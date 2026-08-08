/**
 * Port: push de oportunidades / fichas hacia CRMs externos.
 */

export interface CrmOpportunityPayload {
  alertId: string;
  userId: string;
  competitorName: string;
  originalComplaint: string;
  sourceUrl?: string | null;
  channel?: string | null;
  severity?: string | null;
  frustrationScore?: number | null;
  salesPitch?: string | null;
  status?: string | null;
  detectedAt?: string | null;
  companyName?: string | null;
  reportMarkdown?: string | null;
}

export interface CrmPushResult {
  provider: string;
  ok: boolean;
  externalId?: string;
  detail?: string;
}

export interface ICrmPort {
  readonly providerId: string;
  pushOpportunity(payload: CrmOpportunityPayload): Promise<CrmPushResult>;
}
