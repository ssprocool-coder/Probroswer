'use strict';

const crypto  = require('crypto');
const axios   = require('axios');
const { getDb, upsertImages, upsertVideos } = require('./database');
const { parseHtml }  = require('./parser');
const { isAllowed }  = require('./robots');
const { normalizeUrl, isValidUrl, getDomain, isSameDomain, shouldSkipUrl } = require('./url-utils');

const USER_AGENT     = 'NovaSearchBot/2.0 (+http://localhost:3000/bot)';
const REQ_TIMEOUT_MS = 12000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const RATE_DELAY_MS  = 600;
const CONCURRENCY    = 3;
const HARD_PAGE_CAP  = 500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function contentHash(text) { return crypto.createHash('sha256').update(text || '').digest('hex'); }

class Crawler {
  constructor() { this._reset(); }

  _reset() {
    this.active = false;
    this.sessionId = null;
    this.globalQueue = [];
    this.visited = new Set();
    this.domainQueues = new Map();
    this.domainWorking = new Map();
    this.domainLastRequestAt = new Map();
    this.stats = {
      status: 'idle', pagesCrawled: 0, pagesSkipped: 0, errors: 0,
      imagesIndexed: 0, videosIndexed: 0,
      currentUrl: null, currentDomain: null, seedUrl: null,
      maxPages: 0, maxDepth: 0, startedAt: null,
      crawlSpeed: 0, lastSpeedUpdate: Date.now(), pagesAtLastUpdate: 0,
    };
  }

  start(opts) {
    if (this.active) return { error: 'Crawler is already running. Stop it first.' };
    const { url: rawSeed, maxPages = 50, maxDepth = 2, sameDomain = true } = opts || {};
    if (!isValidUrl(rawSeed)) return { error: 'Invalid seed URL. Must start with http:// or https://' };

    const seedUrl  = normalizeUrl(rawSeed, rawSeed) || rawSeed;
    const capPages = Math.min(Math.max(parseInt(maxPages) || 50, 1), HARD_PAGE_CAP);
    const capDepth = Math.min(Math.max(parseInt(maxDepth) || 2, 0), 10);

    const db  = getDb();
    const row = db.prepare(`INSERT INTO crawl_sessions (started_at, seed_url, max_pages, max_depth, same_domain, status) VALUES (datetime('now'), ?, ?, ?, ?, 'running')`).run(seedUrl, capPages, capDepth, sameDomain ? 1 : 0);

    this.sessionId = row.lastInsertRowid;
    this.active    = true;
    this.globalQueue  = [{ url: seedUrl, depth: 0 }];
    this.visited      = new Set([seedUrl]);
    this.domainQueues = new Map();
    this.domainWorking = new Map();
    this.domainLastRequestAt = new Map();

    Object.assign(this.stats, {
      status: 'running', pagesCrawled: 0, pagesSkipped: 0, errors: 0,
      imagesIndexed: 0, videosIndexed: 0,
      currentUrl: seedUrl, currentDomain: getDomain(seedUrl), seedUrl,
      maxPages: capPages, maxDepth: capDepth, startedAt: new Date().toISOString(),
      crawlSpeed: 0, lastSpeedUpdate: Date.now(), pagesAtLastUpdate: 0,
    });

    this._run(capPages, capDepth, sameDomain, seedUrl)
      .then(() => this._finish('finished'))
      .catch(err => { console.error('[Crawler] Fatal:', err.message); this._finish('error'); });

    return { started: true, sessionId: this.sessionId, seedUrl, maxPages: capPages, maxDepth: capDepth };
  }

  stop() {
    if (!this.active) return { error: 'No crawl is running.' };
    this.active = false; this.stats.status = 'stopping';
    return { stopped: true };
  }

  getStatus() {
    // Update crawl speed every 5 seconds
    const now = Date.now();
    if (now - this.stats.lastSpeedUpdate >= 5000) {
      const elapsed = (now - this.stats.lastSpeedUpdate) / 1000;
      const newPages = this.stats.pagesCrawled - this.stats.pagesAtLastUpdate;
      this.stats.crawlSpeed = parseFloat((newPages / elapsed).toFixed(2));
      this.stats.lastSpeedUpdate = now;
      this.stats.pagesAtLastUpdate = this.stats.pagesCrawled;
    }
    return { ...this.stats };
  }

  async _run(maxPages, maxDepth, sameDomain, seedUrl) {
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(this._domainWorker(maxPages, maxDepth, sameDomain, seedUrl));
    }
    await Promise.all(workers);
  }

  async _domainWorker(maxPages, maxDepth, sameDomain, seedUrl) {
    while (this.active && this.stats.pagesCrawled < maxPages) {
      if (this.globalQueue.length) {
        const item = this.globalQueue.shift();
        const d = getDomain(item.url);
        if (!this.domainQueues.has(d)) this.domainQueues.set(d, []);
        this.domainQueues.get(d).push(item);
        continue;
      }

      let domain = null;
      for (const [d, q] of this.domainQueues) {
        if (q.length > 0 && !this.domainWorking.get(d)) { domain = d; break; }
      }

      if (!domain) {
        if (this._hasPendingWork()) { await sleep(25); continue; }
        break;
      }

      this.domainWorking.set(domain, true);
      const item = this.domainQueues.get(domain).shift();
      try { await this._handleItem(item, maxPages, maxDepth, sameDomain, seedUrl); }
      finally { this.domainWorking.set(domain, false); }
    }
  }

  _hasPendingWork() {
    if (this.globalQueue.length > 0) return true;
    for (const q of this.domainQueues.values()) if (q.length > 0) return true;
    for (const busy of this.domainWorking.values()) if (busy) return true;
    return false;
  }

  async _waitForDomainRateLimit(domain) {
    const last = this.domainLastRequestAt.get(domain) || 0;
    const waitMs = RATE_DELAY_MS - (Date.now() - last);
    if (waitMs > 0) await sleep(waitMs);
  }

  async _handleItem(item, maxPages, maxDepth, sameDomain, seedUrl) {
    if (!this.active || this.stats.pagesCrawled >= maxPages) return;
    const { url, depth } = item;

    if (depth > maxDepth) { this.stats.pagesSkipped++; return; }
    if (shouldSkipUrl(url)) { this.stats.pagesSkipped++; return; }

    this.stats.currentUrl = url;
    this.stats.currentDomain = getDomain(url);

    try {
      if (!(await isAllowed(url))) { this.stats.pagesSkipped++; return; }
    } catch { /* treat as allowed */ }

    try {
      const result = await this._fetchAndIndex(url);
      if (result.success) {
        this.stats.pagesCrawled++;
        this.stats.imagesIndexed += result.images || 0;
        this.stats.videosIndexed += result.videos || 0;
        if (depth < maxDepth && result.links?.length) {
          this._enqueueLinks(result.links, url, depth + 1, sameDomain, seedUrl, maxPages);
        }
      } else if (result.skip) {
        this.stats.pagesSkipped++;
      } else {
        this.stats.errors++;
      }
    } catch (err) {
      console.error(`[Crawler] ${url} — ${err.message}`);
      this.stats.errors++;
    }
  }

  _enqueueLinks(links, baseUrl, depth, sameDomain, seedUrl, maxPages) {
    for (const href of links) {
      const normalized = normalizeUrl(href, baseUrl);
      if (!normalized) continue;
      if (this.visited.has(normalized)) continue;
      if (sameDomain && !isSameDomain(normalized, seedUrl)) continue;
      if (shouldSkipUrl(normalized)) continue;
      this.visited.add(normalized);
      this.globalQueue.push({ url: normalized, depth });
      if (this.globalQueue.length > maxPages * 5) break;
    }
  }

  async _fetchAndIndex(url) {
    const db = getDb();
    const requestDomain = getDomain(url);
    await this._waitForDomainRateLimit(requestDomain);
    this.domainLastRequestAt.set(requestDomain, Date.now());

    let response;
    try {
      response = await axios.get(url, {
        timeout: REQ_TIMEOUT_MS, maxContentLength: MAX_BODY_BYTES, maxRedirects: 5,
        responseType: 'text',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.7',
          'Accept-Language': 'en-US,en;q=0.5', 'Accept-Encoding': 'gzip, deflate',
        },
        validateStatus: s => s < 400,
      });
    } catch (err) {
      const status = err.response?.status;
      if (status && status >= 400) return { success: false, error: `HTTP ${status}` };
      throw err;
    }

    const ct = (response.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return { success: false, skip: true };

    const html = response.data;
    if (!html || html.trim().length < 50) return { success: false, skip: true };

    const parsed   = parseHtml(html, url);
    const domain   = getDomain(url);
    const contentData = [parsed.title, parsed.description, parsed.headings, parsed.bodyText].join('\n');
    const hash     = contentHash(contentData);

    const existing = db.prepare('SELECT id, content_hash FROM pages WHERE url = ?').get(url);
    if (existing && existing.content_hash === hash) return { success: true, links: parsed.links, images: 0, videos: 0 };

    if (existing) {
      db.prepare(`UPDATE pages SET domain=?, title=?, description=?, headings=?, body_text=?, content_hash=?, crawled_at=datetime('now') WHERE url=?`)
        .run(domain, parsed.title, parsed.description, parsed.headings, parsed.bodyText, hash, url);
    } else {
      try {
        db.prepare(`INSERT INTO pages (url, domain, title, description, headings, body_text, content_hash, crawled_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
          .run(url, domain, parsed.title, parsed.description, parsed.headings, parsed.bodyText, hash);
      } catch (e) { if (!e.message?.includes('UNIQUE')) throw e; }
    }

    // Index images
    let imgCount = 0, vidCount = 0;
    if (parsed.images?.length) {
      upsertImages(parsed.images);
      imgCount = parsed.images.length;
    }
    if (parsed.videos?.length) {
      upsertVideos(parsed.videos);
      vidCount = parsed.videos.length;
    }

    return { success: true, links: parsed.links, images: imgCount, videos: vidCount };
  }

  _finish(status) {
    if (this.sessionId) {
      try {
        getDb().prepare(`UPDATE crawl_sessions SET finished_at=datetime('now'), pages_crawled=?, pages_skipped=?, errors=?, status=? WHERE id=?`)
          .run(this.stats.pagesCrawled, this.stats.pagesSkipped, this.stats.errors, status, this.sessionId);
      } catch { /* best effort */ }
    }
    this.active = false; this.stats.status = status;
    this.stats.currentUrl = null; this.stats.currentDomain = null; this.sessionId = null;
  }
}

const crawler = new Crawler();
module.exports = { crawler };
