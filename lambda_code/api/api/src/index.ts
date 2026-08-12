import type { AppSyncResolverHandler } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoKeys } from '@responselens/common';
import { coreTableName, getDynamoDocClient } from '@responselens/infrastructure';
import {
  analyzeReply,
  analyzeRivalReport,
  getUserConfig,
  listCompetitorAlerts,
  saveUserConfig,
  updateCompetitorAlert,
  upsertCompetitorAlert,
} from './composition-root';
import { searchSocialCrawlEverywhere } from './socialcrawl';

type Args = Record<string, unknown>;

const sqs = new SQSClient({});

function fieldName(event: { info?: { fieldName?: string }; fieldName?: string }): string {
  return event.info?.fieldName || event.fieldName || '';
}

export const handler: AppSyncResolverHandler<Args, unknown> = async (event) => {
  const op = fieldName(event);
  const args = (event.arguments || {}) as Args;

  switch (op) {
    case 'analyzeReply':
      return analyzeReply.execute(args.input as Parameters<typeof analyzeReply.execute>[0]);

    case 'analyzeRivalReport':
      return analyzeRivalReport.execute(
        args.input as Parameters<typeof analyzeRivalReport.execute>[0],
      );

    case 'getUserConfig':
      return getUserConfig.execute({ userId: String(args.userId) });

    case 'saveUserConfig':
      return saveUserConfig.execute(args.input as Parameters<typeof saveUserConfig.execute>[0]);

    case 'listCompetitorAlerts':
      return listCompetitorAlerts.execute({
        userId: String(args.userId),
        limit: args.limit as number | null | undefined,
      });

    case 'upsertCompetitorAlert':
      return upsertCompetitorAlert.execute(
        args.input as Parameters<typeof upsertCompetitorAlert.execute>[0],
      );

    case 'updateCompetitorAlert':
      return updateCompetitorAlert.execute(
        args.input as Parameters<typeof updateCompetitorAlert.execute>[0],
      );

    case 'getSocialCrawlJob': {
      const jobId = String(args.jobId || '').trim();
      if (!jobId) return null;
      const res = await getDynamoDocClient().send(
        new GetCommand({
          TableName: coreTableName(),
          Key: {
            PK: DynamoKeys.socialCrawlJobPk(jobId),
            SK: DynamoKeys.socialCrawlJobSk(),
          },
        }),
      );
      const item = res.Item;
      if (!item) return null;
      let mentionsJson: unknown = item.mentionsJson ?? [];
      // Legacy rows may store a JSON string (possibly double-encoded).
      for (let i = 0; i < 3 && typeof mentionsJson === 'string'; i += 1) {
        try {
          mentionsJson = JSON.parse(mentionsJson);
        } catch {
          mentionsJson = [];
          break;
        }
      }
      if (!Array.isArray(mentionsJson)) mentionsJson = [];
      return {
        jobId: String(item.jobId ?? jobId),
        query: String(item.query ?? ''),
        ok: Boolean(item.ok),
        error: item.error != null ? String(item.error) : null,
        mentionsJson,
        rawCount: Number(item.rawCount ?? 0),
        creditsUsed: typeof item.creditsUsed === 'number' ? item.creditsUsed : null,
        creditsRemaining:
          typeof item.creditsRemaining === 'number' ? item.creditsRemaining : null,
        coverage: typeof item.coverage === 'number' ? item.coverage : null,
        planIntent: item.planIntent != null ? String(item.planIntent) : null,
      };
    }

    case 'startSocialCrawlSearch': {
      const input = (args.input || {}) as {
        query?: string;
        lookbackDays?: number;
        sources?: string;
        jobId?: string;
        mock?: boolean;
      };
      const query = String(input.query || '')
        .replace(/["']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 512);
      if (!query) {
        throw new Error('empty_query');
      }
      const queueUrl = process.env.SOCIALCRAWL_JOB_QUEUE_URL || '';
      if (!queueUrl) {
        throw new Error('SOCIALCRAWL_JOB_QUEUE_URL missing on server');
      }
      const jobId = String(input.jobId || randomUUID())
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            jobId,
            query,
            lookbackDays:
              input.lookbackDays ?? (Number(process.env.SOCIALCRAWL_LOOKBACK_DAYS) || 3),
            sources: input.sources || process.env.SOCIALCRAWL_SOURCES || '',
            mock: Boolean(input.mock),
          }),
        }),
      );
      return { jobId, status: input.mock ? 'QUEUED_MOCK' : 'QUEUED' };
    }

    case 'searchSocialMentions': {
      const input = (args.input || {}) as {
        query?: string;
        lookbackDays?: number;
        sources?: string;
      };
      const result = await searchSocialCrawlEverywhere({
        query: String(input.query || ''),
        lookbackDays:
          input.lookbackDays ?? (Number(process.env.SOCIALCRAWL_LOOKBACK_DAYS) || 3),
        sources: input.sources || process.env.SOCIALCRAWL_SOURCES || '',
      });
      return {
        ok: result.ok,
        error: result.error ?? null,
        mentionsJson: result.mentions,
        rawCount: result.rawCount,
        creditsUsed: result.creditsUsed,
        creditsRemaining: result.creditsRemaining,
        coverage: result.coverage,
        planIntent: result.planIntent,
      };
    }

    case 'ping':
      return `pong:${String(args.message ?? '')}`;

    default:
      throw new Error(`UNSUPPORTED_FIELD: ${op}`);
  }
};
