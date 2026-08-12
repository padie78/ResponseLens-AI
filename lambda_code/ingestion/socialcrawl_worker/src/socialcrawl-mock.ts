/**
 * Envelope mock alineado a SocialCrawl /v1/search/everywhere.
 * Usado por socialcrawl_worker cuando el job trae mock:true (misma cola SQS).
 */

export type SocialCrawlTopComment = {
  score: number | null;
  excerpt: string;
  author: string | null;
  url: string | null;
  date: string | null;
};

export type SocialCrawlMention = {
  id: string;
  text: string;
  sourceUrl: string;
  channel: string;
  detectedAt: string;
  _scMeta: {
    provider: 'socialcrawl';
    title?: string | null;
    finalScore?: number | null;
    rerankScore?: number | null;
    engagement?: { points: number | null; numComments: number | null };
    topComments?: SocialCrawlTopComment[];
    sources?: string[];
    clusterId?: string | null;
    clusterTitle?: string | null;
    thumbnailUrl?: string | null;
    planIntent?: string | null;
    candidateId?: string | null;
    mock?: boolean;
  };
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type RawItem = Record<string, unknown> & {
  candidate_id?: string;
  source?: string;
  title?: string | null;
  text?: string;
  url?: string;
  published_at?: string;
  final_score?: number;
  rerank_score?: number;
  sources?: string[];
  cluster_id?: string;
  source_items?: Array<{
    engagement?: { points?: number | null; num_comments?: number | null };
    metadata?: { top_comments?: SocialCrawlTopComment[] };
  }>;
};

function mapItem(item: RawItem, planIntent: string | null): SocialCrawlMention | null {
  const platform = normalizePlatform(String(item.source || 'web'));
  const title = String(item.title || '').trim();
  const body = String(item.text || '').trim();
  const topComments: SocialCrawlTopComment[] = [];
  for (const si of item.source_items || []) {
    for (const c of si.metadata?.top_comments || []) {
      topComments.push({
        score: typeof c.score === 'number' ? c.score : null,
        excerpt: String(c.excerpt || '').slice(0, 300),
        author: c.author != null ? String(c.author) : null,
        url: c.url != null ? String(c.url) : null,
        date: c.date != null ? String(c.date) : null,
      });
    }
  }
  const text = [title, body, topComments[0]?.excerpt].filter(Boolean).join('\n').trim();
  if (!text || text.length < 8) return null;

  let points: number | null = null;
  let numComments: number | null = null;
  for (const si of item.source_items || []) {
    const eng = si.engagement;
    if (!eng) continue;
    if (typeof eng.points === 'number') {
      points = points == null ? eng.points : Math.max(points, eng.points);
    }
    if (typeof eng.num_comments === 'number') {
      numComments =
        numComments == null ? eng.num_comments : Math.max(numComments, eng.num_comments);
    }
  }

  const candidateId = String(
    item.candidate_id || item.url || Math.random().toString(36).slice(2, 9),
  );
  return {
    id: `sc_${platform}_${candidateId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    text: text.slice(0, 4000),
    sourceUrl: String(item.url || ''),
    channel: platform,
    detectedAt: item.published_at || new Date().toISOString(),
    _scMeta: {
      provider: 'socialcrawl',
      title: title || null,
      finalScore: typeof item.final_score === 'number' ? item.final_score : null,
      rerankScore: typeof item.rerank_score === 'number' ? item.rerank_score : null,
      engagement: { points, numComments },
      topComments: topComments.slice(0, 5),
      sources: Array.isArray(item.sources) ? item.sources.map(String) : [String(item.source)],
      clusterId: item.cluster_id != null ? String(item.cluster_id) : null,
      clusterTitle: null,
      thumbnailUrl: null,
      planIntent,
      candidateId,
      mock: true,
    },
  };
}

function buildItems(brand: string, now: number): RawItem[] {
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  return [
    {
      candidate_id: `mock_hn_${brand}_1`,
      source: 'hackernews',
      title: `${brand} outage: status page green but checkout still failing`,
      text: `We've been down for 40 minutes. ${brand} status says all systems operational — that's not true for EU.`,
      url: `https://news.ycombinator.com/item?id=mock_${brand}_1`,
      published_at: iso(45),
      final_score: 71.2,
      rerank_score: 88,
      sources: ['hackernews'],
      cluster_id: 'c_mock_outage',
      source_items: [
        {
          engagement: { points: 214, num_comments: 96 },
          metadata: {
            top_comments: [
              {
                score: 64,
                excerpt: `Same here — ${brand} support just sent the FAQ. Need a real ETA.`,
                author: 'ops_eu',
                url: 'https://news.ycombinator.com/item?id=mock_c1',
                date: iso(30),
              },
            ],
          },
        },
      ],
    },
    {
      candidate_id: `mock_reddit_${brand}_2`,
      source: 'reddit',
      title: `Is anyone else getting charged twice by ${brand}?`,
      text: `Double charge on my card, chat bot loops forever. Looking for alternatives to ${brand}.`,
      url: `https://www.reddit.com/r/fintech/comments/mock_${encodeURIComponent(brand)}/`,
      published_at: iso(120),
      final_score: 64.5,
      rerank_score: 81,
      sources: ['reddit'],
      cluster_id: 'c_mock_billing',
      source_items: [
        {
          engagement: { points: 482, num_comments: 137 },
          metadata: {
            top_comments: [
              {
                score: 210,
                excerpt: `Happened last month too. ${brand} refunded after 5 days.`,
                author: 'shop_owner_mx',
                url: null,
                date: iso(90),
              },
            ],
          },
        },
      ],
    },
    {
      candidate_id: `mock_yt_${brand}_3`,
      source: 'youtube',
      title: `${brand} review 2026 — great DX, terrible incident comms`,
      text: `Love the API. Hate how long ${brand} takes to acknowledge regional outages.`,
      // Stable 11-char id (client YT dedupe)
      url: 'https://www.youtube.com/watch?v=rlMockStrp1',
      published_at: iso(360),
      final_score: 58.1,
      rerank_score: 74,
      sources: ['youtube'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: 1200, num_comments: 88 }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_x_${brand}_4`,
      source: 'twitter-ai-search',
      title: null,
      text: `${brand} support still offline? #outage customers waiting on live chat for 2h.`,
      url: `https://x.com/search?q=${encodeURIComponent(brand + ' outage')}`,
      published_at: iso(18),
      final_score: 52.0,
      rerank_score: 69,
      sources: ['twitter-ai-search'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: 38, num_comments: 12 }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_gh_${brand}_5`,
      source: 'github',
      title: `Docs: ${brand} webhook retries silently drop after 3 attempts`,
      text: `Opened issue — undocumented behaviour is burning our reconcilation jobs.`,
      url: `https://github.com/mock-org/${encodeURIComponent(brand)}/issues/42`,
      published_at: iso(800),
      final_score: 49.3,
      rerank_score: 66,
      sources: ['github'],
      cluster_id: 'c_mock_dx',
      source_items: [{ engagement: { points: 27, num_comments: 9 }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_news_${brand}_6`,
      source: 'tavily',
      title: `${brand} faces customer backlash after EU checkout outage`,
      text: `Several merchants reported failed payments. ${brand} said a regional networking issue has been mitigated.`,
      url: `https://news.example.com/${encodeURIComponent(brand.toLowerCase())}-outage-eu`,
      published_at: iso(200),
      final_score: 61.4,
      rerank_score: 79,
      sources: ['tavily'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: null, num_comments: null }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_news_${brand}_7`,
      source: 'perplexity',
      title: `Analyst note: ${brand} reliability concerns could slow enterprise deals`,
      text: `Coverage summary: repeated SEV-1s and slow status updates are cited in recent RFPs involving ${brand}.`,
      url: `https://www.perplexity.ai/search?q=${encodeURIComponent(brand + ' outage enterprise')}`,
      published_at: iso(480),
      final_score: 55.0,
      rerank_score: 72,
      sources: ['perplexity'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: null, num_comments: null }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_tt_${brand}_8`,
      source: 'tiktok',
      title: null,
      text: `POV: ${brand} checkout fails mid-launch #saas #fail`,
      url: `https://www.tiktok.com/@mock/video/mock_${encodeURIComponent(brand)}`,
      published_at: iso(95),
      final_score: 47.2,
      rerank_score: 63,
      sources: ['tiktok'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: 8900, num_comments: 420 }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_ig_${brand}_9`,
      source: 'instagram',
      title: null,
      text: `${brand} still down for EU creators — stories won't post links.`,
      url: `https://www.instagram.com/p/mock_${encodeURIComponent(brand)}/`,
      published_at: iso(110),
      final_score: 44.0,
      rerank_score: 60,
      sources: ['instagram'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: 320, num_comments: 48 }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_li_${brand}_10`,
      source: 'linkedin',
      title: `Why we paused our ${brand} rollout`,
      text: `Incident response took too long. Sharing lessons for other fintech teams evaluating ${brand}.`,
      url: `https://www.linkedin.com/posts/mock-paused-${encodeURIComponent(brand)}`,
      published_at: iso(600),
      final_score: 50.5,
      rerank_score: 68,
      sources: ['linkedin'],
      cluster_id: 'c_mock_outage',
      source_items: [{ engagement: { points: 156, num_comments: 33 }, metadata: { top_comments: [] } }],
    },
    {
      candidate_id: `mock_th_${brand}_11`,
      source: 'threads',
      title: null,
      text: `anyone else stuck on ${brand} verification loops?`,
      url: `https://www.threads.net/@mock/post/mock_${encodeURIComponent(brand)}`,
      published_at: iso(70),
      final_score: 41.0,
      rerank_score: 58,
      sources: ['threads'],
      cluster_id: 'c_mock_billing',
      source_items: [{ engagement: { points: 89, num_comments: 21 }, metadata: { top_comments: [] } }],
    },
  ];
}

/** Simula latencia de SocialCrawl (~1.5–3s) antes de devolver el envelope. */
export async function searchSocialCrawlMock(query: string): Promise<SocialCrawlSearchResult> {
  const brand =
    String(query || 'brand')
      .replace(/["']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 512) || 'brand';

  await delay(1500 + Math.floor(Math.random() * 1500));

  const items = buildItems(brand, Date.now());
  const planIntent = 'opinion';
  const mentions = items
    .map((item) => mapItem(item, planIntent))
    .filter((m): m is SocialCrawlMention => Boolean(m));

  return {
    ok: true,
    mentions,
    rawCount: items.length,
    creditsUsed: 0,
    creditsRemaining: 100,
    coverage: 11 / 14,
    sourcesSucceeded: [
      'hackernews',
      'reddit',
      'youtube',
      'twitter-ai-search',
      'github',
      'tavily',
      'perplexity',
      'tiktok',
      'instagram',
      'linkedin',
      'threads',
    ],
    sourcesFailed: {
      pinterest: 'mock: empty upstream',
      rumble: 'mock: pruned low_affinity',
      polymarket: 'mock: pruned low_affinity',
    },
    planIntent,
  };
}
