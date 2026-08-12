import type { SQSHandler } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoKeys } from '@responselens/common';
import { getDynamoDocClient, coreTableName } from '@responselens/infrastructure';
import { searchSocialCrawlEverywhere } from './socialcrawl';
import { searchSocialCrawlMock } from './socialcrawl-mock';

type SocialCrawlJob = {
  jobId: string;
  query: string;
  lookbackDays?: number;
  sources?: string;
  mock?: boolean;
};

type JobResultPayload = {
  jobId: string;
  query: string;
  ok: boolean;
  error: string | null;
  /** Mentions array — AppSync AWSJSON + Dynamo document list */
  mentionsJson: unknown;
  rawCount: number;
  creditsUsed: number | null;
  creditsRemaining: number | null;
  coverage: number | null;
  planIntent: string | null;
  /** true when job used socialcrawl-mock (no SC API credits) */
  mock: boolean;
};

const PUBLISH_MUTATION = `
  mutation PublishSocialCrawlResult($input: PublishSocialCrawlResultInput!) {
    publishSocialCrawlResult(input: $input) {
      jobId
      ok
    }
  }
`;

async function persistJobResult(input: JobResultPayload): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 3600;
  await getDynamoDocClient().send(
    new PutCommand({
      TableName: coreTableName(),
      Item: {
        PK: DynamoKeys.socialCrawlJobPk(input.jobId),
        SK: DynamoKeys.socialCrawlJobSk(),
        entityType: 'SOCIALCRAWL_JOB',
        ttl,
        ...input,
      },
    }),
  );
}

async function publishResult(input: JobResultPayload): Promise<void> {
  const url = process.env.APPSYNC_GRAPHQL_URL || '';
  const apiKey = process.env.APPSYNC_API_KEY || '';
  if (!url || !apiKey || url.includes('placeholder')) {
    throw new Error('APPSYNC_GRAPHQL_URL/API_KEY missing on socialcrawl_worker');
  }

  const { mock: _mock, ...publishInput } = input;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query: PUBLISH_MUTATION,
      variables: { input: publishInput },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`APPSYNC_HTTP_${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`APPSYNC_GRAPHQL: ${json.errors[0].message}`);
  }
}

async function processJob(job: SocialCrawlJob): Promise<void> {
  const jobId = String(job.jobId || '').trim();
  const query = String(job.query || '').trim();
  if (!jobId || !query) {
    throw new Error('invalid_socialcrawl_job');
  }

  const useMock = Boolean(job.mock);
  console.info('socialcrawl_worker.job_start', { jobId, mock: useMock, query: query.slice(0, 80) });

  const result = useMock
    ? await searchSocialCrawlMock(query)
    : await searchSocialCrawlEverywhere({
        query,
        lookbackDays: job.lookbackDays,
        sources: job.sources,
      });

  const payload: JobResultPayload = {
    jobId,
    query,
    ok: result.ok,
    error: result.error ?? null,
    // Array/object for AppSync AWSJSON — never pre-stringify (avoids double encoding).
    mentionsJson: result.mentions ?? [],
    rawCount: result.rawCount,
    creditsUsed: result.creditsUsed,
    creditsRemaining: result.creditsRemaining,
    coverage: result.coverage,
    planIntent: result.planIntent,
    mock: useMock,
  };

  await persistJobResult(payload);
  try {
    await publishResult(payload);
  } catch (err) {
    console.error('socialcrawl_worker.publish_failed', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  console.info('socialcrawl_worker.job_done', {
    jobId,
    mock: useMock,
    ok: payload.ok,
    rawCount: payload.rawCount,
  });
}

export const handler: SQSHandler = async (event) => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const job = JSON.parse(record.body) as SocialCrawlJob;
      await processJob(job);
    } catch (err) {
      console.error('socialcrawl_worker.record_failed', {
        messageId: record.messageId,
        error: err instanceof Error ? err.message : String(err),
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
