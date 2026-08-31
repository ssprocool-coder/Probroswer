'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { getDb, resetDatabase, getPagesPaginated, getPageCount, getDomainCount, getSessions, deletePage } = require('./database');
const { search, getSuggestions, getStats, searchImages, searchVideos } = require('./search');
const { crawler }       = require('./crawler');
const { isValidUrl, isSafeUrl } = require('./url-utils');
const { generateOverview, getPublicConfig, loadConfig, saveConfig } = require('./ai');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Boot DB
getDb();

// ── Search API ─────────────────────────────────────────────────────────────

app.get('/api/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  if (!query) return res.status(400).json({ error: 'Missing query parameter: q' });
  if (query.length > 500) return res.status(400).json({ error: 'Query too long (max 500 characters)' });

  const t0 = Date.now();
  try {
    const result = search(query, page);
    result.searchTime = `${Date.now() - t0}ms`;
    return res.json(result);
  } catch (err) {
    console.error('[Search] Error:', err.message);
    return res.status(500).json({ error: 'Internal search error' });
  }
});

// ── Image Search ──────────────────────────────────────────────────────────

app.get('/api/search/images', (req, res) => {
  const query = String(req.query.q || '').trim();
  try {
    const results = searchImages(query);
    return res.json({ query, results, total: results.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Video Search ──────────────────────────────────────────────────────────

app.get('/api/search/videos', (req, res) => {
  const query = String(req.query.q || '').trim();
  try {
    const results = searchVideos(query);
    return res.json({ query, results, total: results.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Suggestions API ───────────────────────────────────────────────────────

app.get('/api/suggest', (req, res) => {
  const prefix = String(req.query.q || '').trim();
  try {
    const suggestions = getSuggestions(prefix);
    return res.json({ suggestions });
  } catch (err) {
    return res.status(500).json({ suggestions: [] });
  }
});

// ── AI Overview API ───────────────────────────────────────────────────────

app.get('/api/ai/overview', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ unavailable: true, message: 'No query.' });
  try {
    // Run search to get context
    const searchResult = search(query, 1);
    const overview = await generateOverview(query, searchResult.results || []);
    return res.json(overview);
  } catch (err) {
    return res.json({ unavailable: true, message: err.message });
  }
});

app.get('/api/ai/config', (_req, res) => {
  return res.json(getPublicConfig());
});

app.post('/api/ai/config', (req, res) => {
  const { provider, model, endpoint, apiKey } = req.body || {};
  const current = loadConfig();
  const updated = { ...current };
  if (provider !== undefined) updated.provider = String(provider);
  if (model    !== undefined) updated.model    = String(model);
  if (endpoint !== undefined) updated.endpoint = String(endpoint);
  if (apiKey   !== undefined) updated.apiKey   = String(apiKey);
  saveConfig(updated);
  return res.json({ saved: true, config: getPublicConfig() });
});

// ── Stats API ──────────────────────────────────────────────────────────────

app.get('/api/stats', (_req, res) => {
  try { return res.json(getStats()); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});

// ── Crawl API ──────────────────────────────────────────────────────────────

app.post('/api/crawl', (req, res) => {
  const { url, maxPages, maxDepth, sameDomain } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Field "url" is required' });
  if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL — must use http:// or https://' });

  const result = crawler.start({ url, maxPages, maxDepth, sameDomain });
  if (result.error) return res.status(409).json(result);
  return res.json(result);
});

app.post('/api/crawl/stop', (_req, res) => {
  const result = crawler.stop();
  if (result.error) return res.status(400).json(result);
  return res.json(result);
});

app.get('/api/crawl/status', (_req, res) => {
  return res.json(crawler.getStatus());
});

// ── Proxy / Safe Browse API ───────────────────────────────────────────────
// Lets the in-app browser fetch pages through the server to avoid CORS.

app.get('/api/proxy', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!isSafeUrl(url)) return res.status(400).json({ error: 'Invalid or unsafe URL' });

  try {
    const axios = require('axios');
    const response = await axios.get(url, {
      timeout: 15000, maxContentLength: 8 * 1024 * 1024, maxRedirects: 5,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile) NovaSearch/2.0',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      validateStatus: () => true,
    });

    const ct = String(response.headers['content-type'] || 'text/html');
    // The browser viewer currently renders HTML in a same-origin sandboxed iframe.
    // Remove framing/CSP policies that would otherwise block this controlled viewer.
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.removeHeader('X-Frame-Options');
    res.set('X-Nova-Original-URL', url);

    if (ct.includes('text/html') || ct.includes('application/xhtml')) {
      const cheerio = require('cheerio');
      const html = Buffer.from(response.data).toString('utf8');
      const $ = cheerio.load(html, { decodeEntities: false });
      $('meta[http-equiv]').filter(function () {
        return /content-security-policy|x-frame-options/i.test($(this).attr('http-equiv') || '');
      }).remove();
      $('base').remove();
      $('head').prepend(`<base href="${String(url).replace(/\"/g, '&quot;')}">`);
      $('head').append(`<script>
        (function(){
          document.addEventListener('click', function(e){
            var a=e.target.closest && e.target.closest('a'); if(!a) return;
            var href=a.href; if(!href || !/^https?:$/i.test(new URL(href).protocol)) return;
            e.preventDefault(); e.stopPropagation();
            if(a.target==='_blank' || e.ctrlKey || e.metaKey){ parent.openNewTab(href,(a.textContent||href).trim()); }
            else { parent.navigate(href,(a.textContent||href).trim()); }
          }, true);
        })();
      </script>`);
      res.type('html');
      return res.send($.html());
    }

    if (ct.includes('text/plain')) {
      res.type('text/plain');
      return res.send(Buffer.from(response.data));
    }

    return res.status(415).json({ error: 'Content type not supported for proxy' });
  } catch (err) {
    return res.status(502).json({ error: `Proxy error: ${err.message}` });
  }
});

// ── Admin API ──────────────────────────────────────────────────────────────

app.get('/api/admin/sessions', (_req, res) => {
  try { return res.json(getSessions()); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/pages', (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const rows   = getPagesPaginated(limit, offset);
    const total  = getPageCount();
    return res.json({ pages: rows, total });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/pages/:id', (req, res) => {
  try { deletePage(req.params.id); return res.json({ deleted: true }); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/reset', (_req, res) => {
  try { resetDatabase(); return res.json({ reset: true, message: 'Index cleared. Ready for a fresh crawl.' }); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});

// ── Page routes ────────────────────────────────────────────────────────────

const pages = ['results', 'browser', 'images', 'videos', 'news', 'settings', 'history', 'admin', 'bookmarks', 'downloads'];
for (const p of pages) {
  app.get(`/${p}`, (req, res) => {
    const file = path.join(__dirname, '..', 'public', `${p}.html`);
    if (fs.existsSync(file)) return res.sendFile(file);
    if (['images', 'videos', 'news'].includes(p)) {
      const q = String(req.query.q || '');
      return res.redirect(`/results?q=${encodeURIComponent(q)}&type=${encodeURIComponent(p)}`);
    }
    return res.status(404).send('NovaSearch page not found');
  });
}

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     🔍  N O V A S E A R C H  V 2        ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Home     →  http://localhost:${PORT}`);
  console.log(`  Browser  →  http://localhost:${PORT}/browser`);
  console.log(`  Admin    →  http://localhost:${PORT}/admin`);
  console.log(`  Settings →  http://localhost:${PORT}/settings`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
