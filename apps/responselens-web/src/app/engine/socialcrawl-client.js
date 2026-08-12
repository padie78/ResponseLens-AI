/**
 * Cliente SocialCrawl vía AppSync async (SQS worker + subscription + poll Dynamo).
 * La API key vive SOLO en Lambda (Terraform `socialcrawl_api_key`).
 * El SPA nunca almacena ni envía `sc_…`.
 */

import { generateClient } from 'aws-amplify/api';
import { environment } from '../../environments/environment';
import { loadScanCredentials } from './scan-credentials.js';
import { normalizePlatformChannel } from './platforms.js';
import { isSocialCrawlMock } from './socialcrawl-mock.js';
import { socialCrawlEverywhereSourcesCsv } from './socialcrawl-sources.js';

const JOB_WAIT_MS = 100_000;
const POLL_MS = 2_000;

/**
 * Preferencias locales (lookback/sources) — sin API key.
 * Mock y real requieren AppSync (misma cola SQS / worker).
 */
export function hasSocialCrawlServer() {
  return Boolean(environment.appsync?.endpoint && environment.appsync?.apiKey);
}

/** @deprecated Use hasSocialCrawlServer — la key ya no vive en el cliente. */
export function hasSocialCrawl(credentials) {
  void credentials;
  return hasSocialCrawlServer();
}

/**
 * @param {object | null} _credentials Ignorado (compat). Key solo en servidor.
 * @param {string} brandOrRivalName
 * @param {{ lookbackDays?: number, sources?: string, mock?: boolean }} [opts]
 */
export async function fetchSocialCrawlMentions(_credentials, brandOrRivalName, opts = {}) {
  if (!hasSocialCrawlServer()) {
    return {
      mentions: [],
      error: 'SocialCrawl server off — falta AppSync (npm run sync:env)',
      skipped: true,
    };
  }

  const name = String(brandOrRivalName || '')
    .replace(/["']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return { mentions: [], error: 'empty_name', skipped: false };

  const prefs = await loadScanCredentials();
  const lookback =
    opts.lookbackDays ??
    Number(prefs.socialcrawl?.lookbackDays) ??
    7;
  const sources =
    opts.sources != null && String(opts.sources).trim()
      ? String(opts.sources).trim()
      : socialCrawlEverywhereSourcesCsv();
  const mock = opts.mock === true || isSocialCrawlMock();

  const result = await searchViaAppSyncJob({
    query: name,
    lookbackDays: lookback,
    sources,
    mock,
  });

  if (!result.ok) {
    return {
      mentions: [],
      error: result.error || 'socialcrawl_proxy_failed',
      skipped: false,
      status: result.status,
    };
  }

  const mentions = (result.mentions || [])
    .map((m) => normalizeMention(m))
    .filter((m) => m && m.text && m.text.length >= 8);

  return {
    mentions,
    error: null,
    skipped: false,
    rawCount: result.rawCount ?? mentions.length,
    creditsUsed: result.creditsUsed,
    creditsRemaining: result.creditsRemaining,
    sourcesSucceeded: result.sourcesSucceeded || [],
    sourcesFailed: result.sourcesFailed || {},
    coverage: result.coverage,
    partialFailure: false,
    planIntent: result.planIntent,
    clusterCount: 0,
    mock,
  };
}

const START_MUTATION = `
  mutation StartSocialCrawlSearch($input: StartSocialCrawlSearchInput!) {
    startSocialCrawlSearch(input: $input) {
      jobId
      status
    }
  }
`;

const RESULT_SUBSCRIPTION = `
  subscription OnSocialCrawlResult($jobId: ID!) {
    onSocialCrawlResult(jobId: $jobId) {
      jobId
      query
      ok
      error
      mentionsJson
      rawCount
      creditsUsed
      creditsRemaining
      coverage
      planIntent
    }
  }
`;

const GET_JOB_QUERY = `
  query GetSocialCrawlJob($jobId: ID!) {
    getSocialCrawlJob(jobId: $jobId) {
      jobId
      query
      ok
      error
      mentionsJson
      rawCount
      creditsUsed
      creditsRemaining
      coverage
      planIntent
    }
  }
`;

/**
 * @param {{ query: string, lookbackDays?: number, sources?: string, mock?: boolean }} input
 */
async function searchViaAppSyncJob(input) {
  const endpoint = environment.appsync.endpoint;
  const apiKey = environment.appsync.apiKey;
  const jobId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `scjob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const pending = subscribeJobResult(jobId, JOB_WAIT_MS);
  await new Promise((r) => setTimeout(r, 400));

  let resolvedJobId = jobId;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: START_MUTATION,
        variables: {
          input: {
            query: input.query,
            lookbackDays: input.lookbackDays ?? 3,
            sources: input.sources || null,
            jobId,
            mock: Boolean(input.mock),
          },
        },
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      pending.unsubscribe();
      return { ok: false, error: `AppSync HTTP ${res.status}`, status: res.status };
    }
    if (json?.errors?.length) {
      pending.unsubscribe();
      return { ok: false, error: json.errors[0]?.message || 'appsync_error', status: res.status };
    }
    const started = json?.data?.startSocialCrawlSearch;
    if (!started?.jobId) {
      pending.unsubscribe();
      return { ok: false, error: 'empty_appsync_response' };
    }
    resolvedJobId = String(started.jobId);
  } catch (err) {
    pending.unsubscribe();
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    // Subscription can win early; poll is the reliable fallback (Dynamo).
    const data = await Promise.race([
      pending.result.catch(() => new Promise(() => {})),
      pollJobResult(resolvedJobId, JOB_WAIT_MS),
    ]);
    pending.unsubscribe();
    return normalizeJobPayload(data);
  } catch (err) {
    pending.unsubscribe();
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {unknown} data
 */
function normalizeJobPayload(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'empty_job_result' };
  }
  const row = /** @type {Record<string, unknown>} */ (data);
  if (!row.ok) return { ok: false, error: String(row.error || 'socialcrawl_failed') };

  const mentions = coerceMentionsJson(row.mentionsJson);
  return {
    ok: true,
    mentions,
    rawCount: row.rawCount ?? mentions.length,
    creditsUsed: row.creditsUsed,
    creditsRemaining: row.creditsRemaining,
    coverage: row.coverage,
    planIntent: row.planIntent,
  };
}

/**
 * AppSync AWSJSON + JSON.stringify en el worker a veces dejan el payload
 * doble-encodeado (string que contiene el JSON array).
 * @param {unknown} raw
 * @returns {unknown[]}
 */
function coerceMentionsJson(raw) {
  let cur = raw;
  for (let i = 0; i < 3; i += 1) {
    if (Array.isArray(cur)) return cur;
    if (typeof cur !== 'string') break;
    const s = cur.trim();
    if (!s) return [];
    try {
      cur = JSON.parse(s);
    } catch {
      return [];
    }
  }
  return Array.isArray(cur) ? cur : [];
}

/**
 * Poll Dynamo via AppSync Query (fallback if WebSocket subscription misses the event).
 * @param {string} jobId
 * @param {number} timeoutMs
 */
async function pollJobResult(jobId, timeoutMs) {
  const endpoint = environment.appsync.endpoint;
  const apiKey = environment.appsync.apiKey;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          query: GET_JOB_QUERY,
          variables: { jobId },
        }),
      });
      const json = await res.json().catch(() => null);
      const data = json?.data?.getSocialCrawlJob;
      if (data) return data;
    } catch {
      /* keep polling */
    }
  }
  throw new Error(`socialcrawl_job_timeout (${timeoutMs}ms)`);
}

/**
 * @param {string} jobId
 * @param {number} timeoutMs
 */
function subscribeJobResult(jobId, _timeoutMs) {
  const client = generateClient();
  /** @type {{ unsubscribe: () => void } | null} */
  let sub = null;
  let settled = false;

  const result = new Promise((resolve) => {
    try {
      const observable = client.graphql({
        query: RESULT_SUBSCRIPTION,
        variables: { jobId },
        authMode: 'apiKey',
      });

      if (!observable || typeof observable.subscribe !== 'function') {
        return;
      }

      sub = observable.subscribe({
        next: (msg) => {
          const data = msg?.data?.onSocialCrawlResult;
          if (!data || settled) return;
          settled = true;
          try {
            sub?.unsubscribe();
          } catch {
            /* ignore */
          }
          resolve(data);
        },
        error: () => {
          try {
            sub?.unsubscribe();
          } catch {
            /* ignore */
          }
        },
      });
    } catch {
      /* poll fallback handles delivery */
    }
  });

  return {
    result,
    unsubscribe() {
      if (settled) return;
      settled = true;
      try {
        sub?.unsubscribe();
      } catch {
        /* ignore */
      }
    },
  };
}

function normalizeMention(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const channel = normalizePlatformChannel(raw.channel) || raw.channel || 'web';
  return {
    id: raw.id || `sc_${Date.now()}`,
    text: String(raw.text || '').trim(),
    sourceUrl: String(raw.sourceUrl || '').trim(),
    channel,
    detectedAt: raw.detectedAt || new Date().toISOString(),
    _provider: 'socialcrawl',
    _scMeta: raw._scMeta || null,
  };
}
