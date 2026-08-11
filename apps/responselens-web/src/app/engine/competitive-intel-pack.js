/**
 * Motor de Inteligencia Competitiva — reportes estratégicos + pipeline de rescate.
 * Solo evidencia del feed (noticias, comentarios, eventos). No inventa datos ni tasas de cierre.
 *
 * Reportes: Product Gap × roadmap · Matriz Precio/Valor · Churn Signal / Crisis
 * Captación: filtro intención → score lead → propuesta IA → CRM (urgente 2h)
 */

import { detectReplyLanguage } from './local-fallback.js';
import {
  lookupCompetitorProfile,
  scoreFrustration,
  craftSalesPitchVariants,
} from './competitor-opportunity.js';
import { detectThemes, primaryTheme, THEME_RULES } from './theme-rules.js';

/** Intención explícita de cambio / búsqueda de alternativa. */
export const SWITCH_INTENT_RE =
  /\b(me\s+cambio|me\s+voy|switching|switch(?:ing)?\s+to|looking\s+for\s+(an?\s+)?alternative|busco\s+alternativa|conoce(?:s|n)?\s+una\s+alternativa|alguien\s+conoce|alternativa|alternative|cancel(?:o|ar|ling)?|leaving|me\s+largo|no\s+renuevo|won'?t\s+renew|cambiarme\s+a|migrar|migration|harto\s+de|fed\s+up|sick\s+of)\b/i;

const PRICE_BREAK_RE =
  /\b(caro|car[ií]simo|expensive|overpriced|subieron|aumentaron|price\s+hike|price\s+increase|aumento\s+de\s+tarifa|tarifa|no\s+vale|not\s+worth|cobr[ao]|cobraron|billing\s+shock|sorpresa\s+en\s+la\s+factura|hidden\s+fee|cargo\s+oculto|reembolso|refund|chargeback|de\s+m[aá]s)\b/i;

const TARIFF_HIKE_NEWS_RE =
  /\b(price\s+hike|raises?\s+prices?|price\s+increase|aument(?:a|o|aron)\s+(?:de\s+)?(?:precio|tarifa)|sube(?:n)?\s+(?:el\s+)?precio|nueva\s+tarifa|billing\s+change|planes?\s+m[aá]s\s+caros)\b/i;

const NEWS_CHANNELS = new Set([
  'news',
  'newsapi',
  'google_news',
  'prensa',
  'press',
  'event',
  'events',
]);

const RIVAL_OWNED_CHANNELS = new Set([
  'facebook',
  'instagram',
  'tiktok',
  'page',
  'amazon',
  'ebay',
  'website',
  'rival_site',
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTACT_SLA_MS = 2 * 60 * 60 * 1000;

/**
 * @param {{
 *   competitorName: string,
 *   mentions?: Array<object>,
 *   companyName?: string,
 *   whatTheySell?: string,
 *   keyLinks?: string[],
 *   productRoadmap?: string[] | string,
 *   competitors?: object[],
 *   competitorProfile?: object | null,
 * }} input
 */
export function buildCompetitiveIntelPack(input) {
  const rival = String(input.competitorName || 'Rival').trim() || 'Rival';
  const companyName = String(input.companyName || '').trim();
  const whatTheySell = String(input.whatTheySell || '').trim();
  const keyLinks = Array.isArray(input.keyLinks) ? input.keyLinks : [];
  const productRoadmap = normalizeRoadmap(input.productRoadmap, whatTheySell);
  const profile =
    input.competitorProfile ||
    lookupCompetitorProfile(rival, input.competitors || []) ||
    null;

  const feed = normalizeFeed(input.mentions || [], rival);
  const corpus = feed.map((m) => m.text).join('\n');
  const lang = detectReplyLanguage(corpus || rival);

  const comments = feed.filter((m) => m.kind === 'comment');
  const press = feed.filter((m) => m.kind === 'press');

  const market = buildMarketIntelligence({
    lang,
    rival,
    companyName,
    whatTheySell,
    productRoadmap,
    profile,
    comments,
    press,
    feed,
  });

  const prospects = filterSwitchIntentProspects({
    lang,
    rival,
    companyName,
    whatTheySell,
    keyLinks,
    productRoadmap,
    feed: comments.length ? comments : feed,
    crisis: market.churnSignal,
  });

  const crmProspects = prospects.map((p) => toCrmProspect(p, rival));

  const reportMarkdown = formatIntelPackMarkdown({
    lang,
    rival,
    companyName,
    whatTheySell,
    market,
    prospects,
    crmProspects,
    feedCount: feed.length,
  });

  return {
    competitorName: rival,
    companyName: companyName || null,
    language: lang,
    generatedAt: new Date().toISOString(),
    model: 'local-competitive-intel-v2',
    feedCount: feed.length,
    market,
    prospects,
    crmProspects,
    crisis: Boolean(market.churnSignal?.inCrisis),
    reportMarkdown,
  };
}

/** @param {string[]|string|undefined} raw @param {string} whatTheySell */
export function normalizeRoadmap(raw, whatTheySell = '') {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 40);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/\n|,|;/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  // Fallback: trocea “qué vende” en frases cortas como mapa mínimo
  if (whatTheySell.trim()) {
    return whatTheySell
      .split(/[.;\n•\-]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .slice(0, 12);
  }
  return [];
}

function parseAt(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function normalizeFeed(mentions, rival) {
  const now = Date.now();
  return (mentions || [])
    .map((m, idx) => {
      const text = String(m.text || m.originalComplaint || m.title || '').trim();
      if (!text) return null;
      const channel = String(m.channel || m._source || 'web').toLowerCase().slice(0, 32) || 'web';
      const sourceUrl = String(m.sourceUrl || m.url || '').trim();
      const kind = classifyFeedKind(channel, text, m);
      const at =
        parseAt(m.detectedAt || m.at || m.createdAt || m.publishedAt) ||
        now - idx * 60 * 60 * 1000;
      return {
        text,
        channel,
        sourceUrl,
        kind,
        at,
        author: extractAuthor(m, sourceUrl, text),
        authorMeta: extractAuthorMeta(m, sourceUrl, text),
        severity: m.severity || null,
        competitorName: rival,
        frustration: scoreFrustration(text),
        themes: detectThemes(text, 'es'),
        hasSwitchIntent: SWITCH_INTENT_RE.test(text),
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

function classifyFeedKind(channel, text, raw) {
  if (NEWS_CHANNELS.has(channel) || raw?.kind === 'press' || raw?._kind === 'news') {
    return 'press';
  }
  if (
    /\b(announces?|lanza|adquiere|raises|funding|ipo|evento|conference|webinar|price\s+hike|aumento\s+de\s+tarifa)\b/i.test(
      text,
    ) &&
    text.length < 320
  ) {
    return 'press';
  }
  return 'comment';
}

function extractAuthor(raw, sourceUrl, text) {
  if (raw?.author || raw?.user || raw?.username) {
    return String(raw.author || raw.user || raw.username).trim().slice(0, 80);
  }
  const url = sourceUrl || '';
  const redditUser = url.match(/reddit\.com\/user\/([^/?#]+)/i) || url.match(/\/u\/([^/?#]+)/i);
  if (redditUser) return `u/${decodeURIComponent(redditUser[1])}`;
  const tw = url.match(/(?:twitter|x)\.com\/([^/?#]+)/i);
  if (tw && !['status', 'i', 'home'].includes(tw[1].toLowerCase())) {
    return `@${tw[1]}`;
  }
  const mention = text.match(/\b(?:u\/|@)([a-zA-Z0-9_]{2,30})\b/);
  if (mention) return mention[0];
  if (url) {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`.slice(0, 72);
    } catch {
      return url.slice(0, 72);
    }
  }
  return 'anónimo';
}

function extractAuthorMeta(raw, sourceUrl, text) {
  const followers =
    Number(raw?.followers ?? raw?.followerCount ?? raw?.subscribers) ||
    (() => {
      const m = String(text || '').match(/\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:k|mil)?\s*(?:followers|seguidores)\b/i);
      if (!m) return 0;
      let n = Number(String(m[1]).replace(/[.,]/g, ''));
      if (/k|mil/i.test(m[0])) n *= 1000;
      return Number.isFinite(n) ? n : 0;
    })();
  const bio = String(raw?.bio || raw?.description || '').slice(0, 240);
  const displayName = String(raw?.displayName || raw?.name || '').slice(0, 80);
  return { followers, bio, displayName, sourceUrl };
}

export function classifyChannelType(channel) {
  const c = String(channel || '').toLowerCase();
  if (RIVAL_OWNED_CHANNELS.has(c)) return 'Propiedad del Rival';
  return 'Público/Abierto';
}

function channelLabel(channel) {
  const map = {
    hackernews: 'Hacker News',
    reddit: 'Reddit',
    news: 'Noticias',
    newsapi: 'Noticias',
    google_news: 'Noticias',
    x: 'Twitter/X',
    twitter: 'Twitter/X',
    page: 'Página web',
    youtube: 'YouTube',
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    g2: 'G2',
    capterra: 'Capterra',
    glassdoor: 'Glassdoor',
    trustpilot: 'Trustpilot',
    producthunt: 'Product Hunt',
    amazon: 'Amazon',
    manual: 'Manual',
  };
  return map[String(channel || '').toLowerCase()] || channel || 'Web';
}

function buildMarketIntelligence(ctx) {
  const commentThemes = aggregateThemes(ctx.comments);
  const pressThemes = aggregateThemes(ctx.press);
  const foda = buildEvidenceSwot({
    lang: ctx.lang,
    rival: ctx.rival,
    profile: ctx.profile,
    comments: ctx.comments,
    press: ctx.press,
    commentThemes,
    pressThemes,
  });
  const productGaps = buildProductGaps({
    lang: ctx.lang,
    whatTheySell: ctx.whatTheySell,
    productRoadmap: ctx.productRoadmap,
    companyName: ctx.companyName,
    comments: ctx.comments,
    commentThemes,
  });
  const priceValue = buildPriceValueMatrix({
    lang: ctx.lang,
    comments: ctx.comments,
    press: ctx.press,
    feed: ctx.feed,
  });
  const churnSignal = buildChurnSignalTracking({
    lang: ctx.lang,
    rival: ctx.rival,
    feed: ctx.feed,
    comments: ctx.comments,
    press: ctx.press,
  });

  return {
    foda,
    productGaps,
    priceFriction: priceValue,
    priceValue,
    churnSignal,
  };
}

function aggregateThemes(items) {
  /** @type {Record<string, { id: string, label: string, count: number, samples: string[] }>} */
  const map = {};
  for (const item of items) {
    for (const t of item.themes || []) {
      if (t.id === 'general' && (item.themes || []).length > 1) continue;
      if (!map[t.id]) {
        map[t.id] = { id: t.id, label: t.label, count: 0, samples: [] };
      }
      map[t.id].count += 1;
      if (map[t.id].samples.length < 2) {
        map[t.id].samples.push(clip(item.text, 120));
      }
    }
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function buildEvidenceSwot({
  lang,
  rival,
  profile,
  comments,
  press,
  commentThemes,
  pressThemes,
}) {
  const es = lang !== 'en';
  const strengths = [];
  const weaknesses = [];
  const opportunities = [];
  const threats = [];

  for (const t of commentThemes.filter((x) => x.id !== 'churn').slice(0, 4)) {
    weaknesses.push({
      label: t.label,
      evidence: t.samples[0] || null,
      source: 'comentario',
    });
  }
  if (profile?.weaknessNotes) {
    weaknesses.push({
      label: es ? 'Nota de ficha (config)' : 'Profile note (config)',
      evidence: String(profile.weaknessNotes).slice(0, 160),
      source: 'config',
    });
  }
  if (!weaknesses.length) {
    weaknesses.push({
      label: es
        ? 'Sin debilidades evidentes en el feed analizado'
        : 'No weaknesses evidenced in the analyzed feed',
      evidence: null,
      source: 'none',
    });
  }

  const praise = comments.filter((c) =>
    /\b(me\s+gusta|love|excelente|great\s+when|antes\s+funcionaba|used\s+to\s+be\s+good|potente|powerful)\b/i.test(
      c.text,
    ),
  );
  for (const p of praise.slice(0, 2)) {
    strengths.push({
      label: es ? 'Señal positiva residual en comentario' : 'Residual positive signal in comment',
      evidence: clip(p.text, 120),
      source: 'comentario',
    });
  }
  if (!strengths.length) {
    strengths.push({
      label: es
        ? 'Sin fortalezas evidenciadas en el feed (solo señal negativa/prensa)'
        : 'No strengths evidenced in feed (negative/press signal only)',
      evidence: null,
      source: 'none',
    });
  }

  for (const t of commentThemes.slice(0, 3)) {
    opportunities.push({
      label:
        t.id === 'churn'
          ? es
            ? 'Usuarios del rival con intención de cambio'
            : 'Rival users showing switch intent'
          : es
            ? `Captar por dolor de ${t.label}`
            : `Capture on ${t.label} pain`,
      evidence: t.samples[0] || null,
      source: 'comentario',
    });
  }
  for (const p of press
    .filter((x) =>
      /\b(outage|ca[ií]da|layoff|despido|breach|filtraci|multa|fine|demanda|lawsuit|crisis|price\s+hike)\b/i.test(
        x.text,
      ),
    )
    .slice(0, 2)) {
    opportunities.push({
      label: es ? 'Ventana por noticia adversa del rival' : 'Window from adverse rival news',
      evidence: clip(p.text, 120),
      source: 'noticia',
    });
  }

  for (const p of press
    .filter((x) =>
      /\b(raises|funding|serie\s+[a-c]|adquiere|acquires|lanza|launch|expande|expansion|partnership|evento|conference)\b/i.test(
        x.text,
      ),
    )
    .slice(0, 3)) {
    threats.push({
      label: es ? 'Movimiento corporativo / evento del rival' : 'Rival corporate move / event',
      evidence: clip(p.text, 120),
      source: 'noticia',
    });
  }
  if (!threats.length) {
    threats.push({
      label: es
        ? press.length
          ? 'Prensa presente pero sin señales de expansión/funding claras'
          : 'Sin noticias/eventos del rival en este feed'
        : press.length
          ? 'Press present but no clear expansion/funding signals'
          : 'No rival news/events in this feed',
      evidence: press[0] ? clip(press[0].text, 120) : null,
      source: press.length ? 'noticia' : 'none',
    });
  }
  if (!opportunities.length) {
    opportunities.push({
      label: es
        ? `Sin oportunidades accionables vs ${rival} en este feed`
        : `No actionable opportunities vs ${rival} in this feed`,
      evidence: null,
      source: 'none',
    });
  }

  return { strengths, weaknesses, opportunities, threats };
}

/**
 * Cruza quejas del rival con el mapa de producto propio.
 * action: promote (ya lo tenemos) | build (falta en roadmap) | clarify (comunicar mejor)
 */
function buildProductGaps({
  lang,
  whatTheySell,
  productRoadmap,
  companyName,
  comments,
  commentThemes,
}) {
  const es = lang !== 'en';
  const brand = companyName || (es ? 'tu solución' : 'your solution');
  const roadmap = productRoadmap || [];
  const roadmapBlob = roadmap.join('\n').toLowerCase();
  const offerLower = String(whatTheySell || '').toLowerCase();
  const demandThemes = commentThemes.filter((t) =>
    ['reliability', 'support', 'pricing', 'product', 'trust'].includes(t.id),
  );

  if (!comments.length) {
    return [
      {
        featureDemand: es
          ? 'Sin comentarios de producto en el feed'
          : 'No product comments in feed',
        ourCoverage: null,
        roadmapHit: null,
        action: null,
        actionLabel: null,
        evidence: null,
      },
    ];
  }

  const mapping = [
    {
      id: 'reliability',
      demandEs: 'Mayor uptime / estabilidad',
      demandEn: 'Better uptime / stability',
      covers: /\b(establ|uptime|sla|fiabl|reliab|disponib)\b/i,
    },
    {
      id: 'support',
      demandEs: 'Soporte humano que responda',
      demandEn: 'Human support that replies',
      covers: /\b(soport|support|humano|24\/7|helpdesk|atenci[oó]n)\b/i,
    },
    {
      id: 'pricing',
      demandEs: 'Precios claros / sin sorpresas',
      demandEn: 'Clear pricing / no surprises',
      covers: /\b(precio|price|transparent|factur|billing|costo|afford)\b/i,
    },
    {
      id: 'product',
      demandEs: 'Producto más usable / menos bugs / features pedidas',
      demandEn: 'More usable product / fewer bugs / requested features',
      covers: /\b(ux|ui|f[aá]cil|simple|producto|feature|integr|api|automati)\b/i,
    },
    {
      id: 'trust',
      demandEs: 'Más transparencia / confianza',
      demandEn: 'More transparency / trust',
      covers: /\b(transpar|confianza|trust|seguro|compliance|gdpr)\b/i,
    },
  ];

  /** @type {Array<object>} */
  const gaps = [];

  for (const m of mapping) {
    const themeHit = demandThemes.find((t) => t.id === m.id);
    if (!themeHit) continue;
    const inOffer = m.covers.test(offerLower);
    const roadmapHit = roadmap.find((f) => m.covers.test(f)) || null;
    let action = 'clarify';
    let actionLabel = es
      ? 'Promocionar mañana: ya está en tu oferta/roadmap'
      : 'Promote tomorrow: already in your offer/roadmap';
    let ourCoverage;

    if (roadmapHit || inOffer) {
      action = 'promote';
      actionLabel = es
        ? 'Promocionar mañana — el rival no lo cubre bien y vos sí'
        : 'Promote tomorrow — rival weak here, you cover it';
      ourCoverage = roadmapHit
        ? es
          ? `${brand} ya lo tiene en roadmap/mapa: “${clip(roadmapHit, 80)}”`
          : `${brand} already has it on roadmap: “${clip(roadmapHit, 80)}”`
        : es
          ? `${brand} ya lo cubre en la oferta: “${clip(whatTheySell, 80)}”`
          : `${brand} already covers it in the offer: “${clip(whatTheySell, 80)}”`;
    } else if (roadmap.length) {
      action = 'build';
      actionLabel = es
        ? 'Programar / priorizar — demanda del rival y no está en tu mapa'
        : 'Build / prioritize — rival demand not on your map';
      ourCoverage = es
        ? `No hay match claro en el mapa de producto (${roadmap.length} ítems). Considerá agregarlo.`
        : `No clear match in product map (${roadmap.length} items). Consider adding it.`;
    } else {
      action = 'clarify';
      actionLabel = es
        ? 'Completá el mapa de producto en Config para cruzar demanda'
        : 'Fill product roadmap in Config to cross-check demand';
      ourCoverage = whatTheySell
        ? clip(whatTheySell, 100)
        : es
          ? 'Sin oferta ni roadmap en Config'
          : 'No offer or roadmap in Config';
    }

    gaps.push({
      featureDemand: es ? m.demandEs : m.demandEn,
      ourCoverage,
      roadmapHit,
      action,
      actionLabel,
      evidence: themeHit.samples[0] || null,
      demandCount: themeHit.count,
    });
    if (gaps.length >= 3) break;
  }

  // Features explícitas pedidas en texto (“necesito X”, “wish they had”)
  for (const c of comments) {
    if (gaps.length >= 3) break;
    const wish = c.text.match(
      /\b(?:necesito|need|falta|missing|wish\s+(?:they|it)\s+had|ojal[aá]\s+tuviera)\s+([^,.!?\n]{8,60})/i,
    );
    if (!wish) continue;
    const feature = wish[1].trim();
    const hit = roadmap.find((f) => f.toLowerCase().includes(feature.slice(0, 12).toLowerCase()));
    gaps.push({
      featureDemand: es ? `Feature pedida: ${clip(feature, 70)}` : `Requested feature: ${clip(feature, 70)}`,
      ourCoverage: hit
        ? es
          ? `Ya en tu mapa: “${hit}” → promocionar`
          : `Already on your map: “${hit}” → promote`
        : es
          ? 'No está en tu mapa → evaluar build'
          : 'Not on your map → evaluate build',
      roadmapHit: hit || null,
      action: hit ? 'promote' : 'build',
      actionLabel: hit
        ? es
          ? 'Promocionar mañana'
          : 'Promote tomorrow'
        : es
          ? 'Programar / priorizar'
          : 'Build / prioritize',
      evidence: clip(c.text, 120),
      demandCount: 1,
    });
  }

  if (!gaps.length) {
    gaps.push({
      featureDemand: es
        ? 'Quejas sin tema de producto claro'
        : 'Complaints without a clear product theme',
      ourCoverage: roadmap[0] || clip(whatTheySell, 100) || null,
      roadmapHit: roadmap[0] || null,
      action: null,
      actionLabel: null,
      evidence: comments[0] ? clip(comments[0].text, 120) : null,
      demandCount: 0,
    });
  }

  return gaps.slice(0, 3);
}

/**
 * Matriz Precio/Valor: hikes en noticias × enojo en comentarios → punto de quiebre.
 */
function buildPriceValueMatrix({ lang, comments, press, feed }) {
  const es = lang !== 'en';
  const pricingRule = THEME_RULES.find((r) => r.id === 'pricing');
  const commentPool = comments.length ? comments : feed.filter((f) => f.kind === 'comment');
  const priced = commentPool.filter(
    (c) => pricingRule?.re.test(c.text) || PRICE_BREAK_RE.test(c.text),
  );
  const breaks = priced.filter((c) => PRICE_BREAK_RE.test(c.text));
  const tariffNews = press.filter((p) => TARIFF_HIKE_NEWS_RE.test(p.text));
  const avgAnger = priced.length
    ? priced.reduce((s, c) => s + c.frustration, 0) / priced.length
    : 0;

  let intensity = 'none';
  if (tariffNews.length && (breaks.length >= 1 || avgAnger >= 0.45)) intensity = 'high';
  else if (breaks.length >= 3 || (priced.length >= 2 && breaks.length >= 1)) intensity = 'high';
  else if (priced.length >= 1 || tariffNews.length >= 1) intensity = 'moderate';

  const breakPoint = breaks[0] || priced[0] || null;
  const hasPriceFriction = priced.length > 0 || tariffNews.length > 0;

  const valueBreak =
    tariffNews.length > 0 && avgAnger >= 0.4
      ? es
        ? 'Punto de quiebre: suba de tarifa en prensa + enojo alto en comentarios → el rival “ya no vale lo que cobra”.'
        : 'Break point: tariff hike in press + high comment anger → rival “no longer worth the price”.'
      : breakPoint
        ? es
          ? `Punto de quiebre detectado en comentarios: “${clip(extractPriceBreakPhrase(breakPoint.text) || breakPoint.text, 90)}”`
          : `Break point in comments: “${clip(extractPriceBreakPhrase(breakPoint.text) || breakPoint.text, 90)}”`
        : es
          ? 'Sin punto de quiebre claro precio/valor en este feed.'
          : 'No clear price/value break point in this feed.';

  return {
    hasPriceFriction,
    intensity,
    complaintCount: priced.length,
    tariffHikeNewsCount: tariffNews.length,
    tariffHikeEvidence: tariffNews[0] ? clip(tariffNews[0].text, 140) : null,
    avgAnger: Number(avgAnger.toFixed(2)),
    breakPointSummary: breakPoint
      ? clip(extractPriceBreakPhrase(breakPoint.text) || breakPoint.text, 100)
      : tariffNews[0]
        ? clip(tariffNews[0].text, 100)
        : es
          ? 'Sin quejas de tarifas en el feed analizado'
          : 'No pricing complaints in the analyzed feed',
    breakPointEvidence: breakPoint ? clip(breakPoint.text, 160) : null,
    breakPointUrl: breakPoint?.sourceUrl || null,
    valueBreak,
    guidance: !hasPriceFriction
      ? es
        ? 'No uses descuento como ángulo principal: no hay evidencia de fricción de precio.'
        : 'Do not lead with discount: no price-friction evidence.'
      : intensity === 'high'
        ? es
          ? 'Ajustá pricing: enfatizá predictibilidad de costo y migración sin sorpresas. Ventana para ads de valor.'
          : 'Adjust pricing: emphasize cost predictability and surprise-free migration. Window for value ads.'
        : es
          ? 'Fricción moderada: mencioná claridad de facturación solo si encaja con tu oferta.'
          : 'Moderate friction: mention billing clarity only if it fits your offer.',
  };
}

/**
 * Velocidad/frecuencia de quejas → Competidor en Crisis.
 */
export function buildChurnSignalTracking({ lang, rival, feed, comments, press }) {
  const es = lang !== 'en';
  const now = Date.now();
  const pool = (comments.length ? comments : feed).filter((m) => m.kind !== 'press' || comments.length === 0);
  const last24 = pool.filter((m) => m.at >= now - DAY_MS);
  const prev24 = pool.filter((m) => m.at >= now - 2 * DAY_MS && m.at < now - DAY_MS);
  const last7 = pool.filter((m) => m.at >= now - 7 * DAY_MS);

  const count24 = last24.length;
  const countPrev = prev24.length;
  const avgDay7 = last7.length / 7;
  const velocity =
    countPrev > 0 ? Number((count24 / countPrev).toFixed(2)) : count24 > 0 ? count24 : 0;

  const triggerNews = press.find((p) =>
    /\b(outage|ca[ií]da|breach|layoff|price\s+hike|crisis|down|incidente)\b/i.test(p.text),
  );

  // Umbrales adaptados a feeds chicos (extensión): crisis si spike fuerte o volumen alto reciente
  const inCrisis =
    (count24 >= 8 && velocity >= 3) ||
    (count24 >= 5 && countPrev <= 1 && count24 >= Math.max(5, avgDay7 * 4)) ||
    (count24 >= 10 && avgDay7 > 0 && count24 >= avgDay7 * 5);

  const adsHint = inCrisis
    ? es
      ? `Competidor en Crisis: lanzá ads dirigidos a audiencia de ${rival} (dolor dominante en últimas 24h). Contactá leads de rescate en < 2h.`
      : `Competitor in Crisis: launch targeted ads at ${rival}'s audience (dominant pain in last 24h). Contact rescue leads within 2h.`
    : es
      ? 'Sin crisis declarada: monitoreá velocidad de quejas tras noticias/eventos.'
      : 'No crisis declared: monitor complaint velocity after news/events.';

  return {
    inCrisis,
    label: inCrisis
      ? es
        ? 'Competidor en Crisis'
        : 'Competitor in Crisis'
      : es
        ? 'Señal estable'
        : 'Stable signal',
    count24h: count24,
    countPrev24h: countPrev,
    avgPerDay7d: Number(avgDay7.toFixed(2)),
    velocity,
    triggerNews: triggerNews ? clip(triggerNews.text, 140) : null,
    adsHint,
    series: [
      { label: es ? 'Hoy' : 'Today', count: count24 },
      { label: es ? 'Ayer' : 'Yesterday', count: countPrev },
      { label: '7d avg', count: Number(avgDay7.toFixed(1)) },
    ],
  };
}

function extractPriceBreakPhrase(text) {
  const m = String(text || '').match(
    /([^.!?\n]{0,40}(?:caro|carísimo|expensive|overpriced|subieron|aumentaron|no vale|not worth|hidden fee|cargo oculto|tarifa|cobró|cobro)[^.!?\n]{0,40})/i,
  );
  return m ? m[1].trim() : null;
}

/**
 * Calificación 1–100 con señales disponibles (sin inventar followers).
 */
export function scoreLeadOpportunity({ mention, channelType, crisisBoost = false }) {
  let score = 35;
  const text = mention.text || '';
  const meta = mention.authorMeta || {};
  const channel = String(mention.channel || '').toLowerCase();

  if (mention.hasSwitchIntent) score += 22;
  score += Math.round((mention.frustration || 0) * 25);

  const b2b = detectSegment(mention);
  if (b2b.segment === 'B2B') score += 18;
  else if (b2b.segment === 'B2C') score += 4;

  if (channel === 'linkedin' || channel === 'g2' || channel === 'capterra') score += 10;
  if (channel === 'hackernews') score += 6;
  if (channel === 'reddit' || channel === 'x' || channel === 'twitter') score += 4;

  let influence = 'desconocida';
  if (meta.followers >= 10000) {
    score += 15;
    influence = 'alta';
  } else if (meta.followers >= 1000) {
    score += 8;
    influence = 'media';
  } else if (meta.followers > 0) {
    score += 3;
    influence = 'baja';
  } else if (/\b(ceo|founder|cto|director|head\s+of|gerente)\b/i.test(`${meta.bio} ${meta.displayName} ${text}`)) {
    score += 12;
    influence = 'media';
  }

  if (channelType === 'Público/Abierto') score += 5;
  if (crisisBoost) score += 8;

  score = Math.max(1, Math.min(100, Math.round(score)));
  return {
    score,
    segment: b2b.segment,
    segmentEvidence: b2b.evidence,
    influence,
    followersObserved: meta.followers || null,
  };
}

function detectSegment(mention) {
  const blob = `${mention.authorMeta?.bio || ''} ${mention.authorMeta?.displayName || ''} ${mention.text || ''} ${mention.author || ''}`;
  if (
    /\b(b2b|saas|empresa|company|inc\.|llc|s\.?r\.?l|gmbh|corp|equipo|nuestro\s+stack|we\s+use|our\s+team|procurement|ceo|founder|cto|cfo|director|head\s+of|gerente)\b/i.test(
      blob,
    ) ||
    String(mention.channel || '').toLowerCase() === 'linkedin'
  ) {
    return { segment: 'B2B', evidence: 'señales B2B en texto/canal' };
  }
  if (/\b(yo|mi\s+cuenta|personal|consumer|gamer)\b/i.test(blob) && !/\bempresa\b/i.test(blob)) {
    return { segment: 'B2C', evidence: 'tono individual' };
  }
  return { segment: 'desconocido', evidence: 'sin señales claras en el feed' };
}

function filterSwitchIntentProspects({
  lang,
  rival,
  companyName,
  whatTheySell,
  keyLinks,
  productRoadmap,
  feed,
  crisis,
}) {
  const es = lang !== 'en';
  const ranked = feed
    .filter((m) => m.hasSwitchIntent)
    .sort((a, b) => b.frustration - a.frustration)
    .slice(0, 12);

  return ranked.map((m) => {
    const theme = primaryTheme(m.text, lang);
    const pain = summarizeCriticalPain(m.text, theme, lang);
    const channelType = classifyChannelType(m.channel);
    const qualification = scoreLeadOpportunity({
      mention: m,
      channelType,
      crisisBoost: Boolean(crisis?.inCrisis),
    });
    const firstName = guessFirstName(m.author, m.authorMeta?.displayName);
    const rescue = buildEthicalContactKit({
      lang,
      rival,
      companyName,
      whatTheySell,
      keyLinks,
      productRoadmap,
      complaint: m.text,
      channelType,
      theme,
      firstName,
    });
    const contactBefore = new Date(Date.now() + CONTACT_SLA_MS).toISOString();
    return {
      userId: m.author,
      sourceUrl: m.sourceUrl || null,
      channel: channelLabel(m.channel),
      channelRaw: m.channel,
      channelType,
      criticalPain: pain,
      painCategory: theme.label,
      themeId: theme.id,
      frustration: m.frustration,
      evidence: clip(m.text, 200),
      qualification,
      opportunityScore: qualification.score,
      rescue,
      contactBefore,
      task: es
        ? 'Contactar antes de que pasen 2 horas'
        : 'Contact within 2 hours',
      label: es
        ? `Cliente insatisfecho de ${rival}`
        : `Dissatisfied customer of ${rival}`,
      ethicalNote:
        channelType === 'Propiedad del Rival'
          ? es
            ? 'Canal del rival: no spamear; DM solo si las reglas lo permiten. Pasá el link al vendedor.'
            : 'Rival-owned channel: no spam; DM only if rules allow. Hand link to sales.'
          : es
            ? 'Canal abierto: respuesta pública sutil + DM opcional.'
            : 'Open channel: subtle public reply + optional DM.',
    };
  });
}

function guessFirstName(userId, displayName) {
  if (displayName && /^[A-Za-zÁÉÍÓÚáéíóúñÑ]+/.test(displayName)) {
    return displayName.split(/\s+/)[0];
  }
  const clean = String(userId || '')
    .replace(/^[@u]/i, '')
    .replace(/^\/+/, '');
  const m = clean.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,20})/);
  return m ? m[1] : null;
}

function toCrmProspect(p, rival) {
  return {
    competidor: rival,
    usuario_origen: p.userId,
    url_comentario: p.sourceUrl || null,
    canal_tipo: p.channelType,
    categoria_dolor: p.painCategory,
    mensaje_sugerido_ia: p.rescue.dm || p.rescue.public || null,
    mensaje_publico_ia: p.rescue.public || null,
    etiqueta: p.label,
    calificacion_oportunidad: p.opportunityScore,
    segmento: p.qualification?.segment || 'desconocido',
    influencia: p.qualification?.influence || 'desconocida',
    tarea: p.task,
    contactar_antes_de: p.contactBefore,
    prioridad: p.opportunityScore >= 70 || p.qualification?.segment === 'B2B' ? 'urgente' : 'alta',
  };
}

/** Dolor crítico en ~5 palabras. */
export function summarizeCriticalPain(text, theme, lang = 'es') {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return raw || (lang === 'en' ? 'Unclear pain' : 'Dolor poco claro');

  const focused = raw.match(
    /((?:no\s+)?(?:funciona|responde|renuevo|vale)|(?:siempre|nunca)\s+\w+|(?:caro|outage|ca[ií]da|bug|estafa|refund|cancel|harto)\w*)[^.]{0,40}/i,
  );
  if (focused) {
    return focused[0].trim().split(/\s+/).slice(0, 5).join(' ');
  }
  if (theme?.label) {
    const seed = lang === 'en' ? `Angry about ${theme.label}` : `Enojo por ${theme.label}`;
    return seed.split(/\s+/).slice(0, 5).join(' ');
  }
  return words.slice(0, 5).join(' ');
}

export function buildEthicalContactKit({
  lang,
  rival,
  companyName,
  whatTheySell,
  keyLinks,
  productRoadmap,
  complaint,
  channelType,
  theme,
  firstName,
}) {
  const es = lang !== 'en';
  const brand = companyName || (es ? 'nuestra solución' : 'our solution');
  const offer =
    whatTheySell ||
    (es ? 'una alternativa más estable' : 'a more stable alternative');
  const link = keyLinks?.[0] ? ` ${keyLinks[0]}` : '';
  const featureHint =
    (productRoadmap || []).find((f) =>
      theme?.id ? THEME_RULES.find((r) => r.id === theme.id)?.re.test(f) : false,
    ) || (productRoadmap || [])[0];
  const hook = theme?.id || 'general';
  const name = firstName || (es ? 'hola' : 'hi');
  const painBit = clip(complaint, 70);
  const featureBit = featureHint
    ? clip(featureHint, 60)
    : theme?.label || (es ? 'esa función' : 'that capability');

  const variants = craftSalesPitchVariants({
    companyName: brand,
    whatTheySell: offer,
    keyLinks,
    competitorName: rival,
    complaint,
    themeId: hook,
  });
  const soft = variants.find((v) => v.id === 'soft')?.body || variants[0]?.body || '';

  const allowPublic = channelType !== 'Propiedad del Rival';

  const publicText = allowPublic
    ? es
      ? `Hola ${name === 'hola' ? '' : name + '. '}Vimos que tenés problemas con ${featureBit} en ${rival}. En ${brand} lo optimizamos para que sea más simple. Te dejamos una guía rápida por si te sirve hoy mismo.${link}`
      : `Hi${name && name !== 'hi' ? ` ${name}` : ''}. Saw you're hitting issues with ${featureBit} on ${rival}. At ${brand} we streamlined that. Here's a short guide if it helps today.${link}`
    : es
      ? `(Canal cerrado / propiedad del rival) Link para el vendedor: ${complaint && link ? link : 'usar URL del comentario'}. Borrador DM abajo.`
      : `(Closed / rival-owned channel) Sales link: use comment URL. DM draft below.`;

  const dmText = es
    ? `Hola${firstName ? ` ${firstName}` : ''} — vi tu comentario sobre ${rival} (“${painBit}”). ` +
      `Sin presión: si estás evaluando alternativas, en ${brand} resolvemos ${clip(offer, 70)}` +
      `${featureHint ? ` (incluimos ${clip(featureHint, 50)})` : ''}. ` +
      `¿Te sirve una prueba corta / checklist de migración?${link}`
    : `Hi${firstName ? ` ${firstName}` : ''} — saw your note about ${rival} (“${painBit}”). ` +
      `No pressure: if you're evaluating options, at ${brand} we focus on ${clip(offer, 70)}` +
      `${featureHint ? ` (including ${clip(featureHint, 50)})` : ''}. ` +
      `Want a short trial / migration checklist?${link}`;

  return {
    public: publicText.trim(),
    dm: dmText,
    softPitch: soft,
    allowPublic,
    dmLinkHint: !allowPublic ? (keyLinks?.[0] || null) : null,
  };
}

function formatIntelPackMarkdown({
  lang,
  rival,
  companyName,
  whatTheySell,
  market,
  prospects,
  crmProspects,
  feedCount,
}) {
  const es = lang !== 'en';
  const pv = market.priceValue || market.priceFriction;
  const churn = market.churnSignal;
  const lines = [
    es
      ? `# Paquete de inteligencia competitiva — ${rival}`
      : `# Competitive intelligence pack — ${rival}`,
    '',
    es
      ? `**Para:** ${companyName || 'tu marca'} · **Oferta:** ${whatTheySell || '—'} · **Feed:** ${feedCount} ítems`
      : `**For:** ${companyName || 'your brand'} · **Offer:** ${whatTheySell || '—'} · **Feed:** ${feedCount} items`,
    churn?.inCrisis
      ? es
        ? `\n> **ALERTA: ${churn.label}** — ${churn.adsHint}\n`
        : `\n> **ALERT: ${churn.label}** — ${churn.adsHint}\n`
      : '',
    '',
    es
      ? '## Reportes estratégicos'
      : '## Strategic reports',
    '',
    es ? '### Product Gap Analysis' : '### Product Gap Analysis',
    ...market.productGaps.map(
      (g, i) =>
        `${i + 1}. **${g.featureDemand}**\n   - ${es ? 'Acción' : 'Action'}: ${g.actionLabel || '—'}\n   - ${es ? 'Cobertura' : 'Coverage'}: ${g.ourCoverage || '—'}\n   - ${es ? 'Evidencia' : 'Evidence'}: ${g.evidence ? `“${g.evidence}”` : '—'}`,
    ),
    '',
    es ? '### Matriz de posicionamiento Precio / Valor' : '### Price / Value positioning matrix',
    `- ${es ? 'Hikes en noticias' : 'Tariff hikes in news'}: ${pv?.tariffHikeNewsCount ?? 0}`,
    `- ${es ? 'Enojo medio (precio)' : 'Avg anger (pricing)'}: ${pv?.avgAnger ?? 0}`,
    `- ${es ? 'Intensidad' : 'Intensity'}: ${pv?.intensity}`,
    `- ${pv?.valueBreak || ''}`,
    `- ${es ? 'Guía' : 'Guidance'}: ${pv?.guidance}`,
    '',
    es ? '### Tendencias de abandono (Churn Signal)' : '### Churn signal tracking',
    `- ${es ? 'Estado' : 'Status'}: ${churn?.label}`,
    `- 24h: ${churn?.count24h ?? 0} · ${es ? 'día previo' : 'prev day'}: ${churn?.countPrev24h ?? 0} · velocity ×${churn?.velocity ?? 0}`,
    `- ${churn?.adsHint || ''}`,
    '',
    es ? '### FODA (evidencia)' : '### SWOT (evidence)',
    '',
    es ? '**Fortalezas**' : '**Strengths**',
    ...market.foda.strengths.map((x) => `- ${x.label}${x.evidence ? `: “${x.evidence}”` : ''}`),
    '',
    es ? '**Debilidades**' : '**Weaknesses**',
    ...market.foda.weaknesses.map((x) => `- ${x.label}${x.evidence ? `: “${x.evidence}”` : ''}`),
    '',
    es ? '**Oportunidades**' : '**Opportunities**',
    ...market.foda.opportunities.map((x) => `- ${x.label}${x.evidence ? `: “${x.evidence}”` : ''}`),
    '',
    es ? '**Amenazas**' : '**Threats**',
    ...market.foda.threats.map((x) => `- ${x.label}${x.evidence ? `: “${x.evidence}”` : ''}`),
    '',
    es
      ? '## Pipeline de captación (intención → score → rescate → CRM)'
      : '## Capture pipeline (intent → score → rescue → CRM)',
    '',
  ];

  if (!prospects.length) {
    lines.push(
      es
        ? '_Ningún usuario con intención de cambio explícita. Se ignoraron insultos/quejas genéricas._'
        : '_No users with explicit switch intent. Generic insults/complaints ignored._',
      '',
    );
  } else {
    for (const p of prospects) {
      lines.push(
        `### ${p.userId} · score ${p.opportunityScore}/100 · ${p.qualification?.segment}`,
        `- ${es ? 'Canal' : 'Channel'}: ${p.channel} (${p.channelType})`,
        `- ${es ? 'Dolor' : 'Pain'}: ${p.criticalPain}`,
        `- ${es ? 'Tarea' : 'Task'}: ${p.task} (antes de ${p.contactBefore})`,
        `- ${es ? 'Etiqueta CRM' : 'CRM label'}: ${p.label}`,
        p.sourceUrl ? `- URL: ${p.sourceUrl}` : '',
        '',
        es ? '**Público**' : '**Public**',
        '',
        p.rescue.public,
        '',
        es ? '**DM**' : '**DM**',
        '',
        p.rescue.dm,
        '',
      );
    }
  }

  lines.push(
    es ? '## Exportación CRM (JSON)' : '## CRM export (JSON)',
    '',
    '```json',
    JSON.stringify(crmProspects, null, 2),
    '```',
    '',
    es
      ? '_Solo evidencia del feed. Sin tasas de cierre inventadas._'
      : '_Feed evidence only. No invented close rates._',
  );

  return lines.filter((l) => l !== undefined && l !== null).join('\n');
}

export function formatIntelPackHtml(pack) {
  if (!pack) return '';
  const es = pack.language !== 'en';
  const m = pack.market;
  const pv = m?.priceValue || m?.priceFriction;
  const churn = m?.churnSignal;

  const fodaRow = (title, items) => `
    <div class="rl-intel-foda__col">
      <strong>${escapeHtml(title)}</strong>
      <ul>${(items || [])
        .map(
          (x) =>
            `<li>${escapeHtml(x.label)}${
              x.evidence ? `<span class="rl-muted"> — “${escapeHtml(x.evidence)}”</span>` : ''
            }</li>`,
        )
        .join('')}</ul>
    </div>`;

  const gaps = (m?.productGaps || [])
    .map(
      (g, i) => `<li>
        <strong>${i + 1}. ${escapeHtml(g.featureDemand)}</strong>
        ${g.actionLabel ? `<span class="rl-badge rl-badge--${escapeHtml(g.action || 'clarify')}">${escapeHtml(g.actionLabel)}</span>` : ''}
        <span class="rl-muted">${escapeHtml(g.ourCoverage || '')}</span>
        ${g.evidence ? `<em>“${escapeHtml(g.evidence)}”</em>` : ''}
      </li>`,
    )
    .join('');

  const prospects = pack.prospects || [];
  const prospectHtml = prospects.length
    ? prospects
        .map(
          (p, i) => `<article class="rl-intel-prospect" data-prospect-idx="${i}">
      <header>
        <strong class="rl-intel-prospect__user">${
          p.sourceUrl
            ? `<a href="${escapeHtml(p.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(p.userId)}</a>`
            : escapeHtml(p.userId)
        }</strong>
        <span class="rl-badge rl-badge--score">${escapeHtml(String(p.opportunityScore))}/100</span>
      </header>
      <p class="rl-muted rl-intel-prospect__meta">${escapeHtml(p.channel)} · ${escapeHtml(p.channelType)} · ${escapeHtml(p.qualification?.segment || '')} · ${escapeHtml(p.criticalPain)}</p>
      <p class="rl-intel-prospect__task">${escapeHtml(p.label)} · <strong>${escapeHtml(p.task)}</strong></p>
      <p class="rl-intel-prospect__ethical">${escapeHtml(p.ethicalNote)}</p>
      <details class="rl-disclosure rl-cfg-panel rl-intel-prospect__rescue">
        <summary>${es ? 'Propuesta de rescate' : 'Rescue proposal'}</summary>
        <div class="rl-intel-prospect__rescue-body">
          <p class="rl-muted rl-alert__section-label">${es ? 'Público' : 'Public'}</p>
          <pre class="rl-intel-msg">${escapeHtml(p.rescue?.public || '')}</pre>
          <button type="button" class="rl-btn rl-btn--soft rl-btn--sm" data-copy-rescue="public">${es ? 'Copiar público' : 'Copy public'}</button>
          <p class="rl-muted rl-alert__section-label">DM</p>
          <pre class="rl-intel-msg">${escapeHtml(p.rescue?.dm || '')}</pre>
          <button type="button" class="rl-btn rl-btn--primary rl-btn--sm" data-copy-rescue="dm">${es ? 'Copiar DM' : 'Copy DM'}</button>
        </div>
      </details>
    </article>`,
        )
        .join('')
    : `<p class="rl-empty rl-empty--sm">${
        es
          ? 'Ningún lead con intención de cambio. Se ignoraron quejas genéricas.'
          : 'No switch-intent leads. Generic complaints ignored.'
      }</p>`;

  const crisisBanner = churn?.inCrisis
    ? `<div class="rl-crisis-banner" role="alert">
        <strong>${escapeHtml(churn.label)}</strong>
        <span>${escapeHtml(churn.adsHint)}</span>
        <span class="rl-muted">24h: ${escapeHtml(String(churn.count24h))} · vel ×${escapeHtml(String(churn.velocity))}</span>
      </div>`
    : '';

  return `
    ${crisisBanner}
    <details class="rl-disclosure rl-cfg-panel" open>
      <summary>1 · ${es ? 'Reportes estratégicos' : 'Strategic reports'}</summary>
      <p class="rl-muted rl-alert__section-label">Product Gap × roadmap</p>
      <ol class="rl-intel-gaps">${gaps}</ol>
      <p class="rl-muted rl-alert__section-label">${es ? 'Matriz Precio / Valor' : 'Price / Value matrix'}</p>
      <p>${es ? 'Hikes noticias' : 'News hikes'}: <strong>${escapeHtml(String(pv?.tariffHikeNewsCount ?? 0))}</strong>
        · ${es ? 'enojo' : 'anger'}: <strong>${escapeHtml(String(pv?.avgAnger ?? 0))}</strong>
        · ${escapeHtml(pv?.intensity || 'none')}</p>
      <p>${escapeHtml(pv?.valueBreak || '')}</p>
      <p class="rl-muted">${escapeHtml(pv?.guidance || '')}</p>
      <p class="rl-muted rl-alert__section-label">${es ? 'Churn / crisis' : 'Churn / crisis'}</p>
      <p><strong>${escapeHtml(churn?.label || '')}</strong>
        · 24h ${escapeHtml(String(churn?.count24h ?? 0))}
        · ${es ? 'prev' : 'prev'} ${escapeHtml(String(churn?.countPrev24h ?? 0))}
        · ×${escapeHtml(String(churn?.velocity ?? 0))}</p>
      <p class="rl-muted">${escapeHtml(churn?.adsHint || '')}</p>
      <details class="rl-disclosure">
        <summary>FODA</summary>
        <div class="rl-intel-foda">
          ${fodaRow(es ? 'Fortalezas' : 'Strengths', m?.foda?.strengths)}
          ${fodaRow(es ? 'Debilidades' : 'Weaknesses', m?.foda?.weaknesses)}
          ${fodaRow(es ? 'Oportunidades' : 'Opportunities', m?.foda?.opportunities)}
          ${fodaRow(es ? 'Amenazas' : 'Threats', m?.foda?.threats)}
        </div>
      </details>
    </details>
    <details class="rl-disclosure rl-cfg-panel" open>
      <summary>2 · ${es ? 'Captación (score + rescate)' : 'Capture (score + rescue)'} (${prospects.length})</summary>
      <div class="rl-intel-prospects">${prospectHtml}</div>
    </details>
    <details class="rl-disclosure rl-cfg-panel">
      <summary>3 · ${es ? 'JSON CRM (urgente 2h)' : 'CRM JSON (2h SLA)'}</summary>
      <pre class="rl-rival-report__md" data-crm-json>${escapeHtml(JSON.stringify(pack.crmProspects || [], null, 2))}</pre>
    </details>
  `;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
