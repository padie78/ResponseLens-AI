# Fuentes profesionales (escaneo competitivo)

ResponseLens prioriza **APIs legales / RSS públicos** + **asistencia en página**. No hace crawl masivo de Meta, Glassdoor u otros ToS cerrados.

## Modo mock (actual)

Por defecto **`externalApisMock: true`** en el SPA y **`EXTERNAL_APIS_MOCK=true`** en Lambdas. SocialCrawl, Reddit y NewsAPI del cron **no llaman APIs reales**: usan envelopes mock con la misma forma que producción. Cero créditos SocialCrawl.

Para activar APIs reales más adelante:

- SPA: `externalApisMock: false` en `environment.ts`
- AWS: `external_apis_mock = "false"` en Terraform / env Lambda

## Capas

| Capa | Fuentes | Auth | Uso |
|---|---|---|---|
| B — Escaneo | **Solo SocialCrawl** `/everywhere` (incluye **hackernews** + news vía tavily/perplexity, Reddit, YT, X, …) o **Scanner mock** con el mismo envelope | Key en Terraform/Lambda | Única fuente de Forzar ahora / cron |
| C — Página | FB, IG, TikTok… | Sesión del usuario | Fuera del escaneo automático |

No hay fallback Algolia HN / Google News RSS / Reddit público en el scan del SPA: si SocialCrawl está off, el escaneo no corre (salvo mock).

## SocialCrawl (seguro)

- Endpoint: `GET https://www.socialcrawl.dev/v1/search/everywhere`
- Auth: header `x-api-key` **solo en Lambda** (`SOCIALCRAWL_API_KEY` ← Terraform `socialcrawl_api_key`).
- El SPA **nunca** guarda ni envía la key: `startSocialCrawlSearch` encola un job (SQS) y espera `onSocialCrawlResult` (WebSocket). El worker Lambda (timeout 120s) llama a SocialCrawl — fuera del tope de 30s de AppSync.
- Preferencias locales (lookback / sources CSV) sí pueden vivir en Empresa.
- Cron: `competitor_scan` usa `SOCIALCRAWL_CRON_LOOKBACK_DAYS` (default **2**) y `COMPETITOR_SCAN_MAX_RIVALS` (default **5**). Schedule: `cron(0 11 * * ? *)` (1×/día).
- Scan manual (**Forzar ahora**): lookback **7** días (Config). Tope **3**/día; Scan demo no cuenta.
- **Nunca** inyectar la API key en prompts LLM.
- Si una key se filtró: **rotarla** en el dashboard de SocialCrawl.

## Reddit OAuth (recomendado)

1. Crear app en [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → tipo **script**.
2. Copiar client id + secret.
3. Extensión: Config → **Fuentes profesionales** → marcar OAuth e ingresar id/secret + User-Agent (`ResponseLensAI/0.7 by <tu_user>`).
4. Lambda (opcional): `reddit_client_id`, `reddit_client_secret`, `reddit_user_agent` en Terraform / tfvars.

Flujo: `client_credentials` → `oauth.reddit.com/search`. Si falla, fallback a `reddit.com/search.json` (a menudo 403 desde cloud).

## NewsAPI

1. Key en [newsapi.org](https://newsapi.org).
2. Extensión: Config → NewsAPI habilitado + key.
3. Lambda: variable `newsapi_api_key`.

Query tip: nombre del rival + términos de frustración (scam, outage, estafa…). Plan free suele limitar dominio; el fetch lo hace el cliente o la Lambda.

## Qué no hacemos como producto

- Headless crawl de Instagram / Facebook / Glassdoor / LinkedIn.
- Inventar menciones sintéticas en el feed de producción (se purgan al escanear).

## UX

Al escanear, el status indica si Reddit usó **OAuth** o público y si noticias fueron **NewsAPI** o **RSS**.
