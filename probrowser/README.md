# 🔍 NovaSearch V2 — Search Engine + Mobile Browser

NovaSearch V2 is a private, local search engine and in-app browser for Android and Termux.

**No Google API. No Bing API. No API key required for core search.**

---

## Features

- **Own web crawler** with robots.txt, rate limiting, dedup
- **BM25 relevance ranking** with field weights
- **Browser-style tab system** — websites open INSIDE NovaSearch
- **Image + video indexing** from crawled pages
- **News view** from crawled article pages
- **Search suggestions** from local index + history
- **AI Overview** (optional — Ollama or OpenAI-compatible)
- **Homepage shortcuts** — add, edit, remove, reorder
- **Search & browsing history**
- **Dark / Light mode**
- **Admin dashboard** with live crawl status
- **Android WebView app** shell
- **Termux compatible** — no native modules, pure JSON storage

---

## Quick Start (Termux / Linux)

```bash
cd novasearch-v2
npm install
npm start
```

Open in browser: **http://localhost:3000**

Admin panel: **http://localhost:3000/admin**

---

## Project Structure

```
novasearch-v2/
├── server/
│   ├── server.js      ← Express API + routes
│   ├── crawler.js     ← Web crawler (concurrent, rate-limited)
│   ├── parser.js      ← HTML parser (pages, images, videos, news)
│   ├── search.js      ← Search + suggestions + image/video search
│   ├── ranker.js      ← BM25 relevance ranking
│   ├── database.js    ← JSON storage (no SQLite, no native modules)
│   ├── robots.js      ← robots.txt support
│   ├── ai.js          ← AI overview abstraction (Ollama / OpenAI)
│   └── url-utils.js   ← URL validation and normalization
│
├── public/
│   ├── index.html     ← Homepage
│   ├── results.html   ← Search results (All/Images/Videos/News/Maps)
│   ├── browser.html   ← In-app browser with tabs
│   ├── admin.html     ← Admin dashboard
│   ├── settings.html  ← Settings page
│   ├── history.html   ← Browse + search history
│   ├── styles.css     ← Full design system
│   ├── app.js         ← Shared utilities + homepage
│   ├── results.js     ← Results page logic
│   ├── browser.js     ← Tab system + navigation
│   ├── admin.js       ← Admin dashboard logic
│   ├── settings.js    ← Settings logic
│   └── history.js     ← History page logic
│
├── android/
│   └── app/src/main/
│       ├── java/com/novasearch/browser/MainActivity.java
│       ├── res/layout/activity_main.xml
│       └── AndroidManifest.xml
│
├── data/
│   └── novasearch.json   ← All indexed data (auto-created)
│
└── package.json
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=…&page=…` | Full-text search |
| GET | `/api/search/images?q=…` | Image search |
| GET | `/api/search/videos?q=…` | Video search |
| GET | `/api/suggest?q=…` | Autocomplete suggestions |
| GET | `/api/ai/overview?q=…` | AI overview (if configured) |
| GET | `/api/stats` | Index statistics |
| POST | `/api/crawl` | Start crawl `{url, maxPages, maxDepth, sameDomain}` |
| POST | `/api/crawl/stop` | Stop running crawl |
| GET | `/api/crawl/status` | Live crawl status |
| GET | `/api/proxy?url=…` | Safe proxy for in-app browser |
| GET | `/api/admin/pages` | List indexed pages |
| DELETE | `/api/admin/pages/:id` | Delete a page |
| POST | `/api/admin/reset` | Reset entire index |
| GET | `/api/ai/config` | Get AI config (no key exposed) |
| POST | `/api/ai/config` | Save AI config |

---

## Browser — In-App Navigation

All normal `http://` and `https://` links open **inside NovaSearch**.

- Chrome is NEVER opened automatically
- Android back button → WebView history → NovaSearch home
- New window links → new NovaSearch tab
- `geo:` URIs → device maps app
- "Open externally" → only on explicit user choice

---

## AI Overview (Optional)

Core search works with **no AI configured**.

To enable, go to **Settings → AI Overview**:

**Option 1 — Local Ollama:**
- Install Ollama: https://ollama.ai
- Pull a model: `ollama pull llama3`
- Set provider to `ollama`, endpoint `http://localhost:11434`

**Option 2 — OpenAI-compatible:**
- Set provider to `openai`
- Enter your API endpoint and key

If no AI is configured, results still work — the AI box is hidden.

---

## Android App

1. Copy the `android/` folder to Android Studio
2. Build → Run on device or emulator
3. The app connects to `http://localhost:3000` (start NovaSearch server first)
4. For production: update `NOVA_HOME` in `MainActivity.java` to your server IP

`android:usesCleartextTraffic="true"` is set for localhost. For production HTTPS, remove it and configure your server with TLS.

---

## V1 → V2 Differences

V1 is preserved unchanged in `novasearch/`. V2 is in `novasearch-v2/`.

| Feature | V1 | V2 |
|---------|----|----|
| Search | ✅ | ✅ improved |
| Crawler | ✅ | ✅ + image/video |
| Browser tabs | ❌ | ✅ |
| In-app navigation | ❌ | ✅ |
| Image search | ❌ | ✅ |
| Video search | ❌ | ✅ |
| News view | ❌ | ✅ |
| Maps intent | ❌ | ✅ |
| AI Overview | ❌ | ✅ (optional) |
| Shortcuts | ❌ | ✅ |
| History | ❌ | ✅ |
| Suggestions | ❌ | ✅ |
| Settings page | ❌ | ✅ |
| Android WebView app | ❌ | ✅ |
