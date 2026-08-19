import { AlertDedupeIndex, stableAlertId } from '@responselens/common';
import type { AlertSeverity, BrandScope, CompetitorAlert } from '@responselens/domain';

export { AlertDedupeIndex, stableAlertId };

const FRUSTRATION_RE =
  /\b(falla|fall[oó]|ca[ií]da|outage|downtime|estafa|me\s+cambio|no\s+funciona|terrible|awful|scam|refund|horrible|pésim|basura|broken|crash|lawsuit|demanda)\b/i;

export type ScanMentionInput = {
  id?: string;
  text: string;
  sourceUrl: string;
  channel?: string;
  detectedAt?: string;
  _scMeta?: unknown;
};

export type MapScanMentionOpts = {
  userId: string;
  competitorName: string;
  brandScope: BrandScope;
  inboundSource: 'cron' | 'scan';
  companyName?: string;
  mention: ScanMentionInput;
};

function scoreFrustration(text: string): number {
  const hits = text.match(new RegExp(FRUSTRATION_RE.source, 'gi'));
  if (!hits?.length) return 0.08;
  return Number(Math.min(0.32 + hits.length * 0.14, 0.97).toFixed(2));
}

function severityFromScore(score: number): AlertSeverity {
  if (score >= 0.85) return 'CRITICAL';
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function detectLang(text: string): 'en' | 'es' {
  const t = text || '';
  const es = (t.match(/\b(el|la|de|que|no|me|por|con|está|falla|estafa|horrible)\b/gi) || []).length;
  const en = (t.match(/\b(the|and|is|to|of|for|not|scam|broken|terrible)\b/gi) || []).length;
  if (en > es + 1) return 'en';
  if (/[áéíóúñ¿¡]/i.test(t)) return 'es';
  return es >= en ? 'es' : 'en';
}

function craftPitch(companyName: string | undefined, competitorName: string, complaint: string): string {
  const lang = detectLang(complaint);
  const brand = companyName || (lang === 'en' ? 'our solution' : 'nuestra solución');
  const snip = complaint.slice(0, 100);
  const more = complaint.length > 100 ? '…' : '';
  if (lang === 'en') {
    return (
      `Saw your comment about ${competitorName}. ` +
      `If you're looking for a more stable alternative, ${brand} can help with that ` +
      `("${snip}${more}").`
    );
  }
  return (
    `Vi tu comentario sobre ${competitorName}. ` +
    `Si buscas una alternativa más estable, ${brand} puede ayudarte a resolver eso ` +
    `("${snip}${more}").`
  );
}

function sentimentGuess(text: string, brandScope: BrandScope): string {
  if (FRUSTRATION_RE.test(text)) return 'negative';
  if (/\b(love|great|excellent|gracias|excelente|recomiendo)\b/i.test(text)) return 'positive';
  return brandScope === 'own' ? 'neutral' : 'negative';
}

/**
 * Misma forma de alerta que el SPA (`mapOpportunityToAlert`): brandScope, _scMeta, id estable.
 */
export function mapScanMentionToAlert(opts: MapScanMentionOpts): CompetitorAlert {
  const { mention, brandScope, userId, competitorName } = opts;
  const text = String(mention.text || '').trim();
  const score = scoreFrustration(text);
  const alertId = stableAlertId({
    alertId: mention.id,
    sourceUrl: mention.sourceUrl,
    originalComplaint: text,
    competitorName,
    brandScope,
  });
  const scMeta =
    mention._scMeta && typeof mention._scMeta === 'object'
      ? (mention._scMeta as Record<string, unknown>)
      : null;

  return {
    alertId,
    userId,
    competitorName,
    originalComplaint: text,
    sourceUrl: mention.sourceUrl || 'unknown://',
    channel: mention.channel || 'web',
    severity: severityFromScore(brandScope === 'own' ? Math.max(score, 0.4) : score),
    frustrationScore: score,
    salesPitch: brandScope === 'rival' ? craftPitch(opts.companyName, competitorName, text) : '',
    detectedAt: mention.detectedAt || new Date().toISOString(),
    status: 'NEW',
    brandScope,
    sentiment: sentimentGuess(text, brandScope),
    inboundSource: opts.inboundSource,
    metaJson: {
      ...(scMeta ? { _scMeta: scMeta } : {}),
      _source: 'socialcrawl',
      _brandScope: brandScope,
    },
  };
}
