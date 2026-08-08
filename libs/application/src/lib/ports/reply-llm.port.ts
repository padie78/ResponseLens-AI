import type { ComplaintTriage, ReplyOption } from '@responselens/domain';
import type { AnalyzeReplyInputDto, AnalyzeRivalReportInputDto, RivalReportDto } from '../dto';

export interface LlmReplyResult {
  options: ReplyOption[];
  triage: ComplaintTriage;
  model: string;
}

export interface IReplyLlmPort {
  generateReplyOptions(input: AnalyzeReplyInputDto): Promise<LlmReplyResult>;
  generateRivalReport?(input: AnalyzeRivalReportInputDto): Promise<RivalReportDto>;
}
