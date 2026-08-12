/**
 * Cliente SocialCrawl vía AppSync async (SQS worker + subscription).
 * La API key vive SOLO en Lambda (Terraform `socialcrawl_api_key`).
 * El SPA nunca almacena ni envía `sc_…`.
 */

import { generateClient } from 'aws-amplify/api';
import { environment } from '../../environments/environment';
import { loadScanCredentials } from './scan-credentials.js';
import { normalizePlatformChannel } from './platforms.js';

const JOB_WAIT_MS = 100_000;

/**
 * Preferencias locales (lookback/sources) — sin API key.
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
 * @param {{ lookbackDays?: number, sources?: string }} [opts]
 */
export async function fetchSocialCrawlMentions(_credentials, brandOrRivalName, opts = {}) {
  if (!hasSocialCrawlServer()) {
    return {
      mentions: [],
      error: 'SocialCrawl server off — falta AppSync (npm run sync:env) o SOCIALCRAWL_API_KEY en Terraform',
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
  const sources = opts.sources || prefs.socialcrawl?.sources || '';

  const result = await searchViaAppSyncJob({
    query: name,
    lookbackDays: lookback,
    sources,
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

/**
 * @param {{ query: string, lookbackDays?: number, sources?: string }} input
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
  } catch (err) {
    pending.unsubscribe();
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const data = await pending.result;
    if (!data.ok) return { ok: false, error: data.error || 'socialcrawl_failed' };

    let mentions = data.mentionsJson;
    if (typeof mentions === 'string') {
      try {
        mentions = JSON.parse(mentions);
      } catch {
        mentions = [];
      }
    }
    if (!Array.isArray(mentions)) mentions = [];

    return {
      ok: true,
      mentions,
      rawCount: data.rawCount ?? mentions.length,
      creditsUsed: data.creditsUsed,
      creditsRemaining: data.creditsRemaining,
      coverage: data.coverage,
      planIntent: data.planIntent,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {string} jobId
 * @param {number} timeoutMs
 */
function subscribeJobResult(jobId, timeoutMs) {
  const client = generateClient();
  /** @type {{ unsubscribe: () => void } | null} */
  let sub = null;
  let settled = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  const result = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        sub?.unsubscribe();
      } catch {
        /* ignore */
      }
      reject(new Error(`socialcrawl_job_timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    const observable = client.graphql({
      query: RESULT_SUBSCRIPTION,
      variables: { jobId },
      authMode: 'apiKey',
    });

    if (!observable || typeof observable.subscribe !== 'function') {
      if (timer) clearTimeout(timer);
      settled = true;
      reject(new Error('appsync_subscription_unavailable'));
      return;
    }

    sub = observable.subscribe({
      next: (msg) => {
        const data = msg?.data?.onSocialCrawlResult;
        if (!data || settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          sub?.unsubscribe();
        } catch {
          /* ignore */
        }
        resolve(data);
      },
      error: (err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          sub?.unsubscribe();
        } catch {
          /* ignore */
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    });
  });

  return {
    result,
    unsubscribe() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
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
