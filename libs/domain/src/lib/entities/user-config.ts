export interface CompetitorProfile {
  name: string;
  aliases?: string[];
  websiteUrl?: string | null;
  socialHandles?: string[];
}

export interface CompanyProfile {
  companyName: string;
  whatTheySell: string;
  keyLinks?: string[];
  brandVoiceNotes?: string | null;
}

export interface UserConfig {
  userId: string;
  company: CompanyProfile;
  competitors: CompetitorProfile[];
  updatedAt: string;
}
