# Producers — menciones competitivas

- Extensión: `apps/responselens-extension/lib/competitor-scan.js`
  - Hacker News (Algolia) — sin API key
  - Reddit — **OAuth app-only** si Config tiene keys; si no, search.json público
  - Noticias — **NewsAPI** si hay key; si no, Google News RSS (rivales + marca propia)
  - **SocialCrawl** — `GET /v1/search/everywhere` si hay key local (`lib/socialcrawl-client.js`)
  - Import de la pestaña activa
  - **Propios:** `runOwnBrandScan` (mismo stack, `_brandScope: 'own'`) → feed en tab Propios + Responder/inyectar
  - Análisis: `lib/mention-intelligence.js` (sin secrets; tono por plataforma)
- Credenciales locales: `lib/scan-credentials.js` (`rl_scan_credentials`)
- Lambda: `lambda_code/ingestion/competitor_scan/src/reddit-mentions.ts`
  - Env: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `NEWSAPI_API_KEY`
  - Terraform: `infra` → `reddit_*` / `newsapi_api_key`
- **Inbound webhook (AWS):** `lambda_code/ingestion/mention_webhook`
  - `POST /v1/webhooks/mentions` (API Gateway HTTP)
  - Header `X-ResponseLens-Secret`
  - Outputs: `mentions_webhook_url`, `inbound_webhook_secret`
  - Ver `docs/integrations.md`

Setup y política de producto: `docs/product-sources.md`.

Meta / TikTok / Glassdoor / LinkedIn: solo content script en página (sin crawl).

## CRM / Share
Ver `docs/integrations.md`.
