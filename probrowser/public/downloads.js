'use strict';
/* Pro Browser — Downloads */

document.addEventListener('DOMContentLoaded', () => { renderDownloads(); });

function fileIcon(name) {
  const ext = (name||'').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️';
  if (['pdf'].includes(ext)) return '📄';
  if (['mp4','webm','mkv','avi'].includes(ext)) return '🎬';
  if (['mp3','ogg','wav'].includes(ext)) return '🎵';
  if (['zip','tar','gz','rar'].includes(ext)) return '📦';
  return '📁';
}

function renderDownloads() {
  const container = document.getElementById('downloadsList'); if (!container) return;
  const dl = getDownloads();
  if (!dl.length) {
    container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state__icon">⬇️</div><div class="empty-state__title">No downloads yet</div><div class="empty-state__msg">Files you download while browsing will appear here.</div></div>';
    return;
  }
  container.innerHTML = '';
  for (const d of dl) {
    const el = document.createElement('div'); el.className = 'download-item';
    el.innerHTML = `
      <span class="download-item__icon">${fileIcon(d.name)}</span>
      <div class="download-item__info">
        <div class="download-item__name">${escHtml(d.name||d.url)}</div>
        <div class="download-item__meta">${formatTime(d.time)}${d.size?' · '+escHtml(d.size):''}</div>
      </div>
      <button class="download-item__del" title="Remove">✕</button>`;
    el.querySelector('.download-item__del').onclick = () => {
      saveDownloads(getDownloads().filter(x=>x.id!==d.id)); renderDownloads();
    };
    container.appendChild(el);
  }
}

function clearDownloads() {
  if (!confirm('Clear download history?')) return;
  saveDownloads([]); renderDownloads(); showToast('Downloads cleared');
}
window.clearDownloads = clearDownloads;
