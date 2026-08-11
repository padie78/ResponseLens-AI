export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertWorkflowStatus = 'NEW' | 'CONTACTED' | 'SNOOZED' | 'DISMISSED' | 'WON';
export type BrandScope = 'own' | 'rival';
export type MentionKind = 'comment' | 'media';
export type SentimentLabel = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED' | string;

export interface ReplyOption {
  tone: string;
  label: string;
  body: string;
  rationale?: string;
  recommended?: boolean;
}

/** Raw opportunity shape returned by the scan engine. */
export interface ScanOpportunity {
  alertId: string;
  userId: string;
  competitorName: string;
  originalComplaint: string;
  sourceUrl: string;
  channel: string;
  severity: AlertSeverity;
  frustrationScore: number;
  salesPitch: string;
  detectedAt: string;
  status?: AlertWorkflowStatus;
  notes?: string;
  _brandScope?: BrandScope;
  _sentiment?: SentimentLabel;
  _mentionKind?: MentionKind;
  _actionable?: boolean;
  _analysisSummary?: string;
  _intel?: unknown;
  _source?: string;
  replyOptions?: ReplyOption[];
}

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
  /** Plugin-parity optional fields */
  _sentiment?: SentimentLabel;
  _mentionKind?: MentionKind;
  _actionable?: boolean;
  _analysisSummary?: string;
  _intel?: unknown;
  _source?: string;
  replyOptions?: ReplyOption[];
}

export function createAlertId(): string {
  return `al_${crypto.randomUUID().slice(0, 10)}`;
}

export function mapOpportunityToAlert(opp: ScanOpportunity, userId: string): CompetitorAlert {
  const brandScope: BrandScope = opp._brandScope === 'own' ? 'own' : 'rival';
  const sentiment =
    opp._sentiment ||
    (brandScope === 'own' ? 'NEUTRAL' : 'negative');

  return {
    alertId: opp.alertId || createAlertId(),
    userId: opp.userId || userId,
    competitorName: opp.competitorName,
    originalComplaint: opp.originalComplaint,
    sourceUrl: opp.sourceUrl,
    channel: opp.channel || 'manual',
    severity: opp.severity || 'MEDIUM',
    frustrationScore:
      typeof opp.frustrationScore === 'number' ? opp.frustrationScore : null,
    salesPitch: opp.salesPitch || '',
    detectedAt: opp.detectedAt || new Date().toISOString(),
    status: opp.status || 'NEW',
    notes: opp.notes || '',
    brandScope,
    sentiment: String(sentiment).toLowerCase(),
    inboundSource: opp._source || 'scan',
    _sentiment: opp._sentiment,
    _mentionKind: opp._mentionKind,
    _actionable: opp._actionable,
    _analysisSummary: opp._analysisSummary,
    _intel: opp._intel,
    _source: opp._source,
    replyOptions: opp.replyOptions,
  };
}
