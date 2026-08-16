/**
 * Superficies competitivas (ads / talento / web) — demo determinista.
 * No llama Meta Ads, Glassdoor ni Similarweb. El radar de menciones sí usa el feed real.
 */

import { computeRivalPerception } from './rival-intel.js';
import { scoreCompetitorDigitalLife } from './digital-life-score.js';

const PLATFORMS = ['Meta', 'Google Ads', 'YouTube', 'LinkedIn'];
const CTAS = ['Probar gratis', 'Ver planes', 'Hablar con ventas', 'Comparar', 'Empezar'];
const TALENT_THEMES = [
  { id: 'pay', label: 'Compensación' },
  { id: 'culture', label: 'Cultura' },
  { id: 'growth', label: 'Crecimiento' },
  { id: 'mgmt', label: 'Liderazgo' },
  { id: 'balance', label: 'Balance' },
];

function hashName(name) {
  let h = 2166136261;
  const s = String(name || '').toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(h, arr, offset = 0) {
  return arr[(h + offset) % arr.length];
}

function domainOf(websiteUrl, name) {
  try {
    if (websiteUrl) return new URL(websiteUrl).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  return `${String(name || 'rival')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18) || 'rival'}.com`;
}

function buildAds(competitor, h) {
  const name = competitor.name;
  const n = 3 + (h % 3);
  /** @type {object[]} */
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const platform = pick(h, PLATFORMS, i);
    rows.push({
      id: `${name}-ad-${i}`,
      platform,
      headline: i % 2 === 0 ? `${name}: menos fricción, más resultado` : `Por qué equipos dejan ${name}`,
      body:
        i % 2 === 0
          ? `Creatividad demo. CTA hacia ${domainOf(competitor.websiteUrl, name)}.`
          : `Ángulo de comparación (demo). No es un anuncio real de la plataforma.`,
      cta: pick(h, CTAS, i + 2),
      status: i === 0 ? 'Activo' : i === 1 ? 'En pausa' : 'Activo',
      spendBand: ['Bajo', 'Medio', 'Alto'][(h + i) % 3],
      daysLive: 7 + ((h + i * 5) % 40),
    });
  }
  return {
    active: rows.filter((r) => r.status === 'Activo').length,
    platforms: [...new Set(rows.map((r) => r.platform))],
    rows,
  };
}

function buildTalent(competitor, h) {
  const name = competitor.name;
  const rating = Number((2.6 + ((h % 18) / 10)).toFixed(1));
  const reviews = 40 + (h % 420);
  const openRoles = 4 + (h % 28);
  const layoff = (h % 7) === 0;
  const themes = TALENT_THEMES.map((t, i) => ({
    ...t,
    score: Math.min(100, 35 + ((h + i * 17) % 55)),
  })).sort((a, b) => a.score - b.score);
  return {
    rating,
    reviews,
    openRoles,
    layoffRisk: layoff ? 'Señal de recorte (demo)' : 'Estable (demo)',
    glassdoorUrl: `https://www.glassdoor.com/Search/results.htm?keyword=${encodeURIComponent(name)}`,
    themes,
    quotes: [
      {
        text: `En ${name} el onboarding es lento y el stack está desactualizado. (cita demo)`,
        theme: themes[0]?.label || 'Cultura',
      },
      {
        text: `Pagan bien pero hay rotación en producto. (cita demo)`,
        theme: 'Compensación',
      },
    ],
  };
}

function buildVisibility(competitor, h, peerCount) {
  const domain = domainOf(competitor.websiteUrl, competitor.name);
  const trafficIndex = 18 + (h % 82);
  const da = 22 + (h % 58);
  const keywords = 120 + (h % 4800);
  const share = peerCount > 0 ? Math.round((trafficIndex / (peerCount * 50 + trafficIndex)) * 100) : trafficIndex;
  return {
    domain,
    trafficIndex,
    domainAuthority: da,
    organicKeywords: keywords,
    shareOfVoicePct: Math.min(48, share),
    trendPct: -12 + (h % 28),
    pages: [
      { path: '/', title: 'Home', traffic: Math.round(trafficIndex * 0.4) },
      { path: '/pricing', title: 'Precios', traffic: Math.round(trafficIndex * 0.22) },
      { path: '/blog', title: 'Blog', traffic: Math.round(trafficIndex * 0.18) },
    ],
  };
}

function battleNarrative(perception, talent, ads, vis) {
  const weak = (perception.topThemes || []).slice(0, 3).map((t) => t.name);
  const strengths = [];
  if (vis.domainAuthority >= 50) strengths.push('Autoridad de dominio relativa alta (demo web)');
  if (ads.active >= 3) strengths.push('Presencia publicitaria activa (demo ads)');
  if (talent.rating >= 3.8) strengths.push('Employer brand por encima del piso demo');
  if (!strengths.length) strengths.push('Volumen de marca detectable en listening');

  const plays = [];
  if (perception.switchIntentPct >= 20) {
    plays.push('Captar churn: responder quejas abiertas del radar en < 2 h.');
  }
  if (weak.some((w) => /precio|price|billing|tarifa/i.test(w))) {
    plays.push('Ángulo precio/valor en battlecard comercial.');
  }
  if (talent.rating < 3.4) {
    plays.push('Talento: contrastar cultura y estabilidad vs. este rival.');
  }
  if (vis.trendPct < 0) {
    plays.push('SEO: atacar keywords donde el tráfico demo del rival cae.');
  }
  if (!plays.length) plays.push('Escanear más menciones para enriquecer la ficha.');

  return { strengths, weaknesses: weak.length ? weak : ['Poca señal en el feed'], plays };
}

/**
 * @param {{
 *   competitors?: Array<{ name?: string, websiteUrl?: string, aliases?: string[] }>,
 *   alerts?: object[],
 *   days?: number,
 * }} opts
 */
export function buildRivalSurfaceIntel(opts) {
  const competitors = (opts.competitors || []).filter((c) => String(c.name || '').trim());
  const alerts = opts.alerts || [];
  const days = Math.max(1, Number(opts.days) || 14);
  const peerCount = Math.max(1, competitors.length);

  const rivals = competitors.map((c) => {
    const name = String(c.name).trim();
    const h = hashName(name);
    const perception = computeRivalPerception({
      competitorName: name,
      alerts,
      mentions: [],
      days,
      brandScope: 'rival',
    });
    const digital = scoreCompetitorDigitalLife({
      competitorName: name,
      alerts,
      mentions: [],
      days,
      brandScope: 'rival',
    });
    const ads = buildAds(c, h);
    const talent = buildTalent(c, h);
    const visibility = buildVisibility(c, h, peerCount);
    const battle = battleNarrative(perception, talent, ads, visibility);
    return {
      name,
      websiteUrl: c.websiteUrl || '',
      aliases: c.aliases || [],
      ads,
      talent,
      visibility,
      perception,
      digitalScore: digital.score,
      digitalBand: digital.bandLabel || '',
      battle,
    };
  });

  const adRows = rivals.flatMap((r) => r.ads.rows.map((row) => ({ ...row, rival: r.name })));

  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    disclaimer:
      'Ads, talento y web son ilustrativos (hash del nombre del rival). Las menciones y el score de percepción sí salen del feed.',
    rivals,
    adRows,
    visChart: rivals.map((r) => ({
      name: r.name,
      traffic: r.visibility.trafficIndex,
      da: r.visibility.domainAuthority,
    })),
  };
}
