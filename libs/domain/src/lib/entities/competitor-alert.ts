import type { AlertSeverity, AlertWorkflowStatus } from '../value-objects/reply-tone';

export interface CompetitorAlert {
  alertId: string;
  userId: string;
  competitorName: string;
  originalComplaint: string;
  sourceUrl: string;
  channel?: string | null;
  severity: AlertSeverity;
  frustrationScore?: number | null;
  salesPitch: string;
  detectedAt: string;
  status?: AlertWorkflowStatus;
  notes?: string | null;
}
