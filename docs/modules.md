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

## Detección configurable
Sensibilidad, keywords extra, dominios ignorados y badge en el icono del plugin con el conteo de quejas en la página.

## Fallback offline
Si AppSync/LLM falla (o no está configurado), genera 3 tonos + triage heurístico local para no bloquear al agente.

## Análisis manual
En Canales Propios / Competencia se puede pegar cualquier queja y analizarla o generar pitch sin estar en la página fuente.
