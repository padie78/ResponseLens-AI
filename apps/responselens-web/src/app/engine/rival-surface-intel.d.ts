export interface RivalAdRow {
  id: string;
  platform: string;
  headline: string;
  body: string;
  cta: string;
  status: string;
  spendBand: string;
  daysLive: number;
  rival: string;
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
  rating: number;
  reviews: number;
  openRoles: number;
  layoffRisk: string;
  glassdoorUrl: string;
  themes: RivalTalentTheme[];
  quotes: RivalTalentQuote[];
}

export interface RivalVisibilityPage {
  path: string;
  title: string;
  traffic: number;
}

export interface RivalVisibility {
  domain: string;
  trafficIndex: number;
  domainAuthority: number;
  organicKeywords: number;
  shareOfVoicePct: number;
  trendPct: number;
  pages: RivalVisibilityPage[];
}

export interface RivalAdsPack {
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
  disclaimer: string;
  rivals: RivalSurface[];
  adRows: RivalAdRow[];
  visChart: Array<{ name: string; traffic: number; da: number }>;
}

export function buildRivalSurfaceIntel(opts: {
  competitors?: Array<{ name?: string; websiteUrl?: string; aliases?: string[] }>;
  alerts?: object[];
  days?: number;
}): RivalSurfaceIntel;
