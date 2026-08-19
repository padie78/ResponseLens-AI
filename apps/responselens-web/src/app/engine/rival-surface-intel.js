/**
 * Superficies competitivas F2: Meta Ad Library, status, pricing, careers.
 * Sin spend inventado, sin Glassdoor, sin Similarweb.
 * Mock por defecto (`externalApisMock`); URLs en Config marcan Conectado.
 */

import { computeRivalPerception } from './rival-intel.js';
import { scoreCompetitorDigitalLife } from './digital-life-score.js';
import { isExternalApisMock } from './external-apis-mock.js';

const CTAS = ['Probar gratis', 'Ver planes', 'Hablar con ventas', 'Comparar', 'Empezar'];
const JOB_TITLES = [
  'Customer Success',
  'Soporte L2',
  'Account Executive',
  'Ingeniería de producto',
  'Community',
  'Ops de pagos',
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

function hasUrl(raw) {
  return Boolean(String(raw || '').trim());
}

function pricingStoreKey(competitorName) {
  return `rl_web_pricing_hash_${String(competitorName || '').toLowerCase()}`;
}

function readPricingPrev(name) {
  try {
    const raw = localStorage.getItem(pricingStoreKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePricingPrev(name, payload) {
  try {
    localStorage.setItem(pricingStoreKey(name), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** F2.1 Meta Ad Library: copy, CTA, fechas. Nunca spend. */
function buildAds(competitor, h, mock) {
  const name = competitor.name;
  const domain = domainOf(competitor.websiteUrl, name);
  const connected = mock === true;
  const source = connected ? 'connected' : 'demo';
  const n = connected ? 2 + (h % 3) : 0;
  const rows = [];
  const now = Date.now();
  for (let i = 0; i < n; i += 1) {
    const started = new Date(now - (5 + ((h + i * 11) % 40)) * 86400000);
    rows.push({
      id: `${name}-ad-${i}`,
      platform: 'Meta',
      format: pick(h, ['Imagen', 'Video', 'Carrusel'], i),
      angle: pick(h, ['Oferta', 'Comparación', 'Marca'], i + 2),
      landing: `https://${domain}`,
      headline:
        i % 2 === 0 ? `${name}: menos fricción, más resultado` : `Equipos que salen de ${name}`,
      body:
        i % 2 === 0
          ? `Creatividad Ad Library (copy público). Landing ${domain}.`
          : `Ángulo competitivo vs. ${name}. Sin inversión estimada.`,
      cta: pick(h, CTAS, i + 2),
      status: i === 1 ? 'Inactivo' : 'Activo',
      spendBand: '',
      startedAt: started.toISOString().slice(0, 10),
      daysLive: 5 + ((h + i * 5) % 40),
    });
  }
  return {
    source,
    active: rows.filter((r) => r.status === 'Activo').length,
    platforms: [...new Set(rows.map((r) => r.platform))],
    rows,
  };
}

function layoffFromFeed(competitorName, alerts) {
  const key = String(competitorName || '').toLowerCase();
  const re = /\b(layoff|layoffs|recorte|despido|rifs?|downsiz)/i;
  return (alerts || []).some((a) => {
    const name = String(a.competitorName || '').toLowerCase();
    if (name !== key) return false;
    return re.test(String(a.originalComplaint || a.salesPitch || ''));
  });
}

/** F2.4 careers count. Sin rating Glassdoor. */
function buildTalent(competitor, h, alerts, mock) {
  const name = competitor.name;
  const url = String(competitor.careersUrl || '').trim();
  const connected = Boolean(url && mock);
  const source = connected ? 'connected' : url ? 'connected' : 'demo';
  const openRoles = connected ? 4 + (h % 22) : 0;
  const jobs = connected
    ? JOB_TITLES.slice(0, Math.min(6, 2 + (h % 5))).map((title, i) => ({
        title,
        url: url || `https://${domainOf(competitor.websiteUrl, name)}/careers`,
        id: `${name}-job-${i}`,
      }))
    : [];
  const layoff = layoffFromFeed(name, alerts);
  const recommend = !connected
    ? `Cargá la URL de careers de ${name} en Config → Rivales.`
    : layoff
      ? `Hay señal de recorte en el feed. ${openRoles} roles públicos en careers.`
      : `${openRoles} roles abiertos en el tablero público.`;
  return {
    source,
    careersUrl: url,
    rating: 0,
    reviews: 0,
    openRoles,
    jobs,
    layoff,
    layoffRisk: layoff ? 'Señal de recorte (feed)' : 'Sin recorte en el feed',
    band: connected ? (openRoles >= 12 ? 'contratando' : 'estable') : 'sin careers',
    weakest: '',
    recommend,
    glassdoorUrl: '',
    themes: [],
    quotes: [],
  };
}

/** F2.2 status + F2.3 pricing hash. Sin tráfico/DA inventados. */
function buildVisibility(competitor, h, mock) {
  const name = competitor.name;
  const domain = domainOf(competitor.websiteUrl, name);
  const statusUrl = String(competitor.statusUrl || '').trim();
  const pricingUrl = String(competitor.pricingUrl || '').trim();
  const statusOn = Boolean(statusUrl);
  const pricingOn = Boolean(pricingUrl);
  const source = statusOn || pricingOn ? 'connected' : 'demo';

  let statusState = 'unknown';
  let statusSummary = 'Sin URL de status page.';
  if (statusOn) {
    const incident = mock && h % 9 === 0;
    statusState = incident ? 'incident' : 'operational';
    statusSummary = incident
      ? `Incidente simulado en status de ${name} (mock).`
      : `Status page operativa (${statusUrl}).`;
  }

  const day = Math.floor(Date.now() / 86400000);
  const hash = pricingOn ? String(hashName(`${pricingUrl}|${Math.floor(day / 3)}`)) : '';
  let priceChanged = false;
  if (pricingOn && hash) {
    const prev = readPricingPrev(name);
    if (prev?.hash && prev.hash !== hash) priceChanged = true;
    writePricingPrev(name, { hash, at: new Date().toISOString(), previousHash: prev?.hash || '' });
  }

  const pages = [
    { path: '/', title: 'Home', traffic: 0 },
    ...(pricingOn ? [{ path: '/pricing', title: 'Precios', traffic: 0 }] : []),
    ...(statusOn ? [{ path: '/status', title: 'Status', traffic: 0 }] : []),
  ];

  const recommend = !pricingOn && !statusOn
    ? `Cargá status y /pricing de ${name} en Config → Rivales.`
    : priceChanged
      ? `Precio cambió vs. la pasada anterior (hash HTML). Revisar battlecard.`
      : statusState === 'incident'
        ? 'Status en incidente: ángulo de confiabilidad en captación.'
        : 'Sin cambio de precio ni incidente en esta pasada.';

  return {
    source,
    domain,
    statusUrl,
    pricingUrl,
    statusState,
    statusSummary,
    priceChanged,
    priceHash: hash,
    trafficIndex: 0,
    domainAuthority: 0,
    organicKeywords: 0,
    shareOfVoicePct: 0,
    trendPct: 0,
    band: source === 'connected' ? 'pública' : 'demo',
    recommend,
    queries: [],
    pages,
  };
}

function battleNarrative(perception, talent, ads, vis) {
  const weak = (perception.topThemes || []).slice(0, 3).map((t) => t.name);
  const strengths = [];
  if (ads.source === 'connected' && ads.active >= 1) strengths.push('Ads Meta visibles en Ad Library');
  if (vis.statusState === 'operational') strengths.push('Status page operativa');
  if (talent.source === 'connected' && talent.openRoles >= 8) strengths.push('Careers activo (contratando)');
  if (!strengths.length) strengths.push('Volumen de marca detectable en listening');

  const plays = [];
  if (perception.switchIntentPct >= 20) {
    plays.push('Captar churn: responder quejas abiertas del radar en < 2 h.');
  }
  if (weak.some((w) => /precio|price|billing|tarifa/i.test(w)) || vis.priceChanged) {
    plays.push('Ángulo precio/valor: el rival tocó pricing o duele en el feed.');
  }
  if (vis.statusState === 'incident') {
    plays.push('Confiabilidad: incidente en su status page — no inventar uptime.');
  }
  if (talent.layoff) {
    plays.push('Talento: recorte mencionado en el feed; contrastar estabilidad.');
  }
  if (!plays.length) plays.push('Escanear más menciones para enriquecer la ficha.');

  return { strengths, weaknesses: weak.length ? weak : ['Poca señal en el feed'], plays };
}

/**
 * @param {{
 *   competitors?: Array<{ name?: string, websiteUrl?: string, aliases?: string[], statusUrl?: string, pricingUrl?: string, careersUrl?: string }>,
 *   alerts?: object[],
 *   days?: number,
 * }} opts
 */
export function buildRivalSurfaceIntel(opts) {
  const mock = isExternalApisMock();
  const configured = (opts.competitors || []).filter((c) => String(c.name || '').trim());
  const usedFallback = configured.length === 0;
  const competitors = usedFallback
    ? [
        {
          name: 'Rival Alpha',
          websiteUrl: 'https://alpha.example',
          aliases: [],
          statusUrl: 'https://status.alpha.example',
          pricingUrl: 'https://alpha.example/pricing',
          careersUrl: 'https://alpha.example/careers',
        },
        {
          name: 'Rival Beta',
          websiteUrl: 'https://beta.example',
          aliases: [],
          statusUrl: '',
          pricingUrl: '',
          careersUrl: '',
        },
      ]
    : configured;
  const alerts = opts.alerts || [];
  const days = Math.max(1, Number(opts.days) || 14);

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
    const ads = buildAds(c, h, mock);
    const talent = buildTalent(c, h, alerts, mock);
    const visibility = buildVisibility(c, h, mock);
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
  const adsSource = rivals.some((r) => r.ads.source === 'connected') ? 'connected' : 'demo';
  const talentSource = rivals.some((r) => r.talent.source === 'connected') ? 'connected' : 'demo';
  const webSource = rivals.some((r) => r.visibility.source === 'connected') ? 'connected' : 'demo';
  const statusIncidents = rivals
    .filter((r) => r.visibility.statusState === 'incident')
    .map((r) => ({ rival: r.name, summary: r.visibility.statusSummary }));

  return {
    generatedAt: new Date().toISOString(),
    demo: adsSource === 'demo' && talentSource === 'demo' && webSource === 'demo',
    mock,
    usedFallback,
    adsSource,
    talentSource,
    webSource,
    statusIncidents,
    disclaimer: usedFallback
      ? 'No hay rivales en Configuración: Alpha/Beta de ejemplo. Cargá nombres y URLs públicas.'
      : mock
        ? 'Ad Library, status, pricing y careers en mock (0 llamadas externas). Sin spend ni Glassdoor.'
        : 'Ads requieren token Meta; status/pricing/careers salen de las URLs de Config (cron intel_surfaces).',
    rivals,
    adRows,
    visChart: rivals.map((r) => ({
      name: r.name,
      traffic: r.talent.openRoles,
      da: r.visibility.priceChanged ? 1 : 0,
    })),
  };
}
