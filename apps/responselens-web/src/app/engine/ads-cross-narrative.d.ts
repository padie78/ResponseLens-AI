import type { OwnAdsIntel } from './own-ads-intel';

export type CorrelationDirection = 'arriba' | 'abajo' | 'estable';

export interface AdMentionCorrelation {
  campaignName: string;
  platform: 'meta' | 'google';
  mentionsInWindow: number;
  daysActive: number;
  direction: CorrelationDirection;
  spendBand: string;
}

export interface AdsCrossNarrative {
  available: boolean;
  correlations: AdMentionCorrelation[];
  narrative: string;
}

export function buildAdsCrossNarrative(opts: {
  adsIntel: OwnAdsIntel;
  alerts: Array<{ detectedAt?: string; severity?: string; brandScope?: string }>;
  windowDays?: number;
}): AdsCrossNarrative;
