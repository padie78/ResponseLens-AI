import type { CompetitorAlert, ReplyOptions, UserConfig } from '@responselens/domain';

export type UserConfigDto = UserConfig;
export type ReplyOptionsDto = ReplyOptions;
export type CompetitorAlertDto = CompetitorAlert;

export interface AnalyzeReplyInputDto {
  userId: string;
  text: string;
  channel?: string | null;
  sourceUrl?: string | null;
  complaintId?: string | null;
  companyName?: string | null;
  whatTheySell?: string | null;
  brandVoiceNotes?: string | null;
}

export interface AnalyzeRivalReportInputDto {
  userId: string;
  competitorName: string;
  mentions: string[];
  channel?: string | null;
  sourceUrl?: string | null;
  companyName?: string | null;
  whatTheySell?: string | null;
  brandVoiceNotes?: string | null;
}

export interface RivalReportDto {
  competitorName: string;
  mentionCount: number;
  avgFrustration: number;
  riskLevel: string;
  conclusions: string[];
  opportunities: string[];
  reportMarkdown: string;
  model: string;
  generatedAt: string;
  themes: Array<{ id?: string; label: string }>;
  sources: string[];
}

export interface SaveUserConfigInputDto {
  userId: string;
  company: UserConfig['company'];
  competitors: UserConfig['competitors'];
}
