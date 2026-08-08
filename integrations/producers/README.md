# Producers — menciones competitivas

- Extensión: `apps/responselens-extension/lib/competitor-scan.js`
  - Hacker News (Algolia) — sin API key
  - Reddit — **OAuth app-only** si Config tiene keys; si no, search.json público
  - Noticias — **NewsAPI** si hay key; si no, Google News RSS (rivales + marca propia)
  - Import de la pestaña activa
- Credenciales locales: `lib/scan-credentials.js` (`rl_scan_credentials`)
- Lambda: `lambda_code/ingestion/competitor_scan/src/reddit-mentions.ts`
  - Env: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `NEWSAPI_API_KEY`
  - Terraform: `infra` → `reddit_*` / `newsapi_api_key`

Setup y política de producto: `docs/product-sources.md`.

Meta / TikTok / Glassdoor / LinkedIn: solo content script en página (sin crawl).

## CRM / Share
Ver `docs/integrations.md`.
