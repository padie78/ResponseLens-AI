export type DataSourceKind = 'demo' | 'feed' | 'connected';

export interface RivalAdRow {
  id: string;
  platform: string;
  format: string;
  angle: string;
  landing: string;
  headline: string;
  body: string;
  cta: string;
  status: string;
  spendBand: string;
  startedAt?: string;
  daysLive: number;
  rival: string;
}

export interface RivalTalentJob {
  id: string;
  title: string;
  url: string;
}

export interface RivalTalentTheme {
  id: string;
  label: string;
  score: number;
}

export interface RivalTalentQuote {
  text: string;
  theme: string;
}

export interface RivalTalent {
  source: DataSourceKind;
  careersUrl: string;
  rating: number;
  reviews: number;
  openRoles: number;
  jobs: RivalTalentJob[];
  layoff: boolean;
  layoffRisk: string;
  band: string;
  weakest: string;
  recommend: string;
  glassdoorUrl: string;
  themes: RivalTalentTheme[];
  quotes: RivalTalentQuote[];
}

export interface RivalVisibilityPage {
  path: string;
  title: string;
  traffic: number;
}

export interface RivalVisibilityQuery {
  query: string;
  pos: number;
  volume: number;
}

export interface RivalVisibility {
  source: DataSourceKind;
  domain: string;
  statusUrl: string;
  pricingUrl: string;
  statusState: 'unknown' | 'operational' | 'incident';
  statusSummary: string;
  priceChanged: boolean;
  priceHash: string;
  trafficIndex: number;
  domainAuthority: number;
  organicKeywords: number;
  shareOfVoicePct: number;
  trendPct: number;
  band: string;
  recommend: string;
  queries: RivalVisibilityQuery[];
  pages: RivalVisibilityPage[];
}

export interface RivalAdsPack {
  source: DataSourceKind;
  active: number;
  platforms: string[];
  rows: Omit<RivalAdRow, 'rival'>[];
}

export interface RivalBattle {
  strengths: string[];
  weaknesses: string[];
  plays: string[];
}

export interface RivalPerceptionLite {
  perceptionScore: number;
  mentionCount: number;
  switchIntentPct: number;
  voiceLine: string;
  pipeline: { winRate: number };
  sampleQuotes: Array<{ text: string; channel: string }>;
  topThemes: Array<{ name: string; count: number }>;
}

export interface RivalSurface {
  name: string;
  websiteUrl: string;
  aliases: string[];
  ads: RivalAdsPack;
  talent: RivalTalent;
  visibility: RivalVisibility;
  perception: RivalPerceptionLite;
  digitalScore: number;
  digitalBand: string;
  battle: RivalBattle;
}

export interface RivalSurfaceIntel {
  generatedAt: string;
  demo: boolean;
  mock?: boolean;
  usedFallback: boolean;
  adsSource: DataSourceKind;
  talentSource: DataSourceKind;
  webSource: DataSourceKind;
  statusIncidents: Array<{ rival: string; summary: string }>;
  disclaimer: string;
  rivals: RivalSurface[];
  adRows: RivalAdRow[];
  visChart: Array<{ name: string; traffic: number; da: number }>;
}

export function buildRivalSurfaceIntel(opts: {
  competitors?: Array<{
    name?: string;
    websiteUrl?: string;
    aliases?: string[];
    statusUrl?: string;
    pricingUrl?: string;
    careersUrl?: string;
  }>;
  alerts?: object[];
  days?: number;
}): RivalSurfaceIntel;
