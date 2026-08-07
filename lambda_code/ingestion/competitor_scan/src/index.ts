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

function craftPitch(companyName: string | undefined, competitorName: string, complaint: string): string {
  const brand = companyName || 'nuestra solución';
  return (
    `Si buscas una alternativa estable a ${competitorName}, ` +
    `${brand} puede ayudarte a resolver: "${complaint.slice(0, 120)}…". ` +
    `Estamos disponibles para una transición sin fricción.`
  );
}

/** Stub MVP — enchufar conectores reales (X API, news, etc.). */
async function fetchMentionsForCompetitor(
  _competitor: CompetitorProfile,
): Promise<Array<{ id?: string; text: string; sourceUrl: string; channel?: string; detectedAt?: string }>> {
  return [];
}

export const handler: ScheduledHandler = async () => {
  const configs = await userConfigs.listAll();
  let published = 0;

  for (const cfg of configs) {
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
        };

        await persistAndPublish.execute(alert);
        published += 1;
      }
    }
  }

  logger.info('scan.complete', { scannedUsers: configs.length, published });
  return { scannedUsers: configs.length, published };
};
