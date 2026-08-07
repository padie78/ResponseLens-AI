import type { ComplaintTriage, ReplyOption } from '@responselens/domain';
import type { AnalyzeReplyInputDto } from '../dto';

export interface LlmReplyResult {
  options: ReplyOption[];
  triage: ComplaintTriage;
  model: string;
}

export interface IReplyLlmPort {
  generateReplyOptions(input: AnalyzeReplyInputDto): Promise<LlmReplyResult>;
}
