export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface SocialAd {
  id: string;
  platform: 'tiktok' | 'linkedin';
  format: string;
  objective: string;
  active: boolean;
  impressions: number;
  engagementRate: number;
  engagementPct: string;
  spendBand: string;
  startedAt: string;
}

export interface RivalSocialAdsIntel {
  source: DataSourceKind;
  connected: boolean;
  disclaimer: string;
  tiktokAds: SocialAd[];
  linkedinAds: SocialAd[];
  totalActive: number;
}

export function buildRivalSocialAdsIntel(opts: {
  competitor: { name: string };
  tiktokAdsAccountId?: string;
  linkedinAdsAccountId?: string;
}): RivalSocialAdsIntel;
