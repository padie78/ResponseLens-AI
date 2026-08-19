export interface CompetitorProfile {
  name: string;
  aliases?: string[];
  websiteUrl?: string | null;
  socialHandles?: string[];
  statusUrl?: string | null;
  pricingUrl?: string | null;
  careersUrl?: string | null;
}

export interface CompanyProfile {
  companyName: string;
  whatTheySell: string;
  keyLinks?: string[];
  brandVoiceNotes?: string | null;
  aliases?: string[];
  channelUrls?: string[];
  ga4PropertyId?: string | null;
  searchConsoleSiteUrl?: string | null;
  metaAdsAccountId?: string | null;
  googleAdsCustomerId?: string | null;
  slackWebhookUrl?: string | null;
  semrushApiKey?: string | null;
  g2CompanySlug?: string | null;
  glassdoorEmployerId?: string | null;
  tiktokAdsAccountId?: string | null;
  linkedinAdsAccountId?: string | null;
  aiVisibilityProvider?: string | null;
  industryKeywords?: string[];
  marketCategory?: string | null;
}

export interface UserConfig {
  userId: string;
  company: CompanyProfile;
  competitors: CompetitorProfile[];
  updatedAt: string;
}
