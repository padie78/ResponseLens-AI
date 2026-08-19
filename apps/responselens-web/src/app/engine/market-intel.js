/**
 * F5.1 — Feed global y tendencias de industria.
 * Reusa alertas existentes y completa con demo si todavía no hay señal suficiente.
 */

function hashKey(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function uniq(list) {
  return [...new Set((list || []).map((s) => String(s || '').trim()).filter(Boolean))];
}

function normalizeKeywords(opts) {
  const raw = uniq([
    ...(opts.industryKeywords || []),
    opts.marketCategory || '',
    opts.whatTheySell || '',
  ]);
  return raw
    .flatMap((s) => s.split(/[,\n]/))
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
}

function textOf(alert) {
  return String(alert?.originalComplaint || alert?.complaint || alert?.summary || '').trim();
}

function sourceOf(alert) {
  return String(alert?.channel || alert?._source || 'feed').trim();
}

function themeFromText(text) {
  const lower = String(text || '').toLowerCase();
  if (/(precio|cost|billing|tarifa|plan)/.test(lower)) return 'precio';
  if (/(soporte|support|ticket|respuesta)/.test(lower)) return 'soporte';
  if (/(seguridad|fraude|phishing|scam|trust)/.test(lower)) return 'seguridad';
  if (/(caída|caido|down|uptime|incidente|status)/.test(lower)) return 'confiabilidad';
  if (/(integraci|api|sdk|webhook)/.test(lower)) return 'integración';
  if (/(onboarding|setup|configur|implementar)/.test(lower)) return 'onboarding';
  return 'mercado';
}

function buildDemoRows(keywords, count = 8) {
  const stems = keywords.length ? keywords : ['mercado', 'industria', 'competencia', 'precio'];
  return Array.from({ length: count }, (_, i) => {
    const kw = stems[i % stems.length];
    const h = hashKey(`${kw}|${i}`);
    const channels = ['Reddit', 'X', 'News', 'YouTube', 'Forum'];
    const themes = ['precio', 'soporte', 'integración', 'onboarding', 'confiabilidad', 'seguridad'];
    const detectedAt = new Date(Date.now() - (i * 7 + (h % 6)) * 3600000).toISOString();
    return {
      id: `market_demo_${i}_${h.toString(36)}`,
      headline: `${kw}: usuarios comparan opciones y fricciones`,
      snippet: `Conversación de industria sobre ${kw} con foco en ${themes[h % themes.length]}.`,
      keyword: kw,
      theme: themes[h % themes.length],
      source: channels[h % channels.length],
      severity: ['LOW', 'MEDIUM', 'HIGH'][h % 3],
      detectedAt,
      sourceUrl: '',
      kind: 'demo',
    };
  });
}

export function buildMarketFeed(opts) {
  const keywords = normalizeKeywords(opts);
  const alerts = Array.isArray(opts.alerts) ? opts.alerts : [];
  const rows = [];
  for (const alert of alerts) {
    const body = textOf(alert);
    const lower = body.toLowerCase();
    const hit = keywords.find((kw) => lower.includes(kw));
    if (!hit) continue;
    rows.push({
      id: String(alert?.alertId || alert?.id || `${hit}_${rows.length}`),
      headline: body.slice(0, 96) || `Mención sobre ${hit}`,
      snippet: body.slice(0, 180),
      keyword: hit,
      theme: themeFromText(body),
      source: sourceOf(alert),
      severity: String(alert?.severity || 'LOW').toUpperCase(),
      detectedAt: String(alert?.detectedAt || new Date().toISOString()),
      sourceUrl: String(alert?.sourceUrl || ''),
      kind: 'real',
    });
  }
  const sorted = rows.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  const padded = sorted.length >= 6 ? sorted : [...sorted, ...buildDemoRows(keywords, 8 - sorted.length)];
  return {
    source: sorted.length ? 'feed' : 'demo',
    disclaimer: sorted.length
      ? 'Feed de industria acotado por tus keywords. No pretende cubrir todo el mercado.'
      : 'Sin suficiente señal real todavía. Se muestra una simulación guiada por tus keywords.',
    keywords,
    channels: uniq(padded.map((r) => r.source)),
    severities: uniq(padded.map((r) => r.severity)),
    themes: uniq(padded.map((r) => r.theme)),
    rows: padded.slice(0, 12),
  };
}

export function buildMarketTrends(opts) {
  const feed = buildMarketFeed(opts);
  const byKeyword = new Map();
  const bySource = new Map();
  const bySeverity = new Map();
  const byTheme = new Map();
  for (const row of feed.rows) {
    byKeyword.set(row.keyword, (byKeyword.get(row.keyword) || 0) + 1);
    bySource.set(row.source, (bySource.get(row.source) || 0) + 1);
    bySeverity.set(row.severity, (bySeverity.get(row.severity) || 0) + 1);
    byTheme.set(row.theme, (byTheme.get(row.theme) || 0) + 1);
  }
  const topKeywords = [...byKeyword.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const topSources = [...bySource.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((severity) => ({
    severity,
    count: bySeverity.get(severity) || 0,
  }));
  const topThemes = [...byTheme.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const totalRows = feed.rows.length;
  const realRows = feed.rows.filter((r) => r.kind === 'real').length;
  const criticalCount = feed.rows.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length;
  const summary = topKeywords.length
    ? `Mayor movimiento en ${topKeywords[0].keyword}${topKeywords[1] ? `, seguido de ${topKeywords[1].keyword}` : ''}.`
    : 'Sin volumen suficiente para detectar tendencias.';
  return {
    source: feed.source,
    disclaimer: feed.disclaimer,
    summary,
    totalRows,
    realRows,
    criticalCount,
    topKeywords,
    topThemes,
    topSources,
    severities,
    rows: feed.rows,
  };
}
