export type DataSourceKind = 'demo' | 'connected' | 'feed';

export interface EmployerCategory {
  name: string;
  rating: number;
}

export interface RivalEmployerIntel {
  source: DataSourceKind;
  connected: boolean;
  disclaimer: string;
  glassdoorEmployerId: string;
  overallRating: number;
  totalReviews: number;
  ceoApproval: number | null;
  recommendPct: number | null;
  categories: EmployerCategory[];
  trendDirection: 'subiendo' | 'bajando' | 'estable';
}

export function buildRivalEmployerIntel(opts: {
  competitor: { name: string };
  glassdoorEmployerId?: string;
}): RivalEmployerIntel;
