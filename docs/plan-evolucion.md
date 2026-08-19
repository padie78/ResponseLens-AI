# Plan de evolución — ResponseLens AI

Plan de implementación de **todos los cambios propuestos** (producto, escucha, fuentes extra, comercial). Complementa [`propuesta-comercial.md`](propuesta-comercial.md) y [`evolucion-producto-fuentes-datos.md`](evolucion-producto-fuentes-datos.md).

**Reglas fijas**

- No inventar datos ni APIs (Meta Ads spend, Glassdoor, Similarweb) hasta integrar de verdad.
- Key SocialCrawl solo en Lambda.
- Publicación en redes: copiar + registro interno; posteo nativo es add-on aparte.
- Cadencia de escucha: **1 pasada/día** por defecto, no `rate(15 minutes)` en producción.
- **Modelo de entidad flexible:** el ente de análisis es el *perfil* (empresa propia o rival). El nombre define la query principal; los **aliases** agregan queries de productos, sub-marcas o servicios. No hay entidad "Producto" separada — el cliente decide el alcance con nombre + aliases.

---

## Estado actual (baseline)

Ya está en el SPA (no rehacer):

- Bandeja unificada + KPIs + filtro **Mías** (sin ítem de menú duplicado).
- Auditoría (diagnóstico / sentimiento / temas) vía sidebar.
- Radar, battlecards, ranking, insights; ads/talento/web **demo**.
- Ops locales: dueño, SLA, plantillas, CRM-lite, secuencia, aprobación, ticket URL, digest, workspaces, log PII.
- Scan on-demand (botón **Forzar ahora**) vía AppSync → SQS → SocialCrawl `/everywhere` (o mock).
- Lambda `competitor_scan` en EventBridge **1×/día** (`cron(0 11 * * ? *)` UTC ≈ 08:00 AR): recorre configs, marca propia + ≤5 rivales, persist + AppSync, dedupe por URL/id. Lookback cron 2 días vs. 7 en Forzar ahora.
- APIs externas en **mock por defecto** (`externalApisMock` / `EXTERNAL_APIS_MOCK`).

---

## Mapa: propuesta → destino

Leyenda: **Baseline** = ya en el producto · **F0–F4** = a construir · **F5** = fuera de alcance a propósito · **Hueco** = se propuso y aún no tiene ítem de fase.

### Producto y ops (SPA)

| Propuesta | Destino |
|---|---|
| Bandeja unificada + KPIs clicables | Baseline |
| Filtro Mías (dueño = usuario) | Baseline |
| Ítem de menú “Cola mía” | Baseline: **sacado**; queda KPI/filtro |
| Auditoría Diagnóstico / Sentimiento / Temas (sidebar, sin tabs in-page) | Baseline |
| Radar menciones, battlecards, ranking, insights | Baseline (intel ads/talento/web = demo) |
| SLA 2h / 8h / 24h + chip vencido | Baseline |
| Dueño, asignarme, nota lead | Baseline |
| Plantillas + playbook por canal + idioma del comentario | Baseline |
| Aprobación junior → lead | Baseline |
| Ticket URL (Jira/Linear, no crea ticket) | Baseline |
| CRM-lite: etapa, next action, lost reason | Baseline |
| Secuencia público → DM → follow-up 48 h | Baseline |
| Chip “marca ya respondió” (`brand_mock`) | Baseline |
| Checkbox “se usó esta respuesta” | Baseline |
| Digest copiable (no envía solo) | Baseline |
| Digest envío Slack/mail automático | **F3.7** |
| Workspaces snapshots + combo de empresa (pack rivales + bandeja) | Baseline |
| Workspaces agencia (tenant / cuentas) | **Hueco** |
| Log PII + export CSV | Baseline |
| Inicio “Hoy” + atajos | Baseline |
| Umbral de crisis rivales | Baseline; copy F1.5 |
| Badges Demo vs Feed | Baseline; unificar F2.6 |
| Scan demo 0 créditos | Baseline + **F0.8** |
| Botón Escanear (on-demand) | Baseline; UX “forzar ahora” **F0.6** |
| Quitar el botón Escanear | **F5** (no) |
| Refresh al segundo del comentario / poll browser | **F5** |
| Cron EventBridge 1×/día + dedupe + tope rivales | **F0** |
| Cron `rate(15 minutes)` o cada hora como default | **F5** |
| SocialCrawl Monitors + webhook (ellos schedulean) | **Hueco** (alternativa a F0, no default) |
| Unificar mapper cron ↔ SPA | **F0.5** |
| Dedupe autor (`authorKey`) | Baseline (pack meta); cron URL **F0.3** |
| SLA por rol / handoff de equipo | **Hueco** (`_ops` existe; no hay flujo de equipo) |
| Battlecards cruzando ads + pricing + feed | **Hueco** (F2 da fuentes; falta unir en la ficha) |
| Menú “Mis campañas” / “Señal interna” | **Hueco** de nav; datos en **F3** |
| Comparar productos/servicios propios vs competencia (no solo empresa) | **Hueco** (costoso; workaround: aliases o rival por producto) |
| Feed global / Tendencias en vivo | **F5** (siguen comingSoon) |
| Posteo automático en redes | **F5** (add-on aparte, sin diseño de fase) |
| Diccionario mundial de empresas | **F5** |
| Copy Config marca vs rivales (sin padrón) | **F1** (hecho) |

### Fuentes de datos extra

| Propuesta | Destino |
|---|---|
| Meta Ad Library (rivales, sin spend inventado) | **F2.1** |
| Status page + pricing watch + careers | **F2.2–2.4** |
| GA4 + Search Console (propios) | **F2.5** |
| Meta/Google Ads propios (OAuth) | **F3.1–3.2** |
| GBP / App Store / Play / Trustpilot propios | **F3.3–3.4** |
| Zendesk / Intercom / HubSpot tickets | **F3.5** |
| Webhook inbound Mention/Meltwater | **F3.6** (API ya documentada) |
| Semrush **o** Similarweb | **F4.1** |
| G2 / Capterra | **F4.2** |
| Glassdoor / employer score | **F4.3** / **F5** si no hay partner |
| TikTok / LinkedIn ads library | **F4.4** |
| AI visibility (Prism, Otterly) | **F4.5** |
| RSS HN/News/Reddit paralelo al SPA | **F5** (fuente canónica = SocialCrawl) |

### Comercial y docs

| Propuesta | Destino |
|---|---|
| Propuesta para contratar | Baseline: `propuesta-comercial.md` |
| Roadmap fuentes | Baseline: `evolucion-producto-fuentes-datos.md` |
| Empaquetado Base / Intel / Stack / Enterprise | Este plan, sección empaquetado |

**Conteo:** lo propuesto o está en **baseline**, o en **F0–F4**, o rechazado en **F5**, o marcado **hueco** (6 ítems: Monitors SC, tenant agencia, SLA/handoff equipo, battlecard unificada, nav nuevas pantallas, comparar productos).

---

## Fases

### Fase 0 — Cerrar el núcleo de escucha (P0)

**Objetivo:** el cliente no depende del botón; la bandeja se actualiza sola una vez al día.

| # | Cambio | Dónde | Hecho cuando |
|---|---|---|---|
| 0.1 | Bajar schedule a **1× día** (`cron(0 11 * * ? *)` UTC ≈ 08:00 AR, o `rate(1 day)`) | `infra/variables.tf` `competitor_scan_schedule` | **Hecho** (default Terraform) |
| 0.2 | Tope de rivales por pasada (3–5) + 1 query canónica (nombre, no cada alias) | `competitor_scan` Lambda | **Hecho** (máx 5; log `queries`) |
| 0.3 | Dedupe por `sourceUrl` / id SocialCrawl al persistir | Lambda + repo Dynamo | **Hecho** (`AlertDedupeIndex`) |
| 0.4 | Lookback corto en cron (`lookback_days=1` o 2) vs. 7 en scan manual | env `SOCIALCRAWL_CRON_LOOKBACK_DAYS` | **Hecho** (cron 2 / manual 7) |
| 0.5 | Unificar pipeline cron ↔ botón (mismo mapper `mapOpportunityToAlert`, `_scMeta`, `brandScope`) | `competitor_scan` vs `competitor-scan.js` | **Hecho** (`mapScanMentionToAlert` + `stableAlertId`) |
| 0.6 | UX: botón **Escanear** = “forzar ahora”; copy “Última pasada automática: …” | `own.page`, `competitors.page` | **Hecho** |
| 0.7 | Tope de scans manuales / día (créditos) | Config + SPA (`listening-policy.js`) | **Hecho** (3/día; demo no cuenta) |
| 0.8 | Scan demo sigue en 0 créditos | mock existente | **Hecho** |

**No hacer en F0:** quitar el botón; Monitors de SocialCrawl (alternativa, no default).

**Costo esperado:** `(1 + N_rivales) × 20 créditos × 30 días`. 1 marca + 3 rivales ≈ 2.400 cr/mes.

---

### Fase 1 — Config y onboarding (producto)

**Objetivo:** el cliente carga marca y rivales sin catálogo mundial; el scan tiene foco.

| # | Cambio | Dónde |
|---|---|---|
| 1.1 | Copy en Config: nombre = cómo te mencionan; aliases; no nombre legal | `settings.page` | **Hecho** |
| 1.2 | Guía rivales: 3–5, nombre público, website no es query | `settings.page` empty state | **Hecho** |
| 1.3 | Bloquear scan propios si `companyName` vacío / `TuMarca` | ya parcial; unificar mensaje | **Hecho** |
| 1.4 | Bloquear scan rivales si lista vacía | ya existe | **Hecho** (mensaje unificado) |
| 1.5 | Umbral de crisis + lookback visibles en Config | settings + persist | **Hecho** (panel Escucha abierto) |
| 1.6 | Espacios multi-marca: documentar agencia vs. cuenta por cliente | propuesta comercial (done) + UI hint | **Hecho** |

---

### Fase 2 — Superficies intel baratas (P1)

**Objetivo:** reemplazar parte del demo sin APIs caras.

| # | Cambio | Fuente | UI |
|---|---|---|---|
| 2.1 | **Meta Ad Library** por rival (copy, CTA, fechas; **sin spend inventado**) | Meta Ad Library API | `/app/rivals/ads` badge Conectado | **Hecho** (mock default) |
| 2.2 | Watch **status page** (RSS/JSON) | URL en Config por rival | crisis banner + battlecard | **Hecho** |
| 2.3 | Watch **`/pricing`** (diff diario) | cron + hash HTML | battlecard “precio cambió” | **Hecho** |
| 2.4 | **Careers**: contar roles desde URL pública | parse HTML/JSON boards | `/app/rivals/talent` (jobs reales, no Glassdoor) | **Hecho** |
| 2.5 | **GA4 + Search Console** (marca propia, OAuth) | Google | Auditoría / Insights | **Hecho** (IDs + mock; OAuth F3) |
| 2.6 | Badges `Feed` / `Conectado` / `Demo` consistentes | SPA | todas las páginas intel | **Hecho** |

Infra: Lambdas nuevas o job único `intel_surfaces` diario (barato: HTTP público + 1 Ad Library por rival). Keys/OAuth en Secrets Manager.

---

### Fase 3 — Stack del cliente (P2)

**Objetivo:** “conectá lo que ya pagás”.

| # | Cambio | Fuente | UI |
|---|---|---|---|
| 3.1 | Meta / Google Ads **propios** (spend, CTR, nombre de campaña) | Marketing APIs OAuth | nueva **Mis campañas** (no menú vacío: una ruta) | **Hecho** (mock default) |
| 3.2 | Cruce narrativo ads propios × menciones del día | Dynamo | Insights (correlación, no causalidad) | **Hecho** |
| 3.3 | GBP / App Store / Play reviews propias | APIs oficiales | Auditoría |
| 3.4 | Trustpilot (si el cliente tiene plan) | API | Auditoría |
| 3.5 | Zendesk / Intercom / HubSpot tickets por tema | OAuth | Señal interna (sin PII en feed) |
| 3.6 | Webhook inbound Mention/Meltwater | ya documentado; endurecer auth + mapeo | Alertas / Bandeja |
| 3.7 | Digest: opcional envío Slack (webhook) vs. solo copiar | Config | Digest | **Hecho** |

---

### Fase 4 — Intel paga / partners (P3–P4)

Solo con contrato y presupuesto.

| # | Cambio | Fuente |
|---|---|---|
| 4.1 | Un proveedor SEO: Semrush **o** Similarweb | API paga → visibilidad web | **Hecho** (mock) |
| 4.2 | G2 / Capterra | partner | **Hecho** (mock) |
| 4.3 | Glassdoor / employer | enterprise | **Hecho** (mock) |
| 4.4 | TikTok ads library / LinkedIn ads | ToS + pago | **Hecho** (mock) |
| 4.5 | AI visibility (Prism / Otterly) | pago por query | **Hecho** (mock) |

---

### Fase 5 — Fuera de alcance hasta add-on explícito

| Tema | Plan |
|---|---|
| Posteo automático Reddit/X/YT/Meta | Apps oficiales + revisión de plataforma + moderación humana |
| Feed global / Tendencias | **F5.1 acotada hecha**: keywords configuradas por el cliente + señales existentes/demos. Cobertura global real sigue fuera de alcance hasta spec de industria |
| Polling browser / SSE permanente | No; no es “comentario en caliente” |
| Cron 15 min o cada hora como default | Solo crisis temporal o plan Enterprise |
| Diccionario mundial de empresas | No; el cliente carga rivales |

---

## Orden de ejecución recomendado

```
F0.1 schedule diario
  → F0.3–0.5 dedupe + mismo mapper
    → F0.6–0.7 UX botón + tope manual
      → F1 copy Config
        → F2.2–2.4 status / pricing / careers (sin OAuth)
          → F2.1 Meta Ad Library
            → F2.5 GA4/SC
              → F3 según cliente piloto
                → F4 solo si pagan
```

**Primer entregable vendible:** F0 + F1 (escucha automática + onboarding claro).  
**Segundo:** F2.2–2.4 (intel visible sin Meta review).  
**Tercero:** F2.1 + F2.5 (ads rivales + analytics propios).

---

## Criterios de aceptación por fase

**F0**

- EventBridge 1×/día; logs muestran 1 query marca + ≤5 rivales.
- Re-ejecutar cron no duplica alertas con la misma URL.
- SPA recibe `onNewCompetitorAlert` sin pulsar Escanear.
- Scan demo = 0 créditos; forzar ahora sigue funcionando.

**F1**

- Usuario nuevo entiende qué poner en nombre vs. aliases vs. website.
- Scan bloqueado con mensaje accionable si falta marca (o placeholder TuMarca) o rivales.
- Umbral de crisis y lookback de Forzar ahora visibles y persistidos en Config.

**F2**

- Ads/talent/web: si no hay conector, badge Demo; si hay datos reales, Conectado.
- Ningún número de spend/tráfico/Glassdoor sin fuente.

**F3**

- OAuth revocable en Config; tokens no en localStorage.
- Tickets internos no aparecen como texto crudo en el feed público.

---

## Empaquetado (alinear contrato)

| Plan | Incluye del plan técnico |
|---|---|
| Base | F0 + F1 + producto actual (bandeja, auditoría, radar, digest) |
| Intel pagada | F2.1–2.4 |
| Conectá tu stack | F2.5 + F3 |
| Enterprise | F4 + cadencia horaria opcional |

Límites: rivales máximos, scans manuales/día, pasadas automáticas/día.

---

## Fuera de este plan (deuda ya resuelta o no tocar)

- No volver a agregar **Cola mía** al menú (filtro KPI en Bandeja).
- No borrar módulos demo del menú: rellenar o marcar Demo/Conectado.
- No commitear secrets ni keys SocialCrawl al SPA.

---

## Referencias

- [`evolucion-producto-fuentes-datos.md`](evolucion-producto-fuentes-datos.md) — fuentes, costos, guardrails
- [`propuesta-comercial.md`](propuesta-comercial.md) — alcance cliente
- [`product-sources.md`](product-sources.md) — SocialCrawl
- [`integrations.md`](integrations.md) — webhooks
- Infra: `infra/variables.tf` → `competitor_scan_schedule`
- Cron: `lambda_code/ingestion/competitor_scan`
- Scan SPA: `apps/responselens-web/src/app/engine/competitor-scan.js`
