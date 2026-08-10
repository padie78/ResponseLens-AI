/**
 * Scoring de vida digital por competidor (0–100).
 * Más alto = peor situación pública del rival = más ventana de captación.
 * Solo evidencia de alertas/menciones/noticias locales — no inventa volumen.
 */

import { scoreFrustration, lookupCompetitorProfile } from './competitor-opportunity.js';
import { computeRivalPerception } from './rival-intel.js';
import { buildChurnSignalTracking, SWITCH_INTENT_RE } from './competitive-intel-pack.js';
import { t } from './i18n.js';

const NEWS_RE = /news|prensa|press|google_news|newsapi/i;
const ADVERSE_NEWS_RE =
  /\b(outage|ca[ií]da|layoff|despido|breach|filtraci|multa|fine|demanda|lawsuit|crisis|price\s+hike|aumento\s+de\s+tarifa|down)\b/i;

/**
 * @param {{
 *   competitorName: string,
 *   alerts?: object[],
 *   mentions?: object[],
 *   days?: number,
 *   brandScope?: 'rival'|'own',
 * }} opts
 */
export function scoreCompetitorDigitalLife(opts) {
  const name = String(opts.competitorName || '').trim() || 'Rival';
  const days = Math.max(1, Number(opts.days) || 14);
  const brandScope = opts.brandScope === 'own' ? 'own' : 'rival';
  const alerts = (opts.alerts || []).filter((a) => {
    if (String(a.competitorName || '').trim() !== name) return false;
    if (brandScope === 'own') return a._brandScope === 'own';
    return a._brandScope !== 'own';
  });
  const mentions = opts.mentions || [];

  const perception = computeRivalPerception({
    competitorName: name,
    alerts,
    mentions,
    days,
    brandScope,
  });

  const feed = [
    ...mentions.map((m) => normalizeItem(m)),
    ...alerts.map((a) => normalizeItem(a)),
  ].filter((x) => x.text);

  const comments = feed.filter((f) => !NEWS_RE.test(f.channel));
  const press = feed.filter((f) => NEWS_RE.test(f.channel));
  const churn = buildChurnSignalTracking({
    lang: 'es',
    rival: name,
    feed,
    comments: comments.length ? comments : feed,
    press,
  });

  const adverseNews = press.filter((p) => ADVERSE_NEWS_RE.test(p.text)).length;
  const openOps = alerts.filter((a) => !a.status || a.status === 'NEW' || a.status === 'SNOOZED').length;
  const switchN = feed.filter((f) => SWITCH_INTENT_RE.test(f.text)).length;

  /** @type {{ id: string, label: string, points: number }[]} */
  const drivers = [];

  let score = 8; // base mínima si hay rival configurado sin señal

  // Percepción negativa agregada (0–100 → hasta 32 pts)
  const percPts = Math.round((perception.perceptionScore / 100) * 32);
  if (percPts > 0) {
    score += percPts;
    drivers.push({
      id: 'perception',
      label: `Percepción pública ${perception.perceptionScore}/100`,
      points: percPts,
    });
  }

  // Volumen de menciones negativas (hasta 14)
  const volPts = Math.min(14, perception.mentionCount * 2);
  if (volPts > 0) {
    score += volPts;
    drivers.push({
      id: 'volume',
      label: `${perception.mentionCount} mención(es) en ${days}d`,
      points: volPts,
    });
  }

  // Frustración media (hasta 14)
  const frPts = Math.round(Math.min(14, perception.avgFrustration * 16));
  if (frPts > 0) {
    score += frPts;
    drivers.push({
      id: 'frustration',
      label: `Frustración media ${perception.avgFrustration}`,
      points: frPts,
    });
  }

  // Intención de cambio (hasta 16)
  const swPts = Math.min(16, Math.round(perception.switchIntentPct * 0.14) + switchN * 2);
  if (swPts > 0) {
    score += swPts;
    drivers.push({
      id: 'churn',
      label: `Intención de cambio ${perception.switchIntentPct}% (${switchN})`,
      points: swPts,
    });
  }

  // Crisis / velocidad (hasta 18)
  let crisisPts = 0;
  if (churn.inCrisis) crisisPts = 18;
  else if (churn.velocity >= 3) crisisPts = 10;
  else if (churn.count24h >= 3) crisisPts = 6;
  if (crisisPts > 0) {
    score += crisisPts;
    drivers.push({
      id: 'velocity',
      label: churn.inCrisis
        ? `Crisis: ${churn.count24h} quejas en 24h (×${churn.velocity})`
        : `Velocidad 24h: ${churn.count24h} (×${churn.velocity})`,
      points: crisisPts,
    });
  }

  // Prensa adversa (hasta 10)
  const newsPts = Math.min(10, adverseNews * 4);
  if (newsPts > 0) {
    score += newsPts;
    drivers.push({
      id: 'press',
      label: `${adverseNews} noticia(s) adversa(s)`,
      points: newsPts,
    });
  }

  // Pipeline abierto = señal ya capturada (hasta 6)
  const pipePts = Math.min(6, openOps * 2);
  if (pipePts > 0) {
    score += pipePts;
    drivers.push({
      id: 'pipeline',
      label:
        brandScope === 'own'
          ? `${openOps} mención(es) abiertas`
          : `${openOps} oportunidad(es) abiertas`,
      points: pipePts,
    });
  }

  if (!perception.mentionCount && !alerts.length && !mentions.length) {
    score = 0;
    drivers.length = 0;
    drivers.push({
      id: 'empty',
      label:
        brandScope === 'own'
          ? 'Sin señal digital aún — escaneá tu marca o abrí tus canales'
          : 'Sin señal digital aún — escaneá o abrí su página',
      points: 0,
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandFromScore(score, churn.inCrisis, perception.mentionCount, brandScope);
  drivers.sort((a, b) => b.points - a.points);

  return {
    competitorName: name,
    score,
    band: band.id,
    bandLabel: band.label,
    bandHint: band.hint,
    inCrisis: Boolean(churn.inCrisis),
    drivers: drivers.slice(0, 5),
    metrics: {
      perceptionScore: perception.perceptionScore,
      mentionCount: perception.mentionCount,
      avgFrustration: perception.avgFrustration,
      switchIntentPct: perception.switchIntentPct,
      count24h: churn.count24h,
      velocity: churn.velocity,
      adverseNews,
      openOps,
    },
    days,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {{
 *   competitors?: Array<{ name?: string }>,
 *   alerts?: object[],
 *   pageRivals?: Array<{ name?: string, mentions?: object[] }>,
 *   days?: number,
 * }} opts
 */
export function scoreAllCompetitorsDigitalLife(opts) {
  const days = Math.max(1, Number(opts.days) || 14);
  const alerts = opts.alerts || [];
  const pageRivals = opts.pageRivals || [];
  const names = new Set();

  for (const c of opts.competitors || []) {
    if (c?.name) names.add(String(c.name).trim());
  }
  for (const a of alerts) {
    if (a?._brandScope === 'own') continue;
    if (a?.competitorName) names.add(String(a.competitorName).trim());
  }
  for (const r of pageRivals) {
    if (r?.name) names.add(String(r.name).trim());
  }

  const list = [...names]
    .filter(Boolean)
    .map((name) => {
      const page = pageRivals.find((r) => r.name === name);
      return scoreCompetitorDigitalLife({
        competitorName: name,
        alerts,
        mentions: page?.mentions || [],
        days,
      });
    })
    .sort((a, b) => b.score - a.score || a.competitorName.localeCompare(b.competitorName));

  return {
    generatedAt: new Date().toISOString(),
    days,
    rivals: list,
  };
}

function normalizeItem(raw) {
  const text = String(raw.text || raw.originalComplaint || raw.title || '').trim();
  const channel = String(raw.channel || raw._source || 'web').toLowerCase();
  const atRaw = raw.detectedAt || raw.at || raw.createdAt || raw.publishedAt;
  const at = atRaw ? Date.parse(atRaw) : Date.now();
  return {
    text,
    channel,
    sourceUrl: raw.sourceUrl || raw.url || '',
    at: Number.isFinite(at) ? at : Date.now(),
    kind: NEWS_RE.test(channel) ? 'press' : 'comment',
    frustration: scoreFrustration(text),
    hasSwitchIntent: SWITCH_INTENT_RE.test(text),
  };
}

function bandFromScore(score, inCrisis, mentionCount, brandScope = 'rival') {
  const own = brandScope === 'own';
  if (inCrisis || score >= 80) {
    return {
      id: 'crisis',
      label: t('rank.band.crisis'),
      hint: own
        ? 'Reputación bajo fuego: priorizá triage y respuesta pública.'
        : 'Vida digital bajo fuego: priorizá captación y ads.',
    };
  }
  if (score >= 55) {
    return {
      id: 'pressure',
      label: t('rank.band.pressure'),
      hint: own
        ? 'Fricción clara: respondé clusters negativos y monitoreá prensa.'
        : 'Quejas y churn claros: buena ventana comercial.',
    };
  }
  if (score >= 30) {
    return {
      id: 'noise',
      label: t('rank.band.noise'),
      hint: own
        ? 'Señal mixta: filtrá por sentimiento y cuidá los temas recurrentes.'
        : 'Señal negativa moderada: monitoreá y filtrá intención de cambio.',
    };
  }
  if (mentionCount > 0 || score > 0) {
    return {
      id: 'stable',
      label: t('rank.band.weak'),
      hint: own
        ? 'Percepción estable en el feed actual — reforzá lo positivo.'
        : 'Poca fricción pública visible en el feed actual.',
    };
  }
  return {
    id: 'unknown',
    label: t('rank.band.unknown'),
    hint: 'Escaneá fuentes o abrí su página para puntuar.',
  };
}

/** HTML del tablero (sidepanel). */
export function formatRivalScoresHtml(board, { escapeHtml, competitors = [] }) {
  const rivals = board?.rivals || [];
  if (!rivals.length) {
    return `<p class="rl-empty rl-empty--sm">${escapeHtml(t('rank.empty'))}</p>`;
  }
  return `
    <ol class="rl-rival-scores__list">
      ${rivals
        .map((r, idx) => {
          const profile = lookupCompetitorProfile(r.competitorName, competitors) || {};
          const logo = profile.logoUrl || '';
          const industry = profile.industry || '';
          const top = r.drivers?.[0]?.label || r.bandHint || '';
          const place = idx + 1;
          return `<li class="rl-rival-score" data-rival-score="${escapeHtml(r.competitorName)}">
            <button type="button" class="rl-rival-score__btn" data-open-rival-score="${escapeHtml(r.competitorName)}">
              <span class="rl-rival-score__place" aria-hidden="true">${place}</span>
              <img
                class="rl-rival-score__logo"
                src="${escapeHtml(logo)}"
                alt=""
                width="40"
                height="40"
                decoding="async"
                data-rival-logo="${escapeHtml(r.competitorName)}"
              />
              <span class="rl-rival-score__meta">
                <strong>${escapeHtml(r.competitorName)}</strong>
                ${industry ? `<span class="rl-rival-score__industry">${escapeHtml(industry)}</span>` : ''}
                <span class="rl-muted">${escapeHtml(top)}</span>
              </span>
              <span class="rl-rival-score__mark">
                <span class="rl-badge rl-badge--band-${escapeHtml(r.band)}">${escapeHtml(r.bandLabel)}</span>
                <span class="rl-rival-score__score rl-rival-score__score--${escapeHtml(r.band)}">${escapeHtml(String(r.score))}</span>
              </span>
            </button>
          </li>`;
        })
        .join('')}
    </ol>`;
}
