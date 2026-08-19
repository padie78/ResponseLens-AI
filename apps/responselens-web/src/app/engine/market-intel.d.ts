export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface MarketFeedRow {
  id: string;
  headline: string;
  snippet: string;
  keyword: string;
  theme: string;
  source: string;
  severity: string;
  detectedAt: string;
  sourceUrl: string;
  kind: 'real' | 'demo';
}

export interface MarketFeedPack {
  source: DataSourceKind;
  disclaimer: string;
  keywords: string[];
  channels: string[];
  severities: string[];
  themes: string[];
  rows: MarketFeedRow[];
}

export interface MarketTrendCount {
  keyword?: string;
  source?: string;
  severity?: string;
  count: number;
}

export interface MarketTrendsPack {
  source: DataSourceKind;
  disclaimer: string;
  summary: string;
  totalRows: number;
  realRows: number;
  criticalCount: number;
  topKeywords: Array<{ keyword: string; count: number }>;
  topThemes: Array<{ theme: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  severities: Array<{ severity: string; count: number }>;
  rows: MarketFeedRow[];
}

export function buildMarketFeed(opts: {
  alerts?: object[];
  industryKeywords?: string[];
  marketCategory?: string;
  whatTheySell?: string;
}): MarketFeedPack;

export function buildMarketTrends(opts: {
  alerts?: object[];
  industryKeywords?: string[];
  marketCategory?: string;
  whatTheySell?: string;
}): MarketTrendsPack;
