/**
 * Percepción de un rival: KPIs + series a partir de menciones web + alertas locales.
 */

import { scoreFrustration } from './competitor-opportunity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const THEME_RULES = [
  { id: 'reliability', re: /\b(outage|downtime|ca[ií]da|falla|crash|timeout|500|unstable|inestable)\b/i, label: 'Confiabilidad' },
  { id: 'support', re: /\b(support|soporte|ticket|respuesta|ignore|ghost|abysmal)\b/i, label: 'Soporte' },
  { id: 'pricing', re: /\b(price|precio|caro|expensive|billing|cobro|charge|refund|reembolso)\b/i, label: 'Precio' },
  { id: 'product', re: /\b(bug|feature|ui|ux|product|producto|lento|slow|broken|roto)\b/i, label: 'Producto' },
  { id: 'trust', re: /\b(scam|estafa|fraude|trust|confianza|lie|mentir)\b/i, label: 'Confianza' },
  { id: 'churn', re: /\b(switch|cambio|cancel|me voy|leaving|alternative|alternativa)\b/i, label: 'Churn' },
];

function parseAt(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function channelOf(item) {
  return String(item.channel || item._source || 'web').toLowerCase().slice(0, 24) || 'web';
}

function severityOf(item, text) {
  const raw = String(item.severity || '').toUpperCase();
  if (raw && raw !== 'OTHER') return raw;
  const f = scoreFrustration(text || item.text || item.originalComplaint || '');
  if (f >= 0.85) return 'CRITICAL';
  if (f >= 0.7) return 'HIGH';
  if (f >= 0.5) return 'MEDIUM';
  return 'LOW';
}

/**
 * Normaliza menciones + alertas del rival a un corpus único.
 * @param {{
 *   competitorName: string,
 *   mentions?: object[],
 *   alerts?: object[],
 *   days?: number,
 * }} opts
 */
export function computeRivalPerception(opts) {
  const name = String(opts.competitorName || '').trim() || 'Rival';
  const days = Math.max(1, Number(opts.days) || 14);
  const now = Date.now();
  const since = now - days * DAY_MS;

  const fromMentions = (opts.mentions || []).map((m) => ({
    text: String(m.text || m.originalComplaint || '').trim(),
    sourceUrl: m.sourceUrl || '',
    channel: channelOf(m),
    at: parseAt(m.detectedAt || m.at) || now,
    severity: severityOf(m, m.text),
    status: m.status || null,
  }));

  const fromAlerts = (opts.alerts || [])
    .filter((a) => String(a.competitorName || '').trim() === name)
    .map((a) => ({
      text: String(a.originalComplaint || '').trim(),
      sourceUrl: a.sourceUrl || '',
      channel: channelOf(a),
      at: parseAt(a.detectedAt || a.createdAt || a.at) || now,
      severity: severityOf(a, a.originalComplaint),
      status: a.status || 'NEW',
    }));

  const seen = new Set();
  const items = [];
  for (const row of [...fromMentions, ...fromAlerts]) {
    if (!row.text) continue;
    const key = row.text.slice(0, 90).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(row);
  }

  const inWindow = items.filter((i) => i.at >= since);
  const sample = inWindow.length ? inWindow : items;

  /** @type {Record<string, number>} */
  const byTheme = {};
  /** @type {Record<string, number>} */
  const byChannel = {};
  /** @type {Record<string, number>} */
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  let switchIntent = 0;
  let frustrationSum = 0;

  for (const item of sample) {
    const text = item.text;
    frustrationSum += scoreFrustration(text);
    byChannel[item.channel] = (byChannel[item.channel] || 0) + 1;
    const sev = item.severity in bySeverity ? item.severity : 'LOW';
    bySeverity[sev] += 1;
    if (THEME_RULES.find((r) => r.id === 'churn')?.re.test(text)) switchIntent += 1;

    let anyTheme = false;
    for (const rule of THEME_RULES) {
      if (rule.re.test(text)) {
        byTheme[rule.label] = (byTheme[rule.label] || 0) + 1;
        anyTheme = true;
      }
    }
    if (!anyTheme) byTheme['General'] = (byTheme['General'] || 0) + 1;
  }

  const n = sample.length || 1;
  const avgFrustration = sample.length ? frustrationSum / sample.length : 0;
  const switchIntentPct = sample.length ? Math.round((switchIntent / sample.length) * 100) : 0;

  // Percepción 0–100: más alto = peor imagen pública (más frustración / severidad / churn)
  const sevWeight =
    (bySeverity.CRITICAL * 1 + bySeverity.HIGH * 0.75 + bySeverity.MEDIUM * 0.45 + bySeverity.LOW * 0.2) /
    n;
  const perceptionScore = Math.min(
    100,
    Math.round(avgFrustration * 55 + sevWeight * 30 + (switchIntentPct / 100) * 15),
  );

  const open = fromAlerts.filter((a) => !a.status || a.status === 'NEW' || a.status === 'SNOOZED').length;
  const won = fromAlerts.filter((a) => a.status === 'WON').length;
  const contacted = fromAlerts.filter((a) => a.status === 'CONTACTED').length;
  const dismissed = fromAlerts.filter((a) => a.status === 'DISMISSED').length;
  const winRate =
    won + dismissed > 0 ? Math.round((won / (won + dismissed)) * 100) : won > 0 ? 100 : 0;

  /** Serie diaria de menciones del rival */
  /** @type {Record<string, number>} */
  const buckets = {};
  for (let i = days - 1; i >= 0; i -= 1) {
    buckets[dayKey(now - i * DAY_MS)] = 0;
  }
  for (const item of items) {
    const key = dayKey(item.at);
    if (key in buckets) buckets[key] += 1;
  }
  const series = Object.entries(buckets).map(([date, count]) => ({
    date,
    label: date.slice(5),
    count,
  }));

  const topThemes = Object.entries(byTheme)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  const topChannels = Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  const voiceLine =
    perceptionScore >= 75
      ? 'Los usuarios lo ven muy mal: alta frustración y ganas de irse.'
      : perceptionScore >= 50
        ? 'Percepción negativa clara; hay ángulos de captación accionables.'
        : perceptionScore >= 30
          ? 'Ruido moderado: dolores puntuales, no crisis total.'
          : 'Señal débil o poco volumen; conviene escanear más fuentes.';

  return {
    competitorName: name,
    days,
    mentionCount: sample.length,
    mentionTotal: items.length,
    avgFrustration: Number(avgFrustration.toFixed(2)),
    perceptionScore,
    voiceLine,
    switchIntentPct,
    bySeverity,
    byTheme,
    byChannel,
    topThemes,
    topChannels,
    series,
    pipeline: { open, contacted, won, dismissed, winRate },
    sampleQuotes: sample
      .slice()
      .sort((a, b) => scoreFrustration(b.text) - scoreFrustration(a.text))
      .slice(0, 4)
      .map((m) => ({
        text: m.text.slice(0, 220),
        channel: m.channel,
        sourceUrl: m.sourceUrl,
      })),
    generatedAt: new Date().toISOString(),
  };
}
