import { Injectable } from '@angular/core';
import { buildLocalReplyOptions } from '../engine/local-fallback.js';

export interface LocalReplyResult {
  originalText: string;
  options: Array<{
    tone: string;
    label: string;
    body: string;
    rationale?: string;
    recommended?: boolean;
  }>;
  triage: {
    riskScore: number;
    riskLevel: string;
    escalationFlags: string[];
    recommendedAction: string;
    keyIssues: string[];
    summary: string;
  };
  model: string;
  generatedAt: string;
  language: string;
}

@Injectable({ providedIn: 'root' })
export class ReplyService {
  analyzeLocal(text: string, companyName: string): LocalReplyResult {
    return buildLocalReplyOptions({ text, companyName }) as LocalReplyResult;
  }
}
