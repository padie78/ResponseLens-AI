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

export interface SaveUserConfigInputDto {
  userId: string;
  company: UserConfig['company'];
  competitors: UserConfig['competitors'];
}
