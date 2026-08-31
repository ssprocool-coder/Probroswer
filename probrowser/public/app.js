/* NovaSearch V2 — shared utilities + homepage */
'use strict';

const API_BASE =
  window.location.protocol === 'capacitor:'
    ? 'http://127.0.0.1:3000'
    : '';
// ── Theme ────────────────────────────────────────────────────────────────────
const THEME_KEY = 'nova-theme';

function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
applyTheme(getTheme());

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.onclick = toggleTheme;
});

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2900);
}
window.showToast = showToast;

// ── Context menu ─────────────────────────────────────────────────────────────
function openCtxMenu(items, e) {
  closeCtxMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = '_ctxMenu';
  for (const item of items) {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-menu__sep';
      menu.appendChild(sep);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'ctx-menu__item' + (item.danger ? ' danger' : '');
    el.innerHTML = `<span>${item.icon || ''}</span><span>${item.label}</span>`;
    el.onclick = () => { closeCtxMenu(); item.action(); };
    menu.appendChild(el);
  }
  document.body.appendChild(menu);
  // Position
  let x = e.clientX, y = e.clientY;
  const rect = menu.getBoundingClientRect();
  if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
  if (y + rect.height > window.innerHeight) y = y - rect.height;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  setTimeout(() => document.addEventListener('click', closeCtxMenu, { once: true }), 10);
}
function closeCtxMenu() { document.getElementById('_ctxMenu')?.remove(); }
window.openCtxMenu = openCtxMenu;

// ── Browser history (visits) ─────────────────────────────────────────────────
const HIST_KEY = 'nova-browser-history';
function getBrowserHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
}
function addBrowserHistory(title, url) {
  const hist = getBrowserHistory().filter(h => h.url !== url);
  hist.unshift({ title, url, time: Date.now() });
  localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 200)));
}
function clearBrowserHistory() { localStorage.removeItem(HIST_KEY); }
window.getBrowserHistory = getBrowserHistory;
window.addBrowserHistory = addBrowserHistory;
window.clearBrowserHistory = clearBrowserHistory;

// ── Search history ───────────────────────────────────────────────────────────
const SEARCH_HIST_KEY = 'nova-search-history';
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(SEARCH_HIST_KEY) || '[]'); } catch { return []; }
}
function addSearchHistory(query) {
  const hist = getSearchHistory().filter(q => q !== query);
  hist.unshift(query);
  localStorage.setItem(SEARCH_HIST_KEY, JSON.stringify(hist.slice(0, 100)));
}
function clearSearchHistory() { localStorage.removeItem(SEARCH_HIST_KEY); }
window.getSearchHistory = getSearchHistory;
window.addSearchHistory = addSearchHistory;
window.clearSearchHistory = clearSearchHistory;

// ── Shortcuts ────────────────────────────────────────────────────────────────
const SC_KEY = 'nova-shortcuts';
function getShortcuts() {
  try { return JSON.parse(localStorage.getItem(SC_KEY) || '[]'); }
  catch { return []; }
}
function saveShortcuts(sc) { localStorage.setItem(SC_KEY, JSON.stringify(sc)); }
window.getShortcuts = getShortcuts;
window.saveShortcuts = saveShortcuts;

// ── Favicon helper ───────────────────────────────────────────────────────────
function faviconUrl(domain) { return `https://${domain}/favicon.ico`; }
function safeImg(img, fallback) {
  img.onerror = () => { img.src = fallback || ''; img.onerror = null; img.style.display = fallback ? '' : 'none'; };
}
window.faviconUrl = faviconUrl;
window.safeImg = safeImg;

// ── Navigate to browser tab ───────────────────────────────────────────────────
function openInBrowser(url, title) {
  addBrowserHistory(title || url, url);
  const params = new URLSearchParams({ url, title: title || '' });
  window.location.href = `/browser?${params}`;
}
window.openInBrowser = openInBrowser;

// ── Suggestions ───────────────────────────────────────────────────────────────
function attachSuggestions(inputEl, dropdownEl, onSelect) {
  let debounce;
  inputEl.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = inputEl.value.trim();
    if (q.length < 2) { dropdownEl.classList.add('hidden'); return; }
    debounce = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/suggest?q=${encodeURIComponent(q)}`)
        const data = await r.json();
        const suggestions = data.suggestions || [];
        // Also include search history matches
        const histMatches = getSearchHistory().filter(h => h.toLowerCase().startsWith(q.toLowerCase())).slice(0, 3);
        const all = [...new Set([...histMatches, ...suggestions])].slice(0, 8);
        if (!all.length) { dropdownEl.classList.add('hidden'); return; }
        dropdownEl.innerHTML = '';
        for (const s of all) {
          const item = document.createElement('div');
          item.className = 'suggestion-item';
          item.innerHTML = `<span class="suggestion-item__icon">🔍</span><span>${escHtml(s)}</span>`;
          item.onclick = () => { inputEl.value = s; dropdownEl.classList.add('hidden'); onSelect(s); };
          dropdownEl.appendChild(item);
        }
        dropdownEl.classList.remove('hidden');
      } catch { dropdownEl.classList.add('hidden'); }
    }, 220);
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') dropdownEl.classList.add('hidden');
  });
  document.addEventListener('click', e => {
    if (!dropdownEl.contains(e.target) && e.target !== inputEl) dropdownEl.classList.add('hidden');
  });
}
window.attachSuggestions = attachSuggestions;

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
window.escHtml = escHtml;

// ── Homepage logic ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const isHome = document.querySelector('.home-page');
  if (!isHome) return;

  const input    = document.getElementById('searchInput');
  const btnSearch = document.getElementById('searchBtn');
  const statsDiv = document.getElementById('homeStats');
  const dropdown = document.getElementById('suggestDropdown');
  const menuBtn  = document.getElementById('menuBtn');

  function doSearch(q) {
    q = (q || input?.value || '').trim();
    if (!q) return;
    addSearchHistory(q);
    window.location.href = `/results?q=${encodeURIComponent(q)}`;
  }

  if (input) {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    if (dropdown) attachSuggestions(input, dropdown, doSearch);
  }
  if (btnSearch) btnSearch.onclick = () => doSearch();

  // Load stats
  if (statsDiv) {
    fetch(`${API_BASE}/api/stats`).then(r => r.json()).then(s => {
      statsDiv.innerHTML = `<span>${s.totalPages || 0}</span> pages &bull; <span>${s.totalDomains || 0}</span> domains &bull; <span>${s.totalImages || 0}</span> images &bull; <span>${s.totalVideos || 0}</span> videos`;
    }).catch(() => { statsDiv.textContent = 'Index empty — visit Admin to crawl websites.'; });
  }

  // Render shortcuts
  renderShortcuts();

  // Render recently visited
  renderRecentlyVisited();

  // Main menu
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      openCtxMenu([
        { icon: '⚙️', label: 'Settings', action: () => window.location.href = '/settings' },
        { icon: '📜', label: 'History', action: () => window.location.href = '/history' },
        { icon: '🔖', label: 'Shortcuts', action: () => openShortcutsManager() },
        'sep',
        { icon: '🗑️', label: 'Clear History', action: () => { clearBrowserHistory(); clearSearchHistory(); showToast('History cleared'); renderRecentlyVisited(); }, danger: true },
        { icon: 'ℹ️', label: 'About NovaSearch', action: () => alert('NovaSearch V2\nA private local search engine + browser\nRunning on Termux/Android') },
      ], e);
    };
  }
});

function renderShortcuts() {
  const container = document.getElementById('shortcutsRow');
  if (!container) return;
  const shortcuts = getShortcuts();
  container.innerHTML = '';

  for (const sc of shortcuts) {
    const el = document.createElement('div');
    el.className = 'shortcut-item';
    const domain = (() => { try { return new URL(sc.url).hostname; } catch { return ''; } })();
    el.innerHTML = `
      <div class="shortcut-icon" onclick="openShortcut('${escHtml(sc.url)}', '${escHtml(sc.name)}')">
        <img src="https://${domain}/favicon.ico" onerror="this.style.display='none';this.nextSibling.style.display=''">
        <span style="display:none;font-size:1.4rem">${sc.emoji || '🌐'}</span>
      </div>
      <span class="shortcut-label">${escHtml(sc.name)}</span>`;
    el.querySelector('.shortcut-icon').oncontextmenu = (e) => {
      e.preventDefault();
      openCtxMenu([
        { icon: '🌐', label: 'Open', action: () => openShortcut(sc.url, sc.name) },
        { icon: '✏️', label: 'Edit', action: () => openEditShortcut(sc) },
        'sep',
        { icon: '🗑️', label: 'Remove', action: () => removeShortcut(sc.id), danger: true },
      ], e);
    };
    container.appendChild(el);
  }

  // Add button
  const addBtn = document.createElement('div');
  addBtn.className = 'shortcut-item';
  addBtn.innerHTML = `<div class="shortcut-icon shortcut-add" title="Add shortcut" onclick="openAddShortcut()">+</div><span class="shortcut-label">Add</span>`;
  container.appendChild(addBtn);
}

function openShortcut(url, name) { openInBrowser(url, name); }

function openAddShortcut() {
  const modal = document.getElementById('shortcutModal');
  document.getElementById('scName').value = '';
  document.getElementById('scUrl').value = '';
  document.getElementById('scEmoji').value = '🌐';
  document.getElementById('scModalTitle').textContent = 'Add Shortcut';
  document.getElementById('scEditId').value = '';
  modal.classList.remove('hidden');
}

function openEditShortcut(sc) {
  const modal = document.getElementById('shortcutModal');
  document.getElementById('scName').value = sc.name;
  document.getElementById('scUrl').value = sc.url;
  document.getElementById('scEmoji').value = sc.emoji || '🌐';
  document.getElementById('scModalTitle').textContent = 'Edit Shortcut';
  document.getElementById('scEditId').value = sc.id;
  modal.classList.remove('hidden');
}

function saveShortcutModal() {
  const name  = document.getElementById('scName').value.trim();
  const url   = document.getElementById('scUrl').value.trim();
  const emoji = document.getElementById('scEmoji').value.trim() || '🌐';
  const editId = document.getElementById('scEditId').value;
  if (!name || !url) { showToast('Name and URL are required'); return; }
  try { new URL(url); } catch { showToast('Invalid URL'); return; }

  const shortcuts = getShortcuts();
  if (editId) {
    const i = shortcuts.findIndex(s => s.id === editId);
    if (i >= 0) shortcuts[i] = { ...shortcuts[i], name, url, emoji };
  } else {
    shortcuts.push({ id: Date.now().toString(), name, url, emoji });
  }
  saveShortcuts(shortcuts);
  document.getElementById('shortcutModal').classList.add('hidden');
  renderShortcuts();
}

function removeShortcut(id) {
  const shortcuts = getShortcuts().filter(s => s.id !== id);
  saveShortcuts(shortcuts);
  renderShortcuts();
}

function openShortcutsManager() {
  showToast('Long-press a shortcut to edit or remove it');
}

window.openAddShortcut = openAddShortcut;
window.saveShortcutModal = saveShortcutModal;
window.removeShortcut = removeShortcut;

function renderRecentlyVisited() {
  const container = document.getElementById('recentList');
  if (!container) return;
  const hist = getBrowserHistory().slice(0, 8);
  if (!hist.length) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><span class="empty-state__msg">No recently visited pages yet</span></div>';
    return;
  }
  container.innerHTML = '';
  for (const h of hist) {
    const domain = (() => { try { return new URL(h.url).hostname; } catch { return ''; } })();
    const time   = formatTime(h.time);
    const el = document.createElement('div');
    el.className = 'recent-item';
    el.innerHTML = `
      <img class="recent-item__favicon" src="https://${domain}/favicon.ico" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div class="recent-item__title">${escHtml(h.title || h.url)}</div>
        <div class="recent-item__domain">${escHtml(domain)}</div>
      </div>
      <span class="recent-item__time" style="font-size:.72rem;color:var(--text-muted)">${time}</span>
      <button class="recent-item__del" title="Remove">✕</button>`;
    el.querySelector('.recent-item__del').onclick = (e) => {
      e.stopPropagation();
      const hist2 = getBrowserHistory().filter(x => x.url !== h.url);
      localStorage.setItem('nova-browser-history', JSON.stringify(hist2));
      renderRecentlyVisited();
    };
    el.onclick = (e) => { if (e.target.tagName === 'BUTTON') return; openInBrowser(h.url, h.title); };
    container.appendChild(el);
  }
}

function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}
window.formatTime = formatTime;
