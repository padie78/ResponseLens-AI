/**
 * F3.1 — Ads propios (Meta + Google Ads).
 * Mock-first: si hay account/customer ID en Config → Conectado (mock).
 * OAuth real queda para siguiente iteración.
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

const CAMPAIGN_NAMES = [
  'Brand Awareness Q3',
  'Retargeting — Carritos',
  'Lookalike — Top Clients',
  'Search — Competencia',
  'Display — Blog Readers',
  'Video — Product Launch',
  'Shopping — Catálogo',
  'Performance Max',
];

const STATUSES = ['active', 'active', 'active', 'paused', 'ended'];

function mockCampaigns(seed, count) {
  const campaigns = [];
  for (let i = 0; i < count; i += 1) {
    const h = hashKey(`${seed}|camp|${i}`);
    const status = STATUSES[h % STATUSES.length];
    const spend = status === 'active' ? 50 + (h % 950) : 0;
    const impressions = status === 'active' ? 1200 + (h % 48000) : h % 12000;
    const clicks = Math.round(impressions * (0.008 + (h % 50) / 1000));
    const ctr = impressions > 0 ? clicks / impressions : 0;

    const startDay = 14 + (h % 60);
    const start = new Date(Date.now() - startDay * 86400000).toISOString().slice(0, 10);
    const endDay = status === 'ended' ? 3 + (h % 10) : null;
    const end = endDay ? new Date(Date.now() - endDay * 86400000).toISOString().slice(0, 10) : null;

    const platform = i % 2 === 0 ? 'meta' : 'google';

    campaigns.push({
      id: `camp_${h.toString(36)}`,
      name: CAMPAIGN_NAMES[i % CAMPAIGN_NAMES.length],
      platform,
      status,
      spend7d: spend,
      spendBand: spend >= 500 ? 'alto' : spend >= 150 ? 'medio' : spend > 0 ? 'bajo' : 'sin gasto',
      impressions,
      clicks,
      ctr: Number(ctr.toFixed(4)),
      ctrPct: `${(ctr * 100).toFixed(2)}%`,
      startedAt: start,
      endedAt: end,
    });
  }
  return campaigns;
}

/**
 * @param {{
 *   companyName?: string,
 *   metaAdsAccountId?: string,
 *   googleAdsCustomerId?: string,
 * }} opts
 */
export function buildOwnAdsIntel(opts) {
  const name = String(opts.companyName || '').trim();
  const metaId = String(opts.metaAdsAccountId || '').trim();
  const googleId = String(opts.googleAdsCustomerId || '').trim();
  const mock = isExternalApisMock();
  const connected = Boolean((metaId || googleId) && (mock || metaId || googleId));
  const source = connected ? 'connected' : 'demo';

  if (!connected) {
    return {
      source,
      connected: false,
      disclaimer:
        'Sin cuenta de ads conectada. Cargá Meta Ads Account ID o Google Ads Customer ID en Config → Integraciones.',
      metaAdsAccountId: metaId,
      googleAdsCustomerId: googleId,
      campaigns: [],
      totalSpend7d: 0,
      topCampaign: null,
    };
  }

  const seed = `${name}|${metaId}|${googleId}`;
  const h = hashKey(seed);
  const count = 4 + (h % 5);
  const campaigns = mockCampaigns(seed, count);

  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const totalSpend7d = activeCampaigns.reduce((sum, c) => sum + c.spend7d, 0);
  const topCampaign = activeCampaigns.length
    ? activeCampaigns.reduce((best, c) => (c.ctr > best.ctr ? c : best), activeCampaigns[0])
    : null;

  return {
    source,
    connected: true,
    disclaimer: mock
      ? 'Ads en mock (misma estructura que la API; 0 llamadas a Meta/Google).'
      : 'Conectado con los IDs de Config. OAuth completo es el siguiente paso.',
    metaAdsAccountId: metaId,
    googleAdsCustomerId: googleId,
    campaigns,
    totalSpend7d,
    topCampaign,
  };
}
