export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertWorkflowStatus = 'NEW' | 'CONTACTED' | 'SNOOZED' | 'DISMISSED' | 'WON';
export type BrandScope = 'own' | 'rival';

export interface CompetitorAlert {
  alertId: string;
  userId: string;
  competitorName: string;
  originalComplaint: string;
  sourceUrl: string;
  channel: string;
  severity: AlertSeverity;
  frustrationScore: number | null;
  salesPitch: string;
  detectedAt: string;
  status: AlertWorkflowStatus;
  notes: string;
  brandScope: BrandScope;
  sentiment: string;
  inboundSource: string;
}

export function createAlertId(): string {
  return `al_${crypto.randomUUID().slice(0, 10)}`;
}
