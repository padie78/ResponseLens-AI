/**
 * Escaneo de menciones competitivas (MVP).
 * Fuentes: Hacker News (Algolia) → Reddit (best-effort) → pestaña activa.
 * Sin fallback sintético por defecto.
 */

import { buildOpportunity, scoreFrustration } from './competitor-opportunity.js';

const NEGATIVE_HINT =
  /\b(scam|outage|broken|terrible|horrible|awful|refund|downtime|fail(ure|ed|ing)?|bug|crash|estafa|falla|ca[ií]da|basura|caro|slow|unreliable|worst|hate|sucks)\b/i;

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksNegative(text) {
  return NEGATIVE_HINT.test(text) || scoreFrustration(text) >= 0.35;
}

/**
 * Fetch JSON vía service worker (evita CORS del Side Panel).
 * En Node/tests cae a fetch directo.
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status?: number, json?: unknown, contentType?: string, error?: string }>}
 */
async function extensionFetchJson(url) {
  if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'RL_FETCH_JSON', url });
      return res && typeof res === 'object'
        ? res
        : { ok: false, error: 'empty_sw_response' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, contentType, error: 'invalid_json' };
    }
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      json,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {string} competitorName
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ mentions: object[], error?: string }>}
 */
export async function fetchHnMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 8;
  const name = String(competitorName || '').trim();
  if (!name) return { mentions: [] };

  const queries = [
    name,
    `${name} scam`,
    `${name} outage`,
    `${name} broken`,
    `${name} terrible`,
    `${name} fail`,
  ];

  const byId = new Map();
  let lastError = '';

  for (const query of queries) {
    if (byId.size >= limit) break;

    for (const endpoint of ['search_by_date', 'search']) {
      if (byId.size >= limit) break;
      const url =
        `https://hn.algolia.com/api/v1/${endpoint}?query=${encodeURIComponent(query)}` +
        `&tags=comment&hitsPerPage=12`;

      const res = await extensionFetchJson(url);
      if (!res.ok || !res.json) {
        lastError = res.error || `HN HTTP ${res.status || '?'}`;
        continue;
      }

      const hits = Array.isArray(res.json?.hits) ? res.json.hits : [];
      for (const hit of hits) {
        const text = stripHtml(hit.comment_text || hit.title || hit.story_title || '');
        if (!text || text.length < 20) continue;
        if (!text.toLowerCase().includes(name.toLowerCase())) continue;
        if (query === name && !looksNegative(text)) continue;
        if (query !== name && !looksNegative(text) && scoreFrustration(text) < 0.3) continue;

        const objectId = hit.objectID || hit.story_id;
        if (!objectId || byId.has(String(objectId))) continue;

        const sourceUrl =
          hit.story_url ||
          (objectId
            ? `https://news.ycombinator.com/item?id=${objectId}`
            : 'https://news.ycombinator.com');

        byId.set(String(objectId), {
          id: `hn_${objectId}`,
          text: text.slice(0, 2000),
          sourceUrl,
          channel: 'hackernews',
          detectedAt: hit.created_at || new Date().toISOString(),
        });
      }
    }
  }

  return {
    mentions: [...byId.values()].slice(0, limit),
    error: byId.size ? undefined : lastError || undefined,
  };
}

/**
 * @param {string} competitorName
 * @param {{ limit?: number }} [opts]
 */
export async function fetchRedditMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 5;
  const name = String(competitorName || '').trim();
  if (!name) return { mentions: [] };

  const q = `${name} (scam OR outage OR broken OR terrible OR estafa OR falla)`;
  const url =
    `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}` +
    `&sort=new&limit=${limit}&t=year&type=link&raw_json=1`;

  const res = await extensionFetchJson(url);
  if (!res.ok || !res.json) {
    return { mentions: [], error: res.error || `Reddit HTTP ${res.status || '?'}` };
  }

  const children = res.json?.data?.children;
  if (!Array.isArray(children)) return { mentions: [] };

  const mentions = [];
  for (const child of children) {
    const d = child?.data;
    if (!d) continue;
    const title = String(d.title || '').trim();
    const selftext = String(d.selftext || '').trim();
    const text = [title, selftext].filter(Boolean).join('\n').slice(0, 2000);
    if (!text) continue;
    if (!text.toLowerCase().includes(name.toLowerCase())) continue;
    if (!looksNegative(text)) continue;

    mentions.push({
      id: `reddit_${d.id || Math.random().toString(36).slice(2, 9)}`,
      text,
      sourceUrl: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url || 'https://www.reddit.com',
      channel: 'reddit',
      detectedAt: d.created_utc
        ? new Date(Number(d.created_utc) * 1000).toISOString()
        : new Date().toISOString(),
    });
  }
  return { mentions };
}

/** Nombres demo viejos → marcas reales buscables en HN. */
export function normalizeCompetitorNameForScan(name) {
  const n = String(name || '').trim();
  const map = {
    RivalCloud: 'AWS',
    rivalcloud: 'AWS',
    ShopFast: 'Shopify',
    shopfast: 'Shopify',
    MailBlast: 'Mailchimp',
    mailblast: 'Mailchimp',
  };
  return map[n] || n;
}

/**
 * @returns {Promise<{ opportunities: object[], stats: object, errors: string[], scannedNames: string[] }>}
 */
export async function runCompetitorScan({
  company,
  userId,
  competitors,
  pageMentions = [],
  preferSyntheticFallback = false,
} = {}) {
  const list = Array.isArray(competitors) && competitors.length ? competitors : [];
  const opportunities = [];
  const errors = [];
  const scannedNames = [];
  const stats = {
    hn: 0,
    reddit: 0,
    page: 0,
    synthetic: 0,
    competitors: list.length,
  };
  const seen = new Set();

  const pushOpp = (partial, flags = {}) => {
    const key = `${partial.competitorName}::${String(partial.complaint).slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const opp = buildOpportunity({
      ...partial,
      company,
      userId,
      competitors: list,
      demo: false,
      alertId: partial.alertId || null,
      detectedAt: partial.detectedAt || null,
    });
    if (flags.synthetic) {
      opp._synthetic = true;
      opp._source = 'synthetic';
    } else if (flags.page) {
      opp._source = 'page';
    } else if (flags.hn) {
      opp._source = 'hackernews';
    } else {
      opp._source = 'reddit';
    }
    opportunities.push(opp);
  };

  for (const raw of pageMentions) {
    if (!raw?.text || !raw?.competitorName) continue;
    pushOpp(
      {
        alertId: raw.id ? `page_${raw.id}` : null,
        competitorName: raw.competitorName,
        complaint: raw.text,
        sourceUrl: raw.sourceUrl || 'page://active-tab',
        channel: raw.channel || 'web',
        detectedAt: raw.detectedAt || new Date().toISOString(),
      },
      { page: true },
    );
    stats.page += 1;
  }

  for (const competitor of list) {
    const originalName = competitor?.name;
    if (!originalName) continue;
    const name = normalizeCompetitorNameForScan(originalName);
    scannedNames.push(name);

    const hn = await fetchHnMentions(name, { limit: 6 });
    if (hn.error) errors.push(`${name}/HN: ${hn.error}`);

    const reddit = await fetchRedditMentions(name, { limit: 4 });
    if (reddit.error) errors.push(`${name}/Reddit: ${reddit.error}`);

    const mentions = [...(hn.mentions || []), ...(reddit.mentions || [])];

    if (mentions.length) {
      for (const m of mentions) {
        const isHn = m.channel === 'hackernews';
        pushOpp(
          {
            alertId: m.id || null,
            competitorName: originalName,
            complaint: m.text,
            sourceUrl: m.sourceUrl,
            channel: m.channel,
            detectedAt: m.detectedAt,
          },
          isHn ? { hn: true } : { reddit: true },
        );
        if (isHn) stats.hn += 1;
        else stats.reddit += 1;
      }
    } else if (preferSyntheticFallback) {
      // Desactivado en UI; se deja por si se reutiliza en demos internas.
      stats.synthetic += 0;
    }
  }

  opportunities.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return { opportunities, stats, errors, scannedNames };
}
