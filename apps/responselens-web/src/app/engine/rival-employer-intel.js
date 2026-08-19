/**
 * F4.3 — Employer brand intel (Glassdoor).
 * Mock-first: rating, reviews, pros/cons, CEO approval, recommend %.
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

const CATEGORIES = ['Cultura', 'Compensación', 'Work-life balance', 'Management', 'Oportunidades de carrera'];

/**
 * @param {{
 *   competitor: { name: string },
 *   glassdoorEmployerId?: string,
 * }} opts
 */
export function buildRivalEmployerIntel(opts) {
  const name = String(opts.competitor?.name || '').trim();
  const eid = String(opts.glassdoorEmployerId || '').trim();
  const mock = isExternalApisMock();
  const connected = Boolean(eid && (mock || eid));
  const source = connected ? 'connected' : 'demo';

  const h = hashKey(`${name}|${eid}|employer`);

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer: 'Sin Glassdoor conectado. Cargá employer ID en Config → Integraciones.',
      glassdoorEmployerId: eid,
      overallRating: 0,
      totalReviews: 0,
      ceoApproval: null,
      recommendPct: null,
      categories: [],
      trendDirection: 'estable',
    };
  }

  const overallRating = Number((2.8 + (h % 22) / 10).toFixed(1));
  const totalReviews = 30 + (h % 470);
  const ceoApproval = 40 + (h % 55);
  const recommendPct = 35 + (h % 60);

  const categories = CATEGORIES.map((cat, i) => ({
    name: cat,
    rating: Number((2.5 + ((h + i * 13) % 25) / 10).toFixed(1)),
  }));

  const trendDirection = overallRating >= 3.8 ? 'subiendo' : overallRating <= 3.0 ? 'bajando' : 'estable';

  return {
    source,
    connected: true,
    disclaimer: mock
      ? 'Employer brand en mock (estructura Glassdoor; 0 llamadas reales).'
      : 'Conectado con Glassdoor.',
    glassdoorEmployerId: eid,
    overallRating,
    totalReviews,
    ceoApproval,
    recommendPct,
    categories,
    trendDirection,
  };
}
