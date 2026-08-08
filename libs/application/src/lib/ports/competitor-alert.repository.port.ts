import type { CompetitorAlert, AlertWorkflowStatus } from '@responselens/domain';

export interface ICompetitorAlertRepository {
  listByUserId(userId: string, limit?: number): Promise<CompetitorAlert[]>;
  save(alert: CompetitorAlert): Promise<CompetitorAlert>;
  findByAlertId(alertId: string, userId: string): Promise<CompetitorAlert | null>;
  updateWorkflow(input: {
    alertId: string;
    userId: string;
    status?: AlertWorkflowStatus;
    notes?: string | null;
  }): Promise<CompetitorAlert>;
}
