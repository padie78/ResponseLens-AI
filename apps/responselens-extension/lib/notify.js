/**
 * Alertas de competencia: desktop notifications + badge del icono.
 * Fuente preferida en prod: AWS (Lambda → AppSync → subscription).
 * Auto-scan local solo si AppSync no está configurado.
 */

const NOTIFY_KEY = 'rl_notify_prefs';
const FOCUS_KEY = 'rl_focus_alert';
const APPSYNC_KEY = 'rl_appsync';

const SEVERITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function defaultNotifyPrefs() {
  return {
    enabled: true,
    desktop: true,
    badge: true,
    /** Notificar menciones de tu marca en prensa */
    ownBrand: true,
    /** Severidad mínima: LOW | MEDIUM | HIGH | CRITICAL */
    minSeverity: 'MEDIUM',
    /**
     * Escaneo automático LOCAL en background (0 = off). Minutos.
     * Se ignora si AppSync está configurado (alertas vienen de AWS).
     */
    autoScanMinutes: 30,
  };
}

/** True si la extensión puede recibir alertas cloud vía AppSync. */
export async function hasAppSyncCloud() {
  const data = await chrome.storage.local.get([APPSYNC_KEY]);
  const a = data[APPSYNC_KEY] || {};
  return Boolean(a.graphqlUrl && a.realtimeUrl && a.apiKey);
}

/**
 * Auto-scan local solo como fallback sin cloud.
 * @returns {Promise<{ useLocal: boolean, cloud: boolean, minutes: number }>}
 */
export async function resolveAutoScanMode() {
  const prefs = await loadNotifyPrefs();
  const cloud = await hasAppSyncCloud();
  const minutes = Number(prefs.autoScanMinutes) || 0;
  return {
    cloud,
    minutes,
    useLocal: Boolean(prefs.enabled && !cloud && minutes >= 5),
  };
}

export async function loadNotifyPrefs() {
  const data = await chrome.storage.local.get([NOTIFY_KEY]);
  return { ...defaultNotifyPrefs(), ...(data[NOTIFY_KEY] || {}) };
}

export async function saveNotifyPrefs(prefs) {
  const next = { ...defaultNotifyPrefs(), ...(prefs || {}) };
  await chrome.storage.local.set({ [NOTIFY_KEY]: next });
  return next;
}

function severityOk(alert, minSeverity) {
  const rank = SEVERITY_RANK[String(alert?.severity || 'LOW').toUpperCase()] || 1;
  const min = SEVERITY_RANK[String(minSeverity || 'MEDIUM').toUpperCase()] || 2;
  return rank >= min;
}

function sourceKind(alert) {
  if (alert?._brandScope === 'own') return 'own';
  const ch = String(alert?.channel || alert?._source || '').toLowerCase();
  if (ch.includes('news')) return 'news';
  if (ch.includes('page') || ch === 'web') return 'page';
  return 'comment';
}

function alertSnippet(alert) {
  const text = String(alert?.originalComplaint || alert?.salesPitch || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 140) || 'Nueva mención negativa';
}

function alertTitle(alert) {
  const name = alert?.competitorName || 'Rival';
  const kind = sourceKind(alert);
  if (kind === 'own') return `Tu marca · ${name}`;
  if (kind === 'news') return `Noticia · ${name}`;
  if (kind === 'page') return `Página · ${name}`;
  return `Competencia · ${name}`;
}

/**
 * Filtra alertas nuevas según preferencias.
 * @param {object[]} alerts
 * @param {ReturnType<typeof defaultNotifyPrefs>} prefs
 */
export function filterNotifiableAlerts(alerts, prefs) {
  const list = Array.isArray(alerts) ? alerts : [];
  return list.filter((a) => {
    if (!a || a._demo || a._synthetic) return false;
    if (a._brandScope === 'own' && prefs.ownBrand === false) return false;
    if (!severityOk(a, prefs.minSeverity)) return false;
    return true;
  });
}

/**
 * Notifica nuevas oportunidades de competencia.
 * @param {object[]} newAlerts alertas que no existían antes
 * @param {{ silentBadgeOnly?: boolean }} [opts]
 */
export async function notifyNewCompetitorAlerts(newAlerts, opts = {}) {
  const prefs = await loadNotifyPrefs();
  const filtered = filterNotifiableAlerts(newAlerts, prefs);

  if (prefs.badge !== false) {
    await refreshCompetitorBadge();
  }

  if (!prefs.enabled || prefs.desktop === false || opts.silentBadgeOnly) {
    return { notified: 0, filtered: filtered.length };
  }
  if (!filtered.length) return { notified: 0, filtered: 0 };

  try {
    if (filtered.length === 1) {
      const a = filtered[0];
      await chrome.notifications.create(`rl_opp_${a.alertId}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: alertTitle(a),
        message: alertSnippet(a),
        priority: String(a.severity).toUpperCase() === 'CRITICAL' ? 2 : 1,
      });
      await chrome.storage.local.set({
        [FOCUS_KEY]: { alertId: a.alertId, at: new Date().toISOString() },
      });
      return { notified: 1, filtered: 1 };
    }

    const top = filtered.slice(0, 5);
    const rivals = [...new Set(top.map((a) => a.competitorName).filter(Boolean))];
    const newsN = top.filter((a) => sourceKind(a) === 'news').length;
    const commentN = top.length - newsN;
    const parts = [];
    if (commentN) parts.push(`${commentN} comentario${commentN > 1 ? 's' : ''}`);
    if (newsN) parts.push(`${newsN} noticia${newsN > 1 ? 's' : ''}`);
    await chrome.notifications.create(`rl_opp_batch_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${filtered.length} alertas de competencia`,
      message: `${parts.join(' · ')}${rivals.length ? ` · ${rivals.slice(0, 3).join(', ')}` : ''}`,
      priority: 1,
    });
    await chrome.storage.local.set({
      [FOCUS_KEY]: {
        alertId: top[0]?.alertId || null,
        openComp: true,
        at: new Date().toISOString(),
      },
    });
    return { notified: filtered.length, filtered: filtered.length };
  } catch (err) {
    console.warn('[RL] notify', err);
    return { notified: 0, filtered: filtered.length, error: String(err) };
  }
}

/** Badge global = alertas NEW abiertas. */
export async function refreshCompetitorBadge() {
  const prefs = await loadNotifyPrefs();
  if (prefs.badge === false) {
    try {
      await chrome.action.setBadgeText({ text: '' });
    } catch {
      /* ignore */
    }
    return 0;
  }
  const data = await chrome.storage.local.get(['rl_competitor_alerts']);
  const list = Array.isArray(data.rl_competitor_alerts) ? data.rl_competitor_alerts : [];
  const open = list.filter(
    (a) =>
      !a._demo &&
      !a._synthetic &&
      (!a.status || a.status === 'NEW' || a.status === 'SNOOZED'),
  ).length;
  try {
    await chrome.action.setBadgeText({ text: open > 0 ? String(Math.min(open, 99)) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' });
  } catch {
    /* ignore */
  }
  return open;
}

export async function setFocusAlert(alertId) {
  await chrome.storage.local.set({
    [FOCUS_KEY]: {
      alertId: alertId || null,
      openComp: true,
      at: new Date().toISOString(),
    },
  });
}

export async function consumeFocusAlert() {
  const data = await chrome.storage.local.get([FOCUS_KEY]);
  const focus = data[FOCUS_KEY] || null;
  if (focus) await chrome.storage.local.remove([FOCUS_KEY]);
  return focus;
}

export { NOTIFY_KEY, FOCUS_KEY };
