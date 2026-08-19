# Evolución del producto — Fuentes de datos más allá de SocialCrawl

Roadmap de inteligencia para ResponseLens AI. Complementa `product-sources.md`, `propuesta-comercial.md` y el plan de implementación [`plan-evolucion.md`](plan-evolucion.md).

**Principio:** SocialCrawl cubre la **voz pública** (menciones, hilos, comentarios, noticias vía Tavily/Perplexity). Las capas siguientes aportan señal **comercial, de producto, employer brand y canal** — con APIs oficiales, OAuth del cliente o cron sobre URLs públicas. **No inventar datos** (spend, Glassdoor score, tráfico exacto) sin fuente verificable.

---

## 1. Qué cubre SocialCrawl hoy

| Área | Cobertura |
|---|---|
| Menciones en redes y foros | Reddit, X, YouTube, TikTok, Instagram, HN, LinkedIn, Threads, GitHub, etc. |
| Comentarios destacados | `top_comments` en resultados `/everywhere` |
| Noticias / web synthesis | Tavily, Perplexity dentro del fan-out |
| Costo | **20 créditos fijos** por llamada `/everywhere` |
| Cadencia recomendada | **1 pasada/día** (marca + N rivales), no polling agresivo |

**Fuera de alcance de SocialCrawl:** performance de tus campañas pagas, reviews estructuradas (G2/Trustpilot), tráfico web estimado, ads library completa, tickets internos, CRM.

---

## 2. Mapa de huecos vs. módulos del producto

| Módulo UI | SocialCrawl | Hueco principal |
|---|---|---|
| Bandeja / Radar menciones | ✅ Feed real | — |
| Auditoría de marca | ✅ Sobre feed propio | Reviews con estrellas (GBP, app stores) |
| Fichas de batalla | ✅ Dolor del feed | Ads, pricing, jobs, uptime |
| Radar de anuncios | ⚠️ Demo | Meta Ad Library, ads propios |
| Talento / HR | ⚠️ Demo | Careers públicos, layoffs (news) |
| Visibilidad web | ⚠️ Demo | GA4/SC propios; Semrush/Similarweb rivales |
| Ranking / Insights | ✅ Parcial | Reviews + tráfico agregado |
| Digest / crisis | ✅ Menciones/24h | Status pages rivales |

Leyenda: ✅ operativo con feed · ⚠️ demo determinista (`rival-surface-intel.js`) hasta integrar API.

---

## 3. Categorías de datos, valor y obtención

### A. Publicidad (propia y competencia)

**Valor:** ángulos de mercado, creatividades, landings, timing; enriquece battlecards y captación (“rival promete X en ads mientras hay quejas de Y en el feed”).

| Señal | Ejemplo | Obtención | Costo / acceso |
|---|---|---|---|
| Ads activos rival (Meta) | Copy, CTA, fecha, página | **Meta Ad Library API** | Gratis con app Meta; cobertura geográfica limitada |
| Ads Google / YouTube | Anunciante, formato | Google Ads Transparency Center / datasets públicos | Gratis, incompleto; API menos uniforme |
| LinkedIn / TikTok ads | Sponsored content | Marketing APIs o librerías terceros | Pago / ToS estricto |
| **Tus** campañas (spend, CTR, ROAS) | “Campaña ‘vs PayPal’ +40% impresiones” | **Meta Marketing API**, **Google Ads API** | OAuth cuenta del **cliente** |
| Cambios en landing de ads | Diff en URL de pricing/LP | Cron + diff HTML / Visualping | Free tier bajo |
| Share of voice paid estimado | Quién invierte más | Semrush Advertising Research, Similarweb | Pago (USD 100+/mes) |

**Evolución P1:** Meta Ad Library por rival (reemplazar demo en Radar de anuncios).  
**Evolución P2:** Conector OAuth ads **propios** (panel “Mis campañas”).

**No mostrar:** gasto en USD del rival sin API de pago explícita.

---

### B. Reseñas y reputación estructurada

**Valor:** estrellas, volumen, temas — mejor para auditoría y ranking que hilos sueltos.

| Señal | Fuente | Costo |
|---|---|---|
| Reviews B2B (G2, Capterra) | Partner API o enlace manual | Partner / limitado |
| Google Business Profile | **Google Business Profile API** | Gratis para **marca propia** |
| App Store / Play | **App Store Connect**, **Google Play Developer API** | Gratis (apps propias) |
| Trustpilot | Trustpilot Business API | Pago |
| Employer (Glassdoor) | Sin API pública limpia | Enterprise / agregadores |

**Evolución P2:** GBP + app reviews propias en Auditoría.  
**Evolución P3:** G2/Capterra vía partnership o curación manual.

---

### C. Web, SEO y visibilidad

**Valor:** complementa menciones (“poco ruido social pero el rival gana tráfico en keyword X”).

| Señal | Fuente | Costo |
|---|---|---|
| Tráfico estimado rival | Similarweb, Semrush, Ahrefs | Pago |
| Keywords ranking | Semrush / Ahrefs API | Pago |
| Tráfico **real** propio | **GA4**, **Search Console** | Gratis (OAuth cliente) |
| Cambios pricing / web | Cron diff `/pricing`, RSS blog | DIY |
| AI visibility | SocialCrawl Prism, Otterly, etc. | Pago por query |

**Evolución P1:** Search Console + GA4 propios.  
**Evolución P3:** Un proveedor SEO (Semrush *o* Similarweb) en plan agencia.

---

### D. Producto, precios y operaciones

**Valor:** product gap, battlecards, alertas de captación en outage del rival.

| Señal | Fuente | Costo |
|---|---|---|
| Cambio de pricing | Watch URL `/pricing` | Cron |
| Changelog / releases | RSS GitHub, blog, Statuspage | Gratis |
| Jobs = apuesta comercial | URL **careers** en Config + parse | Gratis (público) |
| Uptime / incidentes | RSS **status.rival.com**, Better Stack | Gratis–bajo |
| Layoffs / funding | News (SocialCrawl/news), Layoffs.fyi | Gratis / parcial |

**Evolución P1:** status page + pricing watch + careers count (reemplazar parte de demo Talento).

---

### E. Talento y employer brand

| Señal | Fuente | Notas |
|---|---|---|
| Vacantes abiertas | Careers URL | Conteo y títulos, no Glassdoor score inventado |
| Sentimiento empleado | Glassdoor | Solo con API/partner; hasta entonces no prometer |
| Layoffs | Noticias + Layoffs.fyi | Cruce con radar de menciones |

---

### F. Señal interna (solo marca propia)

**Valor:** cruza dolor público vs. tickets privados (sin exponer PII en feed).

| Señal | Fuente |
|---|---|
| Tickets por tema | Zendesk, Intercom, Freshdesk API |
| NPS / CSAT | HubSpot, Delighted |
| Lost deals vs. rival | CRM (webhook ya documentado en `integrations.md`) |

**Evolución P2:** capa opcional “Señal interna” en Config.

---

### G. Medios e listening enterprise

| Señal | Fuente |
|---|---|
| Prensa, comunicados | NewsAPI (docs), webhook inbound |
| Listening multicanal | Mention, Meltwater, Brandwatch → **webhook a ResponseLens** |

**No duplicar** si el cliente ya paga Mention: ingestar vía `POST /v1/webhooks/mentions`.

---

## 4. Priorización de integración

| Prioridad | Capa | Obtención | Módulo |
|---|---|---|---|
| **P0** | Escucha diaria SocialCrawl | EventBridge → Lambda (1×/día) | Bandeja, Radar |
| **P0** | Webhook inbound | API Gateway + mention-webhook | Alertas |
| **P1** | Meta Ad Library | API Meta | Radar de anuncios |
| **P1** | GA4 + Search Console | OAuth Google | Auditoría, Insights |
| **P1** | Status + pricing + careers | Cron + URLs en Config | Battlecards, Talento |
| **P2** | Meta/Google Ads propios | OAuth marketing | Nuevo: Mis campañas |
| **P2** | Trustpilot / GBP propios | APIs oficiales | Auditoría |
| **P2** | Zendesk / HubSpot | OAuth / webhook | Señal interna |
| **P3** | Semrush o Similarweb | API paga | Visibilidad web |
| **P3** | G2 / Capterra | Partner | Ranking |
| **P4** | Glassdoor, TikTok ads library, AI visibility | Enterprise | Add-on |

---

## 5. Arquitectura (patrón ResponseLens)

1. **Secrets / OAuth en Lambda** — nunca keys de pago en el SPA.
2. **Cron (EventBridge) o webhook** → normalizar → Dynamo single-table → AppSync → SPA.
3. **Badges en UI:** `Feed` (SocialCrawl) · `Conectado` (API real) · `Demo` (hasta integrar).
4. **Dedupe** por URL / id externo al persistir.
5. **Coste SocialCrawl:** presupuestar `(1 + N_rivales) × 20 créditos × pasadas/día`; ver `propuesta-comercial.md`.

Ejemplo flujo ads competencia:

```
EventBridge (daily) → Lambda ads_intel
  → Meta Ad Library (search: rival name / page id)
  → Dynamo INTEL#ADS#{rival}
  → AppSync → /app/rivals/ads
```

Ejemplo campañas propias:

```
Cliente OAuth Meta en Config
  → Lambda pull campaign insights
  → cruzar fecha con menciones SocialCrawl (correlación narrativa, no causalidad inventada)
```

---

## 6. Escucha automática vs. botón Scan

| Mecanismo | Uso |
|---|---|
| **EventBridge cron** (backend) | Pasada diaria default; key SocialCrawl en Lambda |
| **Botón Escanear** | Override manual (crisis, demo con mock = 0 créditos) |
| **SocialCrawl Monitors + webhook** | Alternativa: ellos schedulean, POST a mention-webhook |
| **Polling en browser** | ❌ No usar |

Schedule producto recomendado: **`cron(0 11 * * ? *)` UTC** (~08:00 AR) o `rate(1 day)`, no `rate(15 minutes)` en producción.

### Presupuesto de créditos (referencia)

Una **pasada** = 1 query SocialCrawl por marca + 1 por rival (20 créditos c/u).

| Config | Créditos / pasada | 1× día / mes (~30 d) |
|---|---|---|
| 1 marca + 3 rivales | 80 | ~2.400 |
| 1 marca + 5 rivales | 120 | ~3.600 |

Packs SocialCrawl (referencia): Starter 2.500 créditos / £15; Growth 20.000 / £49. Ver [Credits](https://www.socialcrawl.dev/docs/credits).

---

## 7. Empaquetado comercial

| Tier | Incluye |
|---|---|
| **Base** | SocialCrawl 1×/día, bandeja, radar menciones, auditoría sobre feed, digest |
| **Intel pagada** | Meta Ad Library + pricing/status watch rivales |
| **Conectá tu stack** | GA4, Search Console, ads propios, Zendesk, webhook Mention |
| **Enterprise** | Semrush/Similarweb, G2, employer data |

Límites contractuales: máx. rivales por plan, scans manuales/día, pasadas automáticas/día.

---

## 8. Qué no prometer (guardrails)

- Posteo automático en redes (hoy: copiar + registro interno demo).
- Glassdoor / Similarweb / Meta Ads spend **en vivo** sin integración contratada.
- Tiempo real sub-minuto: SocialCrawl es búsqueda periódica, no push nativo de cada plataforma.
- Menciones sintéticas en feed de producción.

---

## 9. Referencias internas

- [`product-sources.md`](product-sources.md) — SocialCrawl, capas A/B/C
- [`propuesta-comercial.md`](propuesta-comercial.md) — alcance cliente, menús, publicación
- [`integrations.md`](integrations.md) — webhooks CRM e inbound mentions
- [`apps/responselens-web/src/app/engine/rival-surface-intel.js`](../apps/responselens-web/src/app/engine/rival-surface-intel.js) — superficies demo actuales

---

## 10. Resumen ejecutivo

**SocialCrawl = qué dice la gente en público.** La evolución natural del producto suma: **(1) qué anuncian**, **(2) cómo les va en web y reviews**, **(3) señales de producto/precio/uptime**, **(4) datos internos del cliente (ads, tickets, analytics)** — con APIs oficiales, OAuth y cron sobre URLs públicas, siempre etiquetados por fuente en la UI.
