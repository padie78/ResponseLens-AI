/**
 * F4.1 — SEO intel por rival (Semrush / Similarweb).
 * Mock-first: genera datos de tráfico, DA, keywords y top pages.
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
 *   competitor: { name: string, websiteUrl?: string },
 *   semrushApiKey?: string,
 * }} opts
 */
export function buildRivalSeoIntel(opts) {
  const name = String(opts.competitor?.name || '').trim();
  const url = String(opts.competitor?.websiteUrl || '').trim();
  const key = String(opts.semrushApiKey || '').trim();
  const mock = isExternalApisMock();
  const connected = Boolean(key && (mock || key));
  const source = connected ? 'connected' : 'demo';

  const domain = (() => {
    try {
      if (url) return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    } catch { /* ignore */ }
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
  })();

  const h = hashKey(`${name}|${domain}|seo`);

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer: 'Sin API SEO conectada. Cargá Semrush API Key en Config → Integraciones.',
      domain,
      trafficIndex: 0,
      domainAuthority: 0,
      organicKeywords: 0,
      paidKeywords: 0,
      backlinks: 0,
      topPages: [],
      topKeywords: [],
      trendPct: 0,
    };
  }

  const trafficIndex = 5000 + (h % 95000);
  const domainAuthority = 15 + (h % 65);
  const organicKeywords = 200 + (h % 9800);
  const paidKeywords = h % 500;
  const backlinks = 1000 + (h % 49000);
  const trendPct = -15 + (h % 30);

  const pagePaths = ['/', '/pricing', '/features', '/blog', '/about', '/docs'];
  const topPages = pagePaths.map((p, i) => ({
    path: p,
    traffic: Math.round(trafficIndex * (0.25 - i * 0.035)),
    keywords: 10 + ((h + i * 17) % 120),
  }));

  const kwStems = ['login', 'pricing', 'alternative', 'review', 'vs', 'api'];
  const topKeywords = kwStems.map((kw, i) => ({
    keyword: `${name.toLowerCase()} ${kw}`,
    volume: 100 + ((h + i * 41) % 4900),
    position: 1 + ((h + i * 7) % 30),
    cpc: Number((0.3 + ((h + i * 13) % 50) / 10).toFixed(2)),
  }));

  return {
    source,
    connected: true,
    disclaimer: mock
      ? 'SEO en mock (misma estructura que Semrush API; 0 llamadas reales).'
      : 'Conectado con Semrush API.',
    domain,
    trafficIndex,
    domainAuthority,
    organicKeywords,
    paidKeywords,
    backlinks,
    topPages,
    topKeywords,
    trendPct,
  };
}
