import type { SQSHandler } from 'aws-lambda';
import { searchSocialCrawlEverywhere } from './socialcrawl';

type SocialCrawlJob = {
  jobId: string;
  query: string;
  lookbackDays?: number;
  sources?: string;
};

const PUBLISH_MUTATION = `
  mutation PublishSocialCrawlResult($input: PublishSocialCrawlResultInput!) {
    publishSocialCrawlResult(input: $input) {
      jobId
      ok
    }
  }
`;

async function publishResult(input: {
  jobId: string;
  query: string;
  ok: boolean;
  error: string | null;
  mentionsJson: string;
  rawCount: number;
  creditsUsed: number | null;
  creditsRemaining: number | null;
  coverage: number | null;
  planIntent: string | null;
}): Promise<void> {
  const url = process.env.APPSYNC_GRAPHQL_URL || '';
  const apiKey = process.env.APPSYNC_API_KEY || '';
  if (!url || !apiKey || url.includes('placeholder')) {
    throw new Error('APPSYNC_GRAPHQL_URL/API_KEY missing on socialcrawl_worker');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query: PUBLISH_MUTATION,
      variables: { input },
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

  const result = await searchSocialCrawlEverywhere({
    query,
    lookbackDays: job.lookbackDays,
    sources: job.sources,
  });

  await publishResult({
    jobId,
    query,
    ok: result.ok,
    error: result.error ?? null,
    mentionsJson: JSON.stringify(result.mentions ?? []),
    rawCount: result.rawCount,
    creditsUsed: result.creditsUsed,
    creditsRemaining: result.creditsRemaining,
    coverage: result.coverage,
    planIntent: result.planIntent,
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
