/**
 * Pulse de listening a partir de alertas + _scMeta (SocialCrawl / mock).
 * Sirve Propios (own) y Competencia (rival) sin APIs extra.
 */

/**
 * @param {object} a
 * @returns {object | null}
 */
export function scMetaOf(a) {
  const m = a?._scMeta;
  return m && typeof m === 'object' ? m : null;
}

/**
 * @param {object[]} alerts
 * @param {'own'|'rival'|'all'} [scope]
 */
function scopedAlerts(alerts = [], scope = 'all') {
  if (scope === 'all') return (alerts || []).filter(Boolean);
  return (alerts || []).filter((a) => {
    const s = a.brandScope === 'own' || a._brandScope === 'own' ? 'own' : 'rival';
    return s === scope;
  });
}

/**
 * @param {object} a
 */
function engOf(a) {
  const m = scMetaOf(a);
  const points = typeof m?.engagement?.points === 'number' ? m.engagement.points : 0;
  const comments =
    typeof m?.engagement?.numComments === 'number' ? m.engagement.numComments : 0;
  return { points, comments };
}

/**
 * Agrega señales SocialCrawl del feed.
 * @param {{ alerts?: object[], scope?: 'own'|'rival'|'all', mode?: 'reputation'|'capture' }} [opts]
 */
export function computeListeningPulse({
  alerts = [],
  scope = 'all',
  mode = 'reputation',
} = {}) {
  const list = scopedAlerts(alerts, scope).filter(
    (a) => a.status !== 'DISMISSED',
  );
  const withSc = list.filter((a) => Boolean(scMetaOf(a)));

  let points = 0;
  let comments = 0;
  let scoreSum = 0;
  let scoreN = 0;
  let finalSum = 0;
  let finalN = 0;
  let open = 0;
  let critical = 0;
  let contacted = 0;
  let won = 0;

  /** @type {Record<string, { count: number, points: number, comments: number }>} */
  const byChannel = {};
  /** @type {Record<string, { title: string, count: number, points: number, score: number }>} */
  const byCluster = {};
  /** @type {Record<string, number>} */
  const byRival = {};

  for (const a of list) {
    const st = a.status || 'NEW';
    if (st === 'NEW' || st === 'SNOOZED') open += 1;
    if (st === 'CONTACTED') contacted += 1;
    if (st === 'WON') won += 1;
    const sev = String(a.severity || '').toUpperCase();
    if ((st === 'NEW' || st === 'SNOOZED') && (sev === 'CRITICAL' || sev === 'HIGH')) {
      critical += 1;
    }

    const ch = String(a.channel || 'web').toLowerCase();
    if (!byChannel[ch]) byChannel[ch] = { count: 0, points: 0, comments: 0 };
    byChannel[ch].count += 1;

    const eng = engOf(a);
    points += eng.points;
    comments += eng.comments;
    byChannel[ch].points += eng.points;
    byChannel[ch].comments += eng.comments;

    if (typeof a._aiScore === 'number') {
      scoreSum += a._aiScore;
      scoreN += 1;
    }

    const m = scMetaOf(a);
    if (typeof m?.finalScore === 'number') {
      finalSum += m.finalScore;
      finalN += 1;
    }

    const cid = m?.clusterId ? String(m.clusterId) : '';
    if (cid) {
      if (!byCluster[cid]) {
        byCluster[cid] = {
          title: String(m.clusterTitle || cid),
          count: 0,
          points: 0,
          score: typeof m.clusterScore === 'number' ? m.clusterScore : 0,
        };
      }
      byCluster[cid].count += 1;
      byCluster[cid].points += eng.points;
      if (m.clusterTitle) byCluster[cid].title = String(m.clusterTitle);
      if (typeof m.clusterScore === 'number') byCluster[cid].score = m.clusterScore;
    }

    const rival = String(a.competitorName || '').trim();
    if (rival) byRival[rival] = (byRival[rival] || 0) + 1;
  }

  const clusters = Object.entries(byCluster)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.points - a.points || b.count - a.count);

  const channels = Object.entries(byChannel)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.points - a.points || b.count - a.count);

  const rivals = Object.entries(byRival)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topCluster = clusters[0] || null;
  const topChannel = channels[0] || null;
  const avgAi = scoreN ? Math.round(scoreSum / scoreN) : 0;
  const avgFinal = finalN ? Math.round(finalSum / finalN) : 0;
  const scCoverage = list.length ? Math.round((withSc.length / list.length) * 100) : 0;

  const headlines = [];
  if (!list.length) {
    headlines.push(
      mode === 'capture'
        ? 'Sin oportunidades todavía. Corré un scan para poblar el feed.'
        : 'Sin menciones propias todavía. Corré un scan para ver salud de marca.',
    );
  } else {
    headlines.push(
      `${list.length} señal(es) activas · ${withSc.length} con métricas (${scCoverage}% cobertura).`,
    );
    if (points > 0) {
      headlines.push(
        `Alcance agregado: ${points.toLocaleString('es')} pts · ${comments.toLocaleString('es')} comentarios.`,
      );
    }
    if (topCluster) {
      headlines.push(
        `Cluster dominante: “${topCluster.title}” (${topCluster.count} menciones · ${topCluster.points} pts).`,
      );
    }
    if (topChannel) {
      headlines.push(
        `Canal con más reach: ${topChannel.name} (${topChannel.points} pts / ${topChannel.count} ítems).`,
      );
    }
    if (mode === 'capture') {
      headlines.push(
        `Pipeline: ${open} abiertas · ${contacted} contactadas · ${won} ganadas · ${critical} críticas abiertas.`,
      );
    } else if (critical > 0) {
      headlines.push(`${critical} menciones críticas/altas abiertas requieren respuesta.`);
    }
  }

  return {
    mode,
    scope,
    total: list.length,
    withSc: withSc.length,
    scCoverage,
    points,
    comments,
    open,
    critical,
    contacted,
    won,
    avgAi,
    avgFinal,
    clusters,
    channels,
    rivals,
    topCluster,
    topChannel,
    headlines,
    winRate: contacted + won > 0 ? Math.round((won / (contacted + won)) * 100) : 0,
  };
}

/**
 * @param {ReturnType<typeof computeListeningPulse>} pulse
 * @returns {{ name: string, value: number }[]}
 */
export function pulseChannelReachSeries(pulse) {
  return (pulse.channels || []).slice(0, 8).map((c) => ({
    name: c.name,
    value: c.points || c.count,
  }));
}

/**
 * @param {ReturnType<typeof computeListeningPulse>} pulse
 */
export function pulseClusterSeries(pulse) {
  return (pulse.clusters || []).slice(0, 6).map((c) => ({
    name: c.title.length > 36 ? `${c.title.slice(0, 34)}…` : c.title,
    value: c.count,
    points: c.points,
  }));
}
