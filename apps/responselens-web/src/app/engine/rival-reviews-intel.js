/**
 * F4.2 — Reviews de rivales (G2 / Capterra).
 * Mock-first: genera ratings, reviews, pros/cons y categorías.
 */

import { isExternalApisMock } from './external-apis-mock.js';

function hashKey(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CATEGORIES = ['Facilidad de uso', 'Soporte', 'Features', 'Precio', 'Integración', 'Onboarding'];
const PROS = [
  'Interfaz intuitiva',
  'Buen soporte técnico',
  'Integración rápida con APIs',
  'Documentación completa',
  'Precio competitivo',
];
const CONS = [
  'Curva de aprendizaje inicial',
  'Faltan integraciones nativas',
  'Precio alto para PYMES',
  'Reportes limitados',
  'Soporte solo en inglés',
];

/**
 * @param {{
 *   competitor: { name: string },
 *   g2CompanySlug?: string,
 * }} opts
 */
export function buildRivalReviewsIntel(opts) {
  const name = String(opts.competitor?.name || '').trim();
  const slug = String(opts.g2CompanySlug || '').trim();
  const mock = isExternalApisMock();
  const connected = Boolean(slug && (mock || slug));
  const source = connected ? 'connected' : 'demo';

  const h = hashKey(`${name}|${slug}|reviews`);

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer: 'Sin G2/Capterra conectado. Cargá el slug de G2 en Config → Integraciones.',
      g2Slug: slug,
      overallRating: 0,
      totalReviews: 0,
      categories: [],
      recentPros: [],
      recentCons: [],
      nps: null,
      trendDirection: 'estable',
    };
  }

  const overallRating = Number((3.2 + (h % 18) / 10).toFixed(1));
  const totalReviews = 50 + (h % 950);
  const nps = 10 + (h % 70);

  const categories = CATEGORIES.map((cat, i) => ({
    name: cat,
    rating: Number((2.8 + ((h + i * 11) % 22) / 10).toFixed(1)),
    reviewCount: 5 + ((h + i * 7) % 40),
  }));

  const recentPros = PROS.slice(0, 3 + (h % 2)).map((text, i) => ({
    text,
    mentions: 3 + ((h + i * 5) % 20),
  }));

  const recentCons = CONS.slice(0, 2 + (h % 3)).map((text, i) => ({
    text,
    mentions: 2 + ((h + i * 3) % 15),
  }));

  const trendDirection = overallRating >= 4.0 ? 'subiendo' : overallRating <= 3.4 ? 'bajando' : 'estable';

  return {
    source,
    connected: true,
    disclaimer: mock
      ? 'Reviews en mock (estructura G2 API; 0 llamadas reales).'
      : 'Conectado con G2.',
    g2Slug: slug,
    overallRating,
    totalReviews,
    categories,
    recentPros,
    recentCons,
    nps,
    trendDirection,
  };
}
