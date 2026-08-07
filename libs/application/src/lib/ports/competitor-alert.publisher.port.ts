import type { CompetitorAlert } from '@responselens/domain';

export interface ICompetitorAlertPublisher {
  publish(alert: CompetitorAlert): Promise<void>;
}
