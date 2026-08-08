# Integraciones CRM + compartir data

## Estado MVP (extensión v0.6)

Funciona **en el cliente** (sin deploy de AppSync nuevo):

| Capacidad | Dónde |
|---|---|
| Webhook genérico | Config → Integraciones CRM |
| HubSpot (Private App) | Config → token; crea Contact + Note |
| Auto-push al captar | Checkbox en Config |
| Share oportunidad / ficha | Botones **Share** / **Compartir ficha** |
| Visor | `share-viewer.html` (link local + token portátil) |

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

1. **Link local** `chrome-extension://…/share-viewer.html?id=sh_…` (mismo perfil Chrome).
2. **Token** (base64url del paquete) — pegable; el destinatario lo abre en el visor.
3. TTL configurable (default 7 días). Sin tokens/API keys en el payload.

## Hexagonal (cloud-ready)

Puertos / use cases ya en monorepo:

- `ICrmPort`, `PushOpportunityToCrmUseCase`
- `IShareLinkPort`, `CreateShareLinkUseCase`
- Adapters: `WebhookCrmAdapter`, `HubSpotCrmAdapter`

Próximo paso cloud (opcional): mutations AppSync `pushOpportunityToCrm` / `createShareLink` + S3 público firmado para shares HTTPS.

## Cómo probar
1. Reload extensión **v0.6.0**
2. Config → activá webhook de prueba (webhook.site) o HubSpot token → Guardar
3. Competencia → expandí alerta → **CRM** / **Share**
4. Ficha rival → **Compartir ficha**
