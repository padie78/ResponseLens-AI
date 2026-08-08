import { NotFoundError, ValidationError, type CompetitorAlert } from '@responselens/domain';
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
    const saved = await this.repository.save({
      ...alert,
      status: alert.status || 'NEW',
    });
    await this.publisher.publish(saved);
    return saved;
  }
}

/** Persiste en DynamoDB (y publica realtime si el publisher tiene AppSync env). */
export class UpsertCompetitorAlertUseCase {
  constructor(
    private readonly repository: ICompetitorAlertRepository,
    private readonly publisher: ICompetitorAlertPublisher,
  ) {}

  async execute(alert: CompetitorAlert): Promise<CompetitorAlertDto> {
    if (!alert.userId?.trim() || !alert.alertId?.trim()) {
      throw new ValidationError('userId and alertId are required');
    }
    if (!alert.competitorName?.trim() || !alert.originalComplaint?.trim()) {
      throw new ValidationError('competitorName and originalComplaint are required');
    }
    const saved = await this.repository.save({
      ...alert,
      status: alert.status || 'NEW',
      detectedAt: alert.detectedAt || new Date().toISOString(),
      salesPitch: alert.salesPitch || '',
      sourceUrl: alert.sourceUrl || 'unknown://',
      severity: alert.severity || 'MEDIUM',
    });
    try {
      await this.publisher.publish(saved);
    } catch {
      /* realtime best-effort; Dynamo ya tiene la alerta */
    }
    return saved;
  }
}

export class UpdateCompetitorAlertUseCase {
  constructor(private readonly repository: ICompetitorAlertRepository) {}

  async execute(input: {
    userId: string;
    alertId: string;
    status?: CompetitorAlert['status'];
    notes?: string | null;
  }): Promise<CompetitorAlertDto> {
    if (!input.userId?.trim() || !input.alertId?.trim()) {
      throw new ValidationError('userId and alertId are required');
    }
    if (!input.status && input.notes === undefined) {
      throw new ValidationError('status or notes is required');
    }
    try {
      return await this.repository.updateWorkflow({
        userId: input.userId.trim(),
        alertId: input.alertId.trim(),
        status: input.status,
        notes: input.notes,
      });
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw err;
    }
  }
}
