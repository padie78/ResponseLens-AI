import { platformDisplayLabel, resolvePlatformKey } from '../engine/platforms.js';
import type {
  CompetitorAlert,
  MockOutboundPost,
  SocialCrawlMeta,
  SocialCrawlTopComment,
} from '../models/alert.model';

export function applyMockPublish(
  alert: CompetitorAlert,
  body: string,
  brandName: string,
): CompetitorAlert {
  const text = body.trim();
  const platformKey = String(resolvePlatformKey(alert) || alert.channel || 'web');
  const platformLabel = platformDisplayLabel(alert) || platformKey;
  const postedAt = new Date().toISOString();
  const author = brandName.trim() || 'Tu marca';

  const post: MockOutboundPost = {
    demo: true,
    platformKey,
    platformLabel,
    body: text,
    postedAt,
    author,
    sourceUrl: alert.sourceUrl || '',
  };

  const brandComment: SocialCrawlTopComment = {
    score: null,
    excerpt: text,
    author: `${author} · oficial (demo)`,
    url: alert.sourceUrl || null,
    date: postedAt,
    kind: 'brand_mock',
  };

  const prev: SocialCrawlMeta | undefined = alert._scMeta;
  const rest = (prev?.topComments || []).filter((c) => c.kind !== 'brand_mock');
  const engagement = {
    points: prev?.engagement?.points ?? null,
    numComments: (prev?.engagement?.numComments ?? rest.length) + 1,
  };

  return {
    ...alert,
    status: 'CONTACTED',
    _mockPost: post,
    _scMeta: {
      provider: 'socialcrawl',
      ...prev,
      topComments: [brandComment, ...rest],
      engagement,
    },
  };
}
