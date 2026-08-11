import type { CompetitorAlert } from '../models/alert.model';
import type { FeedFilterState } from '../ui/molecules/feed-filters/feed-filters.component';

export function filterAlerts(
  alerts: CompetitorAlert[],
  filters: FeedFilterState,
): CompetitorAlert[] {
  const q = filters.q.trim().toLowerCase();
  const now = Date.now();

  return alerts.filter((a) => {
    if (filters.status !== 'all' && a.status !== filters.status) return false;
    if (filters.severity !== 'all' && a.severity !== filters.severity) return false;
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
}
