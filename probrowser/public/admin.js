'use strict';
/* Pro Browser V2 — Admin Dashboard */

let pagesOffset = 0;
const PAGE_LIMIT = 20;
let statusInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadPages();
  loadSessions();
  pollStatus();

  document.getElementById('startCrawlBtn').onclick = startCrawl;
  document.getElementById('stopCrawlBtn').onclick  = stopCrawl;
  document.getElementById('resetBtn').onclick       = resetIndex;
  document.getElementById('prevPageBtn').onclick    = () => { pagesOffset = Math.max(0, pagesOffset - PAGE_LIMIT); loadPages(); };
  document.getElementById('nextPageBtn').onclick    = () => { pagesOffset += PAGE_LIMIT; loadPages(); };
});

async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    const s = await r.json();
    document.getElementById('statPages').textContent   = s.totalPages   ?? '0';
    document.getElementById('statDomains').textContent = s.totalDomains ?? '0';
    document.getElementById('statImages').textContent  = s.totalImages  ?? '0';
    document.getElementById('statVideos').textContent  = s.totalVideos  ?? '0';
  } catch { /* ignore */ }
}

async function loadPages() {
  try {
    const r = await fetch(`/api/admin/pages?limit=${PAGE_LIMIT}&offset=${pagesOffset}`);
    const data = await r.json();
    const tbody = document.getElementById('pagesTableBody');
    if (!data.pages?.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No pages indexed yet.</td></tr>`;
      document.getElementById('prevPageBtn').disabled = true;
      document.getElementById('nextPageBtn').disabled = true;
      document.getElementById('pageInfo').textContent = 'Page 1';
      return;
    }
    tbody.innerHTML = data.pages.map(p => `
      <tr>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(p.title||'')}">
          <img src="https://${escHtml(p.domain)}/favicon.ico" style="width:14px;height:14px;vertical-align:middle;margin-right:6px;border-radius:2px" onerror="this.style.display='none'">
          ${escHtml(p.title || p.url)}
        </td>
        <td style="font-size:.8rem;color:var(--text-muted)">${escHtml(p.domain)}</td>
        <td style="font-size:.78rem;color:var(--text-muted);white-space:nowrap">${formatCrawledAt(p.crawled_at)}</td>
        <td><button onclick="deletePage(${p.id})" style="background:none;color:var(--danger);border:none;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:.85rem" title="Delete">🗑</button></td>
      </tr>`).join('');

    const page = Math.floor(pagesOffset / PAGE_LIMIT) + 1;
    const totalPages = Math.ceil(data.total / PAGE_LIMIT);
    document.getElementById('pageInfo').textContent = `Page ${page} of ${totalPages} (${data.total} total)`;
    document.getElementById('prevPageBtn').disabled = pagesOffset === 0;
    document.getElementById('nextPageBtn').disabled = pagesOffset + PAGE_LIMIT >= data.total;
  } catch (err) {
    document.getElementById('pagesTableBody').innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${escHtml(err.message)}</td></tr>`;
  }
}

async function loadSessions() {
  try {
    const r = await fetch('/api/admin/sessions');
    const sessions = await r.json();
    const tbody = document.getElementById('sessionsTableBody');
    if (!sessions.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No crawl sessions yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = sessions.map(s => `
      <tr>
        <td class="td-url">${escHtml(s.seed_url)}</td>
        <td><span style="font-size:.78rem;padding:2px 8px;border-radius:999px;background:${statusColor(s.status)};color:#fff">${escHtml(s.status)}</span></td>
        <td style="font-size:.82rem">${s.pages_crawled ?? 0} / ${s.max_pages ?? '?'}</td>
        <td style="font-size:.78rem;color:var(--text-muted);white-space:nowrap">${formatCrawledAt(s.started_at)}</td>
      </tr>`).join('');
  } catch { /* ignore */ }
}

function statusColor(status) {
  if (status === 'running')  return '#7c3aed';
  if (status === 'finished') return '#059669';
  if (status === 'error')    return '#dc2626';
  return '#6b7280';
}

async function startCrawl() {
  const url       = document.getElementById('crawlUrl').value.trim();
  const maxPages  = parseInt(document.getElementById('crawlMaxPages').value) || 50;
  const maxDepth  = parseInt(document.getElementById('crawlMaxDepth').value) || 2;
  const sameDomain = document.getElementById('sameDomain').checked;

  if (!url) { showToast('Enter a URL first'); return; }

  try {
    const r = await fetch('/api/crawl', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxPages, maxDepth, sameDomain }),
    });
    const data = await r.json();
    if (data.error) { showToast('Error: ' + data.error); return; }
    document.getElementById('startCrawlBtn').disabled = true;
    document.getElementById('stopCrawlBtn').disabled  = false;
    showToast('Crawl started!');
  } catch (err) { showToast('Error: ' + err.message); }
}

async function stopCrawl() {
  try {
    await fetch('/api/crawl/stop', { method: 'POST' });
    showToast('Crawl stop requested');
  } catch (err) { showToast('Error: ' + err.message); }
}

async function resetIndex() {
  if (!confirm('Reset the entire index? This cannot be undone.')) return;
  try {
    const r = await fetch('/api/admin/reset', { method: 'POST' });
    const data = await r.json();
    if (data.reset) { showToast('Index reset!'); loadStats(); loadPages(); loadSessions(); }
  } catch (err) { showToast('Error: ' + err.message); }
}

async function deletePage(id) {
  try {
    await fetch(`/api/admin/pages/${id}`, { method: 'DELETE' });
    loadPages(); loadStats();
  } catch (err) { showToast('Error: ' + err.message); }
}

window.deletePage = deletePage;

function pollStatus() {
  if (statusInterval) clearInterval(statusInterval);
  statusInterval = setInterval(async () => {
    try {
      const r = await fetch('/api/crawl/status');
      const s = await r.json();
      const el = document.getElementById('crawlStatus');
      el.className = `crawl-status ${s.status}`;
      if (s.status === 'running') {
        el.innerHTML = `
          <strong>🕷 Crawling…</strong><br>
          Pages crawled: <strong>${s.pagesCrawled}</strong> / ${s.maxPages} &bull;
          Skipped: ${s.pagesSkipped} &bull; Errors: ${s.errors}<br>
          Images: ${s.imagesIndexed || 0} &bull; Videos: ${s.videosIndexed || 0}<br>
          Domain: <code>${escHtml(s.currentDomain || '')}</code><br>
          Speed: ${s.crawlSpeed || 0} pages/s<br>
          <small style="color:var(--text-muted);word-break:break-all">URL: ${escHtml(s.currentUrl || '')}</small>`;
        document.getElementById('startCrawlBtn').disabled = true;
        document.getElementById('stopCrawlBtn').disabled  = false;
        loadStats();
      } else {
        el.innerHTML = `Status: <strong>${s.status}</strong>${s.pagesCrawled ? ` — ${s.pagesCrawled} pages crawled` : ''}`;
        document.getElementById('startCrawlBtn').disabled = false;
        document.getElementById('stopCrawlBtn').disabled  = true;
        if (s.status === 'finished' || s.status === 'error') {
          loadPages(); loadSessions(); loadStats();
        }
      }
    } catch { /* ignore */ }
  }, 1500);
}

function formatCrawledAt(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}
