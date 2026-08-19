export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface ReviewCategory {
  name: string;
  rating: number;
  reviewCount: number;
}

export interface ReviewSentiment {
  text: string;
  mentions: number;
}

export interface RivalReviewsIntel {
  source: DataSourceKind;
  connected: boolean;
  disclaimer: string;
  g2Slug: string;
  overallRating: number;
  totalReviews: number;
  categories: ReviewCategory[];
  recentPros: ReviewSentiment[];
  recentCons: ReviewSentiment[];
  nps: number | null;
  trendDirection: 'subiendo' | 'bajando' | 'estable';
}

export function buildRivalReviewsIntel(opts: {
  competitor: { name: string };
  g2CompanySlug?: string;
}): RivalReviewsIntel;
