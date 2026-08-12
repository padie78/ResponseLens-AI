/**
 * Cliente SocialCrawl vía AppSync (server-side).
 * La API key vive SOLO en Lambda (Terraform `socialcrawl_api_key`).
 * El SPA nunca almacena ni envía `sc_…`.
 */

import { environment } from '../../environments/environment';
import { loadScanCredentials } from './scan-credentials.js';
import { normalizePlatformChannel } from './platforms.js';

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

  const result = await searchViaAppSync({
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

/**
 * @param {{ query: string, lookbackDays?: number, sources?: string }} input
 */
async function searchViaAppSync(input) {
  const endpoint = environment.appsync.endpoint;
  const apiKey = environment.appsync.apiKey;
  const mutation = `
    mutation SearchSocialMentions($input: SearchSocialMentionsInput!) {
      searchSocialMentions(input: $input) {
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

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            query: input.query,
            lookbackDays: input.lookbackDays ?? 7,
            sources: input.sources || null,
          },
        },
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `AppSync HTTP ${res.status}`, status: res.status };
    }
    if (json?.errors?.length) {
      return { ok: false, error: json.errors[0]?.message || 'appsync_error', status: res.status };
    }
    const data = json?.data?.searchSocialMentions;
    if (!data) return { ok: false, error: 'empty_appsync_response' };
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
