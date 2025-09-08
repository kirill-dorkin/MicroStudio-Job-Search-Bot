MicroStudio Job Search (bot-js)
===============================

Vercel-ready JS rewrite of the Telegram job search bot and search core.

Structure
- apps/web: Next.js app (web + API)
- packages/jobspy-js: scraping core (Indeed, ZipRecruiter; others WIP)
- packages/bot-logic: grammY bot wiring (/start, /q, /search, /sources, /region, /favorites, /saved, /export, /summary, /subs, /data_export, /data_delete)
- packages/shared-texts: RU/EN texts
- packages/storage: KV (Vercel) + file adapter (local)
\n+Web Pages
- /search — simple search form backed by /api/search
- /favorites?uid=TELEGRAM_ID — view user favorites
- /saved?uid=TELEGRAM_ID — view saved searches

Environment
- TELEGRAM_BOT_TOKEN: bot token
- TELEGRAM_WEBHOOK_SECRET: random secret for webhook header validation
- KV_URL / KV_REST_API_URL / KV_REST_API_TOKEN: Vercel KV (optional for prod)

Local Dev
1) cd bot-js
2) pnpm i
3) export TELEGRAM_BOT_TOKEN=...; export TELEGRAM_WEBHOOK_SECRET=...
4) pnpm dev (Next.js on localhost)
5) Telegram webhook needs a public URL. For local tests, deploy to Vercel or use a tunnel (then call /api/install-webhook).

Deploy to Vercel
1) Set Project root to: apps/web
2) Add env vars above (Vercel KV optional but recommended)
3) Deploy, then open /api/install-webhook once
4) Cron is configured in vercel.json to call /api/digest every 30 minutes

Notes
- Serverless time limits: search is batched and returns first portion; use inline "More" to paginate.
- Current providers: Indeed, ZipRecruiter. LinkedIn/Google/Glassdoor coming next.
- Storage falls back to local JSON in dev; in prod prefer Vercel KV.

Proxies & Debug
- To use proxies, set env var `PROXY_URLS` (comma-separated) or `PROXY_URL`. Example:
  - `PROXY_URLS=http://user:pass@host1:port,http://host2:port`
- Enable debug logs for requests with `JOBSPY_DEBUG=1`.
- Throttle per-host: `JOBSPY_PER_HOST_INTERVAL_MS` (default 200ms), pre-delay per attempt: `JOBSPY_PREDELAY_MS` (default ~80ms).
