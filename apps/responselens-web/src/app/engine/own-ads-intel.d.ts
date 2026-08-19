export type AdPlatform = 'meta' | 'google';
export type CampaignStatus = 'active' | 'paused' | 'ended';
export type SpendBand = 'alto' | 'medio' | 'bajo' | 'sin gasto';
export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface OwnCampaign {
  id: string;
  name: string;
  platform: AdPlatform;
  status: CampaignStatus;
  spend7d: number;
  spendBand: SpendBand;
  impressions: number;
  clicks: number;
  ctr: number;
  ctrPct: string;
  startedAt: string;
  endedAt: string | null;
}

export interface OwnAdsIntel {
  source: DataSourceKind;
  connected: boolean;
  disclaimer: string;
  metaAdsAccountId: string;
  googleAdsCustomerId: string;
  campaigns: OwnCampaign[];
  totalSpend7d: number;
  topCampaign: OwnCampaign | null;
}

export function buildOwnAdsIntel(opts: {
  companyName?: string;
  metaAdsAccountId?: string;
  googleAdsCustomerId?: string;
}): OwnAdsIntel;
