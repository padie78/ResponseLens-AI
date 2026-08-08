/**
 * ResponseLens AI — Service Worker (MV3)
 * Mantiene la subscription AppSync (WebSocket) y puentea Side Panel ↔ Content Script.
 */

import { matchPatternsForHost, normalizePlatformPrefs } from './lib/platforms.js';

const STORAGE_KEYS = {
  config: 'rl_user_config',
  alerts: 'rl_competitor_alerts',
  pendingComplaint: 'rl_pending_complaint',
  appsync: 'rl_appsync',
  history: 'rl_reply_history',
  detection: 'rl_detection',
};

/** @type {WebSocket | null} */
let realtimeSocket = null;
let reconnectTimer = null;
let subscriptionId = null;

async function getLocal(keys) {
  return chrome.storage.local.get(keys);
}

async function setLocal(obj) {
  return chrome.storage.local.set(obj);
}

/** Registra content scripts dinámicos para plataformas custom habilitadas. */
async function syncCustomPlatformScripts(detection) {
  const prefs = normalizePlatformPrefs(detection?.platforms);
  const enabledCustoms = (prefs.custom || []).filter((c) => c.enabled && c.host);

  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch {
    existing = [];
  }
  const ours = existing.filter((s) => String(s.id || '').startsWith('rl-custom-'));
  if (ours.length) {
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: ours.map((s) => s.id),
      });
    } catch {
      /* ignore */
    }
  }

  for (const c of enabledCustoms) {
    const matches = matchPatternsForHost(c.host);
    if (!matches.length) continue;
    const id = `rl-custom-${c.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches,
          js: ['content.js'],
          css: ['content.css'],
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]);
    } catch (err) {
      console.warn('[RL] registerContentScripts', c.host, err);
    }
  }
}

async function openSidePanel(tabId, windowId) {
  try {
    if (typeof windowId === 'number') {
      await chrome.sidePanel.open({ windowId });
      return;
    }
    if (typeof tabId === 'number') {
      await chrome.sidePanel.open({ tabId });
      return;
    }
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.windowId != null) {
      await chrome.sidePanel.open({ windowId: active.windowId });
    }
  } catch (err) {
    console.warn('[RL] sidePanel.open', err);
  }
}

async function enableSidePanelOnClick() {
  try {
    // Side Panel a altura completa de la ventana (el popup no puede ocupar toda la pantalla).
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('[RL] setPanelBehavior', err);
  }
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
      enabled: true,
    });
  } catch (err) {
    console.warn('[RL] setOptions', err);
  }
}

// Importante: no solo en onInstalled — también al despertar el service worker
enableSidePanelOnClick();
getLocal([STORAGE_KEYS.detection]).then((data) => {
  void syncCustomPlatformScripts(data[STORAGE_KEYS.detection] || {});
});

chrome.runtime.onInstalled.addListener(async () => {
  await enableSidePanelOnClick();
  const existing = await getLocal([STORAGE_KEYS.config, STORAGE_KEYS.detection]);
  void syncCustomPlatformScripts(existing[STORAGE_KEYS.detection] || {});
  if (!existing[STORAGE_KEYS.config]?.competitors?.length) {
    // Semilla mínima de rivales reales (buscables en HN); el feed se llena con "Escanear ahora".
    await setLocal({
      [STORAGE_KEYS.config]: {
        ...(existing[STORAGE_KEYS.config] || {}),
        userId: existing[STORAGE_KEYS.config]?.userId || 'local-user',
        company: existing[STORAGE_KEYS.config]?.company || {
          companyName: 'TuMarca',
          whatTheySell: 'software B2B con soporte humano',
        },
        competitors: [
          {
            name: 'AWS',
            aliases: ['RivalCloud', 'Amazon Web Services'],
            websiteUrl: 'https://aws.amazon.com',
            logoUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128',
            industry: 'Cloud / IaaS',
          },
          {
            name: 'Shopify',
            aliases: ['ShopFast'],
            websiteUrl: 'https://shopify.com',
            logoUrl: 'https://www.google.com/s2/favicons?domain=shopify.com&sz=128',
            industry: 'E-commerce',
          },
          {
            name: 'Mailchimp',
            aliases: ['MailBlast'],
            websiteUrl: 'https://mailchimp.com',
            logoUrl: 'https://www.google.com/s2/favicons?domain=mailchimp.com&sz=128',
            industry: 'MarTech',
          },
        ],
      },
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanelOnClick();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'invalid_message' };
  }

  switch (message.type) {
    case 'RL_OPEN_DAMAGE_CONTROL': {
      await setLocal({ [STORAGE_KEYS.pendingComplaint]: message.payload });
      const tabId = sender?.tab?.id;
      await openSidePanel(tabId, sender?.tab?.windowId);
      try {
        await chrome.runtime.sendMessage({
          type: 'RL_PENDING_COMPLAINT',
          payload: message.payload,
        });
      } catch {
        // Side panel / popup may not be listening yet
      }
      return { ok: true };
    }

    case 'RL_CAPTURE_OPPORTUNITY': {
      const alert = message.payload;
      if (!alert?.alertId) return { ok: false, error: 'invalid_alert' };
      const data = await getLocal([STORAGE_KEYS.alerts]);
      const list = Array.isArray(data[STORAGE_KEYS.alerts]) ? data[STORAGE_KEYS.alerts] : [];
      const next = [{ status: 'NEW', ...alert }, ...list.filter((a) => a.alertId !== alert.alertId)].slice(
        0,
        100,
      );
      await setLocal({ [STORAGE_KEYS.alerts]: next });
      if (alert.requestRivalReport) {
        await setLocal({
          rl_pending_rival_report: {
            competitorName: alert.competitorName,
            mentions: alert.pageMentions || [
              {
                text: alert.originalComplaint,
                sourceUrl: alert.sourceUrl,
                channel: alert.channel,
              },
            ],
            alertId: alert.alertId,
            at: new Date().toISOString(),
          },
        });
      }
      const tabId = sender?.tab?.id;
      await openSidePanel(tabId, sender?.tab?.windowId);
      try {
        await chrome.runtime.sendMessage({ type: 'RL_CAPTURE_OPPORTUNITY', payload: alert });
      } catch {
        /* popup closed */
      }
      try {
        await chrome.notifications.create(`rl_cap_${alert.alertId}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `Captación: ${alert.competitorName}`,
          message: alert.requestRivalReport
            ? 'Oportunidad + informe IA del rival en curso…'
            : (alert.salesPitch || '').slice(0, 120),
        });
      } catch {
        /* optional */
      }
      return { ok: true };
    }

    case 'RL_PAGE_RIVALS_DETECTED': {
      const payload = message.payload;
      if (!payload?.rivals?.length) return { ok: true };
      await setLocal({
        rl_page_rivals: {
          ...payload,
          at: new Date().toISOString(),
        },
      });
      try {
        await chrome.runtime.sendMessage({ type: 'RL_PAGE_RIVALS_DETECTED', payload });
      } catch {
        /* side panel closed */
      }
      return { ok: true };
    }

    case 'RL_REQUEST_RIVAL_REPORT': {
      const payload = message.payload;
      if (!payload?.competitorName) return { ok: false, error: 'missing_rival' };
      await setLocal({
        rl_pending_rival_report: {
          competitorName: payload.competitorName,
          mentions: payload.mentions || [],
          href: payload.href,
          channel: payload.channel,
          at: new Date().toISOString(),
        },
      });
      if (payload.openPanel !== false) {
        await openSidePanel(sender?.tab?.id, sender?.tab?.windowId);
      }
      try {
        await chrome.runtime.sendMessage({ type: 'RL_REQUEST_RIVAL_REPORT', payload });
      } catch {
        /* side panel closed */
      }
      return { ok: true };
    }

    case 'RL_INJECT_REPLY': {
      const tabId = message.tabId || sender?.tab?.id;
      let targetTabId = tabId;
      if (!targetTabId) {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!active?.id) return { ok: false, error: 'no_tab' };
        targetTabId = active.id;
      }
      const result = await chrome.tabs.sendMessage(targetTabId, {
        type: 'RL_INJECT_REPLY',
        text: message.text,
        complaintId: message.complaintId,
      });
      return result;
    }

    case 'RL_PAGE_SCAN_STATS': {
      const count = Number(message.count) || 0;
      const tabId = sender?.tab?.id;
      if (tabId) {
        await chrome.action.setBadgeText({
          tabId,
          text: count > 0 ? String(Math.min(count, 99)) : '',
        });
        await chrome.action.setBadgeBackgroundColor({
          tabId,
          color: count >= 5 ? '#7f1d1d' : '#b91c1c',
        });
      }
      return { ok: true };
    }

    case 'RL_DETECTION_UPDATED': {
      await setLocal({ [STORAGE_KEYS.detection]: message.detection || {} });
      await syncCustomPlatformScripts(message.detection || {});
      const tabs = await chrome.tabs.query({});
      await Promise.all(
        tabs.map((tab) =>
          tab.id
            ? chrome.tabs
                .sendMessage(tab.id, {
                  type: 'RL_DETECTION_UPDATED',
                  detection: message.detection,
                })
                .catch(() => undefined)
            : Promise.resolve(),
        ),
      );
      return { ok: true };
    }

    case 'RL_REQUEST_PLATFORM_PERMISSION': {
      const host = String(message.host || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
      if (!host) return { ok: false, error: 'invalid_host' };
      const origins = matchPatternsForHost(host);
      try {
        const granted = await chrome.permissions.request({ origins });
        return { ok: Boolean(granted), granted: Boolean(granted), origins };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case 'RL_SAVE_CONFIG': {
      await setLocal({ [STORAGE_KEYS.config]: message.config });
      return { ok: true };
    }

    case 'RL_GET_ALERTS': {
      const data = await getLocal([STORAGE_KEYS.alerts]);
      return { ok: true, alerts: data[STORAGE_KEYS.alerts] || [] };
    }

    case 'RL_FETCH_JSON': {
      const url = String(message.url || '');
      if (!/^https:\/\//i.test(url)) {
        return { ok: false, error: 'invalid_url' };
      }
      const allowed =
        /^https:\/\/hn\.algolia\.com\//i.test(url) ||
        /^https:\/\/([a-z0-9-]+\.)?reddit\.com\//i.test(url) ||
        /^https:\/\/old\.reddit\.com\//i.test(url);
      if (!allowed) {
        return { ok: false, error: 'url_not_allowed' };
      }
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ResponseLensAI/0.2 (Chrome extension; competitor-scan)',
          },
        });
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        let json = null;
        if (contentType.includes('json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
          try {
            json = JSON.parse(text);
          } catch {
            return {
              ok: false,
              status: res.status,
              contentType,
              error: 'invalid_json',
            };
          }
        }
        return {
          ok: res.ok && json != null,
          status: res.status,
          contentType,
          json,
          error: res.ok ? (json == null ? 'not_json' : undefined) : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case 'RL_START_SUBSCRIPTION': {
      await ensureRealtimeSubscription(message.userId);
      return { ok: true };
    }

    case 'RL_STOP_SUBSCRIPTION': {
      teardownRealtime();
      return { ok: true };
    }

    default:
      return { ok: false, error: 'unknown_type' };
  }
}

/**
 * AppSync Realtime (API_KEY) — handshake simplificado MVP.
 * Docs: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-websocket-client.html
 */
async function ensureRealtimeSubscription(userId) {
  if (!userId) return;
  const { [STORAGE_KEYS.appsync]: appsync } = await getLocal([STORAGE_KEYS.appsync]);
  if (!appsync?.graphqlUrl || !appsync?.realtimeUrl || !appsync?.apiKey) {
    console.warn('[RL] AppSync config missing in chrome.storage.local.rl_appsync');
    return;
  }

  teardownRealtime();

  const header = btoa(
    JSON.stringify({
      host: new URL(appsync.graphqlUrl).host,
      'x-api-key': appsync.apiKey,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const payload = btoa(JSON.stringify({}))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const url = `${appsync.realtimeUrl}?header=${header}&payload=${payload}`;
  realtimeSocket = new WebSocket(url, ['graphql-ws']);

  realtimeSocket.onopen = () => {
    realtimeSocket?.send(JSON.stringify({ type: 'connection_init' }));
  };

  realtimeSocket.onmessage = async (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.type === 'connection_ack') {
      subscriptionId = crypto.randomUUID();
      const query = `
        subscription OnNewCompetitorAlert($userId: ID!) {
          onNewCompetitorAlert(userId: $userId) {
            alertId
            userId
            competitorName
            originalComplaint
            sourceUrl
            channel
            severity
            frustrationScore
            salesPitch
            detectedAt
          }
        }
      `;
      realtimeSocket?.send(
        JSON.stringify({
          id: subscriptionId,
          type: 'start',
          payload: {
            data: JSON.stringify({
              query,
              variables: { userId },
            }),
            extensions: {
              authorization: {
                'x-api-key': appsync.apiKey,
                host: new URL(appsync.graphqlUrl).host,
              },
            },
          },
        }),
      );
      return;
    }

    if (msg.type === 'data' && msg.payload?.data?.onNewCompetitorAlert) {
      const alert = msg.payload.data.onNewCompetitorAlert;
      await prependAlert(alert);
      try {
        await chrome.runtime.sendMessage({ type: 'RL_NEW_ALERT', payload: alert });
      } catch {
        /* sidepanel closed */
      }
      try {
        await chrome.notifications.create(`rl_${alert.alertId}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `Oportunidad: ${alert.competitorName}`,
          message: alert.salesPitch.slice(0, 120),
        });
      } catch {
        /* notifications optional */
      }
    }

    if (msg.type === 'connection_error' || msg.type === 'error') {
      console.warn('[RL] realtime error', msg);
      scheduleReconnect(userId);
    }
  };

  realtimeSocket.onclose = () => scheduleReconnect(userId);
  realtimeSocket.onerror = () => scheduleReconnect(userId);
}

async function prependAlert(alert) {
  const data = await getLocal([STORAGE_KEYS.alerts]);
  const list = Array.isArray(data[STORAGE_KEYS.alerts]) ? data[STORAGE_KEYS.alerts] : [];
  const enriched = { status: 'NEW', ...alert };
  const next = [enriched, ...list.filter((a) => a.alertId !== alert.alertId)].slice(0, 100);
  await setLocal({ [STORAGE_KEYS.alerts]: next });
}

function teardownRealtime() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (realtimeSocket) {
    try {
      if (subscriptionId) {
        realtimeSocket.send(JSON.stringify({ id: subscriptionId, type: 'stop' }));
      }
      realtimeSocket.close();
    } catch {
      /* ignore */
    }
  }
  realtimeSocket = null;
  subscriptionId = null;
}

function scheduleReconnect(userId) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureRealtimeSubscription(userId);
  }, 5000);
}
