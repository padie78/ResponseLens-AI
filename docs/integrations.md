# Integraciones CRM + compartir data

## Estado MVP (web)

Funciona en el cliente SPA (sin deploy de AppSync nuevo):

| Capacidad | Dónde |
|---|---|
| Webhook genérico | Config → Integraciones CRM |
| HubSpot (Private App) | Config → token; crea Contact + Note |
| Auto-push al captar | Checkbox en Config |
| Share oportunidad / ficha | Botones **Share** / **Compartir ficha** |

### Webhook
`POST` JSON:

```json
{
  "event": "responselens.opportunity.push",
  "version": 1,
  "sentAt": "…",
  "payload": {
    "alertId": "…",
    "competitorName": "Shopify",
    "originalComplaint": "…",
    "sourceUrl": "…",
    "salesPitch": "…",
    "severity": "HIGH"
  }
}
```

Header opcional: `X-ResponseLens-Secret`.

Compatible con Zapier / Make / n8n / Salesforce Flow / cualquier CRM con inbound webhook.

### Paquete de rescate (ficha rival · v0.11)
Desde **Ver percepción / Informe IA**:

- **Copiar JSON CRM** — lista de prospectos con intención de cambio.
- **Enviar a CRM** — webhook batch `responselens.rescue_pack.push` y/o HubSpot por lead.

Campos del JSON:

```json
[
  {
    "competidor": "Shopify",
    "usuario_origen": "u/jane",
    "url_comentario": "https://…",
    "canal_tipo": "Público/Abierto",
    "categoria_dolor": "Precio / facturación",
    "mensaje_sugerido_ia": "…",
    "mensaje_publico_ia": "…",
    "etiqueta": "Cliente insatisfecho de Shopify",
    "calificacion_oportunidad": 78,
    "segmento": "B2B",
    "influencia": "desconocida",
    "tarea": "Contactar antes de que pasen 2 horas",
    "contactar_antes_de": "2026-08-08T19:50:00.000Z",
    "prioridad": "urgente"
  }
]
```

Sin tasas de cierre ni métricas inventadas: solo evidencia del feed.

### HubSpot
Scopes sugeridos del Private App:
- `crm.objects.contacts.write`
- `crm.objects.contacts.read`
- `crm.objects.notes.write`

### Share
Al pulsar **Share** / **Compartir ficha**:

1. Elegís el **canal** (Email, WhatsApp, Slack, CRM, …).
2. Confirmás el **destinatario** (prellenado desde Config → Contactos para compartir).

| Canal | Contacto requerido |
|---|---|
| Email | dirección `to` |
| WhatsApp | teléfono con código de país |
| Slack | Incoming Webhook (o copia si vacío) + nota `#canal` |
| CRM | Webhook/HubSpot ya configurados en Integraciones |
| Portapapeles / Visor | sin destinatario |

1. **Link / token** compartible (paquete base64url) — el destinatario lo abre en el visor del SPA.
2. TTL configurable (default 7 días). Sin tokens/API keys en el payload.

## Hexagonal (cloud-ready)

Puertos / use cases ya en monorepo:

- `ICrmPort`, `PushOpportunityToCrmUseCase`
- `IShareLinkPort`, `CreateShareLinkUseCase`
- Adapters: `WebhookCrmAdapter`, `HubSpotCrmAdapter`
- **Inbound mentions:** `IngestInboundMentionUseCase` + Lambda `mention-webhook`

### Webhook entrante (AWS) — Mention / Meltwater / Brandwatch / Zapier

Tras `terraform apply` + `scripts/deploy-lambdas.sh`:

```bash
terraform output -raw mentions_webhook_url
terraform output -raw inbound_webhook_secret
```

```http
POST {mentions_webhook_url}
Content-Type: application/json
X-ResponseLens-Secret: {inbound_webhook_secret}
```

```json
{
  "event": "responselens.mention.inbound",
  "userId": "local-user",
  "brandScope": "own",
  "source": "mention",
  "text": "Terrible soporte, nadie responde.",
  "sourceUrl": "https://…",
  "channel": "twitter",
  "detectedAt": "2026-08-10T12:00:00Z",
  "sentiment": "NEGATIVE",
  "competitorName": "MiMarca"
}
```

- `brandScope: "own"` → feed **Propios** (via AppSync `onNewCompetitorAlert` + `_brandScope`)
- `brandScope: "rival"` (default) → **Competencia**
- Respuesta `202` con `alertId`

Flujo: API Gateway HTTP → Lambda → DynamoDB → `publishCompetitorAlert` → SPA (subscription).

Compatible con Zapier/Make: Webhooks by Zapier → POST a esa URL.

### SocialCrawl (escucha multi-plataforma)

- Config → Fuentes profesionales → SocialCrawl API key (local al cliente).
- La API key **nunca** entra en prompts LLM. Si se filtró: rotarla en SocialCrawl.

Próximo paso cloud (opcional): mutations AppSync `pushOpportunityToCrm` / `createShareLink` + S3 público firmado para shares HTTPS.

## Cómo probar
1. SPA en local (`npm run start:web`) o CloudFront
2. Config → activá webhook de prueba (webhook.site) o HubSpot token → Guardar
3. Competencia → expandí alerta → **CRM** / **Share**
4. Ficha rival → **Compartir ficha**
5. Inbound: `curl` al `mentions_webhook_url` con secret → mirá Propios/Competencia
