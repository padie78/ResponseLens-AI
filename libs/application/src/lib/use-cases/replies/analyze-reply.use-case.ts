import { ValidationError } from '@responselens/domain';
import type { AnalyzeReplyInputDto, ReplyOptionsDto } from '../../dto';
import type { IReplyLlmPort } from '../../ports';

export class AnalyzeReplyUseCase {
  constructor(private readonly llm: IReplyLlmPort) {}

  async execute(input: AnalyzeReplyInputDto): Promise<ReplyOptionsDto> {
    const text = input.text?.trim() ?? '';
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!text) {
      throw new ValidationError('text is required');
    }
    if (text.length > 8000) {
      throw new ValidationError('text exceeds 8000 characters');
    }

    const result = await this.llm.generateReplyOptions({ ...input, text });

    return {
      complaintId: input.complaintId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      channel: input.channel ?? null,
      originalText: text,
      options: result.options,
      triage: result.triage,
      model: result.model,
      generatedAt: new Date().toISOString(),
    };
  }
}
