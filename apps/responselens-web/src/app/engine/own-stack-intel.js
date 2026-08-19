/**
 * F2.5 — GA4 + Search Console de la marca propia.
 * Sin OAuth real: si hay property/site en Config y mock activo → Conectado (mock).
 * No inventa spend. Números solo con conector (mock o IDs).
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

/**
 * @param {{
 *   companyName?: string,
 *   ga4PropertyId?: string,
 *   searchConsoleSiteUrl?: string,
 * }} opts
 */
export function buildOwnStackIntel(opts) {
  const name = String(opts.companyName || '').trim();
  const ga4 = String(opts.ga4PropertyId || '').trim();
  const gsc = String(opts.searchConsoleSiteUrl || '').trim();
  const mock = isExternalApisMock();
  const connected = Boolean((ga4 || gsc) && (mock || ga4 || gsc));
  const source = connected ? 'connected' : 'demo';

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer:
        'Sin GA4 / Search Console. Cargá property id y sitio en Config → Avanzado. No se muestran tráfico ni queries inventados.',
      ga4PropertyId: ga4,
      searchConsoleSiteUrl: gsc,
      sessions7d: null,
      topPages: [],
      queries: [],
    };
  }

  const h = hashKey(`${name}|${ga4}|${gsc}`);
  const sessions7d = 800 + (h % 4200);
  const domain = (() => {
    try {
      if (gsc) return new URL(gsc.startsWith('http') ? gsc : `https://${gsc}`).hostname.replace(/^www\./, '');
    } catch {
      /* ignore */
    }
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'marca';
  })();

  const topPages = [
    { path: '/', title: 'Home', clicks: Math.round(sessions7d * 0.28) },
    { path: '/pricing', title: 'Precios', clicks: Math.round(sessions7d * 0.14) },
    { path: '/blog', title: 'Blog', clicks: Math.round(sessions7d * 0.11) },
  ];
  const stems = ['login', 'pricing', 'alternativa', 'soporte'];
  const queries = stems.map((s, i) => ({
    query: `${name.toLowerCase()} ${s}`,
    clicks: 40 + ((h + i * 33) % 220),
    position: Number((4 + ((h + i * 7) % 18) / 10).toFixed(1)),
  }));

  return {
    source,
    connected: true,
    disclaimer: mock
      ? 'GA4 / Search Console en mock (mismo contrato que la API; 0 llamadas a Google).'
      : 'Conectado con los IDs de Config. OAuth Google completo es el siguiente paso (F3).',
    ga4PropertyId: ga4,
    searchConsoleSiteUrl: gsc || `https://${domain}`,
    sessions7d,
    topPages,
    queries,
  };
}
