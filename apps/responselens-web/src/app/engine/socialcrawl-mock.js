import { normalizePlatformChannel } from './platforms.js';

/**
 * Mock de SocialCrawl `/v1/search/everywhere` — misma forma que el envelope real
 * (items + top_comments + engagement) mapeada al shape del cliente SPA.
 * Incluye HN + News dentro del everywhere (no orígenes aparte).
 * No llama a la API ni gasta créditos.
 */

let mockEnabled = false;

export function setSocialCrawlMock(enabled) {
  mockEnabled = Boolean(enabled);
}

export function isSocialCrawlMock() {
  return mockEnabled;
}

/**
 * Simula latencia de red (~0.6–1.2s).
 * @param {string} query
 * @returns {Promise<{
 *   mentions: object[],
 *   error: null,
 *   skipped: false,
 *   rawCount: number,
 *   creditsUsed: number,
 *   creditsRemaining: number,
 *   sourcesSucceeded: string[],
 *   sourcesFailed: Record<string, string>,
 *   coverage: number,
 *   partialFailure: false,
 *   planIntent: string,
 *   clusterCount: number,
 *   mock: true,
 * }>}
 */
export async function fetchMockSocialCrawlMentions(query) {
  const q = String(query || 'brand')
    .replace(/["']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'brand';

  await delay(600 + Math.floor(Math.random() * 600));

  const envelope = buildMockEverywhereEnvelope(q);
  const planIntent = envelope.data.plan?.intent || 'opinion';
  const mentions = envelope.data.items
    .map((item) => mapMockItem(item, planIntent))
    .filter(Boolean);

  return {
    mentions,
    error: null,
    skipped: false,
    rawCount: envelope.data.items.length,
    creditsUsed: envelope.credits_used,
    creditsRemaining: envelope.credits_remaining,
    sourcesSucceeded: envelope.data.sources_succeeded,
    sourcesFailed: envelope.data.sources_failed,
    coverage: envelope.data.coverage,
    partialFailure: false,
    planIntent,
    clusterCount: envelope.data.clusters.length,
    mock: true,
  };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Envelope idéntico al de https://www.socialcrawl.dev/docs/search/everywhere
 * @param {string} query
 */
export function buildMockEverywhereEnvelope(query) {
  const now = Date.now();
  const iso = (minsAgo) => new Date(now - minsAgo * 60_000).toISOString();
  const brand = query;

  const items = [
    {
      candidate_id: `mock_hn_${brand}_1`,
      source: 'hackernews',
      title: `${brand} outage: status page green but checkout still failing`,
      text: `We've been down for 40 minutes. ${brand} status says all systems operational — that's not true for EU.`,
      url: `https://news.ycombinator.com/item?id=mock_${encodeURIComponent(brand)}_1`,
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
              {
                score: 41,
                excerpt: 'We switched volume to a competitor for the afternoon. Painful.',
                author: 'fintech_cto',
                url: 'https://news.ycombinator.com/item?id=mock_c2',
                date: iso(22),
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
                excerpt: `Happened last month too. ${brand} refunded after 5 days — not OK for cashflow.`,
                author: 'shop_owner_mx',
                url: 'https://www.reddit.com/r/fintech/comments/mock_c3/',
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
      url: 'https://www.youtube.com/watch?v=rlMockStrp1',
      published_at: iso(360),
      final_score: 58.1,
      rerank_score: 74,
      sources: ['youtube'],
      cluster_id: 'c_mock_outage',
      source_items: [
        {
          engagement: { points: 1200, num_comments: 88 },
          metadata: {
            top_comments: [
              {
                score: 95,
                excerpt: `Pinned: we migrated away from ${brand} after the last SEV-1.`,
                author: 'devtools_channel',
                url: null,
                date: iso(300),
              },
            ],
          },
        },
      ],
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
      source_items: [
        {
          engagement: { points: 27, num_comments: 9 },
          metadata: {
            top_comments: [
              {
                score: 12,
                excerpt: 'Can confirm. We had to build our own idempotency layer.',
                author: 'backend-dev',
                url: null,
                date: iso(700),
              },
            ],
          },
        },
      ],
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
      source_items: [
        {
          engagement: { points: null, num_comments: null },
          metadata: { top_comments: [] },
        },
      ],
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
      source_items: [
        {
          engagement: { points: null, num_comments: null },
          metadata: { top_comments: [] },
        },
      ],
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
      source_items: [
        {
          engagement: { points: 8900, num_comments: 420 },
          metadata: {
            top_comments: [
              {
                score: 501,
                excerpt: `Switching off ${brand} today lol`,
                author: 'creator_ops',
                url: null,
                date: iso(80),
              },
            ],
          },
        },
      ],
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

  return {
    success: true,
    credits_used: 0,
    credits_remaining: 100,
    data: {
      query: brand,
      plan: {
        intent: 'opinion',
        freshness_mode: 'balanced_recent',
        cluster_mode: 'debate',
        subqueries: [
          {
            label: 'complaints',
            search_query: `${brand} outage OR refund OR scam`,
            sources: ['reddit', 'hackernews', 'youtube'],
            weight: 1,
          },
        ],
        source_weights: { hackernews: 0.9, reddit: 0.85, youtube: 0.7 },
        notes: ['mock_envelope'],
      },
      items,
      items_by_source: {
        hackernews: [items[0]],
        reddit: [items[1]],
        youtube: [items[2]],
        'twitter-ai-search': [items[3]],
        github: [items[4]],
        tavily: [items[5]],
        perplexity: [items[6]],
        tiktok: [items[7]],
        instagram: [items[8]],
        linkedin: [items[9]],
        threads: [items[10]],
      },
      clusters: [
        {
          cluster_id: 'c_mock_outage',
          title: `${brand} incident / status mismatch`,
          candidate_ids: [
            items[0].candidate_id,
            items[2].candidate_id,
            items[3].candidate_id,
            items[5].candidate_id,
            items[7].candidate_id,
          ],
          sources: ['hackernews', 'youtube', 'twitter-ai-search', 'tavily', 'tiktok'],
          score: 0.78,
        },
        {
          cluster_id: 'c_mock_billing',
          title: `${brand} double charges`,
          candidate_ids: [items[1].candidate_id, items[10].candidate_id],
          sources: ['reddit', 'threads'],
          score: 0.61,
        },
      ],
      sources_called: [
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
        'pinterest',
        'rumble',
        'polymarket',
      ],
      sources_succeeded: [
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
      sources_failed: {
        pinterest: 'mock: empty upstream',
        rumble: 'mock: pruned low_affinity',
        polymarket: 'mock: pruned low_affinity',
      },
      coverage: 11 / 14,
      partial_failure: false,
    },
  };
}

function mapMockItem(item, planIntent) {
  const platform =
    normalizePlatformChannel(item.source || 'web') ||
    String(item.source || 'web')
      .toLowerCase()
      .replace(/-ai-search$/, '');
  const title = String(item.title || '').trim();
  const body = String(item.text || '').trim();
  const topComments = [];
  for (const si of item.source_items || []) {
    for (const c of si?.metadata?.top_comments || []) {
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

  let engagement = { points: null, numComments: null };
  for (const si of item.source_items || []) {
    const eng = si?.engagement;
    if (!eng) continue;
    if (typeof eng.points === 'number') {
      engagement.points =
        engagement.points == null ? eng.points : Math.max(engagement.points, eng.points);
    }
    if (typeof eng.num_comments === 'number') {
      engagement.numComments =
        engagement.numComments == null
          ? eng.num_comments
          : Math.max(engagement.numComments, eng.num_comments);
    }
  }

  const candidateId = String(item.candidate_id || item.id || Math.random().toString(36).slice(2, 9));
  return {
    id: `sc_${platform}_${candidateId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    text: text.slice(0, 4000),
    sourceUrl: String(item.url || ''),
    channel: platform,
    detectedAt: item.published_at || new Date().toISOString(),
    _provider: 'socialcrawl',
    _scMeta: {
      provider: 'socialcrawl',
      title: title || null,
      finalScore: typeof item.final_score === 'number' ? item.final_score : null,
      rerankScore: typeof item.rerank_score === 'number' ? item.rerank_score : null,
      engagement,
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
