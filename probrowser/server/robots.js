'use strict';

const axios = require('axios');
const robotsParser = require('robots-parser');

const BOT_NAME   = 'NovaSearchBot';
const USER_AGENT = 'NovaSearchBot/2.0 (+http://localhost:3000/bot)';
const CACHE_TTL  = 60 * 60 * 1000;

const cache = new Map();

async function fetchRobots(origin) {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.robots;
  const robotsUrl = `${origin}/robots.txt`;
  let robots = null;
  try {
    const res = await axios.get(robotsUrl, {
      timeout: 8000, maxContentLength: 512 * 1024,
      headers: { 'User-Agent': USER_AGENT }, maxRedirects: 3,
      validateStatus: s => s < 500,
    });
    if (res.status === 200 && typeof res.data === 'string') {
      robots = robotsParser(robotsUrl, res.data);
    }
  } catch { /* treat as no restrictions */ }
  cache.set(origin, { robots, timestamp: Date.now() });
  return robots;
}

async function isAllowed(url) {
  try {
    const u = new URL(url);
    const origin = `${u.protocol}//${u.hostname}`;
    const robots = await fetchRobots(origin);
    if (!robots) return true;
    const result = robots.isAllowed(url, BOT_NAME);
    return result !== false;
  } catch { return true; }
}

module.exports = { isAllowed };
