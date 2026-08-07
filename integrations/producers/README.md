# Producers — menciones competitivas

- Extensión: `apps/responselens-extension/lib/competitor-scan.js`
  - Hacker News (Algolia) — principal, sin API key
  - Reddit search — best-effort
  - Import de la pestaña activa
  - Fallback sintético etiquetado
- Lambda: `lambda_code/ingestion/competitor_scan/src/reddit-mentions.ts` (misma lógica)

Próximos conectores: X API, NewsAPI, Trustpilot, G2.
