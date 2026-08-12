/**
 * Insights de marca propia: descriptivo ya vive en computeOwnBrandHealth.
 * Aquí: predictivo, prescriptivo y temas (sin APIs externas).
 */

import { primaryTheme, detectThemes } from './theme-rules.js';
import { computeOwnBrandHealth } from './ops-stats.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseAt(value) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : null;
}

function ownAlerts(alerts = []) {
  return (alerts || []).filter((a) => a.brandScope === 'own' || a._brandScope === 'own');
}

/**
 * Predictivo: trayectoria de riesgo / volumen a 7 días (heurística local).
 * @param {{ alerts?: object[], days?: number }} [opts]
 */
export function computeOwnPredictive({ alerts = [], days = 14 } = {}) {
  const health = computeOwnBrandHealth({ alerts, days });
  const list = ownAlerts(alerts);
  const now = Date.now();

  /** últimos 7 días vs 7 anteriores */
  const recentSince = now - 7 * DAY_MS;
  const prevSince = now - 14 * DAY_MS;
  const recent = list.filter((a) => {
    const t = parseAt(a.detectedAt);
    return t != null && t >= recentSince;
  });
  const previous = list.filter((a) => {
    const t = parseAt(a.detectedAt);
    return t != null && t >= prevSince && t < recentSince;
  });

  const avg = (arr) => {
    const scores = arr
      .map((a) => (typeof a._aiScore === 'number' ? a._aiScore : null))
      .filter((n) => n != null);
    if (!scores.length) return 0;
    return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
  };

  const volRecent = recent.length;
  const volPrev = previous.length || 1;
  const volDeltaPct = Math.round(((volRecent - previous.length) / volPrev) * 100);
  const scoreRecent = avg(recent);
  const scorePrev = avg(previous);
  const scoreDelta = scoreRecent - scorePrev;

  /** series diarias volumen + score medio + reach (7 días) */
  /** @type {{ label: string, volume: number, avgScore: number, reach: number }[]} */
  const series = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = new Date(now - i * DAY_MS);
    const dayKey = dayStart.toISOString().slice(0, 10);
    const label = dayKey.slice(5);
    const bucket = list.filter((a) => {
      const t = parseAt(a.detectedAt);
      return t != null && new Date(t).toISOString().slice(0, 10) === dayKey;
    });
    series.push({
      label,
      volume: bucket.length,
      avgScore: avg(bucket),
      reach: bucket.reduce((s, a) => {
        const p = a?._scMeta?.engagement?.points;
        return s + (typeof p === 'number' ? p : 0);
      }, 0),
    });
  }

  let crisisProb = 15;
  crisisProb += Math.min(35, health.negPct * 0.4);
  crisisProb += Math.min(25, health.avgScore * 0.25);
  crisisProb += Math.min(20, health.criticalOpen * 8);
  if (volDeltaPct > 40) crisisProb += 12;
  if (scoreDelta > 10) crisisProb += 10;
  const reachRecent = recent.reduce((s, a) => {
    const p = a?._scMeta?.engagement?.points;
    return s + (typeof p === 'number' ? p : 0);
  }, 0);
  const reachPrev = previous.reduce((s, a) => {
    const p = a?._scMeta?.engagement?.points;
    return s + (typeof p === 'number' ? p : 0);
  }, 0);
  const reachDeltaPct =
    reachPrev > 0
      ? Math.round(((reachRecent - reachPrev) / reachPrev) * 100)
      : reachRecent > 0
        ? 100
        : 0;
  if (reachDeltaPct > 50) crisisProb += 8;
  crisisProb = Math.max(5, Math.min(95, Math.round(crisisProb)));

  let outlook = 'estable';
  let outlookLabel = 'Escenario estable';
  if (crisisProb >= 70 || scoreDelta > 15 || volDeltaPct > 80) {
    outlook = 'worsening';
    outlookLabel = 'Riesgo en alza';
  } else if (crisisProb <= 25 && scoreDelta < -8 && volDeltaPct < 10) {
    outlook = 'improving';
    outlookLabel = 'Mejora esperada';
  } else if (crisisProb >= 45) {
    outlook = 'watch';
    outlookLabel = 'Vigilancia recomendada';
  }

  const forecastScore7d = Math.max(
    1,
    Math.min(100, Math.round(health.avgScore + scoreDelta * 0.6 + (volDeltaPct > 30 ? 8 : 0))),
  );

  return {
    outlook,
    outlookLabel,
    crisisProb,
    volRecent,
    volPrev: previous.length,
    volDeltaPct,
    scoreRecent,
    scorePrev,
    scoreDelta,
    reachRecent,
    reachPrev,
    reachDeltaPct,
    forecastScore7d,
    series,
    narrative:
      outlook === 'worsening'
        ? `El volumen reciente (${volRecent}) y el score medio (${scoreRecent}) sugieren presión reputacional. Alcance ${reachRecent.toLocaleString('es')} pts (Δ ${reachDeltaPct > 0 ? '+' : ''}${reachDeltaPct}%). Prob. crisis ~${crisisProb}%.`
        : outlook === 'improving'
          ? `Señal de alivio: score bajando (${scoreDelta}) y volumen controlado. Alcance reciente ${reachRecent.toLocaleString('es')} pts. Seguí cerrando abiertas.`
          : `Trayectoria ${outlookLabel.toLowerCase()}. Score proyectado a 7 días: ${forecastScore7d}/100 · alcance ${reachRecent.toLocaleString('es')} pts.`,
  };
}

/**
 * Prescriptivo: cola de acciones priorizadas + playbooks por tema.
 * @param {{ alerts?: object[], companyName?: string }} [opts]
 */
export function computeOwnPrescriptive({ alerts = [], companyName = 'tu marca' } = {}) {
  const list = ownAlerts(alerts).filter((a) => {
    const st = a.status || 'NEW';
    return st === 'NEW' || st === 'SNOOZED' || st === 'CONTACTED';
  });

  const ranked = [...list]
    .map((a) => {
      const score = typeof a._aiScore === 'number' ? a._aiScore : 40;
      const sev =
        a.severity === 'CRITICAL' ? 30 : a.severity === 'HIGH' ? 20 : a.severity === 'MEDIUM' ? 10 : 0;
      const moderation = a._intel?.requiere_moderacion_humana ? 25 : 0;
      const eng = a._scMeta?.engagement;
      const reachBoost =
        eng && (eng.points >= 100 || eng.numComments >= 50)
          ? 12
          : eng && (eng.points > 0 || eng.numComments > 0)
            ? 5
            : 0;
      const priority = Math.min(100, score + sev + moderation + reachBoost);
      let action = 'Revisar y responder';
      if (a._intel?.requiere_moderacion_humana) action = 'Escalar a moderación / legal';
      else if (a._mentionKind === 'media' || a._actionable === false) action = 'Monitorear mención';
      else if (priority >= 80) action = 'Responder en < 2 h';
      else if (priority >= 60) action = 'Responder hoy';
      else action = 'Programar respuesta';
      return {
        alertId: a.alertId,
        competitorName: a.competitorName,
        snippet: String(a.originalComplaint || '').slice(0, 120),
        score,
        priority,
        action,
        sla: priority >= 80 ? '< 2 h' : priority >= 60 ? '< 8 h' : '24 h',
        channel: a.channel || a._source || 'web',
        theme: primaryTheme(a.originalComplaint || '', 'es')?.label || 'General',
        reach:
          eng && (eng.points != null || eng.numComments != null)
            ? `${eng.points ?? 0} pts · ${eng.numComments ?? 0} cmts`
            : '',
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12);

  /** @type {Record<string, number>} */
  const themeCounts = {};
  for (const a of list) {
    const themes = detectThemes(a.originalComplaint || '', 'es');
    for (const t of themes) {
      const lab = t.label || t.id;
      themeCounts[lab] = (themeCounts[lab] || 0) + 1;
    }
  }

  const themeActions = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([theme, count]) => ({
      theme,
      count,
      playbook:
        theme.toLowerCase().includes('soporte') || theme.toLowerCase().includes('support')
          ? `Para ${companyName}: triage → respuesta pública → fix en DM → cerrar ciclo.`
          : theme.toLowerCase().includes('precio') || theme.toLowerCase().includes('pricing')
            ? `Clarificá pricing en público; ofrecé opciones en privado sin discutir.`
            : theme.toLowerCase().includes('confiab') || theme.toLowerCase().includes('reliab')
              ? `Comunicá estado del incidente + ETA de fix; evitá disculpas vacías.`
              : `Reconocé el tema ${theme}, mové detalle a DM y registrá en historial.`,
    }));

  return {
    queue: ranked,
    themeActions,
    openCount: ranked.length,
    urgentCount: ranked.filter((r) => r.priority >= 80).length,
  };
}

/**
 * Temas agregados para tab Temas.
 * @param {{ alerts?: object[] }} [opts]
 */
export function computeOwnThemes({ alerts = [] } = {}) {
  const list = ownAlerts(alerts);
  /** @type {Record<string, { count: number, avgScore: number, sum: number, n: number, neg: number, points: number }>} */
  const map = {};
  for (const a of list) {
    const themes = detectThemes(a.originalComplaint || '', 'es');
    const score = typeof a._aiScore === 'number' ? a._aiScore : 0;
    const sent = String(a._sentiment || a.sentiment || '').toUpperCase();
    const pts =
      typeof a?._scMeta?.engagement?.points === 'number' ? a._scMeta.engagement.points : 0;
    const clusterTheme = a?._scMeta?.clusterTitle;
    const themeList = themes.length
      ? themes
      : clusterTheme
        ? [{ id: 'cluster', label: String(clusterTheme) }]
        : [{ id: 'general', label: 'General' }];
    for (const t of themeList) {
      const key = t.label || t.id;
      if (!map[key]) map[key] = { count: 0, avgScore: 0, sum: 0, n: 0, neg: 0, points: 0 };
      map[key].count += 1;
      map[key].points += pts;
      if (score) {
        map[key].sum += score;
        map[key].n += 1;
      }
      if (sent === 'NEGATIVE') map[key].neg += 1;
    }
  }
  return Object.entries(map)
    .map(([theme, v]) => ({
      theme,
      count: v.count,
      avgScore: v.n ? Math.round(v.sum / v.n) : 0,
      negPct: v.count ? Math.round((v.neg / v.count) * 100) : 0,
      points: v.points,
    }))
    .sort((a, b) => b.points - a.points || b.count - a.count || b.avgScore - a.avgScore);
}
