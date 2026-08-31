'use strict';
/* Pro Browser — History page */

document.addEventListener('DOMContentLoaded', () => {
  renderBrowseHistory();
  renderSearchHistory();

  document.getElementById('clearAllBtn').onclick = () => {
    const tab = document.getElementById('tabBrowse').classList.contains('active') ? 'browse' : 'search';
    if (!confirm('Clear all ' + tab + ' history?')) return;
    if (tab === 'browse') { clearBrowserHistory(); renderBrowseHistory(); }
    else { clearSearchHistory(); renderSearchHistory(); }
    showToast('History cleared');
  };
});

function showTab(tab) {
  const isBrowse = tab === 'browse';
  document.getElementById('tabBrowse').classList.toggle('active', isBrowse);
  document.getElementById('tabSearch').classList.toggle('active', !isBrowse);
  document.getElementById('browseList').style.display = isBrowse ? '' : 'none';
  document.getElementById('searchList').style.display = isBrowse ? 'none' : '';
}
window.showTab = showTab;

function groupByDate(items, timeKey) {
  const groups = {};
  for (const item of items) {
    const d = new Date(item[timeKey]);
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return groups;
}
function isToday(d) { const n=new Date(); return d.toDateString()===n.toDateString(); }
function isYesterday(d) { const y=new Date(); y.setDate(y.getDate()-1); return d.toDateString()===y.toDateString(); }

function renderBrowseHistory() {
  const container = document.getElementById('browseList'); if (!container) return;
  const hist = getBrowserHistory();
  if (!hist.length) { container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state__icon">📜</div><div class="empty-state__title">No browsing history</div></div>'; return; }
  const groups = groupByDate(hist, 'time');
  container.innerHTML = '';
  for (const [label, items] of Object.entries(groups)) {
    const group = document.createElement('div'); group.className = 'history-group';
    group.innerHTML = `<div class="history-group__date">${escHtml(label)}</div>`;
    for (const h of items) {
      const domain = (() => { try { return new URL(h.url).hostname; } catch { return ''; } })();
      const el = document.createElement('div'); el.className = 'history-item';
      el.innerHTML = `
        <img class="history-item__favicon" src="https://${domain}/favicon.ico" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div class="history-item__title">${escHtml(h.title||h.url)}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${escHtml(domain)}</div>
        </div>
        <span class="history-item__time">${formatTime(h.time)}</span>
        <button class="history-item__del" title="Remove">✕</button>`;
      el.querySelector('.history-item__del').onclick = e => {
        e.stopPropagation();
        localStorage.setItem('pb-browser-history', JSON.stringify(getBrowserHistory().filter(x=>x.url!==h.url)));
        renderBrowseHistory();
      };
      el.onclick = e => { if(e.target.tagName==='BUTTON') return; openInBrowser(h.url, h.title); };
      group.appendChild(el);
    }
    container.appendChild(group);
  }
}

function renderSearchHistory() {
  const container = document.getElementById('searchList'); if (!container) return;
  const items = getSearchHistory();
  if (!items.length) { container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state__icon">🔍</div><div class="empty-state__title">No search history</div></div>'; return; }
  container.innerHTML = '';
  for (const it of items) {
    const q = typeof it==='string'?it:it.q;
    const t = typeof it==='string'?Date.now():it.lastUsed;
    const el = document.createElement('div'); el.className = 'history-item';
    el.innerHTML = `
      <span style="font-size:1rem;color:var(--text-muted)">🔍</span>
      <span class="history-item__title">${escHtml(q)}</span>
      <span class="history-item__time">${formatTime(t)}</span>
      <button class="history-item__del" title="Remove">✕</button>`;
    el.querySelector('.history-item__del').onclick = e => { e.stopPropagation(); removeSearchHistItem(q); renderSearchHistory(); };
    el.onclick = e => { if(e.target.tagName==='BUTTON') return; window.location.href=`/results?q=${encodeURIComponent(q)}`; };
    container.appendChild(el);
  }
}
