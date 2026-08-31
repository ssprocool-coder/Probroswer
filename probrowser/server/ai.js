'use strict';

/**
 * NovaSearch AI Overview — abstraction layer.
 * Supports: none (default), local Ollama, or OpenAI-compatible providers.
 *
 * Core search works with NO AI configured.
 * AI settings live in data/ai-config.json (never expose API keys to frontend).
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'ai-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return { provider: 'none' };
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

function getPublicConfig() {
  const cfg = loadConfig();
  // Never expose API keys to the frontend
  return {
    provider: cfg.provider || 'none',
    model:    cfg.model    || '',
    endpoint: cfg.endpoint || '',
    configured: cfg.provider && cfg.provider !== 'none',
  };
}

/**
 * Generate an AI overview for a query given relevant page snippets as context.
 * Returns { text, sources } or { unavailable: true, message }.
 */
async function generateOverview(query, results) {
  const cfg = loadConfig();
  if (!cfg.provider || cfg.provider === 'none') {
    return { unavailable: true, message: 'AI answers are currently unavailable. Search results are still available.' };
  }

  // Build context from top search results
  const context = results.slice(0, 5).map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join('\n\n');

  const sources = results.slice(0, 5).map(r => ({ title: r.title, url: r.url, domain: r.domain }));

  const prompt = `You are a search assistant. Using ONLY the following search results as context, provide a concise and accurate answer to the query. Cite sources by their number [1], [2], etc. If the context does not contain a clear answer, say so. Do not hallucinate facts.

Query: ${query}

Search Results:
${context}

Provide a 2-4 sentence summary answer citing sources.`;

  try {
    if (cfg.provider === 'ollama') {
      return await callOllama(cfg, prompt, sources);
    }
    if (cfg.provider === 'openai') {
      return await callOpenAI(cfg, prompt, sources);
    }
    return { unavailable: true, message: 'Unknown AI provider configured.' };
  } catch (err) {
    console.error('[AI] Error:', err.message);
    return { unavailable: true, message: `AI provider error: ${err.message}` };
  }
}

async function callOllama(cfg, prompt, sources) {
  const endpoint = cfg.endpoint || 'http://localhost:11434';
  const model    = cfg.model    || 'llama3';
  const res = await axios.post(`${endpoint}/api/generate`, {
    model, prompt, stream: false,
  }, { timeout: 30000 });
  const text = res.data?.response || '';
  if (!text) return { unavailable: true, message: 'No response from Ollama.' };
  return { text: text.trim(), sources };
}

async function callOpenAI(cfg, prompt, sources) {
  const endpoint = cfg.endpoint || 'https://api.openai.com/v1';
  const model    = cfg.model    || 'gpt-3.5-turbo';
  if (!cfg.apiKey) return { unavailable: true, message: 'OpenAI API key not configured.' };
  const res = await axios.post(`${endpoint}/chat/completions`, {
    model, messages: [{ role: 'user', content: prompt }], max_tokens: 300,
  }, {
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const text = res.data?.choices?.[0]?.message?.content || '';
  if (!text) return { unavailable: true, message: 'No response from AI provider.' };
  return { text: text.trim(), sources };
}

module.exports = { generateOverview, getPublicConfig, loadConfig, saveConfig };
