'use strict';
/* Pro Browser — In-App Browser */

let tabs = [];
let activeTabId = null;
let tabIdSeq = 1;

const tabBar       = document.getElementById('tabBar');
const newTabBtn    = document.getElementById('newTabBtn');
const backBtn      = document.getElementById('backBtn');
const fwdBtn       = document.getElementById('fwdBtn');
const reloadBtn    = document.getElementById('reloadBtn');
const addrInput    = document.getElementById('addrInput');
const progressBar  = document.getElementById('progressBar');
const mainFrame    = document.getElementById('mainFrame');
const noPageMsg    = document.getElementById('noPageMsg');
const homeBtn      = document.getElementById('homeBtn');
const searchNavBtn = document.getElementById('searchNavBtn');
const newTabNavBtn = document.getElementById('newTabNavBtn');
const tabsBtn      = document.getElementById('tabsBtn');
const moreBtn      = document.getElementById('moreBtn');
const menuBtn      = document.getElementById('menuBtn');
const bookmarkBtn  = document.getElementById('bookmarkBtn');
const tabCountBadge= document.getElementById('tabCountBadge');

document.addEventListener('DOMContentLoaded', () => {
  const params   = new URLSearchParams(location.search);
  const initUrl  = params.get('url') || '';
  const initTitle= params.get('title') || '';

  const first = createTab(initUrl, initTitle);
  switchTab(first.id);
  if (initUrl) navigate(initUrl, initTitle);

  newTabBtn.onclick    = () => openNewTab();
  backBtn.onclick      = () => goBack();
  fwdBtn.onclick       = () => goForward();
  reloadBtn.onclick    = () => reloadCurrent();
  homeBtn.onclick      = () => window.location.href = '/';
  searchNavBtn.onclick = () => window.location.href = '/results';
  newTabNavBtn.onclick = () => openNewTab();
  tabsBtn.onclick      = () => showTabSwitcher();
  moreBtn.onclick      = (e) => showMoreMenu(e);
  if (menuBtn) menuBtn.onclick = (e) => showMoreMenu(e);
  if (bookmarkBtn) bookmarkBtn.onclick = () => {
    const tab = getActiveTab();
    if (!tab?.url) return;
    if (isBookmarked(tab.url)) { removeBookmark(tab.url); showToast('Bookmark removed'); }
    else { addBookmark(tab.url, tab.title); }
    updateBookmarkBtn();
  };

  addrInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') navigateToInput();
    if (e.key === 'Escape') { addrInput.blur(); syncAddrBar(); }
  });
  addrInput.addEventListener('focus', () => addrInput.select());

  mainFrame.addEventListener('load', onFrameLoad);
  mainFrame.addEventListener('error', onFrameError);

  window.addEventListener('popstate', () => {
    if (getActiveTab()?.history?.length > 1) goBack();
    else window.location.href = '/';
  });
  history.pushState({}, '');
});

// ── Tab Management ──────────────────────────────────────────────────────────
function createTab(url='', title='New Tab') {
  const tab = { id: tabIdSeq++, url, title, favicon:'', history:[], histIdx:-1, loading:false };
  if (url) { tab.history = [url]; tab.histIdx = 0; }
  tabs.push(tab); renderTabBar(); return tab;
}
function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null; }

function switchTab(id) {
  activeTabId = id; const tab = getActiveTab(); renderTabBar();
  if (tab) { syncAddrBar(); updateNavBtns(); updateBookmarkBtn(); tab.url ? showFrame(tab.url) : showNoPage(); }
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (tabs.length <= 1) { tabs[0] = {...tabs[0], url:'', title:'New Tab', history:[], histIdx:-1}; switchTab(tabs[0].id); return; }
  tabs.splice(idx, 1);
  if (activeTabId === id) switchTab(tabs[Math.min(idx, tabs.length-1)].id);
  else renderTabBar();
}

function openNewTab(url='', title='') {
  const tab = createTab(url, title); switchTab(tab.id);
  if (url) navigate(url, title); else { showNoPage(); addrInput.focus(); }
}

function renderTabBar() {
  tabBar.querySelectorAll('.tab').forEach(el => el.remove());
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    const fav = document.createElement('img'); fav.className = 'tab__favicon';
    fav.src = tab.favicon||''; fav.onerror = () => fav.style.display='none';
    if (!tab.favicon) fav.style.display='none';
    const ttl = document.createElement('span'); ttl.className = 'tab__title';
    ttl.textContent = tab.loading ? 'Loading…' : (tab.title||tab.url||'New Tab');
    const cls = document.createElement('button'); cls.className = 'tab__close'; cls.textContent = '✕';
    cls.onclick = e => { e.stopPropagation(); closeTab(tab.id); };
    el.append(fav, ttl, cls);
    el.onclick = () => switchTab(tab.id);
    el.oncontextmenu = e => { e.preventDefault(); showTabMenu(e, tab.id); };
    tabBar.insertBefore(el, newTabBtn);
  }
  tabBar.querySelector('.tab.active')?.scrollIntoView({inline:'center', behavior:'smooth'});
  tabCountBadge.textContent = tabs.length;
}

// ── Navigation ──────────────────────────────────────────────────────────────
function navigateToInput() {
  let val = addrInput.value.trim(); if (!val) return;
  if (isUrlLike(val)) {
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    navigate(val);
  } else {
    addSearchHistory(val);
    window.location.href = `/results?q=${encodeURIComponent(val)}`;
  }
}

function isUrlLike(str) {
  if (/^https?:\/\//i.test(str)) return true;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/|$)/.test(str)) return true;
  return false;
}

function isSafeScheme(url) {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

function navigate(url, title='') {
  if (!isSafeScheme(url)) { showError('Unsafe URL', 'Only http:// and https:// are supported.'); return; }
  const tab = getActiveTab(); if (!tab) return;
  if (tab.histIdx < tab.history.length - 1) tab.history = tab.history.slice(0, tab.histIdx+1);
  if (tab.history[tab.histIdx] !== url) { tab.history.push(url); tab.histIdx = tab.history.length-1; }
  tab.url = url; tab.title = title||url; tab.loading = true;
  addrInput.value = url; showProgress(true); renderTabBar(); updateNavBtns(); updateBookmarkBtn();
  showFrame(url); addBrowserHistory(title||url, url);
}

function showFrame(url) {
  noPageMsg.style.display = 'none'; mainFrame.style.display = 'block';
  mainFrame.src = `/api/proxy?url=${encodeURIComponent(url)}`;
  mainFrame.dataset.realUrl = url;
}

function showNoPage() {
  mainFrame.style.display = 'none'; mainFrame.src = 'about:blank';
  noPageMsg.style.display = 'flex'; addrInput.value = ''; showProgress(false);
}

function onFrameLoad() {
  const tab = getActiveTab(); if (!tab) return;
  tab.loading = false; showProgress(false);
  try {
    const doc = mainFrame.contentDocument || mainFrame.contentWindow?.document;
    if (doc && doc.title && tab.url) {
      tab.title = doc.title;
      const iconEl = doc.querySelector('link[rel~="icon"]');
      tab.favicon = iconEl ? iconEl.href : `https://${new URL(tab.url).hostname}/favicon.ico`;
    }
  } catch {
    if (tab.url) { try { tab.favicon = `https://${new URL(tab.url).hostname}/favicon.ico`; } catch {} }
  }
  try {
    const doc = mainFrame.contentDocument;
    if (doc) {
      doc.addEventListener('click', e => {
        const a = e.target.closest('a'); if (!a) return;
        const href = a.href; if (!href || !isSafeScheme(href)) return;
        e.preventDefault();
        a.target === '_blank' ? openNewTab(href, a.textContent?.trim()||href) : navigate(href);
      }, true);
    }
  } catch {}
  renderTabBar(); syncAddrBar(); updateNavBtns(); updateBookmarkBtn();
  addBrowserHistory(tab.title, tab.url);
}

function onFrameError() {
  const tab = getActiveTab(); if (tab) tab.loading = false;
  showProgress(false); renderTabBar();
}

function showProgress(active) {
  if (active) {
    progressBar.style.display = 'block'; let w = 10;
    progressBar._iv = setInterval(() => { w = Math.min(w + Math.random()*15, 85); progressBar.style.width = w+'%'; }, 300);
  } else {
    clearInterval(progressBar._iv); progressBar.style.width = '100%';
    setTimeout(() => { progressBar.style.display='none'; progressBar.style.width='0%'; }, 300);
  }
}

function showError(title, msg) {
  mainFrame.style.display = 'none';
  noPageMsg.innerHTML = `
    <div class="browser-error">
      <div class="browser-error__icon">⚠️</div>
      <div class="browser-error__title">${escHtml(title)}</div>
      <div class="browser-error__msg">${escHtml(msg)}</div>
      <button class="browser-error__retry" onclick="showNoPage()">Go Back</button>
    </div>`;
  noPageMsg.style.display = 'flex'; showProgress(false);
}

function goBack() {
  const tab = getActiveTab(); if (!tab || tab.histIdx <= 0) return;
  tab.histIdx--; tab.url = tab.history[tab.histIdx];
  addrInput.value = tab.url; showFrame(tab.url); updateNavBtns(); updateBookmarkBtn();
}

function goForward() {
  const tab = getActiveTab(); if (!tab || tab.histIdx >= tab.history.length-1) return;
  tab.histIdx++; tab.url = tab.history[tab.histIdx];
  addrInput.value = tab.url; showFrame(tab.url); updateNavBtns(); updateBookmarkBtn();
}

function reloadCurrent() {
  const tab = getActiveTab(); if (!tab?.url) return;
  showProgress(true); showFrame(tab.url);
}

function updateNavBtns() {
  const tab = getActiveTab();
  backBtn.disabled = !tab || tab.histIdx <= 0;
  fwdBtn.disabled  = !tab || tab.histIdx >= tab.history.length-1;
}

function syncAddrBar() { addrInput.value = getActiveTab()?.url || ''; }

function updateBookmarkBtn() {
  if (!bookmarkBtn) return;
  const tab = getActiveTab();
  bookmarkBtn.textContent = (tab?.url && isBookmarked(tab.url)) ? '★' : '🔖';
}

// ── Tab Switcher ────────────────────────────────────────────────────────────
function showTabSwitcher() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const sheet = document.createElement('div'); sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal__handle"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-weight:700;font-size:1rem">Tabs (${tabs.length})</span>
      <button onclick="this.closest('.modal-overlay').remove();openNewTab()" class="btn btn-primary" style="padding:6px 14px;font-size:.82rem">+ New Tab</button>
    </div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px';
  for (const tab of tabs) {
    const card = document.createElement('div');
    const isActive = tab.id === activeTabId;
    card.style.cssText = `background:var(--surface-2);border:2px solid ${isActive?'var(--accent)':'var(--border)'};border-radius:var(--radius);padding:10px;cursor:pointer;position:relative`;
    const domain = tab.url ? (() => { try { return new URL(tab.url).hostname; } catch { return ''; } })() : '';
    card.innerHTML = `
      <div style="font-size:.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${escHtml(tab.title||'New Tab')}</div>
      <div style="font-size:.72rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(domain)}</div>
      <button style="position:absolute;top:4px;right:4px;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.8rem;padding:2px 5px" data-cid="${tab.id}">✕</button>`;
    card.querySelector('[data-cid]').onclick = e => { e.stopPropagation(); closeTab(tab.id); overlay.remove(); tabs.length && showTabSwitcher(); };
    card.onclick = e => { if (e.target.dataset.cid) return; switchTab(tab.id); overlay.remove(); };
    grid.appendChild(card);
  }
  sheet.appendChild(grid); overlay.appendChild(sheet); document.body.appendChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

// ── Menus ────────────────────────────────────────────────────────────────────
function showTabMenu(e, tabId) {
  const tab = tabs.find(t => t.id === tabId); if (!tab) return;
  openCtxMenu([
    { icon:'🔄', label:'Reload', action: () => { switchTab(tabId); reloadCurrent(); } },
    { icon:'⧉', label:'Duplicate', action: () => { const dup = createTab(tab.url, tab.title); switchTab(dup.id); if(dup.url) navigate(dup.url, dup.title); } },
    { icon:'🔗', label:'Open Externally', action: () => openExternally(tab.url) },
    'sep',
    { icon:'✕', label:'Close Tab', action: () => closeTab(tabId), danger: true },
  ], e);
}

function openExternally(url) {
  if (!isSafeScheme(url)) return;
  try { if (window.NovaAndroid?.openExternal) { window.NovaAndroid.openExternal(url); return; } } catch {}
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showMoreMenu(e) {
  const tab = getActiveTab();
  const hasUrl = !!tab?.url;
  openCtxMenu([
    { icon:'🏠', label:'Home', action: () => window.location.href = '/' },
    { icon:'🔍', label:'Search', action: () => window.location.href = '/results' },
    { icon:'📜', label:'History', action: () => window.location.href = '/history' },
    { icon:'🔖', label:'Bookmarks', action: () => window.location.href = '/bookmarks' },
    { icon:'⬇️', label:'Downloads', action: () => window.location.href = '/downloads' },
    { icon:'⚙️', label:'Settings', action: () => window.location.href = '/settings' },
    'sep',
    ...(hasUrl ? [
      { icon:'📋', label:'Copy URL', action: () => { navigator.clipboard.writeText(tab.url).catch(()=>{}); showToast('URL copied!'); } },
      { icon:'🔗', label:'Open Externally', action: () => openExternally(tab.url) },
      { icon:'🔖', label: isBookmarked(tab.url) ? 'Remove Bookmark' : 'Add Bookmark', action: () => { if(isBookmarked(tab.url)){removeBookmark(tab.url);showToast('Bookmark removed');}else{addBookmark(tab.url,tab.title);} updateBookmarkBtn(); } },
    ] : []),
    'sep',
    { icon:'🛠', label:'Admin Panel', action: () => window.location.href = '/admin' },
    { icon:'➕', label:'New Tab', action: () => openNewTab() },
  ], e);
}
