/**
 * Escaneo de menciones competitivas (producto profesional).
 * Fuentes:
 *  - Hacker News (Algolia, gratis)
 *  - Reddit: OAuth app-only si hay credenciales; si no, search.json público
 *  - News: NewsAPI si hay key; si no, Google News RSS
 *  - YouTube: Data API si hay key; si no, Google News site:youtube.com
 *  - SocialCrawl: GET /v1/search/everywhere si hay key local
 *  - Pestaña activa
 *
 * Propios (brandScope own / allSentiment): positivo + negativo + neutro.
 * Competencia: prioriza señal negativa (captación).
 */

import { buildOpportunity, scoreFrustration } from './competitor-opportunity.js';
import { mentionDedupeKey } from './mention-dedupe.js';
import { hasNewsApi, hasRedditOAuth, hasSocialCrawl, hasYouTubeApi } from './scan-credentials.js';
import { analyzeBrandMention, sentimentToStorage } from './mention-intelligence.js';
import { fetchSocialCrawlMentions } from './socialcrawl-client.js';

const NEGATIVE_HINT =
  /\b(scam|outage|broken|terrible|horrible|awful|refund|downtime|fail(ure|ed|ing)?|bug|crash|estafa|falla|ca[ií]da|basura|caro|slow|unreliable|worst|hate|sucks|lawsuit|demanda|crisis|polémica|polemica|investigat|multa|breach|filtración|filtracion|complaint|queja|estaf|fraude|boycott)\b/i;

const POSITIVE_HINT =
  /\b(love|great|amazing|awesome|excellent|fantastic|recommend|best|impressed|gracias|excelente|incre[ií]ble|recomiendo|genial|perfecto|útil|util|helpful|game[- ]?changer|won|éxito|exito|launch|partnership|award|premio|crecimiento)\b/i;

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
  return NEGATIVE_HINT.test(text) || scoreFrustration(text) >= 0.32;
}

function looksPositive(text) {
  return POSITIVE_HINT.test(text) && scoreFrustration(text) < 0.45;
}

/** @returns {'NEGATIVE'|'POSITIVE'|'NEUTRAL'|'MIXED'} */
export function classifySentiment(text) {
  const neg = looksNegative(text);
  const pos = looksPositive(text);
  if (neg && pos) return scoreFrustration(text) >= 0.4 ? 'NEGATIVE' : 'MIXED';
  if (neg) return 'NEGATIVE';
  if (pos) return 'POSITIVE';
  return 'NEUTRAL';
}

/** Nombres + aliases a consultar (máx 3 para no saturar APIs). */
export function scanQueryNames(competitor) {
  const primary = normalizeCompetitorNameForScan(competitor?.name || '');
  if (!primary) return [];
  const aliases = (competitor?.aliases || [])
    .map((a) => normalizeCompetitorNameForScan(a))
    .filter((a) => a && a.toLowerCase() !== primary.toLowerCase());
  const uniq = [primary];
  for (const a of aliases) {
    if (!uniq.some((u) => u.toLowerCase() === a.toLowerCase())) uniq.push(a);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

/**
 * Fetch JSON vía service worker (evita CORS del Side Panel).
 * En Node/tests cae a fetch directo.
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status?: number, json?: unknown, contentType?: string, error?: string }>}
 */
async function extensionFetchJson(url, headers = {}) {
  if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'RL_FETCH_JSON',
        url,
        headers,
      });
      return res && typeof res === 'object'
        ? res
        : { ok: false, error: 'empty_sw_response' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
    });
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

/** Fetch texto/XML vía service worker (Google News RSS, etc.). */
async function extensionFetchText(url) {
  if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'RL_FETCH_TEXT', url });
      return res && typeof res === 'object'
        ? res
        : { ok: false, error: 'empty_sw_response' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function parseRssItems(xml) {
  const raw = String(xml || '');
  const items = [];
  const blocks = raw.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = stripHtml(
      (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '',
    );
    const link = stripHtml(
      (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] ||
        (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] ||
        '',
    );
    const desc = stripHtml(
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '',
    );
    const pub =
      (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]?.trim() || '';
    const guid = stripHtml(
      (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || link || title,
    );
    if (!title) continue;
    let detectedAt = new Date().toISOString();
    if (pub) {
      const t = Date.parse(pub);
      if (Number.isFinite(t)) detectedAt = new Date(t).toISOString();
    }
    items.push({
      title,
      link: link || '',
      description: desc,
      guid,
      detectedAt,
    });
  }
  return items;
}

/**
 * Portales de noticias vía Google News RSS (sin API key).
 * Cubre medios indexados que mencionan la marca / rival.
 * @param {string} subjectName
 * @param {{ limit?: number, brandScope?: 'rival'|'own', allSentiment?: boolean }} [opts]
 */
export async function fetchNewsMentions(subjectName, opts = {}) {
  const limit = opts.limit ?? 6;
  const name = String(subjectName || '').trim();
  if (!name) return { mentions: [] };

  const allSentiment = opts.allSentiment === true || opts.brandScope === 'own';

  const queries = allSentiment
    ? [
        `"${name}"`,
        `"${name}" (review OR artículo OR article OR análisis OR analysis OR launch OR partnership OR funding)`,
        `"${name}" (crisis OR demanda OR falla OR outage OR multa OR polémica OR award OR éxito)`,
      ]
    : [
        `"${name}" (${opts.brandScope === 'own' ? 'crisis OR demanda OR falla OR outage OR multa OR investigación OR polémica' : 'scam OR outage OR crisis OR demanda OR falla OR problema OR multa OR lawsuit'})`,
        `"${name}"`,
      ];

  const locales = [
    { hl: 'es-419', gl: 'AR', ceid: 'AR:es' },
    { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  ];

  const byId = new Map();
  let lastError = '';

  for (const query of queries) {
    if (byId.size >= limit) break;
    for (const loc of locales) {
      if (byId.size >= limit) break;
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
        `&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;

      const res = await extensionFetchText(url);
      if (!res.ok || !res.text) {
        lastError = res.error || `News HTTP ${res.status || '?'}`;
        continue;
      }

      for (const item of parseRssItems(res.text)) {
        const text = [item.title, item.description].filter(Boolean).join('\n').slice(0, 2000);
        if (!text.toLowerCase().includes(name.toLowerCase())) continue;
        if (!allSentiment) {
          // Primera query (con keywords): exigir señal; segunda: aceptar menciones con algo de fricción o título fuerte
          if (query.includes('(') && !looksNegative(text) && scoreFrustration(text) < 0.28) continue;
          if (!query.includes('(') && !looksNegative(text) && scoreFrustration(text) < 0.4) continue;
        }

        const idKey = item.guid || item.link || item.title;
        if (!idKey || byId.has(idKey)) continue;

        byId.set(idKey, {
          id: `news_${Math.abs(hashStr(idKey)).toString(36)}`,
          text,
          sourceUrl: item.link || `https://news.google.com/search?q=${encodeURIComponent(name)}`,
          channel: 'news',
          detectedAt: item.detectedAt,
          brandScope: opts.brandScope || 'rival',
          sentiment: classifySentiment(text),
        });
      }
    }
  }

  return {
    mentions: [...byId.values()].slice(0, limit),
    error: byId.size ? undefined : lastError || undefined,
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * @param {string} competitorName
 * @param {{ limit?: number, allSentiment?: boolean }} [opts]
 * @returns {Promise<{ mentions: object[], error?: string }>}
 */
export async function fetchHnMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 8;
  const name = String(competitorName || '').trim();
  if (!name) return { mentions: [] };
  const allSentiment = opts.allSentiment === true;

  const queries = allSentiment
    ? [name, `${name} review`, `${name} experience`]
    : [
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
        `&tags=comment&hitsPerPage=${allSentiment ? 20 : 12}`;

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
        if (!allSentiment) {
          if (query === name && !looksNegative(text)) continue;
          if (query !== name && !looksNegative(text) && scoreFrustration(text) < 0.3) continue;
        }

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
          sentiment: classifySentiment(text),
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
 * @param {{ limit?: number, allSentiment?: boolean }} [opts]
 */
export async function fetchRedditMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 5;
  const name = String(competitorName || '').trim();
  if (!name) return { mentions: [] };
  const allSentiment = opts.allSentiment === true;

  const q = allSentiment
    ? `"${name}"`
    : `${name} (scam OR outage OR broken OR terrible OR estafa OR falla)`;
  const url =
    `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}` +
    `&sort=new&limit=${Math.min(limit * 2, 25)}&t=year&type=link&raw_json=1`;

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
    if (!allSentiment && !looksNegative(text)) continue;

    mentions.push({
      id: `reddit_${d.id || Math.random().toString(36).slice(2, 9)}`,
      text,
      sourceUrl: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url || 'https://www.reddit.com',
      channel: 'reddit',
      detectedAt: d.created_utc
        ? new Date(Number(d.created_utc) * 1000).toISOString()
        : new Date().toISOString(),
      _provider: 'reddit_public',
      sentiment: classifySentiment(text),
    });
    if (mentions.length >= limit) break;
  }
  return { mentions };
}

/** @type {{ token: string, expiresAt: number, key: string } | null} */
let redditTokenCache = null;

async function getRedditAppToken(redditCreds) {
  const key = `${redditCreds.clientId}:${redditCreds.clientSecret}`;
  if (redditTokenCache && redditTokenCache.key === key && Date.now() < redditTokenCache.expiresAt) {
    return redditTokenCache.token;
  }
  const basic =
    typeof btoa === 'function'
      ? btoa(`${redditCreds.clientId}:${redditCreds.clientSecret}`)
      : Buffer.from(`${redditCreds.clientId}:${redditCreds.clientSecret}`).toString('base64');
  const ua = redditCreds.userAgent || 'ResponseLensAI/0.7';
  const res = await chrome.runtime.sendMessage({
    type: 'RL_FETCH_POST',
    url: 'https://www.reddit.com/api/v1/access_token',
    headers: {
      Authorization: `Basic ${basic}`,
      'User-Agent': ua,
    },
    bodyRaw: 'grant_type=client_credentials',
  });
  if (!res?.ok || !res.json?.access_token) {
    throw new Error(res?.text || res?.error || 'Reddit OAuth failed');
  }
  const expiresIn = Number(res.json.expires_in || 3600);
  redditTokenCache = {
    token: res.json.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    key,
  };
  return redditTokenCache.token;
}

/**
 * Reddit autenticado (OAuth application-only).
 * @param {string} competitorName
 * @param {{ limit?: number, reddit?: object }} [opts]
 */
export async function fetchRedditOAuthMentions(competitorName, opts = {}) {
  const limit = opts.limit ?? 6;
  const name = String(competitorName || '').trim();
  if (!name || !opts.reddit) return { mentions: [], error: 'missing_reddit_creds' };

  let token;
  try {
    token = await getRedditAppToken(opts.reddit);
  } catch (err) {
    return {
      mentions: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allSentiment = opts.allSentiment === true;
  const q = allSentiment
    ? `"${name}"`
    : `${name} (scam OR outage OR broken OR terrible OR estafa OR falla OR refund)`;
  const url =
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}` +
    `&sort=new&limit=${Math.min(limit * 2, 25)}&t=year&type=link&raw_json=1`;
  const ua = opts.reddit.userAgent || 'ResponseLensAI/0.7';
  const res = await extensionFetchJson(url, {
    Authorization: `Bearer ${token}`,
    'User-Agent': ua,
  });
  if (!res.ok || !res.json) {
    return { mentions: [], error: res.error || `Reddit OAuth HTTP ${res.status || '?'}` };
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
    if (!text || !text.toLowerCase().includes(name.toLowerCase())) continue;
    if (!allSentiment && !looksNegative(text)) continue;
    mentions.push({
      id: `reddit_oauth_${d.id || Math.random().toString(36).slice(2, 9)}`,
      text,
      sourceUrl: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url || 'https://www.reddit.com',
      channel: 'reddit',
      detectedAt: d.created_utc
        ? new Date(Number(d.created_utc) * 1000).toISOString()
        : new Date().toISOString(),
      _provider: 'reddit_oauth',
      sentiment: classifySentiment(text),
    });
    if (mentions.length >= limit) break;
  }
  return { mentions };
}

/**
 * NewsAPI.org (everything). Requiere apiKey.
 * @param {string} subjectName
 * @param {{ limit?: number, apiKey?: string, brandScope?: string, allSentiment?: boolean }} [opts]
 */
export async function fetchNewsApiMentions(subjectName, opts = {}) {
  const limit = opts.limit ?? 6;
  const name = String(subjectName || '').trim();
  const apiKey = opts.apiKey;
  if (!name || !apiKey) return { mentions: [], error: 'missing_newsapi_key' };

  const allSentiment = opts.allSentiment === true || opts.brandScope === 'own';
  const q = allSentiment
    ? `"${name}"`
    : opts.brandScope === 'own'
      ? `"${name}" AND (crisis OR lawsuit OR outage OR fine OR scandal OR demanda OR falla)`
      : `"${name}" AND (scam OR outage OR lawsuit OR broken OR crisis OR estafa OR falla OR refund)`;

  const url =
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}` +
    `&sortBy=publishedAt&pageSize=${Math.min(Math.max(limit, 10), 25)}`;

  const res = await extensionFetchJson(url, { 'X-Api-Key': apiKey });
  if (!res.ok || !res.json) {
    return { mentions: [], error: res.error || `NewsAPI HTTP ${res.status || '?'}` };
  }
  if (res.json.status === 'error') {
    return { mentions: [], error: res.json.message || 'NewsAPI error' };
  }

  const articles = Array.isArray(res.json.articles) ? res.json.articles : [];
  const mentions = [];
  for (const a of articles) {
    const text = [a.title, a.description, a.content]
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000);
    if (!text || !text.toLowerCase().includes(name.toLowerCase())) continue;
    if (!allSentiment && !looksNegative(text) && scoreFrustration(text) < 0.28) continue;
    mentions.push({
      id: `newsapi_${hashStr(a.url || a.title || text).toString(36)}`,
      text,
      sourceUrl: a.url || 'https://newsapi.org',
      channel: 'news',
      detectedAt: a.publishedAt || new Date().toISOString(),
      _provider: 'newsapi',
      brandScope: opts.brandScope || 'rival',
      sentiment: classifySentiment(text),
    });
    if (mentions.length >= limit) break;
  }
  return { mentions };
}

/**
 * Videos de YouTube que mencionan la marca.
 * Con API key → YouTube Data API search.
 * Sin key → Google News RSS `site:youtube.com` (cobertura parcial).
 * @param {string} subjectName
 * @param {{ limit?: number, apiKey?: string }} [opts]
 */
export async function fetchYouTubeMentions(subjectName, opts = {}) {
  const limit = opts.limit ?? 8;
  const name = String(subjectName || '').trim();
  if (!name) return { mentions: [] };

  if (opts.apiKey) {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
      `&maxResults=${Math.min(limit, 15)}` +
      `&order=date&q=${encodeURIComponent(name)}` +
      `&key=${encodeURIComponent(opts.apiKey)}`;
    const res = await extensionFetchJson(url);
    if (!res.ok || !res.json) {
      return { mentions: [], error: res.error || `YouTube API HTTP ${res.status || '?'}` };
    }
    if (res.json.error) {
      return {
        mentions: [],
        error: res.json.error?.message || 'YouTube API error',
      };
    }
    const items = Array.isArray(res.json.items) ? res.json.items : [];
    const mentions = [];
    for (const it of items) {
      const sn = it.snippet || {};
      const vid = it.id?.videoId;
      if (!vid) continue;
      const text = [sn.title, sn.description, sn.channelTitle]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);
      if (!text) continue;
      mentions.push({
        id: `yt_${vid}`,
        text,
        sourceUrl: `https://www.youtube.com/watch?v=${vid}`,
        channel: 'youtube',
        detectedAt: sn.publishedAt || new Date().toISOString(),
        _provider: 'youtube_api',
        sentiment: classifySentiment(text),
      });
      if (mentions.length >= limit) break;
    }
    return { mentions };
  }

  // Fallback gratis: noticias/índice que apuntan a YouTube
  const query = `"${name}" site:youtube.com`;
  const locales = [
    { hl: 'es-419', gl: 'AR', ceid: 'AR:es' },
    { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  ];
  const byId = new Map();
  let lastError = '';
  for (const loc of locales) {
    if (byId.size >= limit) break;
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
      `&hl=${encodeURIComponent(loc.hl)}&gl=${encodeURIComponent(loc.gl)}&ceid=${encodeURIComponent(loc.ceid)}`;
    const res = await extensionFetchText(url);
    if (!res.ok || !res.text) {
      lastError = res.error || `YT-RSS HTTP ${res.status || '?'}`;
      continue;
    }
    for (const item of parseRssItems(res.text)) {
      const text = [item.title, item.description].filter(Boolean).join('\n').slice(0, 2000);
      const link = item.link || '';
      const isYt =
        /youtube\.com|youtu\.be/i.test(link) || /youtube\.com|youtu\.be/i.test(text);
      if (!isYt && !text.toLowerCase().includes(name.toLowerCase())) continue;
      if (!text.toLowerCase().includes(name.toLowerCase())) continue;
      const idKey = item.guid || link || item.title;
      if (!idKey || byId.has(idKey)) continue;
      byId.set(idKey, {
        id: `yt_rss_${Math.abs(hashStr(idKey)).toString(36)}`,
        text,
        sourceUrl: link || `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`,
        channel: 'youtube',
        detectedAt: item.detectedAt,
        _provider: 'youtube_news_rss',
        sentiment: classifySentiment(text),
      });
    }
  }
  return {
    mentions: [...byId.values()].slice(0, limit),
    error: byId.size ? undefined : lastError || undefined,
  };
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
  sources = null,
  credentials = null,
} = {}) {
  const list = Array.isArray(competitors) && competitors.length ? competitors : [];
  const opportunities = [];
  const errors = [];
  const scannedNames = [];
  const enabled = {
    hackernews: sources?.hackernews !== false,
    reddit_api: sources?.reddit_api !== false,
    active_page: sources?.active_page !== false,
    news_portals: sources?.news_portals !== false,
  };
  const useRedditOauth = hasRedditOAuth(credentials);
  const useNewsApi = hasNewsApi(credentials);
  const stats = {
    hn: 0,
    reddit: 0,
    news: 0,
    page: 0,
    ownNews: 0,
    synthetic: 0,
    competitors: list.length,
    skippedDupes: 0,
    providers: {
      reddit: useRedditOauth ? 'oauth' : 'public',
      news: useNewsApi ? 'newsapi' : 'google_rss',
      socialcrawl: hasSocialCrawl(credentials) ? 'socialcrawl' : 'off',
    },
    perCompetitor: {},
  };
  const seen = new Set();

  const pushOpp = (partial, flags = {}) => {
    const key = mentionDedupeKey({
      text: partial.complaint,
      sourceUrl: partial.sourceUrl,
      competitorName: partial.competitorName,
    });
    if (seen.has(key)) {
      stats.skippedDupes += 1;
      return false;
    }
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
    if (flags.page) {
      opp._source = 'page';
    } else if (flags.socialcrawl) {
      opp._source = 'socialcrawl';
    } else if (flags.hn) {
      opp._source = 'hackernews';
    } else if (flags.news) {
      opp._source = 'news';
      opp.channel = opp.channel || 'news';
    } else {
      opp._source = 'reddit';
    }
    if (flags.ownBrand) {
      opp._brandScope = 'own';
      opp.notes = [opp.notes, 'Mención de tu marca en prensa'].filter(Boolean).join(' · ');
    }
    if (!flags.ownBrand) {
      const intel = analyzeBrandMention({
        text: partial.complaint,
        channel: partial.channel || opp.channel,
        sourceUrl: partial.sourceUrl || opp.sourceUrl,
        brandScope: 'rival',
        competitorName: partial.competitorName,
        companyName: company?.companyName,
        systemContext: { alertId: opp.alertId, provider: opp._source },
      });
      opp._intel = intel.analisis_comentario_recibido;
      if (intel.analisis_comentario_recibido?.analisis_estrategico?.resumen_insight) {
        opp.notes = [
          opp.notes,
          intel.analisis_comentario_recibido.analisis_estrategico.resumen_insight,
        ]
          .filter(Boolean)
          .join(' · ');
      }
    }
    // Floor: descartar ruido casi nulo salvo página (usuario captó a mano)
    if (!flags.page && (opp.frustrationScore || 0) < 0.28 && !looksNegative(partial.complaint)) {
      stats.skippedDupes += 1;
      return false;
    }
    opportunities.push(opp);
    return true;
  };

  if (enabled.active_page) {
    for (const raw of pageMentions) {
      if (!raw?.text || !raw?.competitorName) continue;
      if (
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
        )
      ) {
        stats.page += 1;
      }
    }
  }

  for (const competitor of list) {
    const originalName = competitor?.name;
    if (!originalName) continue;
    const queryNames = scanQueryNames(competitor);
    const name = queryNames[0] || normalizeCompetitorNameForScan(originalName);
    scannedNames.push(name);
    const tally = { hn: 0, reddit: 0, news: 0, errors: [] };
    stats.perCompetitor[originalName] = tally;

    let hn = { mentions: [] };
    let reddit = { mentions: [] };
    let news = { mentions: [] };

    for (const qName of queryNames) {
      if (enabled.hackernews) {
        const part = await fetchHnMentions(qName, { limit: 5 });
        if (part.error) {
          errors.push(`${qName}/HN: ${part.error}`);
          tally.errors.push(part.error);
        }
        hn.mentions = [...(hn.mentions || []), ...(part.mentions || [])];
      }

      if (enabled.reddit_api) {
        const part = useRedditOauth
          ? await fetchRedditOAuthMentions(qName, {
              limit: 5,
              reddit: credentials.reddit,
            })
          : await fetchRedditMentions(qName, { limit: 3 });
        if (part.error) {
          errors.push(`${qName}/Reddit: ${part.error}`);
          tally.errors.push(part.error);
        }
        reddit.mentions = [...(reddit.mentions || []), ...(part.mentions || [])];
      }

      if (enabled.news_portals) {
        const part = useNewsApi
          ? await fetchNewsApiMentions(qName, {
              limit: 4,
              apiKey: credentials.newsapi.apiKey,
              brandScope: 'rival',
            })
          : await fetchNewsMentions(qName, { limit: 4, brandScope: 'rival' });
        if (part.error) {
          errors.push(`${qName}/News: ${part.error}`);
          tally.errors.push(part.error);
        }
        news.mentions = [...(news.mentions || []), ...(part.mentions || [])];
      }
    }

    const mentions = [
      ...(hn.mentions || []),
      ...(reddit.mentions || []),
      ...(news.mentions || []),
    ];

    for (const m of mentions) {
      const isHn = m.channel === 'hackernews';
      const isNews = m.channel === 'news';
      const ok = pushOpp(
        {
          alertId: m.id || null,
          competitorName: originalName,
          complaint: m.text,
          sourceUrl: m.sourceUrl,
          channel: m.channel,
          detectedAt: m.detectedAt,
        },
        isHn ? { hn: true } : isNews ? { news: true } : { reddit: true },
      );
      if (!ok) continue;
      if (isHn) {
        stats.hn += 1;
        tally.hn += 1;
      } else if (isNews) {
        stats.news += 1;
        tally.news += 1;
      } else {
        stats.reddit += 1;
        tally.reddit += 1;
      }
    }
  }

  // Prensa sobre la marca propia (reputación)
  const ownName = String(company?.companyName || '').trim();
  if (enabled.news_portals && ownName && ownName.toLowerCase() !== 'tumarca') {
    scannedNames.push(`own:${ownName}`);
    const ownNews = useNewsApi
      ? await fetchNewsApiMentions(ownName, {
          limit: 5,
          apiKey: credentials.newsapi.apiKey,
          brandScope: 'own',
        })
      : await fetchNewsMentions(ownName, { limit: 5, brandScope: 'own' });
    if (ownNews.error) errors.push(`${ownName}/NewsOwn: ${ownNews.error}`);
    for (const m of ownNews.mentions || []) {
      if (
        pushOpp(
          {
            alertId: m.id || null,
            competitorName: ownName,
            complaint: m.text,
            sourceUrl: m.sourceUrl,
            channel: 'news',
            detectedAt: m.detectedAt,
          },
          { news: true, ownBrand: true },
        )
      ) {
        stats.news += 1;
        stats.ownNews += 1;
      }
    }
  }

  if (hasSocialCrawl(credentials) && list.length) {
    stats.socialcrawl = 0;
    for (const competitor of list.slice(0, 5)) {
      const name = competitor.name || competitor;
      const sc = await fetchSocialCrawlMentions(credentials, name, {
        lookbackDays: Number(credentials.socialcrawl?.lookbackDays) || 7,
        sources: credentials.socialcrawl?.sources || '',
      });
      if (sc.error) errors.push(`SocialCrawl/${name}: ${sc.error}`);
      for (const m of sc.mentions || []) {
        if (
          pushOpp(
            {
              alertId: m.id || null,
              competitorName: name,
              complaint: m.text,
              sourceUrl: m.sourceUrl,
              channel: m.channel,
              detectedAt: m.detectedAt,
            },
            { socialcrawl: true },
          )
        ) {
          stats.socialcrawl += 1;
        }
      }
    }
  }

  opportunities.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return { opportunities, stats, errors, scannedNames, enabledSources: enabled };
}

/**
 * Escaneo de reputación de la marca propia (HN · Reddit · News · pestaña).
 * Misma forma de alertas que competencia, con `_brandScope: 'own'`.
 *
 * @param {{
 *   company?: { companyName?: string, aliases?: string[], whatTheySell?: string },
 *   userId?: string,
 *   pageMentions?: Array<{ id?: string, text: string, sourceUrl?: string, channel?: string, detectedAt?: string }>,
 *   sources?: Record<string, boolean> | null,
 *   credentials?: object | null,
 * }} [opts]
 */
export async function runOwnBrandScan({
  company,
  userId = 'local-user',
  pageMentions = [],
  sources = null,
  credentials = null,
} = {}) {
  const ownName = String(company?.companyName || '').trim();
  const opportunities = [];
  const errors = [];
  const scannedNames = [];
  const enabled = {
    hackernews: sources?.hackernews !== false,
    reddit_api: sources?.reddit_api !== false,
    active_page: sources?.active_page !== false,
    news_portals: sources?.news_portals !== false,
    youtube_api: sources?.youtube_api !== false,
  };
  const useYoutubeApi = hasYouTubeApi(credentials);
  const stats = {
    hn: 0,
    reddit: 0,
    news: 0,
    youtube: 0,
    page: 0,
    socialcrawl: 0,
    skippedDupes: 0,
    providers: {
      reddit: hasRedditOAuth(credentials) ? 'oauth' : 'public',
      news: hasNewsApi(credentials) ? 'newsapi' : 'google_rss',
      youtube: useYoutubeApi ? 'youtube_api' : 'youtube_news_rss',
      socialcrawl: hasSocialCrawl(credentials) ? 'socialcrawl' : 'off',
    },
  };

  if (!ownName || ownName.toLowerCase() === 'tumarca') {
    return {
      opportunities,
      stats,
      errors: ['Configurá el nombre de tu empresa en Config → Mi empresa'],
      scannedNames,
      enabledSources: enabled,
    };
  }

  const queryNames = scanQueryNames({
    name: ownName,
    aliases: [
      ...(company?.aliases || []),
      ...(company?.socialHandles || [])
        .map((h) => String(h || '').trim().replace(/^@/, ''))
        .filter(Boolean),
    ],
  });
  scannedNames.push(...queryNames.map((n) => `own:${n}`));

  const useRedditOauth = hasRedditOAuth(credentials);
  const useNewsApi = hasNewsApi(credentials);
  const seen = new Set();

  const pushOwn = (partial, flags) => {
    const key = mentionDedupeKey({
      text: partial.complaint,
      sourceUrl: partial.sourceUrl,
      competitorName: ownName,
    });
    if (seen.has(key)) {
      stats.skippedDupes += 1;
      return false;
    }
    seen.add(key);
    const sentiment =
      partial.sentiment || classifySentiment(partial.complaint || '');
    const opp = buildOpportunity({
      ...partial,
      competitorName: ownName,
      company,
      userId,
      competitors: [],
      demo: false,
      alertId: partial.alertId || null,
      detectedAt: partial.detectedAt || null,
    });
    opp._brandScope = 'own';
    opp._sentiment = sentiment;
    const intel = analyzeBrandMention({
      text: partial.complaint,
      channel: partial.channel || opp.channel,
      sourceUrl: partial.sourceUrl || opp.sourceUrl,
      brandScope: 'own',
      companyName: ownName,
      systemContext: {
        alertId: opp.alertId,
        provider: flags.socialcrawl ? 'socialcrawl' : flags.page ? 'page' : 'scan',
      },
    });
    opp._intel = intel.analisis_comentario_recibido;
    if (intel.analisis_comentario_recibido?.respuesta_sugerida_publica) {
      opp.salesPitch = intel.analisis_comentario_recibido.respuesta_sugerida_publica;
    }
    const mappedSent = sentimentToStorage(intel.analisis_comentario_recibido?.sentimiento);
    if (mappedSent) opp._sentiment = mappedSent;
    if (intel.analisis_comentario_recibido?.requiere_moderacion_humana) {
      opp.severity = 'CRITICAL';
      opp.notes = [opp.notes, 'Requiere moderación humana'].filter(Boolean).join(' · ');
    }
    if (sentiment === 'POSITIVE' || sentiment === 'NEUTRAL' || mappedSent === 'POSITIVE' || mappedSent === 'NEUTRAL') {
      if (opp.severity !== 'CRITICAL') opp.severity = 'LOW';
    }
    if (flags.page) opp._source = 'page';
    else if (flags.socialcrawl) {
      opp._source = 'socialcrawl';
      opp.channel = opp.channel || partial.channel || 'web';
    } else if (flags.hn) opp._source = 'hackernews';
    else if (flags.news) {
      opp._source = 'news';
      opp.channel = opp.channel || 'news';
    } else if (flags.youtube) {
      opp._source = 'youtube';
      opp.channel = 'youtube';
    } else opp._source = 'reddit';

    const srcNote =
      flags.page
        ? 'Detectado en página abierta'
        : flags.socialcrawl
          ? 'SocialCrawl (multi-plataforma)'
          : flags.hn
            ? 'Mención de tu marca en Hacker News'
            : flags.news
              ? 'Artículo / noticia sobre tu marca'
              : flags.youtube
                ? 'Video / mención en YouTube'
                : 'Mención de tu marca en Reddit';
    const sentNote =
      sentiment === 'POSITIVE'
        ? 'Sentimiento positivo'
        : sentiment === 'NEGATIVE'
          ? 'Sentimiento negativo'
          : sentiment === 'MIXED'
            ? 'Sentimiento mixto'
            : 'Sentimiento neutro';
    opp.notes = [opp.notes, srcNote, sentNote].filter(Boolean).join(' · ');

    // Propios: guardar todo (pos/neg/neutro). Solo descartamos texto vacío.
    if (!String(partial.complaint || '').trim()) {
      stats.skippedDupes += 1;
      return false;
    }
    opportunities.push(opp);
    return true;
  };

  if (enabled.active_page) {
    for (const raw of pageMentions) {
      if (!raw?.text) continue;
      if (
        pushOwn(
          {
            alertId: raw.id ? `own_page_${raw.id}` : null,
            complaint: raw.text,
            sourceUrl: raw.sourceUrl || 'page://active-tab',
            channel: raw.channel || 'web',
            detectedAt: raw.detectedAt || new Date().toISOString(),
          },
          { page: true },
        )
      ) {
        stats.page += 1;
      }
    }
  }

  for (const qName of queryNames) {
    if (enabled.hackernews) {
      const part = await fetchHnMentions(qName, { limit: 10, allSentiment: true });
      if (part.error) errors.push(`${qName}/HN: ${part.error}`);
      for (const m of part.mentions || []) {
        if (
          pushOwn(
            {
              alertId: m.id || null,
              complaint: m.text,
              sourceUrl: m.sourceUrl,
              channel: 'hackernews',
              detectedAt: m.detectedAt,
              sentiment: m.sentiment,
            },
            { hn: true },
          )
        ) {
          stats.hn += 1;
        }
      }
    }

    if (enabled.reddit_api) {
      const part = useRedditOauth
        ? await fetchRedditOAuthMentions(qName, {
            limit: 10,
            reddit: credentials.reddit,
            allSentiment: true,
          })
        : await fetchRedditMentions(qName, { limit: 8, allSentiment: true });
      if (part.error) errors.push(`${qName}/Reddit: ${part.error}`);
      for (const m of part.mentions || []) {
        if (
          pushOwn(
            {
              alertId: m.id || null,
              complaint: m.text,
              sourceUrl: m.sourceUrl,
              channel: m.channel || 'reddit',
              detectedAt: m.detectedAt,
              sentiment: m.sentiment,
            },
            { reddit: true },
          )
        ) {
          stats.reddit += 1;
        }
      }
    }

    if (enabled.news_portals) {
      const part = useNewsApi
        ? await fetchNewsApiMentions(qName, {
            limit: 12,
            apiKey: credentials.newsapi.apiKey,
            brandScope: 'own',
            allSentiment: true,
          })
        : await fetchNewsMentions(qName, {
            limit: 12,
            brandScope: 'own',
            allSentiment: true,
          });
      if (part.error) errors.push(`${qName}/News: ${part.error}`);
      for (const m of part.mentions || []) {
        if (
          pushOwn(
            {
              alertId: m.id || null,
              complaint: m.text,
              sourceUrl: m.sourceUrl,
              channel: 'news',
              detectedAt: m.detectedAt,
              sentiment: m.sentiment,
            },
            { news: true },
          )
        ) {
          stats.news += 1;
        }
      }
    }

    if (enabled.youtube_api) {
      const part = await fetchYouTubeMentions(qName, {
        limit: 8,
        apiKey: useYoutubeApi ? credentials.youtube.apiKey : undefined,
      });
      if (part.error) errors.push(`${qName}/YouTube: ${part.error}`);
      for (const m of part.mentions || []) {
        if (
          pushOwn(
            {
              alertId: m.id || null,
              complaint: m.text,
              sourceUrl: m.sourceUrl,
              channel: 'youtube',
              detectedAt: m.detectedAt,
              sentiment: m.sentiment,
            },
            { youtube: true },
          )
        ) {
          stats.youtube += 1;
        }
      }
    }
  }

  if (hasSocialCrawl(credentials)) {
    const sc = await fetchSocialCrawlMentions(credentials, ownName, {
      lookbackDays: Number(credentials.socialcrawl?.lookbackDays) || 7,
      sources: credentials.socialcrawl?.sources || '',
    });
    if (sc.error) errors.push(`SocialCrawl: ${sc.error}`);
    for (const m of sc.mentions || []) {
      if (
        pushOwn(
          {
            alertId: m.id || null,
            complaint: m.text,
            sourceUrl: m.sourceUrl,
            channel: m.channel,
            detectedAt: m.detectedAt,
          },
          { socialcrawl: true },
        )
      ) {
        stats.socialcrawl += 1;
      }
    }
  }

  opportunities.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return { opportunities, stats, errors, scannedNames, enabledSources: enabled };
}

