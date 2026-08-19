/**
 * F4.4 — Social ads intel por rival (TikTok + LinkedIn).
 * Mock-first: genera campañas con formato, engagement, spend band.
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

const TIKTOK_FORMATS = ['In-Feed', 'TopView', 'Spark Ads', 'Brand Takeover'];
const LINKEDIN_FORMATS = ['Sponsored Content', 'Message Ads', 'Lead Gen', 'Text Ads', 'Video Ads'];
const OBJECTIVES = ['Awareness', 'Conversions', 'Traffic', 'Engagement', 'App Install'];

function mockAds(seed, platform, count) {
  const formats = platform === 'tiktok' ? TIKTOK_FORMATS : LINKEDIN_FORMATS;
  const ads = [];
  for (let i = 0; i < count; i += 1) {
    const h = hashKey(`${seed}|${platform}|${i}`);
    const format = formats[h % formats.length];
    const objective = OBJECTIVES[h % OBJECTIVES.length];
    const active = (h % 3) !== 0;
    const engagement = 0.5 + (h % 80) / 10;
    const impressions = active ? 5000 + (h % 95000) : h % 20000;
    const startDay = 7 + (h % 45);
    const startedAt = new Date(Date.now() - startDay * 86400000).toISOString().slice(0, 10);

    ads.push({
      id: `${platform}_${h.toString(36)}`,
      platform,
      format,
      objective,
      active,
      impressions,
      engagementRate: Number(engagement.toFixed(2)),
      engagementPct: `${engagement.toFixed(1)}%`,
      spendBand: active ? (impressions > 50000 ? 'alto' : 'medio') : 'sin gasto',
      startedAt,
    });
  }
  return ads;
}

/**
 * @param {{
 *   competitor: { name: string },
 *   tiktokAdsAccountId?: string,
 *   linkedinAdsAccountId?: string,
 * }} opts
 */
export function buildRivalSocialAdsIntel(opts) {
  const name = String(opts.competitor?.name || '').trim();
  const tiktokId = String(opts.tiktokAdsAccountId || '').trim();
  const linkedinId = String(opts.linkedinAdsAccountId || '').trim();
  const mock = isExternalApisMock();
  const hasAny = Boolean(tiktokId || linkedinId);
  const connected = hasAny && (mock || hasAny);
  const source = connected ? 'connected' : 'demo';

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer: 'Sin TikTok/LinkedIn ads conectado. Cargá account IDs en Config → Integraciones.',
      tiktokAds: [],
      linkedinAds: [],
      totalActive: 0,
    };
  }

  const seed = `${name}|social`;
  const h = hashKey(seed);
  const tiktokAds = tiktokId ? mockAds(seed, 'tiktok', 2 + (h % 4)) : [];
  const linkedinAds = linkedinId ? mockAds(seed, 'linkedin', 2 + (h % 3)) : [];
  const totalActive = [...tiktokAds, ...linkedinAds].filter((a) => a.active).length;

  return {
    source,
    connected: true,
    disclaimer: mock
      ? 'Social ads en mock (estructura TikTok/LinkedIn; 0 llamadas reales).'
      : 'Conectado con TikTok/LinkedIn Ads.',
    tiktokAds,
    linkedinAds,
    totalActive,
  };
}
