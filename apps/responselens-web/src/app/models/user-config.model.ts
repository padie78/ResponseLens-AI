export interface CompetitorProfile {
  name: string;
  aliases: string[];
  websiteUrl: string;
  socialHandles: string[];
  /** Status page pública (RSS/JSON/HTML). F2.2 */
  statusUrl: string;
  /** Página de precios pública. F2.3 */
  pricingUrl: string;
  /** Tablero de empleo público. F2.4 */
  careersUrl: string;
}

export interface CompanyProfile {
  companyName: string;
  aliases: string[];
  whatTheySell: string;
  keyLinks: string[];
  channelUrls: string[];
  brandVoiceNotes: string;
  /** GA4 property id. F2.5 — mock si no hay OAuth. */
  ga4PropertyId: string;
  /** URL de propiedad Search Console. F2.5 */
  searchConsoleSiteUrl: string;
  /** Meta Ads account ID. F3.1 — mock si no hay OAuth. */
  metaAdsAccountId: string;
  /** Google Ads customer ID. F3.1 — mock si no hay OAuth. */
  googleAdsCustomerId: string;
  /** Slack incoming webhook URL para digest. F3.7 */
  slackWebhookUrl: string;
}

export interface UserConfig {
  userId: string;
  company: CompanyProfile;
  competitors: CompetitorProfile[];
  updatedAt: string;
}

export function emptyCompany(): CompanyProfile {
  return {
    companyName: '',
    aliases: [],
    whatTheySell: '',
    keyLinks: [],
    channelUrls: [],
    brandVoiceNotes: '',
    ga4PropertyId: '',
    searchConsoleSiteUrl: '',
    metaAdsAccountId: '',
    googleAdsCustomerId: '',
    slackWebhookUrl: '',
  };
}

export function emptyCompetitor(): CompetitorProfile {
  return {
    name: '',
    aliases: [],
    websiteUrl: '',
    socialHandles: [],
    statusUrl: '',
    pricingUrl: '',
    careersUrl: '',
  };
}

export function emptyUserConfig(userId: string): UserConfig {
  return {
    userId,
    company: emptyCompany(),
    competitors: [],
    updatedAt: new Date().toISOString(),
  };
}
