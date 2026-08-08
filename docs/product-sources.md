# Fuentes profesionales (escaneo competitivo)

ResponseLens prioriza **APIs legales / RSS públicos** + **asistencia en página**. No hace crawl masivo de Meta, Glassdoor u otros ToS cerrados.

## Capas

| Capa | Fuentes | Auth | Uso |
|---|---|---|---|
| A — Siempre on | Hacker News (Algolia), Google News RSS | Ninguna | Extensión + Lambda |
| B — Profesional | Reddit OAuth (app-only), NewsAPI | Keys en Config / Terraform | Preferidas si están habilitadas |
| C — Página | FB, IG, TikTok, Threads, LinkedIn, Glassdoor, G2… | Sesión del usuario | Content script al abrir la URL |

Sin keys de capa B, el producto sigue vivo con A + C.

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

Query tip: nombre del rival + términos de frustración (scam, outage, estafa…). Plan free suele limitar dominio; en extensión el SW hace el fetch.

## Qué no hacemos como producto

- Headless crawl de Instagram / Facebook / Glassdoor / LinkedIn.
- Inventar menciones sintéticas en el feed de producción (se purgan al escanear).

## UX

Al escanear, el status indica si Reddit usó **OAuth** o público y si noticias fueron **NewsAPI** o **RSS**.
