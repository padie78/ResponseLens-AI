/**
 * Cliente SocialCrawl server-side — la API key vive en env (Terraform), nunca en el SPA.
 * Docs: https://www.socialcrawl.dev/docs/search/everywhere
 */

export type SocialCrawlTopComment = {
  score: number | null;
  excerpt: string;
  author: string | null;
  url: string | null;
  date: string | null;
};

export type SocialCrawlMeta = {
  provider: 'socialcrawl';
  title?: string | null;
  finalScore?: number | null;
  rerankScore?: number | null;
  engagement?: { points: number | null; numComments: number | null };
  topComments?: SocialCrawlTopComment[];
  sources?: string[];
  clusterId?: string | null;
  clusterTitle?: string | null;
  clusterScore?: number | null;
  thumbnailUrl?: string | null;
  transcript?: string | null;
  planIntent?: string | null;
  candidateId?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  domain?: string | null;
};

export type SocialCrawlMention = {
  id: string;
  text: string;
  sourceUrl: string;
  channel: string;
  detectedAt: string;
  _scMeta: SocialCrawlMeta;
};

export type SocialCrawlSearchResult = {
  ok: boolean;
  error?: string;
  mentions: SocialCrawlMention[];
  rawCount: number;
  creditsUsed: number | null;
  creditsRemaining: number | null;
  coverage: number | null;
  sourcesSucceeded: string[];
  sourcesFailed: Record<string, string>;
  planIntent: string | null;
};

function normalizePlatform(raw: string): string {
  const p = String(raw || 'web')
    .toLowerCase()
    .replace(/-ai-search$/, '')
    .replace(/-hashtag$/, '')
    .replace(/^twitter$/, 'x');
  if (p === 'tavily' || p === 'perplexity') return 'news';
  return p;
}

function collectTopComments(item: Record<string, unknown>): SocialCrawlTopComment[] {
  const out: SocialCrawlTopComment[] = [];
  const push = (c: unknown) => {
    if (!c) return;
    if (typeof c === 'string') {
      const excerpt = c.trim();
      if (excerpt) out.push({ score: null, excerpt: excerpt.slice(0, 300), author: null, url: null, date: null });
      return;
    }
    if (typeof c !== 'object') return;
    const o = c as Record<string, unknown>;
    const excerpt = String(o.excerpt || o.text || o.body || '').trim();
    if (!excerpt) return;
    out.push({
      score: typeof o.score === 'number' ? o.score : null,
      excerpt: excerpt.slice(0, 300),
      author: o.author != null ? String(o.author) : null,
      url: o.url != null ? String(o.url) : null,
      date: o.date != null ? String(o.date) : null,
    });
  };
  if (Array.isArray(item.top_comments)) item.top_comments.forEach(push);
  if (Array.isArray(item.comments)) item.comments.forEach(push);
  const sourceItems = Array.isArray(item.source_items) ? item.source_items : [];
  for (const si of sourceItems) {
    const meta = (si as { metadata?: { top_comments?: unknown[] } })?.metadata;
    if (Array.isArray(meta?.top_comments)) meta.top_comments.forEach(push);
  }
  const seen = new Set<string>();
  return out
    .filter((c) => {
      const k = c.excerpt.slice(0, 80).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 5);
}

function extractEngagement(item: Record<string, unknown>): {
  points: number | null;
  numComments: number | null;
} {
  let points: number | null = null;
  let numComments: number | null = null;
  const sourceItems = Array.isArray(item.source_items) ? item.source_items : [];
  for (const si of sourceItems) {
    const eng = (si as { engagement?: { points?: number; num_comments?: number } })?.engagement;
    if (!eng) continue;
    if (typeof eng.points === 'number') points = points == null ? eng.points : Math.max(points, eng.points);
    if (typeof eng.num_comments === 'number') {
      numComments = numComments == null ? eng.num_comments : Math.max(numComments, eng.num_comments);
    }
  }
  return { points, numComments };
}

function extractMedia(item: Record<string, unknown>): { thumbnailUrl: string | null; transcript: string | null } {
  let thumbnailUrl: string | null = null;
  let transcript: string | null = null;
  const sourceItems = Array.isArray(item.source_items) ? item.source_items : [];
  for (const si of sourceItems) {
    const rec = si as {
      media?: { thumbnail_url?: string };
      metadata?: { thumbnail_url?: string; transcript?: unknown };
    };
    const thumb = rec.media?.thumbnail_url || rec.metadata?.thumbnail_url;
    if (thumb && !thumbnailUrl) thumbnailUrl = String(thumb);
    const tr = rec.metadata?.transcript;
    if (tr && !transcript) {
      transcript = typeof tr === 'string' ? tr.slice(0, 2000) : JSON.stringify(tr).slice(0, 2000);
    }
  }
  return { thumbnailUrl, transcript };
}

function extractAuthor(item: Record<string, unknown>): string | null {
  const direct = item.author ?? item.username ?? item.user;
  if (direct != null && String(direct).trim()) return String(direct).trim().slice(0, 80);
  const sourceItems = Array.isArray(item.source_items) ? item.source_items : [];
  for (const si of sourceItems) {
    const rec = si as { author?: unknown; metadata?: { author?: unknown } };
    const a = rec.author ?? rec.metadata?.author;
    if (a != null && String(a).trim()) return String(a).trim().slice(0, 80);
  }
  return null;
}

function extractDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function mapItem(
  item: Record<string, unknown>,
  planIntent: string | null,
  clustersById: Record<string, { title?: string; score?: number }> = {},
): SocialCrawlMention | null {
  const platform = normalizePlatform(String(item.source || item.platform || 'web'));
  const title = String(item.title || item.headline || '').trim();
  const body = String(item.text || item.snippet || item.description || item.content || '').trim();
  const topComments = collectTopComments(item);
  const text = [title, body, topComments[0]?.excerpt].filter(Boolean).join('\n').trim();
  if (!text || text.length < 8) return null;

  const sourceUrl = String(item.url || item.link || item.permalink || item.candidate_id || '').trim();
  const candidateId = String(item.candidate_id || item.id || sourceUrl || Math.random().toString(36).slice(2, 9));
  let detectedAt = new Date().toISOString();
  const rawDate = item.published_at || item.created_at || item.date || topComments[0]?.date;
  if (rawDate) {
    const t = Date.parse(String(rawDate));
    if (Number.isFinite(t)) detectedAt = new Date(t).toISOString();
  }

  const engagement = extractEngagement(item);
  const media = extractMedia(item);
  const sources = Array.isArray(item.sources)
    ? item.sources.map(String)
    : item.source
      ? [String(item.source)]
      : [];
  const clusterId = item.cluster_id != null ? String(item.cluster_id) : null;
  const cluster = clusterId ? clustersById[clusterId] : undefined;

  return {
    id: `sc_${platform}_${candidateId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    text: text.slice(0, 4000),
    sourceUrl: sourceUrl || `https://www.socialcrawl.dev/?q=${encodeURIComponent(title || body.slice(0, 40))}`,
    channel: platform,
    detectedAt,
    _scMeta: {
      provider: 'socialcrawl',
      title: title || null,
      finalScore: typeof item.final_score === 'number' ? item.final_score : null,
      rerankScore: typeof item.rerank_score === 'number' ? item.rerank_score : null,
      engagement,
      topComments,
      sources,
      clusterId,
      clusterTitle: cluster?.title ? String(cluster.title) : null,
      clusterScore: typeof cluster?.score === 'number' ? cluster.score : null,
      thumbnailUrl: media.thumbnailUrl,
      transcript: media.transcript,
      planIntent,
      candidateId,
      author: extractAuthor(item),
      publishedAt: detectedAt,
      domain: extractDomain(sourceUrl),
    },
  };
}

/**
 * @param opts.query Natural language (no quotes/operators)
 */
export async function searchSocialCrawlEverywhere(opts: {
  apiKey?: string;
  query: string;
  lookbackDays?: number;
  sources?: string;
}): Promise<SocialCrawlSearchResult> {
  const apiKey = String(opts.apiKey || process.env.SOCIALCRAWL_API_KEY || '').trim();
  const query = String(opts.query || '')
    .replace(/["']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 512);

  if (!apiKey) {
    return {
      ok: false,
      error: 'SOCIALCRAWL_API_KEY missing on server',
      mentions: [],
      rawCount: 0,
      creditsUsed: null,
      creditsRemaining: null,
      coverage: null,
      sourcesSucceeded: [],
      sourcesFailed: {},
      planIntent: null,
    };
  }
  if (!query) {
    return {
      ok: false,
      error: 'empty_query',
      mentions: [],
      rawCount: 0,
      creditsUsed: null,
      creditsRemaining: null,
      coverage: null,
      sourcesSucceeded: [],
      sourcesFailed: {},
      planIntent: null,
    };
  }

  const lookback = Math.min(Math.max(Number(opts.lookbackDays) || 3, 1), 30);
  const fetchTimeoutMs = Math.min(
    Math.max(Number(process.env.SOCIALCRAWL_FETCH_TIMEOUT_MS) || 110_000, 5_000),
    115_000,
  );
  const url = new URL('https://www.socialcrawl.dev/v1/search/everywhere');
  url.searchParams.set('query', query);
  url.searchParams.set('lookback_days', String(lookback));
  if (opts.sources?.trim()) url.searchParams.set('sources', opts.sources.trim());
  else {
    url.searchParams.set(
      'sources',
      [
        'reddit',
        'twitter-ai-search',
        'youtube',
        'tiktok',
        'instagram',
        'hackernews',
        'polymarket',
        'github',
        'threads',
        'pinterest',
        'perplexity',
        'tavily',
        'linkedin',
        'rumble',
      ].join(','),
    );
  }

  let envelope: Record<string, unknown>;
  try {
    const res = await fetch(url.toString(), {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    envelope = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = envelope.error as { message?: string } | string | undefined;
      const msg =
        (typeof errObj === 'object' && errObj?.message) ||
        (typeof errObj === 'string' ? errObj : null) ||
        `HTTP ${res.status}`;
      return {
        ok: false,
        error: String(msg),
        mentions: [],
        rawCount: 0,
        creditsUsed: null,
        creditsRemaining: null,
        coverage: null,
        sourcesSucceeded: [],
        sourcesFailed: {},
        planIntent: null,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /abort|timeout|timed out/i.test(msg);
    return {
      ok: false,
      error: timedOut
        ? `socialcrawl_timeout (${fetchTimeoutMs}ms) — probá lookback más corto (3d) o menos fuentes en Config`
        : msg,
      mentions: [],
      rawCount: 0,
      creditsUsed: null,
      creditsRemaining: null,
      coverage: null,
      sourcesSucceeded: [],
      sourcesFailed: {},
      planIntent: null,
    };
  }

  if (envelope.success === false) {
    const errObj = envelope.error as { message?: string } | string | undefined;
    return {
      ok: false,
      error:
        (typeof errObj === 'object' && errObj?.message) ||
        (typeof errObj === 'string' ? errObj : 'socialcrawl_error'),
      mentions: [],
      rawCount: 0,
      creditsUsed: null,
      creditsRemaining: null,
      coverage: null,
      sourcesSucceeded: [],
      sourcesFailed: {},
      planIntent: null,
    };
  }

  const data = (envelope.data ?? envelope) as Record<string, unknown>;
  const plan = data.plan as { intent?: string } | undefined;
  const planIntent = plan?.intent ? String(plan.intent) : null;
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const clustersById: Record<string, { title?: string; score?: number }> = {};
  const clusters = Array.isArray(data.clusters) ? data.clusters : [];
  for (const c of clusters) {
    if (!c || typeof c !== 'object') continue;
    const rec = c as { cluster_id?: string; id?: string; title?: string; score?: number };
    const id = String(rec.cluster_id || rec.id || '');
    if (!id) continue;
    clustersById[id] = { title: rec.title, score: rec.score };
  }
  const mentions = items
    .map((item) => mapItem(item, planIntent, clustersById))
    .filter((m): m is SocialCrawlMention => Boolean(m));

  return {
    ok: true,
    mentions,
    rawCount: items.length,
    creditsUsed: typeof envelope.credits_used === 'number' ? envelope.credits_used : null,
    creditsRemaining:
      typeof envelope.credits_remaining === 'number' ? envelope.credits_remaining : null,
    coverage: typeof data.coverage === 'number' ? data.coverage : null,
    sourcesSucceeded: Array.isArray(data.sources_succeeded)
      ? data.sources_succeeded.map(String)
      : [],
    sourcesFailed:
      data.sources_failed && typeof data.sources_failed === 'object'
        ? (data.sources_failed as Record<string, string>)
        : {},
    planIntent,
  };
}
