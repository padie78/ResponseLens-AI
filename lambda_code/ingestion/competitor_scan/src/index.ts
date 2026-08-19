import {
  AlertDedupeIndex,
  PersistAndPublishAlertUseCase,
  mapScanMentionToAlert,
} from '@responselens/application';
import {
  AppSyncCompetitorAlertPublisher,
  ConsoleLogger,
  DynamoDbCompetitorAlertRepository,
  DynamoDbUserConfigRepository,
} from '@responselens/infrastructure';
import type { CompetitorAlert, CompetitorProfile } from '@responselens/domain';
import type { ScheduledHandler } from 'aws-lambda';
import { fetchLiveMentions } from './reddit-mentions';
import { searchSocialCrawl } from './search-socialcrawl';
import { isExternalApisMock } from '../../../shared/external-apis-mock';

const logger = new ConsoleLogger({ source: 'competitor_scan' });
const userConfigs = new DynamoDbUserConfigRepository();
const alertsRepo = new DynamoDbCompetitorAlertRepository();
const publisher = new AppSyncCompetitorAlertPublisher();
const persistAndPublish = new PersistAndPublishAlertUseCase(alertsRepo, publisher);

const MAX_RIVALS = Math.min(Math.max(Number(process.env.COMPETITOR_SCAN_MAX_RIVALS) || 5, 1), 8);
const LOOKBACK_DAYS = Math.min(
  Math.max(Number(process.env.SOCIALCRAWL_CRON_LOOKBACK_DAYS) || 2, 1),
  7,
);

type Mention = {
  id?: string;
  text: string;
  sourceUrl: string;
  channel?: string;
  detectedAt?: string;
  _scMeta?: unknown;
};

async function fetchMentionsForName(name: string): Promise<Mention[]> {
  const out: Mention[] = [];
  try {
    if (!isExternalApisMock()) {
      out.push(...(await fetchLiveMentions(name)));
    }
  } catch (err) {
    logger.warn('mentions.fetch_failed', {
      query: name,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const sc = await searchSocialCrawl({
      query: name,
      lookbackDays: LOOKBACK_DAYS,
      sources: process.env.SOCIALCRAWL_SOURCES || '',
    });
    if (!sc.ok) {
      logger.warn('socialcrawl.fetch_failed', { query: name, error: sc.error });
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
        query: name,
        count: sc.mentions.length,
        creditsRemaining: sc.creditsRemaining,
        lookbackDays: LOOKBACK_DAYS,
      });
    }
  } catch (err) {
    logger.warn('socialcrawl.exception', {
      query: name,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}

async function persistMentions(opts: {
  userId: string;
  competitorName: string;
  brandScope: 'own' | 'rival';
  companyName?: string;
  mentions: Mention[];
  index: AlertDedupeIndex;
}): Promise<{ published: number; skippedDupes: number }> {
  let published = 0;
  let skippedDupes = 0;
  for (const mention of opts.mentions) {
    if (!String(mention.text || '').trim()) continue;
    const alert: CompetitorAlert = mapScanMentionToAlert({
      userId: opts.userId,
      competitorName: opts.competitorName,
      brandScope: opts.brandScope,
      inboundSource: 'cron',
      companyName: opts.companyName,
      mention,
    });
    if (opts.index.has(alert)) {
      skippedDupes += 1;
      continue;
    }
    await persistAndPublish.execute(alert);
    opts.index.add(alert);
    published += 1;
  }
  return { published, skippedDupes };
}

export const handler: ScheduledHandler = async () => {
  const configs = await userConfigs.listAll();
  let published = 0;
  let skippedDupes = 0;
  let queryCount = 0;

  for (const cfg of configs) {
    const companyName = String(cfg.company?.companyName || '').trim();
    const rivals = (cfg.competitors ?? [])
      .map((c: CompetitorProfile) => ({
        name: String(c.name || '').trim(),
      }))
      .filter((c) => c.name)
      .slice(0, MAX_RIVALS);

    const existing = await alertsRepo.listByUserId(cfg.userId, 200);
    const index = new AlertDedupeIndex(existing);
    const passQueries: string[] = [];

    if (companyName && companyName.toLowerCase() !== 'tumarca') {
      passQueries.push(companyName);
      queryCount += 1;
      const ownMentions = await fetchMentionsForName(companyName);
      const own = await persistMentions({
        userId: cfg.userId,
        competitorName: companyName,
        brandScope: 'own',
        companyName,
        mentions: ownMentions,
        index,
      });
      published += own.published;
      skippedDupes += own.skippedDupes;
    }

    for (const rival of rivals) {
      passQueries.push(rival.name);
      queryCount += 1;
      const mentions = await fetchMentionsForName(rival.name);
      const rivalOut = await persistMentions({
        userId: cfg.userId,
        competitorName: rival.name,
        brandScope: 'rival',
        companyName,
        mentions,
        index,
      });
      published += rivalOut.published;
      skippedDupes += rivalOut.skippedDupes;
    }

    logger.info('scan.pass', {
      userId: cfg.userId,
      queries: passQueries.length,
      queryNames: passQueries,
      rivals: rivals.length,
      maxRivals: MAX_RIVALS,
      lookbackDays: LOOKBACK_DAYS,
      mock: isExternalApisMock(),
    });
  }

  logger.info('scan.complete', {
    scannedUsers: configs.length,
    published,
    skippedDupes,
    queryCount,
    lookbackDays: LOOKBACK_DAYS,
    maxRivals: MAX_RIVALS,
    mock: isExternalApisMock(),
  });
  return { scannedUsers: configs.length, published, skippedDupes, queryCount };
};
