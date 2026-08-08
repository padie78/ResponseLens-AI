/**
 * Escaneo de menciones competitivas (producto profesional).
 * Fuentes:
 *  - Hacker News (Algolia, gratis)
 *  - Reddit: OAuth app-only si hay credenciales; si no, search.json público
 *  - News: NewsAPI si hay key; si no, Google News RSS
 *  - Pestaña activa
 */

import { buildOpportunity, scoreFrustration } from './competitor-opportunity.js';
import { hasNewsApi, hasRedditOAuth } from './scan-credentials.js';

const NEGATIVE_HINT =
  /\b(scam|outage|broken|terrible|horrible|awful|refund|downtime|fail(ure|ed|ing)?|bug|crash|estafa|falla|ca[ií]da|basura|caro|slow|unreliable|worst|hate|sucks|lawsuit|demanda|crisis|polémica|polemica|investigat|multa|breach|filtración|filtracion)\b/i;

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
 * @param {{ limit?: number, brandScope?: 'rival'|'own' }} [opts]
 */
export async function fetchNewsMentions(subjectName, opts = {}) {
  const limit = opts.limit ?? 6;
  const name = String(subjectName || '').trim();
  if (!name) return { mentions: [] };

  const queries = [
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
        // Primera query (con keywords): exigir señal; segunda: aceptar menciones con algo de fricción o título fuerte
        if (query.includes('(') && !looksNegative(text) && scoreFrustration(text) < 0.28) continue;
        if (!query.includes('(') && !looksNegative(text) && scoreFrustration(text) < 0.4) continue;

        const idKey = item.guid || item.link || item.title;
        if (!idKey || byId.has(idKey)) continue;

        byId.set(idKey, {
          id: `news_${Math.abs(hashStr(idKey)).toString(36)}`,
          text,
          sourceUrl: item.link || `https://news.google.com/search?q=${encodeURIComponent(name)}`,
          channel: 'news',
          detectedAt: item.detectedAt,
          brandScope: opts.brandScope || 'rival',
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
      _provider: 'reddit_public',
    });
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

  const q = `${name} (scam OR outage OR broken OR terrible OR estafa OR falla OR refund)`;
  const url =
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}` +
    `&sort=new&limit=${limit}&t=year&type=link&raw_json=1`;
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
    if (!looksNegative(text)) continue;
    mentions.push({
      id: `reddit_oauth_${d.id || Math.random().toString(36).slice(2, 9)}`,
      text,
      sourceUrl: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url || 'https://www.reddit.com',
      channel: 'reddit',
      detectedAt: d.created_utc
        ? new Date(Number(d.created_utc) * 1000).toISOString()
        : new Date().toISOString(),
      _provider: 'reddit_oauth',
    });
  }
  return { mentions };
}

/**
 * NewsAPI.org (everything). Requiere apiKey.
 * @param {string} subjectName
 * @param {{ limit?: number, apiKey?: string, brandScope?: string }} [opts]
 */
export async function fetchNewsApiMentions(subjectName, opts = {}) {
  const limit = opts.limit ?? 6;
  const name = String(subjectName || '').trim();
  const apiKey = opts.apiKey;
  if (!name || !apiKey) return { mentions: [], error: 'missing_newsapi_key' };

  const q =
    opts.brandScope === 'own'
      ? `"${name}" AND (crisis OR lawsuit OR outage OR fine OR scandal OR demanda OR falla)`
      : `"${name}" AND (scam OR outage OR lawsuit OR broken OR crisis OR estafa OR falla OR refund)`;

  const url =
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}` +
    `&language=en&sortBy=publishedAt&pageSize=${Math.min(limit, 20)}`;

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
    if (!looksNegative(text) && scoreFrustration(text) < 0.28) continue;
    mentions.push({
      id: `newsapi_${hashStr(a.url || a.title || text).toString(36)}`,
      text,
      sourceUrl: a.url || 'https://newsapi.org',
      channel: 'news',
      detectedAt: a.publishedAt || new Date().toISOString(),
      _provider: 'newsapi',
      brandScope: opts.brandScope || 'rival',
    });
    if (mentions.length >= limit) break;
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
    providers: {
      reddit: useRedditOauth ? 'oauth' : 'public',
      news: useNewsApi ? 'newsapi' : 'google_rss',
    },
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
    opportunities.push(opp);
  };

  if (enabled.active_page) {
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
  }

  for (const competitor of list) {
    const originalName = competitor?.name;
    if (!originalName) continue;
    const name = normalizeCompetitorNameForScan(originalName);
    scannedNames.push(name);

    let hn = { mentions: [] };
    let reddit = { mentions: [] };
    let news = { mentions: [] };

    if (enabled.hackernews) {
      hn = await fetchHnMentions(name, { limit: 6 });
      if (hn.error) errors.push(`${name}/HN: ${hn.error}`);
    }

    if (enabled.reddit_api) {
      if (useRedditOauth) {
        reddit = await fetchRedditOAuthMentions(name, {
          limit: 6,
          reddit: credentials.reddit,
        });
      } else {
        reddit = await fetchRedditMentions(name, { limit: 4 });
      }
      if (reddit.error) errors.push(`${name}/Reddit: ${reddit.error}`);
    }

    if (enabled.news_portals) {
      if (useNewsApi) {
        news = await fetchNewsApiMentions(name, {
          limit: 5,
          apiKey: credentials.newsapi.apiKey,
          brandScope: 'rival',
        });
      } else {
        news = await fetchNewsMentions(name, { limit: 5, brandScope: 'rival' });
      }
      if (news.error) errors.push(`${name}/News: ${news.error}`);
    }

    const mentions = [
      ...(hn.mentions || []),
      ...(reddit.mentions || []),
      ...(news.mentions || []),
    ];

    if (mentions.length) {
      for (const m of mentions) {
        const isHn = m.channel === 'hackernews';
        const isNews = m.channel === 'news';
        pushOpp(
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
        if (isHn) stats.hn += 1;
        else if (isNews) stats.news += 1;
        else stats.reddit += 1;
      }
    } else if (preferSyntheticFallback) {
      stats.synthetic += 0;
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
      );
      stats.news += 1;
      stats.ownNews += 1;
    }
  }

  opportunities.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return { opportunities, stats, errors, scannedNames, enabledSources: enabled };
}
