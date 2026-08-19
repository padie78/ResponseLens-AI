/**
 * Identidad estable de una mención (cron y SPA).
 * Dedupe por alertId SocialCrawl y por URL canónica.
 */

export type AlertIdentityInput = {
  alertId?: string | null;
  sourceUrl?: string | null;
  originalComplaint?: string | null;
  text?: string | null;
  competitorName?: string | null;
  brandScope?: string | null;
};

export function fnv1a36(raw: string): string {
  let h = 2166136261;
  const s = String(raw || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function normalizeMentionText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .slice(0, 140);
}

export function extractYouTubeVideoId(urlOrText: string): string | null {
  const s = String(urlOrText || '');
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function normalizeSourceUrl(url: string): string {
  const raw = String(url || '').trim();
  if (
    !raw ||
    raw.startsWith('page://') ||
    raw.startsWith('manual://') ||
    raw.startsWith('synthetic://')
  ) {
    return '';
  }

  const ytId = extractYouTubeVideoId(raw);
  if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;

  const m = raw.match(/^(https?:)\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return raw.toLowerCase().slice(0, 180);

  const host = m[2].toLowerCase();
  const pathname = m[3] || '/';
  let search = m[4] || '';
  if (
    /(^|\.)socialcrawl\.dev$/i.test(host) ||
    (/(^|\.)google\.com$/i.test(host) && pathname.includes('/url')) ||
    /(^|\.)news\.google\.com$/i.test(host)
  ) {
    return '';
  }
  if (search) {
    const kept: string[] = [];
    for (const part of search.slice(1).split('&')) {
      const key = decodeURIComponent((part.split('=')[0] || '').toLowerCase());
      if (
        !key ||
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid'].includes(
          key,
        )
      ) {
        continue;
      }
      kept.push(part);
    }
    search = kept.length ? `?${kept.join('&')}` : '';
  }
  return `${m[1].toLowerCase()}//${host}${pathname}${search}`.toLowerCase();
}

function scopeOf(input: AlertIdentityInput): 'own' | 'rival' {
  return input.brandScope === 'own' ? 'own' : 'rival';
}

function rivalKey(input: AlertIdentityInput): string {
  return String(input.competitorName || '')
    .toLowerCase()
    .trim();
}

/** Claves de dedupe (id, URL, YouTube, texto). Cualquiera que matchee = mismo ítem. */
export function alertDedupeKeys(input: AlertIdentityInput): string[] {
  const textRaw = input.text || input.originalComplaint || '';
  const text = normalizeMentionText(textRaw);
  const url = normalizeSourceUrl(input.sourceUrl || '');
  const rival = rivalKey(input);
  const scope = scopeOf(input);
  const keys: string[] = [];

  const rawId = String(input.alertId || '').trim();
  if (rawId) keys.push(`${scope}::id::${rawId}`);

  const ytId =
    extractYouTubeVideoId(input.sourceUrl || '') ||
    extractYouTubeVideoId(textRaw) ||
    (rawId.startsWith('yt_') ? rawId.replace(/^yt_/, '').slice(0, 11) : null);
  if (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
    keys.push(`${scope}::${rival}::yt::${ytId}`);
  }

  if (url) keys.push(`${scope}::${rival}::url::${url}`);
  if (text && text.length >= 12) keys.push(`${scope}::${rival}::txt::${text}`);
  return keys;
}

/** ID estable: SocialCrawl id si existe; si no, hash de URL/texto. */
export function stableAlertId(input: AlertIdentityInput): string {
  const rawId = String(input.alertId || '').trim();
  if (rawId) return rawId.slice(0, 120);

  const scope = scopeOf(input);
  const rival = rivalKey(input)
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  const url = normalizeSourceUrl(input.sourceUrl || '');
  if (url) return `sc_${scope}_${rival}_${fnv1a36(url)}`.slice(0, 120);
  const text = normalizeMentionText(input.originalComplaint || input.text || '');
  return `sc_${scope}_${rival}_${fnv1a36(text || 'empty')}`.slice(0, 120);
}

export class AlertDedupeIndex {
  private readonly keys = new Set<string>();

  constructor(existing: AlertIdentityInput[] = []) {
    for (const row of existing) this.add(row);
  }

  add(row: AlertIdentityInput): void {
    for (const k of alertDedupeKeys(row)) this.keys.add(k);
  }

  has(row: AlertIdentityInput): boolean {
    return alertDedupeKeys(row).some((k) => this.keys.has(k));
  }
}
