import { ValidationError, type CompetitorAlert } from '@responselens/domain';
import type { CompetitorAlertDto } from '../../dto';
import type { ICompetitorAlertPublisher, ICompetitorAlertRepository } from '../../ports';

export class ListCompetitorAlertsUseCase {
  constructor(private readonly repository: ICompetitorAlertRepository) {}

  async execute(input: { userId: string; limit?: number | null }): Promise<CompetitorAlertDto[]> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    return this.repository.listByUserId(input.userId.trim(), input.limit ?? undefined);
  }
}

export class PersistAndPublishAlertUseCase {
  constructor(
    private readonly repository: ICompetitorAlertRepository,
    private readonly publisher: ICompetitorAlertPublisher,
  ) {}

  async execute(alert: CompetitorAlert): Promise<CompetitorAlertDto> {
    const saved = await this.repository.save(alert);
    await this.publisher.publish(saved);
    return saved;
  }
}
