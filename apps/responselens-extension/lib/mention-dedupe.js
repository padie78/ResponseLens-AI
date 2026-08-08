/**
 * Dedupe de menciones / oportunidades por URL + texto normalizado.
 */

export function normalizeMentionText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .slice(0, 140);
}

export function normalizeSourceUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('page://') || raw.startsWith('manual://') || raw.startsWith('synthetic://')) {
    return '';
  }
  try {
    const u = new URL(raw);
    u.hash = '';
    // strip tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid'].forEach((k) =>
      u.searchParams.delete(k),
    );
    return `${u.origin}${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase().slice(0, 180);
  }
}

/**
 * Clave estable para dedupe.
 * @param {{ text?: string, originalComplaint?: string, sourceUrl?: string, competitorName?: string }} row
 */
export function mentionDedupeKey(row) {
  const text = normalizeMentionText(row?.text || row?.originalComplaint || '');
  const url = normalizeSourceUrl(row?.sourceUrl);
  const rival = String(row?.competitorName || '')
    .toLowerCase()
    .trim();
  if (url) return `${rival}::url::${url}`;
  return `${rival}::txt::${text}`;
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => object} [mapRow]
 * @returns {T[]}
 */
export function dedupeMentions(rows, mapRow) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const mapped = mapRow ? mapRow(row) : row;
    const key = mentionDedupeKey(mapped);
    if (!key || key.endsWith('::txt::') || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
