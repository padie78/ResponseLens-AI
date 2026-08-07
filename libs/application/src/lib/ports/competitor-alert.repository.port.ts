import type { CompetitorAlert } from '@responselens/domain';

export interface ICompetitorAlertRepository {
  listByUserId(userId: string, limit?: number): Promise<CompetitorAlert[]>;
  save(alert: CompetitorAlert): Promise<CompetitorAlert>;
}
