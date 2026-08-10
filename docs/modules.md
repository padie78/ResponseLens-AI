# Funcionalidad operativa (extensión)

## Idioma (i18n)
Selector **ES/EN/FR/IT/DE** en el header (junto al zoom). Persistido en `rl_locale`. Catálogos en `locales/*.js`. Informes largos siguen ES|EN según el texto.

## Triage de crisis (Propios)
Cada análisis incluye `riskScore`, `riskLevel`, flags de escalado y acción recomendada (público / DM / legal / safety).

### Escaneo de marca propia
Tab **Propios** → **Escanear marca** + **Informe vida digital**: score de reputación, mix +/−, temas, lectura y acciones (defense). Fuentes: HN + Reddit + noticias/artículos + YouTube + pestaña. Config → Mi empresa (ficha + canales).

## Historial + KPIs
Las inyecciones quedan en `rl_reply_history` (export CSV). Cabecera con respuestas/7d, alertas abiertas, críticas y win rate.

## Stats (panel)
Tab **Stats**: KPIs detallados, comparación Propios vs Competencia (barras + tendencia diaria), embudo de captación (abiertas → contactadas → ganadas/descartadas), distribución de riesgo, top rivales y canales. Ventana 7 / 14 / 30 días. Datos 100% locales (historial + alertas). Click en un rival del chart **Top rivales** abre su ficha.

### Score de vida digital (por rival)
Tab **Ranking**: lista 0–100 por competidor (quejas, churn, crisis, prensa). Tocá un rival → informe. También badge en alertas de Competencia y cabecera del informe.

## Ficha de percepción del rival
En **Competencia**: selector **Ficha rival** + **Ver percepción** (también Informe IA / captar). Genera:

### Reportes estratégicos (más allá del FODA)
1. **Product Gap Analysis** — cruza quejas del rival con tu **mapa de producto** (Config → roadmap). Acción: *promocionar mañana* vs *programar/priorizar*.
2. **Matriz Precio / Valor** — hikes de tarifa en noticias × enojo en comentarios → punto de quiebre (“ya no vale lo que cobra”).
3. **Churn Signal Tracking** — velocidad 24h vs día previo; si hay spike declara **Competidor en Crisis** (banner + notificación) para ads dirigidos.

### Pipeline de captación (4 pasos)
1. Filtro **intención de cambio** (ignora insultos genéricos).
2. **Score 1–100** (B2B/B2C, canal, frustración, influencia si hay evidencia).
3. **Propuesta de rescate** (público sutil o DM + link al vendedor en canales cerrados).
4. **CRM** — JSON / HubSpot / webhook con etiqueta `Cliente insatisfecho de [Rival]`, tarea *Contactar antes de 2 horas*, `contactar_antes_de`, prioridad.

También: FODA evidenciado, KPIs, gráficos (colapsados). Sin inventar datos ni tasas de cierre. Roadmap de producto es local (no va al schema AppSync aún).

## Workflow de captación
Estados: NEW → CONTACTED / WON / DISMISSED.

## Escaneo de competencia (valor MVP)
- Botón **Escanear ahora**: HN + Reddit (**OAuth** si hay keys) + noticias (**NewsAPI** o Google News RSS) + import de pestaña.
- Scoring de frustración más estricto (sin inflar MEDIUM vacío); dedupe por URL/texto; aliases del rival en queries.
- Config → **Fuentes profesionales (API)**: Reddit OAuth + NewsAPI. Detalle: `docs/product-sources.md`.
- Noticias: rivales **y** tu marca (badge “Tu marca”).
- **Sin simulados / sin phantom** en ficha: vacío = vacío.
- **Datos de prueba** (demos) ocultos por defecto. Activar desde afuera: `chrome.storage.local.set({ rl_dev_tools: true })` o abrir el panel con `?devtools=1`.
- Cron Lambda `competitor_scan`: HN + Reddit (OAuth/env) + NewsAPI cuando hay env vars.
- Detección en página también en Reddit; chip **captar · Rival**.

## Datos cloud (DynamoDB / AppSync)
- **Fuente de verdad:** DynamoDB single-table (`USER#` / `ALERT#`).
- Extensión: cache local + hydrate `getUserConfig` / `listCompetitorAlerts` al entrar.
- Escaneo / captura / cron → `upsertCompetitorAlert` (persist) + `publishCompetitorAlert` (WS).
- **Inbound webhook** (Mention/Zapier/etc.) → API Gateway `POST /v1/webhooks/mentions` → Lambda `mention-webhook` → Dynamo + AppSync. Ver `docs/integrations.md`.
- Pipeline Contactado/Ganado/Descartar → `updateCompetitorAlert`.
- Config empresa/rivales → `saveUserConfig`.
- Secretos (API keys CRM, Reddit, NewsAPI), detection UI y zoom: solo local.

## CRM / Share (v0.6)
- Config → Integraciones: webhook + HubSpot + auto-push.
- Alertas: botones **CRM** y **Share**; ficha: **Compartir ficha**.
- Detalle: `docs/integrations.md`.

## Plataformas en página
- Config → **Sesiones en el navegador**: tilde verde/roja/gris según cookies de sesión (heurística; no login automático).
- Config → **Plataformas en página**: redes + reviews (**Glassdoor, G2, Capterra, Product Hunt, Indeed**, Trustpilot…).
- Meta/TikTok/LinkedIn/reviews **no** se escanean en segundo plano: abrí la ficha/reviews y el content script marca.
- Más portales: **+ Agregar plataforma** (dominio custom).

## Detección configurable
Sensibilidad, keywords extra, dominios ignorados y badge en el icono del plugin con el conteo de quejas en la página.

## Fallback offline
Si AppSync/LLM falla (o no está configurado), genera 3 tonos + triage heurístico local para no bloquear al agente.

## Integraciones CRM + share
Ver `docs/integrations.md`. Webhook genérico + HubSpot + botones CRM/Share en oportunidades y ficha rival.

## IA en respuestas
- Propios: 3 tonos + badge **Recomendada** (LLM o fallback heurístico).
- Competencia: 3 pitches (Suave recomendado / Directo / Técnico); clic para elegir antes de copiar/inyectar.
- **Informe IA del rival**: al abrir una plataforma con menciones de competencia, banner + botón 📊 en página / **Informe IA** en la alerta. Agrega quejas de la página + HN/Reddit y genera conclusiones + markdown (offline local; nube vía `analyzeRivalReport` tras deploy).

## Auth
Login Cognito (email) o modo local. Ver `docs/auth.md`.
