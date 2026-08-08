import type { AnalyzeRivalReportInputDto, RivalReportDto } from '../../dto';
import type { IReplyLlmPort } from '../../ports/reply-llm.port';

export class AnalyzeRivalReportUseCase {
  constructor(private readonly llm: IReplyLlmPort) {}

  async execute(input: AnalyzeRivalReportInputDto): Promise<RivalReportDto> {
    const userId = String(input.userId || '').trim();
    const competitorName = String(input.competitorName || '').trim();
    const mentions = (input.mentions || []).map((m) => String(m || '').trim()).filter(Boolean);

    if (!userId) throw new Error('INVALID_USER_ID');
    if (!competitorName) throw new Error('INVALID_COMPETITOR_NAME');
    if (!mentions.length) throw new Error('EMPTY_MENTIONS');

    const corpus = mentions.join('\n').slice(0, 12000);
    if (corpus.length < 8) throw new Error('MENTIONS_TOO_SHORT');

    if (typeof this.llm.generateRivalReport !== 'function') {
      throw new Error('LLM_RIVAL_REPORT_UNSUPPORTED');
    }

    return this.llm.generateRivalReport({
      ...input,
      userId,
      competitorName,
      mentions: mentions.slice(0, 12),
    });
  }
}
