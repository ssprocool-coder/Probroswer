'use strict';
/* Pro Browser — Bookmarks */

document.addEventListener('DOMContentLoaded', () => { renderBookmarks(); });

function renderBookmarks(filter) {
  const container = document.getElementById('bookmarksList'); if (!container) return;
  let bm = getBookmarks();
  if (filter) bm = bm.filter(b => b.title.toLowerCase().includes(filter.toLowerCase()) || b.url.toLowerCase().includes(filter.toLowerCase()));
  if (!bm.length) {
    container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state__icon">🔖</div><div class="empty-state__title">No bookmarks yet</div><div class="empty-state__msg">Bookmark pages while browsing to see them here.</div></div>';
    return;
  }
  container.innerHTML = '';
  for (const b of bm) {
    const domain = (() => { try { return new URL(b.url).hostname; } catch { return ''; } })();
    const el = document.createElement('div'); el.className = 'bookmark-item';
    el.innerHTML = `
      <img class="bookmark-item__favicon" src="https://${domain}/favicon.ico" onerror="this.style.display='none'">
      <div class="bookmark-item__info">
        <div class="bookmark-item__title">${escHtml(b.title||b.url)}</div>
        <div class="bookmark-item__url">${escHtml(b.url)}</div>
      </div>
      <button class="bookmark-item__del" title="Remove">🗑</button>`;
    el.querySelector('.bookmark-item__del').onclick = e => { e.stopPropagation(); removeBookmark(b.url); renderBookmarks(document.getElementById('bmSearch')?.value); };
    el.onclick = e => { if(e.target.tagName==='BUTTON') return; openInBrowser(b.url, b.title); };
    container.appendChild(el);
  }
}
window.renderBookmarks = renderBookmarks;
