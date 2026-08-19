export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface SeoPage {
  path: string;
  traffic: number;
  keywords: number;
}

export interface SeoKeyword {
  keyword: string;
  volume: number;
  position: number;
  cpc: number;
}

export interface RivalSeoIntel {
  source: DataSourceKind;
  connected: boolean;
  disclaimer: string;
  domain: string;
  trafficIndex: number;
  domainAuthority: number;
  organicKeywords: number;
  paidKeywords: number;
  backlinks: number;
  topPages: SeoPage[];
  topKeywords: SeoKeyword[];
  trendPct: number;
}

export function buildRivalSeoIntel(opts: {
  competitor: { name: string; websiteUrl?: string };
  semrushApiKey?: string;
}): RivalSeoIntel;
