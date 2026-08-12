import type { AlertSeverity, AlertWorkflowStatus } from '../value-objects/reply-tone';

/** Origen de alcance: marca propia (reputación) vs rival (captación). */
export type BrandScope = 'own' | 'rival';

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
  /** own = Propios; rival / omitido = Competencia */
  brandScope?: BrandScope | null;
  sentiment?: string | null;
  /** mention | brandwatch | meltwater | sprout | zapier | … */
  inboundSource?: string | null;
  /** SPA enrichment (_scMeta, AI scores, …) persisted as Dynamo/AppSync AWSJSON */
  metaJson?: Record<string, unknown> | null;
}
