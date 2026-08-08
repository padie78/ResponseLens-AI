/**
 * KPIs y series analíticas locales (historial + alertas).
 * Sin dependencias externas — apto para Side Panel MV3.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseAt(value) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : null;
}

function dayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isOwnEntry(h) {
  return h.kind !== 'captacion';
}

function isCapEntry(h) {
  return h.kind === 'captacion';
}

function channelOf(item) {
  const raw = String(item.channel || item.source || '').toLowerCase();
  if (!raw) {
    const url = String(item.sourceUrl || '');
    if (/reddit/i.test(url)) return 'reddit';
    if (/amazon/i.test(url)) return 'amazon';
    if (/ebay/i.test(url)) return 'ebay';
    if (/youtube|youtu\.be/i.test(url)) return 'youtube';
    if (/twitter|x\.com/i.test(url)) return 'x';
    if (/ycombinator|news\.ycombinator|hn\./i.test(url)) return 'hn';
    return 'otro';
  }
  if (raw.includes('reddit')) return 'reddit';
  if (raw.includes('amazon')) return 'amazon';
  if (raw.includes('ebay')) return 'ebay';
  if (raw.includes('youtube')) return 'youtube';
  if (raw === 'x' || raw.includes('twitter')) return 'x';
  if (raw.includes('hn') || raw.includes('hacker')) return 'hn';
  if (raw.includes('competencia') || raw.includes('manual')) return 'manual';
  return raw.slice(0, 16);
}

/**
 * KPIs compactos del header.
 */
export function computeOpsStats({ history = [], alerts = [] } = {}) {
  const analytics = computeAnalytics({ history, alerts, days: 7 });
  return {
    repliesThisWeek: analytics.own.repliesInWindow,
    openAlerts: analytics.comp.open,
    contacted: analytics.comp.contacted + analytics.comp.won,
    criticalOpen: analytics.comp.criticalOpen,
    escalations: analytics.own.escalations,
    historyTotal: history.length,
    winRate: analytics.comp.winRate,
    ownVsCompRatio: analytics.comparison.ownSharePct,
  };
}

/**
 * Analytics completos para el panel Stats.
 * @param {{ history?: object[], alerts?: object[], days?: number }} opts
 */
export function computeAnalytics({ history = [], alerts = [], days = 14 } = {}) {
  const now = Date.now();
  const windowMs = Math.max(1, days) * DAY_MS;
  const since = now - windowMs;

  const histInWindow = history.filter((h) => {
    const t = parseAt(h.at);
    return t != null && t >= since;
  });

  const ownAll = history.filter(isOwnEntry);
  const ownWindow = histInWindow.filter(isOwnEntry);
  const capWindow = histInWindow.filter(isCapEntry);

  const open = alerts.filter((a) => !a.status || a.status === 'NEW' || a.status === 'SNOOZED');
  const contacted = alerts.filter((a) => a.status === 'CONTACTED');
  const won = alerts.filter((a) => a.status === 'WON');
  const dismissed = alerts.filter((a) => a.status === 'DISMISSED');
  const criticalOpen = open.filter(
    (a) => a.severity === 'CRITICAL' || a.severity === 'HIGH',
  );

  const pipelineTotal = open.length + contacted.length + won.length + dismissed.length;
  const closedWonOrLost = won.length + dismissed.length + contacted.length;
  const winRate =
    won.length + dismissed.length > 0
      ? Math.round((won.length / (won.length + dismissed.length)) * 100)
      : won.length > 0
        ? 100
        : 0;
  const contactRate =
    pipelineTotal > 0
      ? Math.round(((contacted.length + won.length) / Math.max(pipelineTotal, 1)) * 100)
      : 0;

  const riskCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OTHER: 0 };
  /** @type {Record<string, number>} */
  const byTone = {};
  /** @type {Record<string, number>} */
  const byAction = {};
  for (const h of ownWindow) {
    const lvl = String(h.riskLevel || 'OTHER').toUpperCase();
    if (lvl in riskCounts) riskCounts[lvl] += 1;
    else riskCounts.OTHER += 1;
    const tone = String(h.tone || h.label || 'otro').slice(0, 24);
    byTone[tone] = (byTone[tone] || 0) + 1;
    const action = String(h.recommendedAction || 'OTHER');
    byAction[action] = (byAction[action] || 0) + 1;
  }

  /** @type {Record<string, number>} */
  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OTHER: 0 };
  for (const a of alerts) {
    const lvl = String(a.severity || 'OTHER').toUpperCase();
    if (lvl in severityCounts) severityCounts[lvl] += 1;
    else severityCounts.OTHER += 1;
  }

  const escalations = ownAll.filter((h) =>
    String(h.recommendedAction || '').startsWith('ESCALATE'),
  ).length;
  const escalationsWindow = ownWindow.filter((h) =>
    String(h.recommendedAction || '').startsWith('ESCALATE'),
  ).length;

  /** @type {Record<string, number>} */
  const byCompetitor = {};
  /** @type {Record<string, { open: number, won: number, total: number }>} */
  const rivalOutcomes = {};
  for (const a of alerts) {
    const name = (a.competitorName || 'Sin nombre').trim() || 'Sin nombre';
    byCompetitor[name] = (byCompetitor[name] || 0) + 1;
    if (!rivalOutcomes[name]) rivalOutcomes[name] = { open: 0, won: 0, total: 0 };
    rivalOutcomes[name].total += 1;
    if (!a.status || a.status === 'NEW' || a.status === 'SNOOZED') rivalOutcomes[name].open += 1;
    if (a.status === 'WON') rivalOutcomes[name].won += 1;
  }

  /** @type {Record<string, number>} */
  const byChannelOwn = {};
  /** @type {Record<string, number>} */
  const byChannelComp = {};
  for (const h of ownWindow) {
    const ch = channelOf(h);
    byChannelOwn[ch] = (byChannelOwn[ch] || 0) + 1;
  }
  for (const a of alerts) {
    const ch = channelOf(a);
    byChannelComp[ch] = (byChannelComp[ch] || 0) + 1;
  }

  const series = buildDailySeries({ history, alerts, days, now });

  const ownInWindow = ownWindow.length;
  const compMentionsInWindow = series.reduce((s, d) => s + d.comp, 0);
  const totalCompare = ownInWindow + compMentionsInWindow;
  const ownSharePct = totalCompare > 0 ? Math.round((ownInWindow / totalCompare) * 100) : 50;

  const avgRiskScore = averageRiskFromHistory(ownWindow);
  const responseRate =
    ownInWindow + compMentionsInWindow > 0
      ? Math.round((ownInWindow / Math.max(ownInWindow + open.length, 1)) * 100)
      : 0;

  return {
    days,
    own: {
      repliesTotal: ownAll.length,
      repliesInWindow: ownInWindow,
      escalations,
      escalationsWindow,
      riskCounts,
      avgRiskScore,
      byChannel: byChannelOwn,
      byTone,
      byAction,
    },
    comp: {
      total: alerts.length,
      open: open.length,
      contacted: contacted.length,
      won: won.length,
      dismissed: dismissed.length,
      criticalOpen: criticalOpen.length,
      winRate,
      contactRate,
      mentionsInWindow: compMentionsInWindow,
      byCompetitor,
      byChannel: byChannelComp,
      statusChangesInWindow: capWindow.length,
      severityCounts,
      rivalOutcomes,
    },
    comparison: {
      ownInWindow,
      compInWindow: compMentionsInWindow,
      ownSharePct,
      compSharePct: totalCompare > 0 ? 100 - ownSharePct : 50,
      delta: ownInWindow - compMentionsInWindow,
      responseRate,
    },
    series,
    pipeline: {
      open: open.length,
      contacted: contacted.length,
      won: won.length,
      dismissed: dismissed.length,
      total: pipelineTotal,
    },
  };
}

function averageRiskFromHistory(entries) {
  const map = { CRITICAL: 90, HIGH: 70, MEDIUM: 45, LOW: 20 };
  const scores = entries
    .map((h) => map[String(h.riskLevel || '').toUpperCase()])
    .filter((n) => Number.isFinite(n));
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Serie diaria: respuestas propias + menciones competencia (por createdAt de alertas o historial).
 */
function buildDailySeries({ history, alerts, days, now }) {
  /** @type {Record<string, { own: number, comp: number }>} */
  const buckets = {};
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY_MS);
    buckets[key] = { own: 0, comp: 0 };
  }

  for (const h of history) {
    const t = parseAt(h.at);
    if (t == null) continue;
    const key = dayKey(t);
    if (!buckets[key]) continue;
    if (isCapEntry(h)) continue;
    buckets[key].own += 1;
  }

  for (const a of alerts) {
    const t = parseAt(a.detectedAt || a.createdAt || a.at);
    if (t == null) continue;
    const key = dayKey(t);
    if (!buckets[key]) continue;
    buckets[key].comp += 1;
  }

  return Object.entries(buckets).map(([date, v]) => ({
    date,
    label: date.slice(5),
    own: v.own,
    comp: v.comp,
  }));
}

/**
 * Top N entradas de un mapa { label: count }.
 * @param {Record<string, number>} map
 * @param {number} n
 */
export function topEntries(map, n = 5) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}
