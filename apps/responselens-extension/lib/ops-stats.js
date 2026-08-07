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

  const openAlerts = alerts.filter(
    (a) => !a.status || a.status === 'NEW' || a.status === 'SNOOZED',
  ).length;

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
