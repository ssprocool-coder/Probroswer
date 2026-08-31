'use strict';

const FIELD_WEIGHTS = { title: 10.0, headings: 6.0, description: 5.0, url: 3.0, body_text: 1.0 };
const K1 = 1.5, B = 0.75;

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function tf(token, tokens) {
  let count = 0; for (const t of tokens) if (t === token) count++; return count;
}

function bm25(termFreq, fieldLen, avgLen, idf) {
  if (termFreq === 0) return 0;
  const norm = termFreq * (K1 + 1) / (termFreq + K1 * (1 - B + B * (fieldLen / (avgLen || 1))));
  return idf * norm;
}

function countPhraseOccurrences(phrase, text) {
  if (!phrase || !text) return 0;
  const lower = text.toLowerCase(), needle = phrase.toLowerCase();
  let count = 0, pos = 0;
  while ((pos = lower.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
  return count;
}

function exactMatchScore(query, fieldValue) {
  if (!fieldValue) return 0;
  const lower = fieldValue.toLowerCase(), q = query.toLowerCase();
  if (lower === q) return 2.0;
  if (lower.startsWith(q)) return 1.5;
  if (lower.includes(q)) return 1.0;
  return 0;
}

function rankResults(results, query, stats) {
  if (!results || results.length === 0) return [];
  const queryTokens = tokenize(query);
  const totalDocs = stats.totalDocs || results.length || 1;
  const n = results.length;

  const avgLen = {};
  for (const field of Object.keys(FIELD_WEIGHTS)) {
    const total = results.reduce((s, r) => s + tokenize(r[field]).length, 0);
    avgLen[field] = total / n || 50;
  }

  const idfMap = {};
  for (const token of queryTokens) {
    const docsWithTerm = results.filter(r =>
      Object.keys(FIELD_WEIGHTS).some(f => tokenize(r[f]).includes(token))
    ).length;
    idfMap[token] = Math.log((totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
  }

  const scored = results.map(row => {
    let score = 0;
    const ftsBase = row.fts_rank != null ? Math.abs(parseFloat(row.fts_rank)) : 0;
    score += ftsBase * 0.5;

    score += exactMatchScore(query, row.title)       * FIELD_WEIGHTS.title * 3;
    score += exactMatchScore(query, row.description) * FIELD_WEIGHTS.description * 1.5;
    score += exactMatchScore(query, row.url)         * FIELD_WEIGHTS.url * 2;

    score += countPhraseOccurrences(query, row.title)       * FIELD_WEIGHTS.title * 4;
    score += countPhraseOccurrences(query, row.headings)    * FIELD_WEIGHTS.headings * 2;
    score += countPhraseOccurrences(query, row.description) * FIELD_WEIGHTS.description;
    score += countPhraseOccurrences(query, row.body_text)   * FIELD_WEIGHTS.body_text * 0.3;

    for (const token of queryTokens) {
      const idf = idfMap[token] || 0;
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        const tokens = tokenize(row[field]);
        const termFreq = tf(token, tokens);
        if (termFreq > 0) score += bm25(termFreq, tokens.length, avgLen[field], idf) * weight;
      }
    }

    const allText = [row.title, row.description, row.headings, row.body_text].join(' ').toLowerCase();
    const coverageCount = queryTokens.filter(t => allText.includes(t)).length;
    score += (coverageCount / Math.max(queryTokens.length, 1)) * 5;

    return { ...row, _rawScore: score };
  });

  scored.sort((a, b) => b._rawScore - a._rawScore);
  const maxScore = scored[0]._rawScore || 1;
  const minScore = scored[n - 1]?._rawScore || 0;
  const range = maxScore - minScore || 1;

  return scored.map(r => ({
    ...r,
    score: parseFloat(((r._rawScore - minScore) / range).toFixed(4)),
  }));
}

module.exports = { rankResults, tokenize };
