'use strict';
/* NovaSearch V2 — Results page */

const params = new URLSearchParams(location.search);
let currentQuery = params.get('q') || '';
let currentPage  = parseInt(params.get('page') || '1');
let currentCat   = params.get('cat') || 'all';

const body = document.getElementById('appBody');
const API_BASE =
  window.location.protocol === 'capacitor:'
    ? 'http://127.0.0.1:3000'
    : '';
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchInput');
  const btn   = document.getElementById('searchBtn');
  const tabs  = document.getElementById('catTabs');
  const dropdown = document.getElementById('suggestDropdown');

  if (input) {
    input.value = currentQuery;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(input.value); });
    if (dropdown) attachSuggestions(input, dropdown, doSearch);
  }
  if (btn) btn.onclick = () => doSearch(input.value);

  // Category tabs
  if (tabs) {
    tabs.querySelectorAll('.cat-tab').forEach(tab => {
      if (tab.dataset.cat === currentCat) tab.classList.add('active');
      else tab.classList.remove('active');
      tab.onclick = () => { currentCat = tab.dataset.cat; currentPage = 1; updateUrl(); loadResults(); };
    });
  }

  loadResults();
});

function doSearch(q) {
  q = (q || '').trim();
  if (!q) return;
  addSearchHistory(q);
  currentQuery = q;
  currentPage  = 1;
  updateUrl();
  loadResults();
}

function updateUrl() {
  const p = new URLSearchParams({ q: currentQuery, page: currentPage, cat: currentCat });
  history.replaceState({}, '', `/results?${p}`);
  // Sync tab buttons
  document.querySelectorAll('.cat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === currentCat);
  });
}

async function loadResults() {
  const input = document.getElementById('searchInput');
  if (input) input.value = currentQuery;
  document.title = `${currentQuery} — NovaSearch`;

  body.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';

  if (currentCat === 'maps') { renderMaps(); return; }
  if (currentCat === 'images') { await loadImages(); return; }
  if (currentCat === 'videos') { await loadVideos(); return; }

  // All / news
  try {
    const r = await fetch(`http://127.0.0.1:3000/api/search?q=${encodeURIComponent(currentQuery)}&page=${currentPage}`);
    const data = await r.json();
    if (currentCat === 'news') renderNews(data);
    else renderAll(data);
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Error</div><div class="empty-state__msg">${escHtml(err.message)}</div></div>`;
  }
}

async function renderAll(data) {
  const html = [];
  html.push(`<div class="result-meta">About <span class="result-count">${data.total || 0}</span> results (${data.searchTime || ''})</div>`);
  html.push(`<div class="results-list">`);

  if (!data.total) {
    html.push(`<div class="empty-state"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No results found</div><div class="empty-state__msg">Try crawling more websites in <a href="/admin">Admin</a></div></div>`);
    html.push('</div>');
    body.innerHTML = html.join('');
    return;
  }

  // AI overview placeholder
  html.push(`<div id="aiOverviewArea"></div>`);

  for (const r of data.results || []) {
    const domain = r.domain || '';
    const scoreClass = r.score > 0.7 ? 'score-high' : r.score > 0.4 ? 'score-mid' : 'score-low';
    html.push(`
      <div class="result-card">
        <div class="result-card__num">${r.position}</div>
        <img class="result-card__favicon" src="https://${escHtml(domain)}/favicon.ico" onerror="this.style.display='none'" title="${escHtml(domain)}">
        <div class="result-card__body">
          <div class="result-card__domain">🌐 ${escHtml(domain)}</div>
          <div class="result-card__title" onclick="openResult('${escHtml(r.url)}','${escHtml(r.title)}')">${escHtml(r.title)}</div>
          <div class="result-card__url">${escHtml(r.url)}</div>
          <div class="result-card__snippet">${escHtml(r.snippet || '')}</div>
        </div>
        <button class="result-card__menu-btn" onclick="resultMenu(event,'${escHtml(r.url)}','${escHtml(r.title)}')">⋮</button>
      </div>`);
  }

  // Pagination
  if (data.totalPages > 1) {
    html.push('<div class="pagination">');
    if (currentPage > 1) html.push(`<button class="pagination__btn" onclick="goPage(${currentPage-1})">← Prev</button>`);
    const start = Math.max(1, currentPage - 2), end = Math.min(data.totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) {
      html.push(`<button class="pagination__btn${i===currentPage?' active':''}" onclick="goPage(${i})">${i}</button>`);
    }
    if (currentPage < data.totalPages) html.push(`<button class="pagination__btn" onclick="goPage(${currentPage+1})">Next →</button>`);
    html.push('</div>');
  }

  html.push('</div>');
  body.innerHTML = html.join('');

  // Load AI overview async
  loadAIOverview();
}

async function loadAIOverview() {
  const area = document.getElementById('aiOverviewArea');
  if (!area || !currentQuery) return;
  try {
    const r = await fetch(`http://127.0.0.1:3000/api/ai/overview?q=${encodeURIComponent(currentQuery)}`);
    const data = await r.json();
    if (data.unavailable) {
      // Silently skip if not configured
      if (!data.message?.includes('unavailable')) {
        area.innerHTML = `<div class="ai-overview"><div class="ai-overview__header">🤖 AI Overview</div><div class="ai-overview__text ai-unavail">${escHtml(data.message)}</div></div>`;
      }
      return;
    }
    const sources = (data.sources || []).map(s => `<a class="ai-source-chip" href="#" onclick="openResult('${escHtml(s.url)}','${escHtml(s.title)}');return false">${escHtml(s.domain || s.title)}</a>`).join('');
    area.innerHTML = `
      <div class="ai-overview">
        <div class="ai-overview__header">🤖 AI Overview</div>
        <div class="ai-overview__text">${escHtml(data.text)}</div>
        ${sources ? `<div class="ai-overview__sources">Sources: ${sources}</div>` : ''}
      </div>`;
  } catch { /* silently ignore */ }
}

async function loadImages() {
  try {
    const r = await fetch(`http://127.0.0.1:3000/api/search/images?q=${encodeURIComponent(currentQuery)}`);
    const data = await r.json();
    if (!data.results?.length) {
      body.innerHTML = `<div class="empty-state" style="padding:40px"><div class="empty-state__icon">🖼️</div><div class="empty-state__title">No images indexed</div><div class="empty-state__msg">Crawl websites to discover images.</div></div>`;
      return;
    }
    const html = [`<div class="result-meta">Found <span class="result-count">${data.total}</span> images</div><div class="images-grid">`];
    for (const img of data.results) {
      html.push(`
        <div class="image-card" onclick="openResult('${escHtml(img.source_url)}','${escHtml(img.alt || img.domain)}')" title="${escHtml(img.alt || img.url)}">
          <img src="${escHtml(img.url)}" alt="${escHtml(img.alt || '')}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=&quot;image-card__broken&quot;>🖼️</div>'">
          <div class="image-card__overlay"><div class="image-card__alt">${escHtml(img.alt || img.domain)}</div></div>
        </div>`);
    }
    html.push('</div>');
    body.innerHTML = html.join('');
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__msg">${escHtml(err.message)}</div></div>`;
  }
}

async function loadVideos() {
  try {
    const r = await fetch(`http://127.0.0.1:3000/api/search/videos?q=${encodeURIComponent(currentQuery)}`);
    const data = await r.json();
    if (!data.results?.length) {
      body.innerHTML = `<div class="empty-state" style="padding:40px"><div class="empty-state__icon">▶️</div><div class="empty-state__title">No videos indexed</div><div class="empty-state__msg">Crawl websites with YouTube/Vimeo embeds to discover videos.</div></div>`;
      return;
    }
    const html = [`<div class="result-meta">Found <span class="result-count">${data.total}</span> videos</div><div class="videos-grid">`];
    for (const vid of data.results) {
      const thumb = vid.thumbnail || '';
      html.push(`
        <div class="video-card" onclick="openResult('${escHtml(vid.url)}','${escHtml(vid.title)}')">
          <div class="video-card__thumb">
            ${thumb ? `<img src="${escHtml(thumb)}" alt="" onerror="this.style.display='none'">` : ''}
            <div class="video-card__play">▶️</div>
          </div>
          <div class="video-card__info">
            <div class="video-card__title">${escHtml(vid.title || vid.url)}</div>
            <div class="video-card__domain">🌐 ${escHtml(vid.domain)}</div>
          </div>
        </div>`);
    }
    html.push('</div>');
    body.innerHTML = html.join('');
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__msg">${escHtml(err.message)}</div></div>`;
  }
}

function renderNews(data) {
  if (!data.total) {
    body.innerHTML = `<div class="empty-state" style="padding:40px"><div class="empty-state__icon">📰</div><div class="empty-state__title">No news results</div><div class="empty-state__msg">News articles appear when crawled pages contain article metadata.</div></div>`;
    return;
  }
  // Filter to pages that look like articles (have a description and title)
  const newsResults = (data.results || []).filter(r => r.snippet && r.title && r.title !== r.url);
  const html = [`<div class="result-meta">About <span class="result-count">${newsResults.length}</span> article results</div><div class="news-list">`];
  for (const r of newsResults) {
    html.push(`
      <div class="news-card" onclick="openResult('${escHtml(r.url)}','${escHtml(r.title)}')">
        <div class="news-card__body">
          <div class="news-card__source">🌐 ${escHtml(r.domain)}</div>
          <div class="news-card__title">${escHtml(r.title)}</div>
          <div class="news-card__snippet">${escHtml(r.snippet || '')}</div>
        </div>
      </div>`);
  }
  html.push('</div>');
  body.innerHTML = html.join('');
}

function renderMaps() {
  const query = currentQuery;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(query)}`;
  // Try Android intent format for in-app use
  const intentUrl = `geo:0,0?q=${encodeURIComponent(query)}`;
  body.innerHTML = `
    <div class="maps-placeholder">
      <div class="maps-placeholder__icon">🗺️</div>
      <div class="maps-placeholder__title">Maps</div>
      <div class="maps-placeholder__msg">NovaSearch will open your device's map application to search for:<br><strong>"${escHtml(query)}"</strong></div>
      <button class="maps-open-btn" onclick="openMaps()">Open Maps</button>
      <div style="margin-top:12px;font-size:.78rem;color:var(--text-muted)">Opens your installed maps app</div>
    </div>`;
  window._mapsQuery = query;
}

window.openMaps = function() {
  const q = window._mapsQuery || currentQuery;
  // Try geo URI (Android/iOS) first, fallback to Google Maps
  window.location.href = `geo:0,0?q=${encodeURIComponent(q)}`;
  setTimeout(() => { window.open(`https://maps.google.com/?q=${encodeURIComponent(q)}`, '_blank'); }, 800);
};

function openResult(url, title) {
  addBrowserHistory(title || url, url);
  const p = new URLSearchParams({ url, title: title || '' });
  window.location.href = `/browser?${p}`;
}
window.openResult = openResult;

function resultMenu(e, url, title) {
  e.stopPropagation();
  openCtxMenu([
    { icon: '🌐', label: 'Open', action: () => openResult(url, title) },
    { icon: '➕', label: 'Open in New Tab', action: () => { addBrowserHistory(title, url); const p = new URLSearchParams({ url, title, newtab: '1' }); window.open(`/browser?${p}`, '_blank'); } },
    { icon: '📋', label: 'Copy Link', action: () => { navigator.clipboard.writeText(url).catch(() => {}); showToast('Link copied!'); } },
    { icon: '🔖', label: 'Add to Shortcuts', action: () => addToShortcuts(url, title) },
    'sep',
    { icon: '🔗', label: 'Open Externally', action: () => window.open(url, '_blank') },
  ], e);
}
window.resultMenu = resultMenu;

function addToShortcuts(url, title) {
  const shortcuts = getShortcuts();
  if (shortcuts.some(s => s.url === url)) { showToast('Already in shortcuts'); return; }
  shortcuts.push({ id: Date.now().toString(), name: (title || url).slice(0, 24), url, emoji: '🌐' });
  saveShortcuts(shortcuts);
  showToast('Added to shortcuts!');
}

function goPage(p) { currentPage = p; updateUrl(); loadResults(); window.scrollTo(0, 0); }
window.goPage = goPage;
