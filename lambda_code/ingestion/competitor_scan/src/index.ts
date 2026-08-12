import { PersistAndPublishAlertUseCase } from '@responselens/application';
import {
  AppSyncCompetitorAlertPublisher,
  ConsoleLogger,
  DynamoDbCompetitorAlertRepository,
  DynamoDbUserConfigRepository,
} from '@responselens/infrastructure';
import type { AlertSeverity, CompetitorAlert, CompetitorProfile } from '@responselens/domain';
import { randomUUID } from 'crypto';
import type { ScheduledHandler } from 'aws-lambda';
import { fetchLiveMentions } from './reddit-mentions';
import { searchSocialCrawlEverywhere } from './socialcrawl';

const logger = new ConsoleLogger({ source: 'competitor_scan' });
const userConfigs = new DynamoDbUserConfigRepository();
const alerts = new DynamoDbCompetitorAlertRepository();
const publisher = new AppSyncCompetitorAlertPublisher();
const persistAndPublish = new PersistAndPublishAlertUseCase(alerts, publisher);

const FRUSTRATION_RE =
  /\b(falla|fall[oó]|ca[ií]da|outage|downtime|estafa|me\s+cambio|no\s+funciona|terrible|awful|scam|refund)\b/i;

function scoreFrustration(text: string): number {
  const hits = text.match(new RegExp(FRUSTRATION_RE.source, 'gi'));
  if (!hits?.length) return 0;
  return Number(Math.min(0.35 + hits.length * 0.2, 0.95).toFixed(2));
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
      `("${snip}${more}"). ` +
      `We're available for a low-friction transition.`
    );
  }
  return (
    `Vi tu comentario sobre ${competitorName}. ` +
    `Si buscas una alternativa más estable, ${brand} puede ayudarte a resolver eso ` +
    `("${snip}${more}"). ` +
    `Estamos disponibles para una transición sin fricción.`
  );
}

async function fetchMentionsForCompetitor(
  competitor: CompetitorProfile,
): Promise<
  Array<{
    id?: string;
    text: string;
    sourceUrl: string;
    channel?: string;
    detectedAt?: string;
    _scMeta?: unknown;
  }>
> {
  const out: Array<{
    id?: string;
    text: string;
    sourceUrl: string;
    channel?: string;
    detectedAt?: string;
    _scMeta?: unknown;
  }> = [];
  try {
    out.push(...(await fetchLiveMentions(competitor.name)));
  } catch (err) {
    logger.warn('mentions.fetch_failed', {
      competitor: competitor.name,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const sc = await searchSocialCrawlEverywhere({
      query: competitor.name,
      lookbackDays: Number(process.env.SOCIALCRAWL_LOOKBACK_DAYS) || 7,
      sources: process.env.SOCIALCRAWL_SOURCES || '',
    });
    if (!sc.ok) {
      logger.warn('socialcrawl.fetch_failed', { competitor: competitor.name, error: sc.error });
    } else {
      for (const m of sc.mentions) {
        out.push({
          id: m.id,
          text: m.text,
          sourceUrl: m.sourceUrl,
          channel: m.channel,
          detectedAt: m.detectedAt,
          _scMeta: m._scMeta,
        });
      }
      logger.info('socialcrawl.ok', {
        competitor: competitor.name,
        count: sc.mentions.length,
        creditsRemaining: sc.creditsRemaining,
      });
    }
  } catch (err) {
    logger.warn('socialcrawl.exception', {
      competitor: competitor.name,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}

export const handler: ScheduledHandler = async () => {
  const configs = await userConfigs.listAll();
  let published = 0;

  for (const cfg of configs) {
    const companyName = String(cfg.company?.companyName || '').trim();
    if (companyName && companyName.toLowerCase() !== 'tumarca') {
      const ownAsCompetitor: CompetitorProfile = {
        name: companyName,
        aliases: [],
        websiteUrl: null,
        socialHandles: [],
      };
      const ownMentions = await fetchMentionsForCompetitor(ownAsCompetitor);
      for (const mention of ownMentions) {
        // Propios: umbral más bajo (reputación; no solo quejas fuertes).
        const score = scoreFrustration(mention.text);
        if (score < 0.28 && !FRUSTRATION_RE.test(mention.text)) continue;

        const detectedAt = mention.detectedAt || new Date().toISOString();
        const alert: CompetitorAlert = {
          alertId: mention.id || randomUUID(),
          userId: cfg.userId,
          competitorName: companyName,
          originalComplaint: mention.text,
          sourceUrl: mention.sourceUrl,
          channel: mention.channel || 'web',
          severity: severityFromScore(Math.max(score, 0.4)),
          frustrationScore: score,
          salesPitch: '',
          detectedAt,
          brandScope: 'own',
          inboundSource: 'cron',
          metaJson: mention._scMeta
            ? { _scMeta: mention._scMeta as Record<string, unknown>, _source: 'socialcrawl' }
            : { _source: 'socialcrawl' },
        };

        await persistAndPublish.execute(alert);
        published += 1;
      }
    }

    for (const competitor of cfg.competitors ?? []) {
      const mentions = await fetchMentionsForCompetitor(competitor);
      for (const mention of mentions) {
        const score = scoreFrustration(mention.text);
        if (score < 0.5) continue;

        const detectedAt = mention.detectedAt || new Date().toISOString();
        const alert: CompetitorAlert = {
          alertId: mention.id || randomUUID(),
          userId: cfg.userId,
          competitorName: competitor.name,
          originalComplaint: mention.text,
          sourceUrl: mention.sourceUrl,
          channel: mention.channel || 'web',
          severity: severityFromScore(score),
          frustrationScore: score,
          salesPitch: craftPitch(cfg.company?.companyName, competitor.name, mention.text),
          detectedAt,
          brandScope: 'rival',
          inboundSource: 'cron',
          metaJson: mention._scMeta
            ? { _scMeta: mention._scMeta as Record<string, unknown>, _source: 'socialcrawl' }
            : { _source: 'socialcrawl' },
        };

        await persistAndPublish.execute(alert);
        published += 1;
      }
    }
  }

  logger.info('scan.complete', { scannedUsers: configs.length, published });
  return { scannedUsers: configs.length, published };
};
