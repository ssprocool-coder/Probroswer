'use strict';

const cheerio = require('cheerio');

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'object', 'embed',
  'nav', 'header', 'footer', '.nav', '.navbar', '.footer', '.sidebar',
  '.ad', '.ads', '.advertisement', '.cookie-banner', '.popup',
  '[aria-hidden="true"]', '.hidden', '.visually-hidden',
];

const CONTENT_SELECTORS = [
  'main', 'article', '[role="main"]', '.content', '.main-content',
  '#content', '#main', '.post', '.post-body', '.post-content',
  '.entry-content', '.article-body', '.page-content', '.text-content',
];

// Video hosting domains we recognize
const VIDEO_DOMAINS = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv', 'rumble.com'];

function cleanText(text) {
  if (!text) return '';
  return text.replace(/[<>"'&\0]/g, ' ').replace(/\s+/g, ' ').trim();
}

function emptyResult(url) {
  return { title: url, description: '', headings: '', bodyText: '', canonical: url, links: [], images: [], videos: [], publishedDate: null, isNews: false };
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function parseHtml(html, pageUrl) {
  let $;
  try { $ = cheerio.load(html, { decodeEntities: true }); }
  catch { return emptyResult(pageUrl); }

  $(NOISE_SELECTORS.join(', ')).remove();

  // Title
  const title = cleanText(
    $('title').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text() || ''
  ).slice(0, 512);

  // Description
  const description = cleanText(
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') || ''
  ).slice(0, 1024);

  // Canonical
  const canonical = ($('link[rel="canonical"]').attr('href') || pageUrl).trim();

  // Headings
  const headingParts = [];
  $('h1, h2, h3, h4').each((_, el) => {
    const text = cleanText($(el).text());
    if (text) headingParts.push(text);
  });
  const headings = headingParts.join(' | ').slice(0, 2048);

  // Published date
  let publishedDate = null;
  const dateSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]', 'meta[name="publishdate"]',
    'time[datetime]', 'meta[itemprop="datePublished"]',
  ];
  for (const sel of dateSelectors) {
    const val = $(sel).attr('content') || $(sel).attr('datetime');
    if (val) { publishedDate = val; break; }
  }

  // Is this page news-like?
  const isNews = !!(
    $('meta[property="article:published_time"]').length ||
    $('meta[property="og:type"]').attr('content') === 'article' ||
    $('article').length > 0
  );

  // Thumbnail
  const thumbnail =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') || null;

  // Body text
  let bodyEl = null;
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) { bodyEl = el; break; }
  }
  const rawBody = bodyEl ? bodyEl.text() : $('body').text();
  const bodyText = cleanText(rawBody).slice(0, 50000);

  // Links
  const links = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
      links.push(href);
    }
  });

  // Images — discover from <img> tags and srcsets
  const images = [];
  const pageDomain = getDomain(pageUrl);
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    const alt = cleanText($(el).attr('alt') || '');
    const imgTitle = cleanText($(el).attr('title') || '');
    if (!src || src.startsWith('data:')) return;
    try {
      const absUrl = new URL(src, pageUrl).href;
      if (!['http:', 'https:'].includes(new URL(absUrl).protocol)) return;
      // Skip tiny images (icons etc.)
      const width = parseInt($(el).attr('width') || '0');
      const height = parseInt($(el).attr('height') || '0');
      if (width > 0 && width < 50) return;
      if (height > 0 && height < 50) return;
      images.push({ url: absUrl, source_url: pageUrl, alt, title: imgTitle, domain: pageDomain });
    } catch { /* skip */ }
  });

  // Videos — discover embedded players and links
  const videos = [];
  // YouTube iframes
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const isVideo = VIDEO_DOMAINS.some(d => src.includes(d));
    if (!isVideo) return;
    try {
      const absUrl = new URL(src, pageUrl).href;
      videos.push({
        url: absUrl,
        source_url: pageUrl,
        title: title,
        description: description.slice(0, 200),
        thumbnail: thumbnail || null,
        domain: pageDomain,
      });
    } catch { /* skip */ }
  });
  // Direct video links
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const isVideo = VIDEO_DOMAINS.some(d => href.includes(d));
    if (!isVideo) return;
    try {
      const absUrl = new URL(href, pageUrl).href;
      const linkText = cleanText($(el).text()) || title;
      if (!videos.some(v => v.url === absUrl)) {
        videos.push({
          url: absUrl, source_url: pageUrl, title: linkText,
          description: '', thumbnail: null, domain: pageDomain,
        });
      }
    } catch { /* skip */ }
  });

  return { title, description, headings, bodyText, canonical, links, images, videos, publishedDate, isNews, thumbnail };
}

module.exports = { parseHtml };
