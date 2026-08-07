import type {
  EscalationFlag,
  RecommendedAction,
  ReplyTone,
  RiskLevel,
} from '../value-objects/reply-tone';

export interface ReplyOption {
  tone: ReplyTone;
  label: string;
  body: string;
  rationale?: string | null;
}

export interface ComplaintTriage {
  riskScore: number;
  riskLevel: RiskLevel;
  escalationFlags: EscalationFlag[];
  recommendedAction: RecommendedAction;
  keyIssues: string[];
  summary: string;
}

export interface ReplyOptions {
  complaintId?: string | null;
  sourceUrl?: string | null;
  channel?: string | null;
  originalText: string;
  options: ReplyOption[];
  triage: ComplaintTriage;
  model: string;
  generatedAt: string;
}
