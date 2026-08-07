export type ReplyTone = 'FORMAL_CORPORATE' | 'EMPATHETIC' | 'RESOLUTIVE_TECHNICAL';

export const REPLY_TONES: readonly ReplyTone[] = [
  'FORMAL_CORPORATE',
  'EMPATHETIC',
  'RESOLUTIVE_TECHNICAL',
] as const;

export const REPLY_TONE_LABELS: Record<ReplyTone, string> = {
  FORMAL_CORPORATE: 'Formal-Corporativa',
  EMPATHETIC: 'Empática-Cercana',
  RESOLUTIVE_TECHNICAL: 'Resolutiva-Técnica',
};

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RecommendedAction =
  | 'PUBLIC_REPLY'
  | 'PRIVATE_DM'
  | 'ESCALATE_LEGAL'
  | 'ESCALATE_SAFETY'
  | 'NO_ENGAGE';

export type EscalationFlag =
  | 'LEGAL_THREAT'
  | 'SAFETY_HARM'
  | 'DATA_PRIVACY'
  | 'CHARGEBACK'
  | 'INFLUENCER_REACH'
  | 'CHURN_SIGNAL';

export type AlertWorkflowStatus = 'NEW' | 'CONTACTED' | 'SNOOZED' | 'DISMISSED' | 'WON';
