import { ValidationError, type AlertSeverity, type BrandScope, type CompetitorAlert } from '@responselens/domain';
import type { CompetitorAlertDto } from '../../dto';
import { PersistAndPublishAlertUseCase } from './competitor-alerts.use-cases';

export type InboundMentionPayload = {
  event?: string;
  userId: string;
  brandScope?: BrandScope | string | null;
  source?: string | null;
  text: string;
  sourceUrl?: string | null;
  channel?: string | null;
  detectedAt?: string | null;
  sentiment?: string | null;
  competitorName?: string | null;
  alertId?: string | null;
  severity?: AlertSeverity | string | null;
  frustrationScore?: number | null;
  salesPitch?: string | null;
};

const FRUSTRATION_RE =
  /\b(falla|fall[oó]|ca[ií]da|outage|downtime|estafa|me\s+cambio|no\s+funciona|terrible|awful|scam|refund|horrible)\b/i;

function scoreFrustration(text: string): number {
  const hits = text.match(new RegExp(FRUSTRATION_RE.source, 'gi'));
  if (!hits?.length) return 0.35;
  return Number(Math.min(0.35 + hits.length * 0.18, 0.97).toFixed(2));
}

function severityFromScore(score: number): AlertSeverity {
  if (score >= 0.85) return 'CRITICAL';
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function normalizeScope(raw: string | null | undefined): BrandScope {
  const s = String(raw || '').toLowerCase().trim();
  return s === 'own' || s === 'propios' || s === 'brand' ? 'own' : 'rival';
}

function normalizeSeverity(raw: string | null | undefined, fallback: AlertSeverity): AlertSeverity {
  const s = String(raw || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') return s;
  return fallback;
}

function defaultPitch(scope: BrandScope, brandOrRival: string, text: string): string {
  const snip = text.slice(0, 120);
  if (scope === 'own') {
    return (
      `Gracias por el comentario sobre ${brandOrRival}. ` +
      `Lo tomamos en serio ("${snip}${text.length > 120 ? '…' : ''}"). ` +
      `Si preferís, continuamos por DM para resolverlo.`
    );
  }
  return (
    `Vi tu comentario sobre ${brandOrRival}. ` +
    `Si buscás una alternativa más estable, podemos ayudarte ` +
    `("${snip}${text.length > 120 ? '…' : ''}").`
  );
}

/**
 * Normaliza un webhook entrante (Mention / Meltwater / Brandwatch / Zapier)
 * a CompetitorAlert y lo persiste + publica por AppSync.
 */
export class IngestInboundMentionUseCase {
  constructor(private readonly persistAndPublish: PersistAndPublishAlertUseCase) {}

  async execute(raw: InboundMentionPayload): Promise<CompetitorAlertDto> {
    const userId = String(raw.userId || '').trim();
    const text = String(raw.text || '').trim();
    if (!userId) throw new ValidationError('userId is required');
    if (!text) throw new ValidationError('text is required');

    const brandScope = normalizeScope(raw.brandScope);
    const score =
      typeof raw.frustrationScore === 'number' && Number.isFinite(raw.frustrationScore)
        ? Math.min(1, Math.max(0, raw.frustrationScore))
        : scoreFrustration(text);
    const severity = normalizeSeverity(raw.severity, severityFromScore(score));
    const competitorName =
      String(raw.competitorName || '').trim() || (brandScope === 'own' ? 'Tu marca' : 'Rival');
    const detectedAt = String(raw.detectedAt || '').trim() || new Date().toISOString();
    const alertId =
      String(raw.alertId || '').trim() ||
      `inb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    const alert: CompetitorAlert = {
      alertId,
      userId,
      competitorName,
      originalComplaint: text,
      sourceUrl: String(raw.sourceUrl || '').trim() || `inbound://${raw.source || 'webhook'}`,
      channel: String(raw.channel || '').trim() || 'webhook',
      severity,
      frustrationScore: score,
      salesPitch: String(raw.salesPitch || '').trim() || defaultPitch(brandScope, competitorName, text),
      detectedAt,
      status: 'NEW',
      brandScope,
      sentiment: raw.sentiment ? String(raw.sentiment).toUpperCase() : null,
      inboundSource: raw.source ? String(raw.source).trim().slice(0, 64) : 'webhook',
      notes: raw.event ? `event:${String(raw.event).slice(0, 80)}` : null,
    };

    return this.persistAndPublish.execute(alert);
  }
}
