/**
 * Motor local de oportunidades de captación (Módulo B).
 * Incluye fichas de competidor (logo, web, industria, debilidades).
 */

const FRUSTRATION_RE =
  /\b(falla|fall[oó]|ca[ií]da|outage|downtime|estafa|me\s+cambio|no\s+funciona|terrible|awful|scam|refund|horrible|pésim|basura|cobraron|chargeback)\b/i;

/** Catálogo demo con fichas enriquecidas (logo vía favicon del dominio). */
export const COMPETITOR_CATALOG = {
  AWS: {
    name: 'AWS',
    aliases: ['RivalCloud', 'rival cloud', 'Amazon Web Services', 'aws'],
    websiteUrl: 'https://aws.amazon.com',
    logoUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128',
    description: 'Plataforma cloud orientada a infraestructura.',
    industry: 'Cloud / IaaS',
    socialHandles: ['@awscloud'],
    weaknessNotes: 'Soporte percibido como lento en incidentes para pymes.',
  },
  Shopify: {
    name: 'Shopify',
    aliases: ['ShopFast', 'shop fast', 'shopify'],
    websiteUrl: 'https://shopify.com',
    logoUrl: 'https://www.google.com/s2/favicons?domain=shopify.com&sz=128',
    description: 'E-commerce y checkout con foco en velocidad de compra.',
    industry: 'E-commerce / Payments',
    socialHandles: ['@shopify'],
    weaknessNotes: 'Fricción en cobros/contracargos frecuente en foros.',
  },
  Mailchimp: {
    name: 'Mailchimp',
    aliases: ['MailBlast', 'mail blast', 'mailchimp'],
    websiteUrl: 'https://mailchimp.com',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mailchimp.com&sz=128',
    description: 'Email marketing y automatizaciones de campañas.',
    industry: 'MarTech / Email',
    socialHandles: ['@Mailchimp'],
    weaknessNotes: 'Caídas de entrega y opacidad en reputación de dominio.',
  },
};

export function scoreFrustration(text) {
  const hits = String(text || '').match(new RegExp(FRUSTRATION_RE.source, 'gi'));
  if (!hits?.length) return 0.4;
  return Number(Math.min(0.35 + hits.length * 0.18, 0.97).toFixed(2));
}

export function severityFromScore(score) {
  if (score >= 0.85) return 'CRITICAL';
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

export function initialsAvatarDataUri(name) {
  const initials = String(name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hue =
    Math.abs(
      Array.from(String(name || '')).reduce((a, c) => a + c.charCodeAt(0), 0),
    ) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" rx="12" fill="hsl(${hue} 45% 42%)"/>
    <text x="32" y="38" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="22" font-weight="700">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveCompetitorLogo(profile) {
  if (profile?.logoUrl) return profile.logoUrl;
  if (profile?.websiteUrl) {
    try {
      const host = new URL(profile.websiteUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    } catch {
      /* ignore */
    }
  }
  return initialsAvatarDataUri(profile?.name || '?');
}

export function lookupCompetitorProfile(name, competitors = []) {
  const key = String(name || '').trim();
  if (!key) return null;

  const fromConfig = competitors.find((c) => {
    const names = [c.name, ...(c.aliases || [])].map((n) => String(n).toLowerCase());
    return names.includes(key.toLowerCase());
  });
  if (fromConfig) {
    return normalizeProfile({ ...fromConfig, name: fromConfig.name || key });
  }

  const catalog =
    COMPETITOR_CATALOG[key] ||
    Object.values(COMPETITOR_CATALOG).find((c) =>
      [c.name, ...(c.aliases || [])].some((n) => n.toLowerCase() === key.toLowerCase()),
    );
  return catalog ? normalizeProfile(catalog) : normalizeProfile({ name: key });
}

function normalizeProfile(raw) {
  const profile = {
    name: raw.name || 'Competidor',
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    websiteUrl: raw.websiteUrl || raw.website || null,
    logoUrl: raw.logoUrl || null,
    description: raw.description || raw.notes || null,
    industry: raw.industry || null,
    socialHandles: Array.isArray(raw.socialHandles) ? raw.socialHandles : [],
    weaknessNotes: raw.weaknessNotes || null,
  };
  profile.logoUrl = resolveCompetitorLogo(profile);
  return profile;
}

export function craftSalesPitch({ companyName, whatTheySell, keyLinks, competitorName, complaint }) {
  const brand = companyName?.trim() || 'nuestra solución';
  const offer = whatTheySell?.trim()
    ? whatTheySell.trim().slice(0, 120)
    : 'una alternativa más estable y con soporte humano';
  const link = Array.isArray(keyLinks) && keyLinks[0] ? ` Más info: ${keyLinks[0]}` : '';
  const snippet = String(complaint || '').replace(/\s+/g, ' ').trim().slice(0, 100);

  return (
    `Vi tu comentario sobre ${competitorName}. ` +
    `Si buscas ${offer}, en ${brand} podemos ayudarte a salir de esto ` +
    `("${snippet}${snippet.length >= 100 ? '…' : ''}"). ` +
    `Te acompañamos en la transición sin fricción.${link}`
  );
}

export function buildOpportunity({
  competitorName,
  complaint,
  sourceUrl,
  channel,
  company,
  userId,
  competitors = [],
  demo = false,
  alertId = null,
  detectedAt = null,
}) {
  const frustrationScore = scoreFrustration(complaint);
  const competitor = lookupCompetitorProfile(competitorName, competitors);

  return {
    alertId:
      alertId ||
      `${demo ? 'demo' : 'opp'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    userId: userId || 'local-user',
    competitorName: competitor.name,
    competitor,
    originalComplaint: String(complaint || '').trim(),
    sourceUrl: sourceUrl || 'manual://competencia',
    channel: channel || 'manual',
    severity: severityFromScore(frustrationScore),
    frustrationScore,
    salesPitch: craftSalesPitch({
      companyName: company?.companyName,
      whatTheySell: company?.whatTheySell,
      keyLinks: company?.keyLinks,
      competitorName: competitor.name,
      complaint,
    }),
    detectedAt: detectedAt || new Date().toISOString(),
    status: 'NEW',
    _demo: Boolean(demo),
  };
}

export function buildDemoOpportunities(company, userId, competitors = []) {
  const samples = [
    {
      competitorName: 'AWS',
      complaint: 'Llevan 6 horas de caída del servicio y nadie responde. Me cambio sí o sí.',
      sourceUrl: 'https://x.com/example/status/rival-outage',
      channel: 'x',
    },
    {
      competitorName: 'Shopify',
      complaint: 'Me cobraron dos veces y el soporte es una estafa. Voy a pedir chargeback.',
      sourceUrl: 'https://www.reddit.com/r/example/comments/shopfast',
      channel: 'web',
    },
    {
      competitorName: 'Mailchimp',
      complaint: 'La entrega falla desde ayer. Horrible. ¿Alguna alternativa decente?',
      sourceUrl: 'https://www.youtube.com/watch?v=demo',
      channel: 'youtube',
    },
  ];

  const catalogAsConfig = Object.values(COMPETITOR_CATALOG);
  const merged = [...competitors, ...catalogAsConfig];

  return samples.map((s, i) => {
    const opp = buildOpportunity({
      ...s,
      company,
      userId,
      competitors: merged,
      demo: true,
    });
    opp.alertId = `demo-${i + 1}`;
    opp.detectedAt = new Date(Date.now() - (i + 1) * 36e5).toISOString();
    return opp;
  });
}

export function findMentionedCompetitor(text, competitors = []) {
  const lower = String(text || '').toLowerCase();
  const pool = [...competitors, ...Object.values(COMPETITOR_CATALOG)];
  for (const c of pool) {
    const names = [c.name, ...(c.aliases || [])].filter(Boolean);
    for (const name of names) {
      if (name && lower.includes(String(name).toLowerCase())) {
        return c.name;
      }
    }
  }
  return null;
}

/**
 * Formato Config (una línea por rival):
 * Nombre | alias1,alias2 | https://web | https://logo.png | industria | descripción
 */
export function parseCompetitorLines(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      const [
        name = '',
        aliasesPart = '',
        websiteUrl = '',
        logoUrl = '',
        industry = '',
        description = '',
      ] = parts;
      return normalizeProfile({
        name,
        aliases: aliasesPart
          ? aliasesPart.split(',').map((a) => a.trim()).filter(Boolean)
          : [],
        websiteUrl: websiteUrl || null,
        logoUrl: logoUrl || null,
        industry: industry || null,
        description: description || null,
      });
    });
}

export function formatCompetitorLines(competitors = []) {
  return competitors
    .map((c) => {
      const aliases = (c.aliases || []).join(',');
      return [
        c.name,
        aliases,
        c.websiteUrl || '',
        c.logoUrl && !String(c.logoUrl).includes('google.com/s2/favicons') ? c.logoUrl : '',
        c.industry || '',
        c.description || '',
      ].join(' | ');
    })
    .join('\n');
}

export function defaultCompetitorSeed() {
  return Object.values(COMPETITOR_CATALOG).map((c) => normalizeProfile(c));
}
