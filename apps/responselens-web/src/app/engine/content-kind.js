/**
 * Tipo de pieza SocialCrawl / escucha (no solo posts).
 * @typedef {'comment'|'post'|'video'|'news'|'issue'|'market'|'pin'|'professional'|'thread'|'web'|'media'} ContentKind
 */

/** @type {Record<string, { label: string, reply: boolean }>} */
export const CONTENT_KIND_META = {
  comment: { label: 'Comentario', reply: true },
  post: { label: 'Post', reply: true },
  video: { label: 'Video', reply: true },
  news: { label: 'Noticia', reply: false },
  issue: { label: 'Issue', reply: true },
  market: { label: 'Mercado', reply: false },
  pin: { label: 'Pin', reply: false },
  professional: { label: 'LinkedIn', reply: false },
  thread: { label: 'Thread', reply: true },
  web: { label: 'Web', reply: false },
  media: { label: 'Media', reply: false },
};

/**
 * @param {string} channel
 * @param {{ topComments?: unknown[] } | null | undefined} [scMeta]
 * @returns {ContentKind}
 */
export function resolveContentKind(channel, scMeta) {
  const ch = String(channel || '')
    .toLowerCase()
    .replace(/-ai-search$/, '')
    .replace(/-hashtag$/, '')
    .replace(/^twitter$/, 'x');
  if (ch === 'youtube' || ch === 'tiktok' || ch === 'rumble') return 'video';
  if (ch === 'news' || ch === 'tavily' || ch === 'perplexity') return 'news';
  if (ch === 'github') return 'issue';
  if (ch === 'polymarket') return 'market';
  if (ch === 'pinterest') return 'pin';
  if (ch === 'linkedin') return 'professional';
  if (ch === 'threads') return 'thread';
  if (ch === 'web') return 'web';
  if (Array.isArray(scMeta?.topComments) && scMeta.topComments.length && ch === 'manual') {
    return 'comment';
  }
  return 'post';
}

/**
 * @param {unknown} kind
 * @param {string} [channel]
 * @returns {ContentKind}
 */
export function normalizeContentKind(kind, channel) {
  const k = String(kind || '').toLowerCase();
  if (k === 'media') return resolveContentKind(channel, null);
  if (k && CONTENT_KIND_META[k]) return /** @type {ContentKind} */ (k);
  return resolveContentKind(channel, null);
}

/**
 * @param {ContentKind | string} kind
 * @param {{ topComments?: unknown[] } | null | undefined} [scMeta]
 */
export function isReplyableContent(kind, scMeta) {
  const k = String(kind || '');
  if (k === 'news' || k === 'market' || k === 'pin' || k === 'professional' || k === 'web' || k === 'media') {
    return false;
  }
  if (k === 'video') return Array.isArray(scMeta?.topComments) && scMeta.topComments.length > 0;
  return CONTENT_KIND_META[k]?.reply !== false;
}

/** @param {ContentKind | string} kind */
export function contentKindLabel(kind) {
  return CONTENT_KIND_META[String(kind || '')]?.label || 'Pieza';
}

export const CONTENT_KIND_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos los tipos' },
  { id: 'post', label: 'Posts' },
  { id: 'comment', label: 'Comentarios' },
  { id: 'video', label: 'Videos' },
  { id: 'news', label: 'Noticias' },
  { id: 'issue', label: 'Issues' },
  { id: 'thread', label: 'Threads' },
  { id: 'professional', label: 'LinkedIn' },
  { id: 'pin', label: 'Pins' },
  { id: 'market', label: 'Mercados' },
  { id: 'web', label: 'Web' },
];
