'use strict';

// Android/Termux-friendly storage: plain JSON. No native modules, no better-sqlite3.
const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH   = path.join(DATA_DIR, 'novasearch.json');
let state;

function emptyState() {
  return {
    pages:          [],
    images:         [],
    videos:         [],
    crawl_sessions: [],
    nextPageId:     1,
    nextImageId:    1,
    nextVideoId:    1,
    nextSessionId:  1,
  };
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) { state = emptyState(); save(); return; }
  try { state = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { state = emptyState(); save(); }
  state.pages          ||= [];
  state.images         ||= [];
  state.videos         ||= [];
  state.crawl_sessions ||= [];
  state.nextPageId     ||= Math.max(0, ...state.pages.map(p => p.id || 0)) + 1;
  state.nextImageId    ||= Math.max(0, ...state.images.map(i => i.id || 0)) + 1;
  state.nextVideoId    ||= Math.max(0, ...state.videos.map(v => v.id || 0)) + 1;
  state.nextSessionId  ||= Math.max(0, ...state.crawl_sessions.map(s => s.id || 0)) + 1;
}
load();

function now() { return new Date().toISOString(); }

// ── Page operations ─────────────────────────────────────────────────────────

function getPage(url) {
  return state.pages.find(p => p.url === url) || null;
}

function upsertPage(data) {
  const { url, domain, title, description, headings, body_text, content_hash } = data;
  const existing = state.pages.find(p => p.url === url);
  if (existing) {
    Object.assign(existing, { domain, title, description, headings, body_text, content_hash, crawled_at: now() });
  } else {
    if (state.pages.some(p => p.url === url)) throw new Error('UNIQUE constraint failed: pages.url');
    state.pages.push({ id: state.nextPageId++, url, domain, title, description, headings, body_text, content_hash, crawled_at: now() });
  }
  save();
}

function deletePage(id) {
  state.pages = state.pages.filter(p => p.id !== Number(id));
  save();
}

function getAllPages() {
  return state.pages.slice().sort((a, b) => String(b.crawled_at).localeCompare(String(a.crawled_at)));
}

function getPagesPaginated(limit, offset) {
  return getAllPages().slice(offset, offset + limit).map(({ id, url, domain, title, crawled_at }) => ({ id, url, domain, title, crawled_at }));
}

function getPageCount()   { return state.pages.length; }
function getDomainCount() { return new Set(state.pages.map(p => p.domain)).size; }
function getLastCrawl()   { return state.pages.map(p => p.crawled_at).sort().at(-1) || null; }

// ── Image operations ─────────────────────────────────────────────────────────

function upsertImages(images) {
  for (const img of images) {
    const existing = state.images.find(i => i.url === img.url);
    if (!existing) {
      state.images.push({ id: state.nextImageId++, ...img, indexed_at: now() });
    }
  }
  save();
}

function searchImages(query) {
  if (!query) return state.images.slice(0, 50);
  const q = query.toLowerCase();
  return state.images.filter(i =>
    (i.alt || '').toLowerCase().includes(q) ||
    (i.title || '').toLowerCase().includes(q) ||
    (i.source_url || '').toLowerCase().includes(q) ||
    (i.domain || '').toLowerCase().includes(q)
  ).slice(0, 50);
}

function getImageCount() { return state.images.length; }

// ── Video operations ─────────────────────────────────────────────────────────

function upsertVideos(videos) {
  for (const vid of videos) {
    const existing = state.videos.find(v => v.url === vid.url);
    if (!existing) {
      state.videos.push({ id: state.nextVideoId++, ...vid, indexed_at: now() });
    }
  }
  save();
}

function searchVideos(query) {
  if (!query) return state.videos.slice(0, 50);
  const q = query.toLowerCase();
  return state.videos.filter(v =>
    (v.title || '').toLowerCase().includes(q) ||
    (v.description || '').toLowerCase().includes(q) ||
    (v.domain || '').toLowerCase().includes(q)
  ).slice(0, 50);
}

function getVideoCount() { return state.videos.length; }

// ── Session operations ───────────────────────────────────────────────────────

function startSession(seed_url, max_pages, max_depth, same_domain) {
  const row = { id: state.nextSessionId++, started_at: now(), finished_at: null, seed_url, max_pages, max_depth, same_domain, pages_crawled: 0, pages_skipped: 0, errors: 0, status: 'running' };
  state.crawl_sessions.push(row);
  save();
  return row.id;
}

function finishSession(id, pages_crawled, pages_skipped, errors, status) {
  const s = state.crawl_sessions.find(x => x.id === Number(id));
  if (s) Object.assign(s, { finished_at: now(), pages_crawled, pages_skipped, errors, status });
  save();
}

function getSessions() {
  return state.crawl_sessions.slice().sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 20);
}

// ── Reset ────────────────────────────────────────────────────────────────────

function resetDatabase() { state = emptyState(); save(); }

// ── Legacy prepare() shim (used by crawler.js internally) ────────────────────

function prepare(sql) {
  return {
    get(...args) {
      if (/SELECT id, content_hash FROM pages WHERE url/i.test(sql)) {
        const p = state.pages.find(x => x.url === args[0]);
        return p ? { id: p.id, content_hash: p.content_hash || '' } : undefined;
      }
      if (/SELECT COUNT\(\*\) as n FROM pages/i.test(sql)) return { n: state.pages.length };
      if (/SELECT COUNT\(DISTINCT domain\)/i.test(sql)) return { n: getDomainCount() };
      if (/SELECT MAX\(crawled_at\)/i.test(sql)) return { t: getLastCrawl() };
      return undefined;
    },
    all(...args) {
      if (/SELECT \* FROM crawl_sessions/i.test(sql)) return getSessions();
      if (/SELECT .* FROM pages/i.test(sql)) {
        const rows = getAllPages();
        if (/description|headings|body_text/i.test(sql)) {
          const limit = Number(args[0]) || rows.length;
          const offset = Number(args[1]) || 0;
          return rows.slice(offset, offset + limit);
        }
        const limit = Number(args[0]) || 20, offset = Number(args[1]) || 0;
        return rows.slice(offset, offset + limit).map(({ id, url, domain, title, crawled_at }) => ({ id, url, domain, title, crawled_at }));
      }
      return [];
    },
    run(...args) {
      if (/INSERT INTO crawl_sessions/i.test(sql)) {
        const [seed_url, max_pages, max_depth, same_domain] = args;
        const id = startSession(seed_url, max_pages, max_depth, same_domain ? 1 : 0);
        return { lastInsertRowid: id, changes: 1 };
      }
      if (/UPDATE crawl_sessions\s+SET finished_at/i.test(sql)) {
        const [pages_crawled, pages_skipped, errors, status, id] = args;
        finishSession(id, pages_crawled, pages_skipped, errors, status);
        return { changes: 1 };
      }
      if (/UPDATE pages\s+SET domain=/i.test(sql)) {
        const [domain, title, description, headings, body_text, content_hash, url] = args;
        upsertPage({ url, domain, title, description, headings, body_text, content_hash });
        return { changes: 1 };
      }
      if (/INSERT INTO pages/i.test(sql)) {
        const [url, domain, title, description, headings, body_text, content_hash] = args;
        upsertPage({ url, domain, title, description, headings, body_text, content_hash });
        return { changes: 1 };
      }
      if (/DELETE FROM pages WHERE id/i.test(sql)) {
        deletePage(args[0]);
        return { changes: 1 };
      }
      return { changes: 0 };
    }
  };
}

function getDb() { return { prepare }; }

module.exports = {
  getDb, resetDatabase, DB_PATH,
  // Direct API
  getPage, upsertPage, deletePage, getAllPages, getPagesPaginated,
  getPageCount, getDomainCount, getLastCrawl,
  upsertImages, searchImages, getImageCount,
  upsertVideos, searchVideos, getVideoCount,
  startSession, finishSession, getSessions,
};
