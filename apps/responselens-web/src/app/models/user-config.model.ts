export interface CompetitorProfile {
  name: string;
  aliases: string[];
  websiteUrl: string;
  socialHandles: string[];
}

export interface CompanyProfile {
  companyName: string;
  aliases: string[];
  whatTheySell: string;
  keyLinks: string[];
  channelUrls: string[];
  brandVoiceNotes: string;
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
  };
}

export function emptyCompetitor(): CompetitorProfile {
  return {
    name: '',
    aliases: [],
    websiteUrl: '',
    socialHandles: [],
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
