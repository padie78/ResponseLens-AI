/**
 * F3.2 — Cruce narrativo: ads propios × menciones del día.
 * Correlación heurística (no causalidad).
 */

const DAY_MS = 86400000;

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

/**
 * @param {{
 *   adsIntel: import('./own-ads-intel').OwnAdsIntel,
 *   alerts: Array<{ detectedAt?: string, severity?: string, brandScope?: string }>,
 *   windowDays?: number,
 * }} opts
 */
export function buildAdsCrossNarrative(opts) {
  const { adsIntel, alerts = [], windowDays = 7 } = opts;

  if (!adsIntel?.connected || !adsIntel.campaigns.length) {
    return {
      available: false,
      correlations: [],
      narrative: 'Sin campañas activas para cruzar con menciones.',
    };
  }

  const cutoff = new Date(Date.now() - windowDays * DAY_MS).toISOString();
  const recentAlerts = alerts.filter(
    (a) => (a.detectedAt || '') >= cutoff && a.brandScope === 'own',
  );

  const mentionsByDay = {};
  for (const a of recentAlerts) {
    const day = dayKey(a.detectedAt);
    mentionsByDay[day] = (mentionsByDay[day] || 0) + 1;
  }

  const activeCampaigns = adsIntel.campaigns.filter((c) => c.status === 'active');
  const correlations = [];

  for (const camp of activeCampaigns) {
    const startDay = dayKey(camp.startedAt);
    const endDay = camp.endedAt ? dayKey(camp.endedAt) : dayKey(new Date().toISOString());

    let mentionsInWindow = 0;
    let daysActive = 0;

    for (const [day, count] of Object.entries(mentionsByDay)) {
      if (day >= startDay && day <= endDay) {
        mentionsInWindow += count;
        daysActive += 1;
      }
    }

    if (mentionsInWindow > 0) {
      const avgMentions = recentAlerts.length / windowDays;
      const campAvg = daysActive > 0 ? mentionsInWindow / daysActive : 0;
      const direction = campAvg > avgMentions * 1.3 ? 'arriba' : campAvg < avgMentions * 0.7 ? 'abajo' : 'estable';

      correlations.push({
        campaignName: camp.name,
        platform: camp.platform,
        mentionsInWindow,
        daysActive,
        direction,
        spendBand: camp.spendBand,
      });
    }
  }

  correlations.sort((a, b) => b.mentionsInWindow - a.mentionsInWindow);
  const top = correlations.slice(0, 3);

  let narrative = '';
  if (!top.length) {
    narrative = `${activeCampaigns.length} campaña(s) activa(s) sin menciones propias coincidentes en los últimos ${windowDays} días.`;
  } else {
    const parts = top.map(
      (c) =>
        `"${c.campaignName}" (${c.platform}) coincidió con ${c.mentionsInWindow} mención(es) — tendencia ${c.direction}`,
    );
    narrative = `Correlación últimos ${windowDays}d: ${parts.join('; ')}. Esto no implica causalidad.`;
  }

  return {
    available: true,
    correlations: top,
    narrative,
  };
}
