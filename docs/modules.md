# Funcionalidad operativa (extensión)

## Triage de crisis
Cada análisis incluye `riskScore`, `riskLevel`, flags de escalado y acción recomendada (público / DM / legal / safety).

## Historial + KPIs
Las inyecciones quedan en `rl_reply_history` (export CSV). Cabecera con respuestas/7d, alertas abiertas, críticas y escalados.

## Workflow de captación
Estados: NEW → CONTACTED / WON / DISMISSED.

## Escaneo de competencia (valor MVP)
- Botón **Escanear ahora**: Hacker News (Algolia) + Reddit (best-effort) + import de la pestaña activa.
- **Sin simulados**: si no hay hits públicos, el feed queda vacío (mensaje claro).
- Al escanear se eliminan alertas `_synthetic` / demos viejas.
- Cron Lambda `competitor_scan` publica solo menciones live.
- Detección en página también en Reddit; chip **captar · Rival**.

## Plataformas configurables
- Config → **Fuentes de escaneo**: HN / Reddit API / pestaña activa.
- Config → **Plataformas en página**: Amazon, eBay, YouTube, X, Reddit (on/off).
- **+ Agregar plataforma**: dominio custom (Chrome pide permiso; detecta con selectores genéricos).

## Detección configurable
Sensibilidad, keywords extra, dominios ignorados y badge en el icono del plugin con el conteo de quejas en la página.

## Fallback offline
Si AppSync/LLM falla (o no está configurado), genera 3 tonos + triage heurístico local para no bloquear al agente.

## IA en respuestas
- Propios: 3 tonos + badge **Recomendada** (LLM o fallback heurístico).
- Competencia: 3 pitches (Suave recomendado / Directo / Técnico); clic para elegir antes de copiar/inyectar.

## Auth
Login Cognito (email) o modo local. Ver `docs/auth.md`.
