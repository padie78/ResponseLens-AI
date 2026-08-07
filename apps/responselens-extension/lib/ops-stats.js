/**
 * KPIs locales del Side Panel (historial + alertas).
 */

export function computeOpsStats({ history = [], alerts = [] } = {}) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const repliesThisWeek = history.filter((h) => {
    const t = Date.parse(h.at || '');
    return Number.isFinite(t) && now - t <= weekMs;
  }).length;

  const openAlerts = alerts.filter((a) => !a.status || a.status === 'NEW' || a.status === 'SNOOZED')
    .length;

  const contacted = alerts.filter((a) => a.status === 'CONTACTED' || a.status === 'WON').length;

  const criticalOpen = alerts.filter(
    (a) =>
      (!a.status || a.status === 'NEW') &&
      (a.severity === 'CRITICAL' || a.severity === 'HIGH'),
  ).length;

  const escalations = history.filter((h) =>
    String(h.recommendedAction || '').startsWith('ESCALATE'),
  ).length;

  return {
    repliesThisWeek,
    openAlerts,
    contacted,
    criticalOpen,
    escalations,
    historyTotal: history.length,
  };
}

export const DEMO_ALERTS = [
  {
    alertId: 'demo-1',
    userId: 'local-user',
    competitorName: 'RivalCloud',
    originalComplaint:
      'Llevan 6 horas de caída del servicio y nadie responde. Me cambio sí o sí.',
    sourceUrl: 'https://x.com/example/status/1',
    channel: 'x',
    severity: 'HIGH',
    frustrationScore: 0.82,
    salesPitch:
      'Si buscas una alternativa estable a RivalCloud, podemos ayudarte con una migración sin fricción.',
    detectedAt: new Date(Date.now() - 36e5).toISOString(),
    status: 'NEW',
    _demo: true,
  },
  {
    alertId: 'demo-2',
    userId: 'local-user',
    competitorName: 'ShopFast',
    originalComplaint: 'Me cobraron dos veces y el soporte es una estafa. Voy a pedir chargeback.',
    sourceUrl: 'https://www.reddit.com/r/example/comments/demo',
    channel: 'web',
    severity: 'CRITICAL',
    frustrationScore: 0.91,
    salesPitch:
      'Si ShopFast te falló en cobros, te acompañamos con onboarding guiado y soporte humano.',
    detectedAt: new Date(Date.now() - 864e5).toISOString(),
    status: 'NEW',
    _demo: true,
  },
];
