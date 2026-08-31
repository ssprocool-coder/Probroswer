'use strict';

const { getAllPages, getPageCount, getDomainCount, getLastCrawl, getImageCount, getVideoCount, searchImages, searchVideos } = require('./database');
const { rankResults, tokenize } = require('./ranker');

const PAGE_SIZE = 10;

function search(query, page = 1) {
  query = (query || '').trim();
  if (!query) return { query, total: 0, results: [], error: 'Empty query' };

  const totalDocs = getPageCount();
  if (!totalDocs) return { query, total: 0, results: [], message: 'No pages indexed yet. Open Admin to crawl websites first.' };

  const pages = getAllPages();
  const terms = tokenize(query);

  // Pre-filter: must match at least one term
  const candidates = [];
  for (const p of pages) {
    const allText = `${p.title} ${p.description} ${p.headings} ${p.body_text} ${p.url}`.toLowerCase();
    const matched = terms.filter(t => allText.includes(t)).length;
    if (matched > 0) candidates.push(p);
  }

  const ranked = rankResults(candidates, query, { totalDocs });
  const total = ranked.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  page = Math.max(1, Math.min(page, totalPages || 1));

  const results = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r, i) => ({
    position: (page - 1) * PAGE_SIZE + i + 1,
    title:    r.title || r.url,
    url:      r.url,
    domain:   r.domain,
    snippet:  buildSnippet(r, query),
    score:    r.score,
    crawledAt: r.crawled_at,
  }));

  return { query, total, page, totalPages, results };
}

function buildSnippet(page, query) {
  const terms = tokenize(query);
  const sources = [page.description, page.body_text, page.headings].filter(Boolean);

  for (const source of sources) {
    const lower = source.toLowerCase();
    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx >= 0) {
        const start = Math.max(0, idx - 80);
        const end   = Math.min(source.length, idx + 200);
        let snippet = source.slice(start, end).trim();
        if (start > 0) snippet = '…' + snippet;
        if (end < source.length) snippet += '…';
        return snippet;
      }
    }
  }

  return (page.description || page.body_text || '').slice(0, 280);
}

function getSuggestions(prefix) {
  if (!prefix || prefix.length < 2) return [];
  const p = prefix.toLowerCase();
  const pages = getAllPages();
  const suggestions = new Set();

  for (const page of pages) {
    const title = (page.title || '').toLowerCase();
    const tokens = tokenize(title);
    for (const tok of tokens) {
      if (tok.startsWith(p) && tok !== p) suggestions.add(tok);
    }
    if (title.startsWith(p)) suggestions.add(title);
    const domain = (page.domain || '').toLowerCase();
    if (domain.startsWith(p)) suggestions.add(domain);
  }

  return [...suggestions].slice(0, 8);
}

function getStats() {
  return {
    totalPages:   getPageCount(),
    totalDomains: getDomainCount(),
    totalImages:  getImageCount(),
    totalVideos:  getVideoCount(),
    lastCrawl:    getLastCrawl(),
  };
}

module.exports = { search, getSuggestions, getStats, searchImages, searchVideos };
