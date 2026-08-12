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
import { mentionDedupeKeys, extractYouTubeVideoId } from './mention-dedupe.js';
import { hasNewsApi, hasRedditOAuth, hasYouTubeApi } from './scan-credentials.js';
import { analyzeBrandMention, sentimentToStorage, computeMentionScore } from './mention-intelligence.js';
import { fetchSocialCrawlMentions, hasSocialCrawlServer as hasSocialCrawl } from './socialcrawl-client.js';

const NEGATIVE_HINT =
  /\b(scam|outage|broken|terrible|horrible|awful|refund|downtime|fail(ure|ed|ing)?|bug|crash|estafa|falla|ca[ií]da|basura|caro|slow|unreliable|worst|hate|sucks|lawsuit|demanda|crisis|polémica|polemica|investigat|multa|breach|filtración|filtracion|complaint|queja|estaf|fraude|boycott)\b/i;

const POSITIVE_HINT =
  /\b(love|great|amazing|awesome|excellent|fantastic|recommend|best|impressed|gracias|excelente|incre[ií]ble|recomiendo|genial|perfecto|útil|util|helpful|game[- ]?changer|won|éxito|exito|launch|partnership|award|premio|crecimiento)\b/i;

/**
 * Adjunta meta SocialCrawl y recalcula score IA con engagement/ranking.
 * @param {object} opp
 * @param {object} scMeta
 */
function applyScMetaToOpp(opp, scMeta) {
  if (!opp || !scMeta) return;
  opp._scMeta = scMeta;
  const brandScope = opp._brandScope === 'own' ? 'own' : 'rival';
  const mentionKind =
    opp._mentionKind === 'media' || opp._actionable === false ? 'media' : 'comment';
  const pack = computeMentionScore({
    text: opp.originalComplaint,
    brandScope,
    mentionKind,
    sentimiento: opp._intel?.sentimiento,
    frustrationScore: opp.frustrationScore,
    scMeta,
  });
  opp._aiScore = pack.score;
  opp._aiScoreBand = pack.band;
  opp._aiScoreLabel = pack.label;
  opp._aiScoreDrivers = pack.drivers;
  opp._aiScoreKind = brandScope === 'rival' ? 'opportunity' : 'risk';
  if (opp._intel && typeof opp._intel === 'object') {
    opp._intel.score_ia = pack.score;
    opp._intel.score_banda = pack.band;
    opp._intel.score_etiqueta = pack.label;
    opp._intel.score_drivers = pack.drivers;
  }
}

/** @param {object | null | undefined} next @param {object | null | undefined} prev */
function scMetaRicher(next, prev) {
  if (!next) return false;
  if (!prev) return true;
  const nEng = (next.engagement?.points || 0) + (next.engagement?.numComments || 0);
  const pEng = (prev.engagement?.points || 0) + (prev.engagement?.numComments || 0);
  const nC = Array.isArray(next.topComments) ? next.topComments.length : 0;
  const pC = Array.isArray(prev.topComments) ? prev.topComments.length : 0;
  return (
    nEng > pEng ||
    nC > pC ||
    (next.finalScore || 0) > (prev.finalScore || 0) ||
    (next.rerankScore || 0) > (prev.rerankScore || 0)
  );
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return ' ';
      }
    })
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return ' ';
      }
    })
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Match de marca en texto (evita falsos positivos tipo “strike” vía Algolia). */
function textMentionsBrand(text, brand) {
  const hay = String(text || '').toLowerCase();
  const needle = String(brand || '').toLowerCase().trim();
  if (!needle || needle.length < 2) return false;
  if (hay.includes(needle)) return true;
  // Handles / dominios comunes
  if (hay.includes(`${needle}.com`) || hay.includes(`@${needle}`)) return true;
  return false;
}

/**
 * comment = hilo/queja respondible · media = video/noticia (solo monitoreo).
 * @returns {'comment' | 'media'}
 */
export function resolveOwnMentionKind({ flags = {}, channel = '', sourceUrl = '', text = '' } = {}) {
  if (flags.youtube || flags.news) return 'media';
  const ch = String(channel || '').toLowerCase();
  if (ch === 'youtube' || ch === 'news') return 'media';
  if (extractYouTubeVideoId(sourceUrl) || extractYouTubeVideoId(text)) return 'media';
  if (flags.socialcrawl && (ch === 'web' || ch === 'news' || ch === 'youtube')) return 'media';
  return 'comment';
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
 * Fetch JSON (SPA: siempre fetch directo; sin chrome.runtime).
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status?: number, json?: unknown, contentType?: string, error?: string }>}
 */
async function extensionFetchJson(url, headers = {}) {
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
    // CORS fallback
    try {
      const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxied);
      const text = await res.text();
      const json = JSON.parse(text);
      return { ok: true, status: 200, json };
    } catch {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Fetch texto/XML (RSS, etc.). */
async function extensionFetchText(url) {
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
    try {
      const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxied);
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
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
        if (!textMentionsBrand(text, name)) continue;
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

  // Comillas + typoTolerance=false: sin esto Algolia matchea “strike/strips”
  // y nuestro filtro literal descarta casi todo (marca “Stripe” → 0 resultados).
  const queries = allSentiment
    ? [`"${name}"`, `"${name}" review`, `"${name}" experience`, `"${name}" payment`]
    : [
        `"${name}"`,
        `"${name}" scam`,
        `"${name}" outage`,
        `"${name}" broken`,
        `"${name}" terrible`,
        `"${name}" fail`,
      ];

  const tagSets = allSentiment ? ['comment', 'story'] : ['comment'];
  const byId = new Map();
  let lastError = '';

  for (const query of queries) {
    if (byId.size >= limit) break;

    for (const tags of tagSets) {
      if (byId.size >= limit) break;
      for (const endpoint of ['search_by_date', 'search']) {
        if (byId.size >= limit) break;
        const url =
          `https://hn.algolia.com/api/v1/${endpoint}?query=${encodeURIComponent(query)}` +
          `&tags=${encodeURIComponent(tags)}&hitsPerPage=${allSentiment ? 25 : 12}` +
          `&typoTolerance=false`;

        const res = await extensionFetchJson(url);
        if (!res.ok || !res.json) {
          lastError = res.error || `HN HTTP ${res.status || '?'}`;
          continue;
        }

        const hits = Array.isArray(res.json?.hits) ? res.json.hits : [];
        for (const hit of hits) {
          const text = stripHtml(
            hit.comment_text || hit.title || hit.story_title || hit.story_text || '',
          );
          if (!text || text.length < 20) continue;
          if (!textMentionsBrand(text, name)) continue;
          if (!allSentiment) {
            if (!looksNegative(text) && scoreFrustration(text) < 0.3) continue;
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
    const blocked = Number(res.status) === 403;
    return {
      mentions: [],
      error: blocked
        ? 'Reddit 403 (API pública bloqueada — activá Reddit OAuth en Config → Fuentes)'
        : res.error || `Reddit HTTP ${res.status || '?'}`,
    };
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
    if (!textMentionsBrand(text, name)) continue;
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
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(tokenJson?.error || 'Reddit OAuth failed');
  }
  const res = { ok: true, json: tokenJson };
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
    if (!text || !textMentionsBrand(text, name)) continue;
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
    if (!text || !textMentionsBrand(text, name)) continue;
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

  // Fallback gratis: noticias/índice que apuntan a YouTube (1 locale — evita dupes AR/US)
  const query = `"${name}" site:youtube.com`;
  const locales = [{ hl: 'en-US', gl: 'US', ceid: 'US:en' }];
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
      if (!isYt && !textMentionsBrand(text, name)) continue;
      if (!textMentionsBrand(text, name)) continue;

      const ytId = extractYouTubeVideoId(link) || extractYouTubeVideoId(text);
      const idKey = ytId || item.guid || link || item.title;
      if (!idKey || byId.has(idKey)) continue;

      byId.set(idKey, {
        id: ytId ? `yt_${ytId}` : `yt_rss_${Math.abs(hashStr(idKey)).toString(36)}`,
        text,
        sourceUrl: ytId
          ? `https://www.youtube.com/watch?v=${ytId}`
          : link || `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`,
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
  // Solo SocialCrawl (everywhere). Sin HN/News/Reddit/página paralelos.
  const enabled = {
    hackernews: false,
    reddit_api: false,
    active_page: false,
    news_portals: false,
  };
  const useRedditOauth = false;
  const useNewsApi = false;
  const stats = {
    hn: 0,
    reddit: 0,
    news: 0,
    page: 0,
    ownNews: 0,
    synthetic: 0,
    socialcrawl: 0,
    competitors: list.length,
    skippedDupes: 0,
    providers: {
      reddit: 'off',
      news: 'off',
      socialcrawl: hasSocialCrawl(credentials) ? 'socialcrawl' : 'off',
    },
    perCompetitor: {},
  };
  const seen = new Map();

  const findSeen = (keys) => {
    for (const k of keys) {
      if (seen.has(k)) return seen.get(k);
    }
    return null;
  };

  const registerSeen = (keys, opp) => {
    for (const k of keys) seen.set(k, opp);
  };

  const pushOpp = (partial, flags = {}) => {
    const keys = mentionDedupeKeys({
      text: partial.complaint,
      sourceUrl: partial.sourceUrl,
      competitorName: partial.competitorName,
      _brandScope: partial.brandScope === 'own' ? 'own' : 'rival',
    });
    const existing = findSeen(keys);
    if (existing) {
      if (partial._scMeta && scMetaRicher(partial._scMeta, existing._scMeta)) {
        applyScMetaToOpp(existing, partial._scMeta);
        if (flags.socialcrawl) existing._source = existing._source || 'socialcrawl';
        return 'enriched';
      }
      stats.skippedDupes += 1;
      return false;
    }
    if (!keys.length) {
      stats.skippedDupes += 1;
      return false;
    }
    const opp = buildOpportunity({
      ...partial,
      company,
      userId,
      competitors: list,
      demo: false,
      alertId: partial.alertId || null,
      detectedAt: partial.detectedAt || null,
    });
    if (partial._scMeta) opp._scMeta = partial._scMeta;
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
        frustrationScore: opp.frustrationScore,
        scMeta: partial._scMeta || null,
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
      if (typeof intel._rl?.aiScore === 'number') {
        opp._aiScore = intel._rl.aiScore;
        opp._aiScoreBand = intel._rl.aiScoreBand;
        opp._aiScoreLabel = intel._rl.aiScoreLabel;
        opp._aiScoreDrivers = intel._rl.aiScoreDrivers;
        opp._aiScoreKind = 'opportunity';
      }
    }
    // Floor: descartar ruido casi nulo salvo página / SocialCrawl (señal externa)
    if (
      !flags.page &&
      !flags.socialcrawl &&
      (opp.frustrationScore || 0) < 0.28 &&
      !looksNegative(partial.complaint)
    ) {
      stats.skippedDupes += 1;
      return false;
    }
    opportunities.push(opp);
    registerSeen(keys, opp);
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
      const name = String(competitor.name || competitor || '').trim();
      if (!name) continue;
      const sc = await fetchSocialCrawlMentions(credentials, name, {
        lookbackDays: Number(credentials.socialcrawl?.lookbackDays) || 7,
        // vacío → client usa SOCIALCRAWL_EVERYWHERE_SOURCES (HN + news + todos)
        sources: '',
      });
      if (sc.error) errors.push(`SocialCrawl/${name}: ${sc.error}`);
      else if (!sc.mentions?.length) {
        errors.push(`SocialCrawl/${name}: 0 resultados (raw=${sc.rawCount ?? 0})`);
      }
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
              _scMeta: m._scMeta || null,
            },
            { socialcrawl: true },
          )
        ) {
          stats.socialcrawl += 1;
        }
      }
      if (!sc.error && sc.mentions?.length) {
        const cov =
          typeof sc.coverage === 'number' ? ` cobertura ${Math.round(sc.coverage * 100)}%` : '';
        const failed = sc.sourcesFailed ? Object.keys(sc.sourcesFailed).length : 0;
        if (failed || cov) {
          errors.push(
            `SocialCrawl/${name}:${cov}${failed ? ` · ${failed} fuentes fallidas` : ''}${
              sc.planIntent ? ` · intent=${sc.planIntent}` : ''
            }`,
          );
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
  // Solo SocialCrawl (everywhere). Sin HN/News/Reddit/YT/página paralelos.
  const enabled = {
    hackernews: false,
    reddit_api: false,
    active_page: false,
    news_portals: false,
    youtube_api: false,
  };
  const useYoutubeApi = false;
  const stats = {
    hn: 0,
    reddit: 0,
    news: 0,
    youtube: 0,
    page: 0,
    socialcrawl: 0,
    skippedDupes: 0,
    providers: {
      reddit: 'off',
      news: 'off',
      youtube: 'off',
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

  const useRedditOauth = false;
  const useNewsApi = false;
  const seen = new Map();

  const findSeen = (keys) => {
    for (const k of keys) {
      if (seen.has(k)) return seen.get(k);
    }
    return null;
  };

  const registerSeen = (keys, opp) => {
    for (const k of keys) seen.set(k, opp);
  };

  const pushOwn = (partial, flags) => {
    const keys = mentionDedupeKeys({
      text: partial.complaint,
      sourceUrl: partial.sourceUrl,
      competitorName: ownName,
      _brandScope: 'own',
    });
    const existing = findSeen(keys);
    if (existing) {
      if (partial._scMeta && scMetaRicher(partial._scMeta, existing._scMeta)) {
        applyScMetaToOpp(existing, partial._scMeta);
        if (flags.socialcrawl) {
          existing._source = 'socialcrawl';
          if (!/SocialCrawl/i.test(String(existing.notes || ''))) {
            existing.notes = [existing.notes, 'SocialCrawl (multi-plataforma)']
              .filter(Boolean)
              .join(' · ');
          }
        }
        return 'enriched';
      }
      stats.skippedDupes += 1;
      return false;
    }
    if (!keys.length) {
      stats.skippedDupes += 1;
      return false;
    }
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
    if (partial._scMeta) opp._scMeta = partial._scMeta;
    opp._brandScope = 'own';
    opp._sentiment = sentiment;
    const mentionKindEarly = resolveOwnMentionKind({
      flags,
      channel: partial.channel || opp.channel,
      sourceUrl: partial.sourceUrl || opp.sourceUrl,
      text: partial.complaint,
    });
    const intel = analyzeBrandMention({
      text: partial.complaint,
      channel: partial.channel || opp.channel,
      sourceUrl: partial.sourceUrl || opp.sourceUrl,
      brandScope: 'own',
      companyName: ownName,
      mentionKind: mentionKindEarly,
      frustrationScore: opp.frustrationScore,
      scMeta: partial._scMeta || null,
      systemContext: {
        alertId: opp.alertId,
        provider: flags.socialcrawl ? 'socialcrawl' : flags.page ? 'page' : 'scan',
      },
    });
    opp._intel = intel.analisis_comentario_recibido;
    opp._analysisSummary =
      intel.analisis_comentario_recibido?.analisis_estrategico?.resumen_insight ||
      intel._rl?.analysisSummary ||
      '';
    if (intel.analisis_comentario_recibido?.respuesta_sugerida_publica) {
      opp.salesPitch = intel.analisis_comentario_recibido.respuesta_sugerida_publica;
    }
    if (typeof intel._rl?.aiScore === 'number') {
      opp._aiScore = intel._rl.aiScore;
      opp._aiScoreBand = intel._rl.aiScoreBand;
      opp._aiScoreLabel = intel._rl.aiScoreLabel;
      opp._aiScoreDrivers = intel._rl.aiScoreDrivers;
      opp._aiScoreKind = 'risk';
    }
    const mappedSent = sentimentToStorage(intel.analisis_comentario_recibido?.sentimiento);
    if (mappedSent) opp._sentiment = mappedSent;
    else if (!opp._sentiment) opp._sentiment = 'NEUTRAL';
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

    const mentionKind = resolveOwnMentionKind({
      flags,
      channel: opp.channel || partial.channel,
      sourceUrl: partial.sourceUrl || opp.sourceUrl,
      text: partial.complaint,
    });
    opp._mentionKind = mentionKind;
    opp._actionable = mentionKind === 'comment';

    const srcNote =
      flags.page
        ? 'Detectado en página abierta'
        : flags.socialcrawl
          ? 'SocialCrawl (multi-plataforma)'
          : flags.hn
            ? 'Mención de tu marca en Hacker News'
            : flags.news
              ? 'Artículo / noticia sobre tu marca (monitoreo)'
              : flags.youtube
                ? 'Video en YouTube (monitoreo, no es un comentario)'
                : 'Mención de tu marca en Reddit';
    const kindNote =
      mentionKind === 'media' ? 'Tipo: mención / media (sin respuesta en hilo)' : 'Tipo: comentario accionable';
    const finalSent = String(opp._sentiment || 'NEUTRAL').toUpperCase();
    const sentNote =
      finalSent === 'POSITIVE'
        ? 'Sentimiento positivo'
        : finalSent === 'NEGATIVE'
          ? 'Sentimiento negativo'
          : 'Sentimiento neutro';
    opp.notes = [opp.notes, srcNote, kindNote, sentNote].filter(Boolean).join(' · ');

    // Propios: guardar todo (pos/neg/neutro). Solo descartamos texto vacío.
    if (!String(partial.complaint || '').trim()) {
      stats.skippedDupes += 1;
      return false;
    }
    opportunities.push(opp);
    registerSeen(keys, opp);
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

  // SocialCrawl primero: deja _scMeta en el registro canónico; HN/News posteriores dedupean.
  if (hasSocialCrawl(credentials)) {
    const sc = await fetchSocialCrawlMentions(credentials, ownName, {
      lookbackDays: Number(credentials.socialcrawl?.lookbackDays) || 7,
      sources: '',
    });
    if (sc.error) errors.push(`SocialCrawl: ${sc.error}`);
    else if (!sc.mentions?.length) {
      errors.push(
        `SocialCrawl: 0 resultados para "${ownName}" (raw=${sc.rawCount ?? 0}, lookback=${Number(credentials.socialcrawl?.lookbackDays) || 7}d)`,
      );
    }
    for (const m of sc.mentions || []) {
      const ok = pushOwn(
        {
          alertId: m.id || null,
          complaint: m.text,
          sourceUrl: m.sourceUrl,
          channel: m.channel,
          detectedAt: m.detectedAt,
          _scMeta: m._scMeta || null,
        },
        { socialcrawl: true },
      );
      if (ok) stats.socialcrawl += 1;
    }
    if (!sc.error && sc.mentions?.length) {
      const withMeta = (sc.mentions || []).filter((m) => m._scMeta).length;
      const cov =
        typeof sc.coverage === 'number' ? ` cobertura ${Math.round(sc.coverage * 100)}%` : '';
      const failed = sc.sourcesFailed ? Object.keys(sc.sourcesFailed).length : 0;
      const credits =
        sc.creditsRemaining != null ? ` · créditos restantes ${sc.creditsRemaining}` : '';
      errors.push(
        `SocialCrawl OK: ${withMeta}/${sc.mentions.length} con meta${cov}${
          failed ? ` · ${failed} fuentes fallidas` : ''
        }${sc.planIntent ? ` · intent=${sc.planIntent}` : ''}${credits}`,
      );
    }
  }     else {
    errors.push(
      'SocialCrawl off — key solo en servidor (Terraform socialcrawl_api_key + AppSync sync:env).',
    );
  }

  for (const qName of queryNames) {
    if (enabled.hackernews) {
      const part = await fetchHnMentions(qName, { limit: 20, allSentiment: true });
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
            limit: 15,
            reddit: credentials.reddit,
            allSentiment: true,
          })
        : await fetchRedditMentions(qName, { limit: 12, allSentiment: true });
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
            limit: 15,
            apiKey: credentials.newsapi.apiKey,
            brandScope: 'own',
            allSentiment: true,
          })
        : await fetchNewsMentions(qName, {
            limit: 15,
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
        limit: 10,
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

  opportunities.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  return { opportunities, stats, errors, scannedNames, enabledSources: enabled };
}

