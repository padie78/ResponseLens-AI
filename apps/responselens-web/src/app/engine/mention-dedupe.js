/**
 * Dedupe de menciones / oportunidades por URL + texto normalizado + YouTube videoId.
 */

export function normalizeMentionText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .slice(0, 140);
}

/** Extrae ID de video de YouTube desde URL o texto. */
export function extractYouTubeVideoId(urlOrText) {
  const s = String(urlOrText || '');
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function normalizeSourceUrl(url) {
  const raw = String(url || '').trim();
  if (
    !raw ||
    raw.startsWith('page://') ||
    raw.startsWith('manual://') ||
    raw.startsWith('synthetic://')
  ) {
    return '';
  }

  const ytId = extractYouTubeVideoId(raw);
  if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;

  try {
    const u = new URL(raw);
    // Placeholders / redirects inestables → no sirven como clave
    if (
      /(^|\.)socialcrawl\.dev$/i.test(u.hostname) ||
      (/(^|\.)google\.com$/i.test(u.hostname) && u.pathname.includes('/url')) ||
      /(^|\.)news\.google\.com$/i.test(u.hostname)
    ) {
      return '';
    }
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid'].forEach(
      (k) => u.searchParams.delete(k),
    );
    return `${u.origin}${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase().slice(0, 180);
  }
}

/**
 * Claves de dedupe (YouTube id, URL y/o texto). Cualquiera que matchee = mismo ítem.
 * @param {{ text?: string, originalComplaint?: string, sourceUrl?: string, competitorName?: string, _brandScope?: string, alertId?: string }} row
 * @returns {string[]}
 */
export function mentionDedupeKeys(row) {
  const textRaw = row?.text || row?.originalComplaint || '';
  const text = normalizeMentionText(textRaw);
  const url = normalizeSourceUrl(row?.sourceUrl);
  const rival = String(row?.competitorName || '')
    .toLowerCase()
    .trim();
  const scope = row?._brandScope === 'own' ? 'own' : 'rival';
  const keys = [];

  const ytId =
    extractYouTubeVideoId(row?.sourceUrl) ||
    extractYouTubeVideoId(textRaw) ||
    (String(row?.alertId || '').startsWith('yt_')
      ? String(row.alertId).replace(/^yt_/, '').slice(0, 11)
      : null);
  if (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
    keys.push(`${scope}::${rival}::yt::${ytId}`);
  }

  if (url) keys.push(`${scope}::${rival}::url::${url}`);
  if (text && text.length >= 12) keys.push(`${scope}::${rival}::txt::${text}`);
  return keys;
}

/**
 * Clave estable primaria (compat).
 * @param {{ text?: string, originalComplaint?: string, sourceUrl?: string, competitorName?: string, _brandScope?: string }} row
 */
export function mentionDedupeKey(row) {
  const keys = mentionDedupeKeys(row);
  return keys[0] || '';
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => object} [mapRow]
 * @returns {T[]}
 */
export function dedupeMentions(rows, mapRow) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const mapped = mapRow ? mapRow(row) : row;
    const keys = mentionDedupeKeys(mapped);
    if (!keys.length || keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(row);
  }
  return out;
}

/**
 * Colapsa duplicados ya guardados (p. ej. mismo video YT con URLs distintas).
 * @param {object[]} alerts
 * @returns {object[]}
 */
export function collapseDuplicateAlerts(alerts) {
  const { merged } = mergeAlertLists([], alerts || [], { limit: Math.max(120, (alerts || []).length) });
  return merged;
}

/**
 * Fusiona alertas nuevas con las guardadas sin duplicar por alertId ni por URL/texto/YT.
 * Conserva status/workflow de la alerta existente si ya fue trabajada.
 *
 * @param {object[]} existing
 * @param {object[]} incoming
 * @param {{ limit?: number }} [opts]
 * @returns {{ merged: object[], fresh: object[], skippedDupes: number }}
 */
export function mergeAlertLists(existing, incoming, opts = {}) {
  const limit = opts.limit ?? 120;
  const kept = (existing || []).filter(
    (a) => a && !a._synthetic && !a._demo && a._source !== 'synthetic',
  );

  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {Map<string, string>} dedupeKey -> alertId */
  const byKey = new Map();

  const indexAlert = (alert) => {
    if (!alert?.alertId) return;
    byId.set(alert.alertId, alert);
    for (const k of mentionDedupeKeys(alert)) {
      if (!byKey.has(k)) byKey.set(k, alert.alertId);
    }
  };

  // Primero indexar existentes; si hay dupes internos, conservar el más reciente
  const existingSorted = [...kept].sort(
    (a, b) => new Date(b.detectedAt || 0).getTime() - new Date(a.detectedAt || 0).getTime(),
  );
  for (const a of existingSorted) {
    const keys = mentionDedupeKeys(a);
    let targetId = a.alertId && byId.has(a.alertId) ? a.alertId : null;
    if (!targetId) {
      for (const k of keys) {
        if (byKey.has(k)) {
          targetId = byKey.get(k);
          break;
        }
      }
    }
    if (targetId && targetId !== a.alertId) {
      // Duplicado ya en storage → merge into survivor
      const prev = byId.get(targetId) || {};
      byId.set(targetId, {
        ...a,
        ...prev,
        alertId: targetId,
        status: prev.status && prev.status !== 'NEW' ? prev.status : a.status || prev.status,
        detectedAt: prev.detectedAt || a.detectedAt,
        _lastSeenAt: a.detectedAt || prev._lastSeenAt,
      });
      for (const k of mentionDedupeKeys(byId.get(targetId))) byKey.set(k, targetId);
      continue;
    }
    indexAlert(a);
  }

  const fresh = [];
  let skippedDupes = 0;

  for (const opp of incoming || []) {
    if (!opp || opp._synthetic) continue;

    // Canonicalizar YouTube en la alerta entrante
    const ytId = extractYouTubeVideoId(opp.sourceUrl) || extractYouTubeVideoId(opp.originalComplaint);
    if (ytId) {
      opp.sourceUrl = `https://www.youtube.com/watch?v=${ytId}`;
      if (!opp.alertId || String(opp.alertId).startsWith('yt_rss_')) {
        opp.alertId = `yt_${ytId}`;
      }
      opp.channel = opp.channel || 'youtube';
    }

    const keys = mentionDedupeKeys(opp);
    let targetId = opp.alertId && byId.has(opp.alertId) ? opp.alertId : null;
    if (!targetId) {
      for (const k of keys) {
        if (byKey.has(k)) {
          targetId = byKey.get(k);
          break;
        }
      }
    }

    if (targetId) {
      skippedDupes += 1;
      const prev = byId.get(targetId) || {};
      const next = {
        ...prev,
        ...opp,
        alertId: targetId,
        status: prev.status && prev.status !== 'NEW' ? prev.status : opp.status || prev.status,
        detectedAt: prev.detectedAt || opp.detectedAt,
        _firstSeenAt: prev._firstSeenAt || prev.detectedAt || opp.detectedAt,
        _lastSeenAt: opp.detectedAt || new Date().toISOString(),
      };
      byId.set(targetId, next);
      for (const k of mentionDedupeKeys(next)) byKey.set(k, targetId);
      continue;
    }

    const id =
      opp.alertId ||
      `opp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const created = {
      ...opp,
      alertId: id,
      _firstSeenAt: opp.detectedAt || new Date().toISOString(),
      _lastSeenAt: opp.detectedAt || new Date().toISOString(),
    };
    byId.set(id, created);
    for (const k of mentionDedupeKeys(created)) byKey.set(k, id);
    fresh.push(created);
  }

  const merged = [...byId.values()]
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, limit);

  return { merged, fresh, skippedDupes };
}
