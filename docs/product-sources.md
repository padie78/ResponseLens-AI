# Fuentes profesionales (escaneo competitivo)

ResponseLens prioriza **APIs legales / RSS públicos** + **asistencia en página**. No hace crawl masivo de Meta, Glassdoor u otros ToS cerrados.

## Capas

| Capa | Fuentes | Auth | Uso |
|---|---|---|---|
| A — Siempre on | Hacker News (Algolia), Google News RSS | Ninguna | Extensión + Lambda |
| B — Profesional | Reddit OAuth (app-only), NewsAPI, YouTube Data API, **SocialCrawl** | Keys en Config (local) / Terraform | Preferidas si están habilitadas |
| C — Página | FB, IG, TikTok, Threads, LinkedIn, Glassdoor, G2… | Sesión del usuario | Content script al abrir la URL |

Sin keys de capa B, el producto sigue vivo con A + C.

## SocialCrawl (seguro)

- Endpoint: `GET https://www.socialcrawl.dev/v1/search/everywhere`
- Auth: header `x-api-key` **solo en el cliente HTTP** (`lib/socialcrawl-client.js` vía service worker).
- **Nunca** inyectar la API key en prompts LLM ni en el JSON que ve el modelo.
- Análisis de tono/sentimiento: `lib/mention-intelligence.js` (código puro).
- Config → Fuentes profesionales → SocialCrawl (key en storage local del SPA).
- Si una key se filtró en chat/logs: **rotarla** en el dashboard de SocialCrawl.

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
