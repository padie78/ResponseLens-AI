import type { CompetitorAlert } from '../models/alert.model';
import type {
  FeedFilterState,
  FeedSortKey,
} from '../ui/molecules/feed-filters/feed-filters.component';

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function alertScore(a: CompetitorAlert): number {
  const ai = a._aiScore;
  if (typeof ai === 'number' && Number.isFinite(ai)) return ai;
  const fr = a.frustrationScore;
  if (typeof fr === 'number' && Number.isFinite(fr)) return fr;
  return 0;
}

function alertTime(a: CompetitorAlert): number {
  const t = Date.parse(a.detectedAt);
  return Number.isFinite(t) ? t : 0;
}

function alertSeverity(a: CompetitorAlert): number {
  return SEVERITY_RANK[String(a.severity || '').toUpperCase()] ?? 0;
}

function alertChannel(a: CompetitorAlert): string {
  return String(a.channel || a._source || '').toLowerCase();
}

export function sortAlerts(
  alerts: CompetitorAlert[],
  sort: FeedSortKey = 'time_desc',
): CompetitorAlert[] {
  const out = [...alerts];
  out.sort((a, b) => {
    switch (sort) {
      case 'time_asc':
        return alertTime(a) - alertTime(b);
      case 'score_desc':
        return alertScore(b) - alertScore(a) || alertTime(b) - alertTime(a);
      case 'score_asc':
        return alertScore(a) - alertScore(b) || alertTime(b) - alertTime(a);
      case 'severity_desc':
        return alertSeverity(b) - alertSeverity(a) || alertTime(b) - alertTime(a);
      case 'severity_asc':
        return alertSeverity(a) - alertSeverity(b) || alertTime(b) - alertTime(a);
      case 'channel_asc': {
        const cmp = alertChannel(a).localeCompare(alertChannel(b), 'es');
        return cmp || alertTime(b) - alertTime(a);
      }
      case 'time_desc':
      default:
        return alertTime(b) - alertTime(a);
    }
  });
  return out;
}

export function filterAlerts(
  alerts: CompetitorAlert[],
  filters: FeedFilterState,
): CompetitorAlert[] {
  const q = filters.q.trim().toLowerCase();
  const now = Date.now();

  const filtered = alerts.filter((a) => {
    if (filters.status !== 'all' && a.status !== filters.status) return false;
    if (filters.severity !== 'all' && a.severity !== filters.severity) return false;
    if (filters.kind && filters.kind !== 'all') {
      const kind = String(a._mentionKind || '').toLowerCase();
      if (kind !== filters.kind) return false;
    }
    if (filters.platform !== 'all') {
      const ch = (a.channel || a._source || '').toLowerCase();
      if (ch !== filters.platform && !ch.includes(filters.platform)) return false;
    }
    if (filters.sentiment !== 'all') {
      const sent = String(a._sentiment || a.sentiment || '').toUpperCase();
      if (sent !== filters.sentiment) return false;
    }
    if (filters.rival !== 'all' && a.competitorName !== filters.rival) return false;

    if (filters.date !== 'all') {
      const t = Date.parse(a.detectedAt);
      if (!Number.isFinite(t)) return false;
      const ms =
        filters.date === '24h'
          ? 86_400_000
          : filters.date === '7d'
            ? 7 * 86_400_000
            : 30 * 86_400_000;
      if (now - t > ms) return false;
    }

    if (q) {
      const hay = [
        a.originalComplaint,
        a.competitorName,
        a.channel,
        a.sourceUrl,
        a._analysisSummary ?? '',
        a.salesPitch,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  return sortAlerts(filtered, filters.sort ?? 'time_desc');
}
