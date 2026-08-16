/**
 * Insights de marca propia: descriptivo ya vive en computeOwnBrandHealth.
 * Aquí: predictivo, prescriptivo y temas (sin APIs externas).
 */

import { primaryTheme, detectThemes } from './theme-rules.js';
import { computeOwnBrandHealth } from './ops-stats.js';
import {
  contentKindLabel,
  isReplyableContent,
  normalizeContentKind,
} from './content-kind.js';

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
      else if (
        !isReplyableContent(
          normalizeContentKind(a._mentionKind, a.channel),
          a._scMeta,
        )
      )
        action = 'Monitorear pieza';
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
      if (!map[key]) map[key] = { count: 0, avgScore: 0, sum: 0, n: 0, neg: 0, points: 0, samples: [] };
      map[key].count += 1;
      map[key].points += pts;
      if (score) {
        map[key].sum += score;
        map[key].n += 1;
      }
      if (sent === 'NEGATIVE') map[key].neg += 1;
      const snip = String(a.originalComplaint || '').replace(/\s+/g, ' ').trim();
      if (snip && map[key].samples.length < 2 && !map[key].samples.includes(snip)) {
        map[key].samples.push(snip.slice(0, 180));
      }
    }
  }
  return Object.entries(map)
    .map(([theme, v]) => ({
      theme,
      count: v.count,
      avgScore: v.n ? Math.round(v.sum / v.n) : 0,
      negPct: v.count ? Math.round((v.neg / v.count) * 100) : 0,
      points: v.points,
      samples: v.samples,
    }))
    .sort((a, b) => b.points - a.points || b.count - a.count || b.avgScore - a.avgScore);
}

function sentKey(a) {
  const s = String(a._sentiment || a.sentiment || 'NEUTRAL').toUpperCase();
  if (s === 'POSITIVE' || s === 'NEGATIVE' || s === 'MIXED') return s;
  return 'NEUTRAL';
}

function channelLabel(a) {
  const raw = String(a.channel || a._source || '').trim();
  if (raw) return raw;
  const url = String(a.sourceUrl || '');
  if (/reddit/i.test(url)) return 'reddit';
  if (/youtube|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram/i.test(url)) return 'instagram';
  if (/twitter|x\.com/i.test(url)) return 'x';
  if (/facebook/i.test(url)) return 'facebook';
  if (/linkedin/i.test(url)) return 'linkedin';
  return 'otro';
}

/**
 * Auditoría de marca: diagnóstico + series de sentimiento + canales + citas de dolor.
 * @param {{ alerts?: object[], history?: object[], days?: number, companyName?: string }} [opts]
 */
export function computeBrandAudit({
  alerts = [],
  history = [],
  days = 14,
  companyName = 'tu marca',
} = {}) {
  const health = computeOwnBrandHealth({ alerts, history, days });
  const predictive = computeOwnPredictive({ alerts, days });
  const themes = computeOwnThemes({ alerts });
  const prescriptive = computeOwnPrescriptive({ alerts, companyName });
  const list = ownAlerts(alerts);
  const now = Date.now();
  const since = now - Math.max(1, days) * DAY_MS;
  const inWindow = list.filter((a) => {
    const t = parseAt(a.detectedAt);
    return t == null || t >= since;
  });

  /** @type {{ label: string, pos: number, neg: number, neu: number, mix: number }[]} */
  const sentimentSeries = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(now - i * DAY_MS);
    const dayKey = dayStart.toISOString().slice(0, 10);
    const bucket = list.filter((a) => {
      const t = parseAt(a.detectedAt);
      return t != null && new Date(t).toISOString().slice(0, 10) === dayKey;
    });
    const row = { label: dayKey.slice(5), pos: 0, neg: 0, neu: 0, mix: 0 };
    for (const a of bucket) {
      const k = sentKey(a);
      if (k === 'POSITIVE') row.pos += 1;
      else if (k === 'NEGATIVE') row.neg += 1;
      else if (k === 'MIXED') row.mix += 1;
      else row.neu += 1;
    }
    sentimentSeries.push(row);
  }

  /** @type {Record<string, { count: number, neg: number, sum: number, n: number }>} */
  const chMap = {};
  for (const a of inWindow) {
    const ch = channelLabel(a);
    if (!chMap[ch]) chMap[ch] = { count: 0, neg: 0, sum: 0, n: 0 };
    chMap[ch].count += 1;
    if (sentKey(a) === 'NEGATIVE') chMap[ch].neg += 1;
    if (typeof a._aiScore === 'number') {
      chMap[ch].sum += a._aiScore;
      chMap[ch].n += 1;
    }
  }
  const channels = Object.entries(chMap)
    .map(([channel, v]) => ({
      channel,
      count: v.count,
      negPct: v.count ? Math.round((v.neg / v.count) * 100) : 0,
      avgScore: v.n ? Math.round(v.sum / v.n) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const replies = (history || []).filter((h) => {
    if (h.kind !== 'own_reply') return false;
    const t = parseAt(h.at);
    return t != null && t >= since;
  }).length;
  const closed = inWindow.filter((a) => {
    const st = a.status || 'NEW';
    return st === 'CONTACTED' || st === 'WON' || st === 'DISMISSED';
  }).length;
  const coveragePct = inWindow.length ? Math.round((closed / inWindow.length) * 100) : 0;

  /** @type {string[]} */
  const findings = [];
  if (!inWindow.length) {
    findings.push('Todavía no hay menciones propias en la ventana. Escaneá para auditar reputación real.');
  } else {
    findings.push(
      `${health.healthLabel}: ${health.negPct}% negativo y score medio ${health.avgScore}/100 en ${days} días (${health.total} menciones).`,
    );
    if (health.criticalOpen > 0) {
      findings.push(`${health.criticalOpen} crisis abiertas siguen en la bandeja de entrada.`);
    }
    if (coveragePct < 35 && inWindow.length >= 4) {
      findings.push(`Cobertura de cierre baja (${coveragePct}%). El volumen supera a las respuestas registradas.`);
    } else if (coveragePct >= 70) {
      findings.push(`Buena cobertura operativa: ${coveragePct}% de menciones ya salieron de la cola.`);
    }
    const worstTheme = [...themes].sort((a, b) => b.negPct - a.negPct || b.count - a.count)[0];
    if (worstTheme && worstTheme.negPct >= 40 && worstTheme.count >= 2) {
      findings.push(
        `Punto de dolor dominante: «${worstTheme.theme}» (${worstTheme.negPct}% negativo, ${worstTheme.count} menciones).`,
      );
    }
    if (channels[0] && channels[0].count / Math.max(1, inWindow.length) >= 0.5) {
      findings.push(
        `Concentración de conversación en ${channels[0].channel} (${channels[0].count} de ${inWindow.length}).`,
      );
    }
    findings.push(predictive.narrative);
  }

  const quotes = [...inWindow]
    .filter((a) => sentKey(a) === 'NEGATIVE' || (typeof a._aiScore === 'number' && a._aiScore >= 60))
    .sort((a, b) => (b._aiScore || 0) - (a._aiScore || 0))
    .slice(0, 5)
    .map((a) => {
      const kind = normalizeContentKind(a._mentionKind, a.channel);
      const top = Array.isArray(a._scMeta?.topComments) ? a._scMeta.topComments[0] : null;
      return {
        alertId: a.alertId,
        text: String(a.originalComplaint || '').replace(/\s+/g, ' ').trim().slice(0, 220),
        channel: channelLabel(a),
        score: typeof a._aiScore === 'number' ? a._aiScore : null,
        theme: a._scMeta?.clusterTitle || primaryTheme(a.originalComplaint || '', 'es')?.label || 'General',
        kind,
        kindLabel: contentKindLabel(kind),
        topComment: top?.excerpt ? String(top.excerpt).slice(0, 160) : '',
        encaje:
          typeof a._scMeta?.finalScore === 'number'
            ? Math.round(a._scMeta.finalScore)
            : typeof a._scMeta?.rerankScore === 'number'
              ? Math.round(a._scMeta.rerankScore)
              : null,
      };
    })
    .filter((q) => q.text.length > 0);

  /** Mix por tipo de pieza SocialCrawl */
  /** @type {Record<string, { count: number, neg: number, points: number, comments: number, replyable: number }>} */
  const kindMap = {};
  let replyableN = 0;
  let monitorN = 0;
  let withSc = 0;
  let points = 0;
  let comments = 0;
  let encajeSum = 0;
  let encajeN = 0;
  let mockPosted = 0;
  /** @type {Set<string>} */
  const clusterIds = new Set();
  /** @type {Record<string, number>} */
  const statusMap = { NEW: 0, SNOOZED: 0, CONTACTED: 0, WON: 0, DISMISSED: 0 };

  for (const a of inWindow) {
    const kind = normalizeContentKind(a._mentionKind, a.channel);
    if (!kindMap[kind]) {
      kindMap[kind] = { count: 0, neg: 0, points: 0, comments: 0, replyable: 0 };
    }
    kindMap[kind].count += 1;
    if (sentKey(a) === 'NEGATIVE') kindMap[kind].neg += 1;
    const eng = a._scMeta?.engagement;
    if (typeof eng?.points === 'number') {
      kindMap[kind].points += eng.points;
      points += eng.points;
    }
    if (typeof eng?.numComments === 'number') {
      kindMap[kind].comments += eng.numComments;
      comments += eng.numComments;
    }
    const canReply = isReplyableContent(kind, a._scMeta);
    if (canReply) {
      kindMap[kind].replyable += 1;
      replyableN += 1;
    } else monitorN += 1;
    if (a._scMeta?.provider === 'socialcrawl') withSc += 1;
    const enc =
      typeof a._scMeta?.finalScore === 'number'
        ? a._scMeta.finalScore
        : typeof a._scMeta?.rerankScore === 'number'
          ? a._scMeta.rerankScore
          : null;
    if (enc != null) {
      encajeSum += enc;
      encajeN += 1;
    }
    if (a._mockPost) mockPosted += 1;
    if (a._scMeta?.clusterId) clusterIds.add(String(a._scMeta.clusterId));
    const st = String(a.status || 'NEW').toUpperCase();
    if (st in statusMap) statusMap[st] += 1;
    else statusMap.NEW += 1;
  }

  const kinds = Object.entries(kindMap)
    .map(([kind, v]) => ({
      kind,
      label: contentKindLabel(kind),
      count: v.count,
      negPct: v.count ? Math.round((v.neg / v.count) * 100) : 0,
      points: v.points,
      comments: v.comments,
      replyable: v.replyable,
      monitor: v.count - v.replyable,
    }))
    .sort((a, b) => b.count - a.count);

  const workflow = [
    { id: 'NEW', label: 'Pendientes', count: statusMap.NEW },
    { id: 'SNOOZED', label: 'Pospuestas', count: statusMap.SNOOZED },
    { id: 'CONTACTED', label: 'Respondidas', count: statusMap.CONTACTED },
    { id: 'WON', label: 'Resueltas', count: statusMap.WON },
    { id: 'DISMISSED', label: 'Descartadas', count: statusMap.DISMISSED },
  ];

  const listening = {
    withSc,
    points,
    comments,
    clusters: clusterIds.size,
    avgEncaje: encajeN ? Math.round(encajeSum / encajeN) : 0,
    replyable: replyableN,
    monitor: monitorN,
    mockPosted,
    scPct: inWindow.length ? Math.round((withSc / inWindow.length) * 100) : 0,
  };

  if (inWindow.length) {
    const topKind = kinds[0];
    if (topKind && topKind.count / inWindow.length >= 0.35) {
      findings.push(
        `La conversación se concentra en ${topKind.label.toLowerCase()}s (${topKind.count} de ${inWindow.length}).`,
      );
    }
    if (monitorN > replyableN && inWindow.length >= 4) {
      findings.push(
        `${monitorN} piezas son de seguimiento (noticias, pins, LinkedIn, mercados) frente a ${replyableN} con hilo para responder.`,
      );
    }
    if (listening.avgEncaje) {
      findings.push(`Encaje medio SocialCrawl ${listening.avgEncaje}/100 · alcance ${points.toLocaleString('es')} pts · ${comments.toLocaleString('es')} comentarios en origen.`);
    }
    if (clusterIds.size) {
      findings.push(`${clusterIds.size} clusters de historia en la ventana (misma narrativa agrupada).`);
    }
    if (mockPosted) {
      findings.push(`${mockPosted} respuestas simuladas en plataforma de origen (demo).`);
    }
  }

  let headline = 'Sin señal suficiente para un veredicto.';
  if (inWindow.length) {
    if (health.healthBand === 'critical') headline = 'Reputación bajo presión: hay que intervenir.';
    else if (health.healthBand === 'watch') headline = 'Marca en observación: el patrón ya no es ruido.';
    else if (health.healthBand === 'strong') headline = 'Señal saludable: sostené el ritmo de respuesta.';
    else headline = 'Escenario estable: vigilá temas, tipos de pieza y cobertura.';
  }

  return {
    days,
    health,
    predictive,
    themes,
    prescriptive,
    sentimentSeries,
    channels,
    kinds,
    workflow,
    listening,
    findings,
    quotes,
    coveragePct,
    replies,
    closed,
    headline,
    sampleN: inWindow.length,
  };
}
