/**
 * ResponseLens AI — Service Worker (MV3)
 * Mantiene la subscription AppSync (WebSocket) y puentea Side Panel ↔ Content Script.
 */

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

async function openSidePanel(tabId) {
  try {
    if (tabId) {
      await chrome.sidePanel.open({ tabId });
    }
  } catch (err) {
    console.warn('[RL] sidePanel.open', err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const existing = await getLocal([STORAGE_KEYS.alerts]);
  if (!existing[STORAGE_KEYS.alerts]) {
    await setLocal({ [STORAGE_KEYS.alerts]: [] });
  }
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
      await openSidePanel(tabId);
      try {
        await chrome.runtime.sendMessage({
          type: 'RL_PENDING_COMPLAINT',
          payload: message.payload,
        });
      } catch {
        // Side panel may not be listening yet; it reads storage on load.
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

    case 'RL_SAVE_CONFIG': {
      await setLocal({ [STORAGE_KEYS.config]: message.config });
      return { ok: true };
    }

    case 'RL_GET_ALERTS': {
      const data = await getLocal([STORAGE_KEYS.alerts]);
      return { ok: true, alerts: data[STORAGE_KEYS.alerts] || [] };
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
