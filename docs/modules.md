# Funcionalidad operativa (extensión)

## Triage de crisis
Cada análisis incluye `riskScore`, `riskLevel`, flags de escalado y acción recomendada (público / DM / legal / safety).

## Historial + KPIs
Las inyecciones quedan en `rl_reply_history` (export CSV). Cabecera con respuestas/7d, alertas abiertas, críticas y win rate.

## Stats (panel)
Tab **Stats**: KPIs detallados, comparación Propios vs Competencia (barras + tendencia diaria), embudo de captación (abiertas → contactadas → ganadas/descartadas), distribución de riesgo, top rivales y canales. Ventana 7 / 14 / 30 días. Datos 100% locales (historial + alertas). Click en un rival del chart **Top rivales** abre su ficha.

## Ficha de percepción del rival
En **Competencia**: selector **Ficha rival** + **Ver percepción** (también 📊 / Informe IA / captar). Genera KPIs (percepción, frustración, churn, win), gráficos de temas / canales / severidad / tendencia, citas de usuarios e informe IA. Fuente: menciones de página + alertas + scan HN/Reddit.

## Workflow de captación
Estados: NEW → CONTACTED / WON / DISMISSED.

## Escaneo de competencia (valor MVP)
- Botón **Escanear ahora**: HN + Reddit (**OAuth** si hay keys) + noticias (**NewsAPI** o Google News RSS) + import de pestaña.
- Config → **Fuentes profesionales (API)**: Reddit OAuth + NewsAPI. Detalle: `docs/product-sources.md`.
- Noticias: rivales **y** tu marca (badge “Tu marca” si hay menciones negativas/críticas).
- **Sin simulados**: si no hay hits, el feed queda vacío (mensaje claro).
- Cron Lambda `competitor_scan`: HN + Reddit (OAuth/env) + NewsAPI cuando hay env vars.
- Detección en página también en Reddit; chip **captar · Rival**.

## CRM / Share (v0.6)
- Config → Integraciones: webhook + HubSpot + auto-push.
- Alertas: botones **CRM** y **Share**; ficha: **Compartir ficha**.
- Detalle: `docs/integrations.md`.

## Plataformas en página
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
