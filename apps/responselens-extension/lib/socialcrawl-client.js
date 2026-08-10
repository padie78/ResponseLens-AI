/**
 * Cliente SocialCrawl — solo HTTP + API key desde credenciales locales.
 * Nunca pasa la key a un LLM / prompt.
 *
 * Docs: https://www.socialcrawl.dev/docs/search/everywhere
 */

import { hasSocialCrawl } from './scan-credentials.js';

const BASE = 'https://www.socialcrawl.dev';

/**
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
async function fetchJson(url, headers = {}) {
  const res = await chrome.runtime.sendMessage({
    type: 'RL_FETCH_JSON',
    url,
    headers,
  });
  if (!res?.ok) {
    return { ok: false, error: res?.error || `HTTP ${res?.status || '?'}`, json: res?.json || null };
  }
  return { ok: true, json: res.json };
}

/**
 * @param {{
 *   apiKey: string,
 *   query: string,
 *   lookbackDays?: number,
 *   sources?: string,
 * }} opts
 */
export async function searchEverywhere(opts) {
  const key = String(opts.apiKey || '').trim();
  const query = String(opts.query || '').trim().slice(0, 512);
  if (!key || !query) {
    return { ok: false, error: 'missing_key_or_query', mentions: [] };
  }

  const url = new URL(`${BASE}/v1/search/everywhere`);
  url.searchParams.set('query', query);
  url.searchParams.set('lookback_days', String(Math.min(Math.max(opts.lookbackDays || 7, 1), 90)));
  if (opts.sources) url.searchParams.set('sources', opts.sources);

  const res = await fetchJson(url.toString(), {
    'x-api-key': key,
    Accept: 'application/json',
  });

  if (!res.ok) {
    return { ok: false, error: res.error || 'socialcrawl_failed', mentions: [] };
  }

  const envelope = res.json || {};
  if (envelope.success === false) {
    return {
      ok: false,
      error: envelope.error?.message || envelope.error || 'socialcrawl_error',
      mentions: [],
    };
  }

  const items = extractItems(envelope);
  const mentions = items
    .map((item) => mapItemToMention(item))
    .filter((m) => m && m.text && m.text.length >= 12);

  return {
    ok: true,
    mentions,
    creditsUsed: envelope.credits_used ?? null,
    creditsRemaining: envelope.credits_remaining ?? null,
    requestId: envelope.request_id || null,
  };
}

/**
 * @param {object | null} credentials
 * @param {string} brandOrRivalName
 * @param {{ lookbackDays?: number, sources?: string }} [opts]
 */
export async function fetchSocialCrawlMentions(credentials, brandOrRivalName, opts = {}) {
  if (!hasSocialCrawl(credentials)) {
    return { mentions: [], error: null, skipped: true };
  }
  const name = String(brandOrRivalName || '').trim();
  if (!name) return { mentions: [], error: 'empty_name', skipped: false };

  const result = await searchEverywhere({
    apiKey: credentials.socialcrawl.apiKey,
    query: name,
    lookbackDays: opts.lookbackDays ?? 7,
    sources: opts.sources || credentials.socialcrawl.sources || '',
  });

  if (!result.ok) {
    return { mentions: [], error: result.error, skipped: false };
  }
  return {
    mentions: result.mentions,
    error: null,
    skipped: false,
    creditsUsed: result.creditsUsed,
    creditsRemaining: result.creditsRemaining,
  };
}

function extractItems(envelope) {
  const data = envelope.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.clusters)) {
    return data.clusters.flatMap((c) => (Array.isArray(c.items) ? c.items : [c]));
  }
  return [];
}

function mapItemToMention(item) {
  if (!item || typeof item !== 'object') return null;
  const platform = String(item.source || item.platform || item.provider || 'web')
    .toLowerCase()
    .replace(/-ai-search$/, '')
    .replace(/^twitter$/, 'x');

  const title = String(item.title || item.headline || '').trim();
  const body = String(
    item.text || item.snippet || item.description || item.content || item.body || '',
  ).trim();
  const comments = Array.isArray(item.comments)
    ? item.comments
    : Array.isArray(item.top_comments)
      ? item.top_comments
      : [];
  const topComment = comments
    .map((c) => (typeof c === 'string' ? c : c?.text || c?.body || c?.content || ''))
    .map((s) => String(s || '').trim())
    .find(Boolean);

  const text = [title, body, topComment].filter(Boolean).join('\n').trim();
  const sourceUrl = String(item.url || item.link || item.permalink || item.source_url || '').trim();
  const id = String(item.id || item.result_id || sourceUrl || Math.random().toString(36).slice(2, 9));

  let detectedAt = new Date().toISOString();
  const rawDate = item.published_at || item.created_at || item.date || item.timestamp;
  if (rawDate) {
    const t = Date.parse(rawDate);
    if (Number.isFinite(t)) detectedAt = new Date(t).toISOString();
  }

  return {
    id: `sc_${platform}_${id}`.slice(0, 120),
    text: text.slice(0, 4000),
    sourceUrl: sourceUrl || `https://www.socialcrawl.dev/?q=${encodeURIComponent(title || body.slice(0, 40))}`,
    channel: platform,
    detectedAt,
    _provider: 'socialcrawl',
  };
}
