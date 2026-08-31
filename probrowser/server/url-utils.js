'use strict';

const { URL } = require('url');

const SKIP_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
  '.zip', '.rar', '.tar', '.gz', '.7z', '.bz2',
  '.mp3', '.wav', '.flac', '.ogg',
  '.css', '.json', '.xml', '.rss', '.atom', '.txt',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dmg', '.pkg', '.deb', '.rpm',
]);

// Extensions we specifically want to crawl for media indexing
const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.mp4', '.avi', '.mov', '.mkv', '.webm',
]);

function normalizeUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  rawUrl = rawUrl.trim();
  if (!rawUrl || rawUrl.startsWith('javascript:') || rawUrl.startsWith('data:') || rawUrl.startsWith('file:')) return null;
  try {
    const url = new URL(rawUrl, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    try { url.pathname = encodeURI(decodeURIComponent(url.pathname)); } catch { /* leave */ }
    return url.href;
  } catch { return null; }
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (!u.hostname || u.hostname.length < 2) return false;
    return true;
  } catch { return false; }
}

function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return ['http:', 'https:'].includes(u.protocol);
  } catch { return false; }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function isSameDomain(urlA, urlB) {
  return getDomain(urlA) === getDomain(urlB);
}

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase().split('?')[0];
    const dot = pathname.lastIndexOf('.');
    return dot >= 0 ? pathname.substring(dot) : '';
  } catch { return ''; }
}

function shouldSkipUrl(url) {
  const ext = getExtension(url);
  return SKIP_EXTENSIONS.has(ext);
}

function isMediaUrl(url) {
  return MEDIA_EXTENSIONS.has(getExtension(url));
}

module.exports = { normalizeUrl, isValidUrl, isSafeUrl, getDomain, isSameDomain, shouldSkipUrl, isMediaUrl, getExtension };
