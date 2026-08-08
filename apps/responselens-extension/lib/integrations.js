/**
 * Integraciones CRM + paquetes compartibles (cliente extensión).
 * Webhook genérico (Zapier/Make/Salesforce Flow) + HubSpot Private App.
 */

const INTEGRATIONS_KEY = 'rl_integrations';
const SHARES_KEY = 'rl_shares';

/**
 * @typedef {{
 *   webhook?: { enabled?: boolean, url?: string, secret?: string },
 *   hubspot?: { enabled?: boolean, accessToken?: string },
 *   autoPushOnCapture?: boolean,
 *   shareTtlHours?: number,
 * }} IntegrationsConfig
 */

export function defaultIntegrationsConfig() {
  return {
    webhook: { enabled: false, url: '', secret: '' },
    hubspot: { enabled: false, accessToken: '' },
    autoPushOnCapture: false,
    shareTtlHours: 168,
    /** Destinatarios por defecto al compartir */
    contacts: {
      email: '',
      whatsapp: '', // E.164 preferido: 54911…
      slackWebhook: '', // Incoming Webhook URL
      slackLabel: '', // ej. #ventas o @diego
    },
  };
}

export async function loadIntegrations() {
  const data = await chrome.storage.local.get([INTEGRATIONS_KEY]);
  const raw = data[INTEGRATIONS_KEY] || {};
  const base = defaultIntegrationsConfig();
  return {
    ...base,
    ...raw,
    webhook: { ...base.webhook, ...(raw.webhook || {}) },
    hubspot: { ...base.hubspot, ...(raw.hubspot || {}) },
    contacts: { ...base.contacts, ...(raw.contacts || {}) },
  };
}

export async function saveIntegrations(cfg) {
  const next = {
    ...defaultIntegrationsConfig(),
    ...cfg,
    webhook: { ...defaultIntegrationsConfig().webhook, ...(cfg.webhook || {}) },
    hubspot: { ...defaultIntegrationsConfig().hubspot, ...(cfg.hubspot || {}) },
    contacts: { ...defaultIntegrationsConfig().contacts, ...(cfg.contacts || {}) },
  };
  await chrome.storage.local.set({ [INTEGRATIONS_KEY]: next });
  return next;
}

/** Normaliza teléfono para wa.me (solo dígitos, con país). */
export function normalizeWhatsAppPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

export function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || '').trim());
}

/** Post a Slack Incoming Webhook. */
export async function postSlackWebhook(webhookUrl, text) {
  if (!/^https:\/\/hooks\.slack\.com\//i.test(webhookUrl) && !/^https:\/\//i.test(webhookUrl)) {
    return { ok: false, detail: 'URL de Slack inválida' };
  }
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'RL_FETCH_POST',
      url: webhookUrl,
      body: { text: String(text || '').slice(0, 3500) },
    });
    if (res?.ok) return { ok: true, detail: 'Slack OK' };
    // fallback directo
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text || '').slice(0, 3500) }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, detail: `HTTP ${r.status} ${t.slice(0, 120)}` };
    }
    return { ok: true, detail: 'Slack OK' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Payload canónico hacia CRM / webhook.
 */
export function buildCrmPayload(alert, extras = {}) {
  const prospect = extras.prospect || null;
  return {
    alertId: alert.alertId,
    userId: alert.userId || 'local-user',
    competitorName: alert.competitorName || prospect?.competidor || null,
    originalComplaint: alert.originalComplaint,
    sourceUrl: alert.sourceUrl || prospect?.url_comentario || null,
    channel: alert.channel || null,
    severity: alert.severity || null,
    frustrationScore: alert.frustrationScore ?? null,
    salesPitch:
      alert.salesPitch ||
      alert.salesPitches?.[0]?.body ||
      prospect?.mensaje_sugerido_ia ||
      null,
    status: alert.status || 'NEW',
    detectedAt: alert.detectedAt || null,
    companyName: extras.companyName || null,
    reportMarkdown: extras.reportMarkdown || null,
    competidor: prospect?.competidor || alert.competitorName || null,
    usuario_origen: prospect?.usuario_origen || null,
    url_comentario: prospect?.url_comentario || alert.sourceUrl || null,
    canal_tipo: prospect?.canal_tipo || null,
    categoria_dolor: prospect?.categoria_dolor || null,
    mensaje_sugerido_ia: prospect?.mensaje_sugerido_ia || null,
    mensaje_publico_ia: prospect?.mensaje_publico_ia || null,
    etiqueta: prospect?.etiqueta || null,
    calificacion_oportunidad: prospect?.calificacion_oportunidad ?? null,
    segmento: prospect?.segmento || null,
    influencia: prospect?.influencia || null,
    tarea: prospect?.tarea || null,
    contactar_antes_de: prospect?.contactar_antes_de || null,
    prioridad: prospect?.prioridad || null,
  };
}

/**
 * Empuja lista de prospectos del intel pack.
 * Webhook: un solo batch. HubSpot: un contacto/nota por prospecto (máx 15).
 * @param {Array<object>} crmProspects
 * @param {{ companyName?: string, competitorName?: string }} extras
 */
export async function pushRescueProspectsToCrm(crmProspects, extras = {}) {
  const list = Array.isArray(crmProspects) ? crmProspects : [];
  if (!list.length) {
    return [{ provider: 'none', ok: false, detail: 'Sin prospectos con intención de cambio' }];
  }

  const cfg = await loadIntegrations();
  /** @type {Array<{ provider: string, ok: boolean, externalId?: string, detail?: string }>} */
  const results = [];
  let any = false;

  if (cfg.webhook?.enabled && cfg.webhook.url) {
    any = true;
    results.push(
      await pushWebhook(cfg.webhook, {
        kind: 'rescue_pack',
        competitorName: extras.competitorName || list[0]?.competidor,
        companyName: extras.companyName || null,
        prospectos: list,
        count: list.length,
      }),
    );
  }

  if (cfg.hubspot?.enabled && cfg.hubspot.accessToken) {
    any = true;
    for (const p of list.slice(0, 15)) {
      const synthetic = {
        alertId: `rescue_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        competitorName: p.competidor,
        originalComplaint: `${p.categoria_dolor || ''} · ${p.usuario_origen || ''}`.trim(),
        sourceUrl: p.url_comentario,
        channel: p.canal_tipo,
        salesPitch: p.mensaje_sugerido_ia,
        status: 'NEW',
      };
      results.push(
        await pushHubSpot(cfg.hubspot.accessToken, buildCrmPayload(synthetic, {
          companyName: extras.companyName,
          prospect: p,
        })),
      );
    }
  }

  if (!any) {
    results.push({
      provider: 'none',
      ok: false,
      detail: 'Activá Webhook y/o HubSpot en Config → Integraciones',
    });
  }
  return results;
}

export async function pushOpportunityToCrm(alert, extras = {}) {
  // Preferir service worker (bypass CSP del side panel para webhooks arbitrarios)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const res = await chrome.runtime.sendMessage({
        type: 'RL_CRM_PUSH',
        alert,
        extras,
      });
      if (Array.isArray(res?.results)) return res.results;
    }
  } catch {
    /* fall through to local */
  }
  return pushOpportunityToCrmLocal(alert, extras);
}

/** Ejecución directa (background o fallback). */
export async function pushOpportunityToCrmLocal(alert, extras = {}) {
  const cfg = await loadIntegrations();
  const payload = buildCrmPayload(alert, extras);
  /** @type {Array<{ provider: string, ok: boolean, externalId?: string, detail?: string }>} */
  const results = [];

  if (cfg.webhook?.enabled && cfg.webhook.url) {
    results.push(await pushWebhook(cfg.webhook, payload));
  }
  if (cfg.hubspot?.enabled && cfg.hubspot.accessToken) {
    results.push(await pushHubSpot(cfg.hubspot.accessToken, payload));
  }
  if (!results.length) {
    results.push({
      provider: 'none',
      ok: false,
      detail: 'Activá Webhook y/o HubSpot en Config → Integraciones',
    });
  }
  return results;
}

async function pushWebhook(webhook, payload) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ResponseLensAI/0.6',
    };
    if (webhook.secret) headers['X-ResponseLens-Secret'] = webhook.secret;
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
    event: payload?.kind === 'rescue_pack' ? 'responselens.rescue_pack.push' : 'responselens.opportunity.push',
        version: 1,
        sentAt: new Date().toISOString(),
        payload,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { provider: 'webhook', ok: false, detail: `HTTP ${res.status} ${text.slice(0, 180)}` };
    }
    return { provider: 'webhook', ok: true, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      provider: 'webhook',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pushHubSpot(token, payload) {
  try {
    const email = `rl.${String(payload.alertId)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 24)}@responselens.local`.toLowerCase();
    const noteBody = [
      `ResponseLens · ${payload.etiqueta || `Oportunidad vs ${payload.competitorName}`}`,
      `Prioridad: ${payload.prioridad || '—'} · Score: ${payload.calificacion_oportunidad ?? '—'} · Segmento: ${payload.segmento || '—'}`,
      `Tarea: ${payload.tarea || '—'} · Antes de: ${payload.contactar_antes_de || '—'}`,
      `Severidad: ${payload.severity || '—'} · Canal: ${payload.channel || payload.canal_tipo || '—'}`,
      `Usuario: ${payload.usuario_origen || '—'}`,
      `Fuente: ${payload.sourceUrl || payload.url_comentario || '—'}`,
      '',
      'Queja:',
      payload.originalComplaint,
      '',
      payload.mensaje_sugerido_ia || payload.salesPitch
        ? `Mensaje sugerido:\n${payload.mensaje_sugerido_ia || payload.salesPitch}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          email,
          firstname: String(payload.usuario_origen || 'Lead').replace(/^[@u/]+/, '').slice(0, 40) || 'Lead',
          lastname: String(payload.competitorName || 'Rival').slice(0, 80),
          company: payload.companyName || '',
          hs_lead_status: 'NEW',
          message: String(payload.originalComplaint || '').slice(0, 65000),
          hs_lead_status_note: payload.etiqueta || undefined,
        },
      }),
    });
    if (!contactRes.ok) {
      const err = await contactRes.text().catch(() => '');
      return {
        provider: 'hubspot',
        ok: false,
        detail: `Contact HTTP ${contactRes.status}: ${err.slice(0, 200)}`,
      };
    }
    const contact = await contactRes.json();
    const contactId = contact.id;
    const noteRes = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_timestamp: String(Date.now()),
          hs_note_body: noteBody.slice(0, 65000),
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          },
        ],
      }),
    });
    if (!noteRes.ok) {
      const err = await noteRes.text().catch(() => '');
      return {
        provider: 'hubspot',
        ok: true,
        externalId: contactId,
        detail: `Contact OK; note ${noteRes.status}: ${err.slice(0, 120)}`,
      };
    }
    return {
      provider: 'hubspot',
      ok: true,
      externalId: contactId,
      detail: 'Contact + note',
    };
  } catch (err) {
    return {
      provider: 'hubspot',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function newShareId() {
  return `sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Crea un paquete compartible (local). Link: share-viewer.html?id=…
 * También devuelve token base64 para pegar en Slack/email.
 */
export async function createSharePackage({ kind, title, data, ttlHours }) {
  const cfg = await loadIntegrations();
  const hours = Number(ttlHours || cfg.shareTtlHours || 168);
  const shareId = newShareId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const pack = {
    shareId,
    kind,
    title: String(title || 'ResponseLens share').slice(0, 200),
    createdAt,
    expiresAt,
    data: sanitizeShareData(data),
  };

  const stored = await chrome.storage.local.get([SHARES_KEY]);
  const map = stored[SHARES_KEY] && typeof stored[SHARES_KEY] === 'object' ? stored[SHARES_KEY] : {};
  map[shareId] = pack;
  // retención simple: máx 40 shares
  const ids = Object.keys(map).sort(
    (a, b) => Date.parse(map[b].createdAt || 0) - Date.parse(map[a].createdAt || 0),
  );
  for (const id of ids.slice(40)) delete map[id];
  await chrome.storage.local.set({ [SHARES_KEY]: map });

  const viewerUrl = chrome.runtime.getURL(`share-viewer.html?id=${encodeURIComponent(shareId)}`);
  const token = encodeShareToken(pack);
  return { pack, viewerUrl, token };
}

export async function getSharePackage(shareId) {
  const stored = await chrome.storage.local.get([SHARES_KEY]);
  const pack = stored[SHARES_KEY]?.[shareId] || null;
  if (!pack) return null;
  if (pack.expiresAt && Date.parse(pack.expiresAt) < Date.now()) return null;
  return pack;
}

export function encodeShareToken(pack) {
  const json = JSON.stringify(pack);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShareToken(token) {
  try {
    let b64 = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    const pack = JSON.parse(json);
    if (pack.expiresAt && Date.parse(pack.expiresAt) < Date.now()) return null;
    return pack;
  } catch {
    return null;
  }
}

function sanitizeShareData(data) {
  const src = data && typeof data === 'object' ? data : {};
  const out = { ...src };
  delete out.apiKey;
  delete out.accessToken;
  delete out.idToken;
  delete out.refreshToken;
  delete out.password;
  return out;
}

export function formatPushSummary(results) {
  if (!results?.length) return 'Sin destinos CRM';
  return results
    .map((r) => `${r.provider}: ${r.ok ? 'OK' : 'error'}${r.detail ? ` (${r.detail})` : ''}`)
    .join(' · ');
}
