/**
 * Fuentes canónicas de SocialCrawl GET /v1/search/everywhere
 * (docs: socialcrawl.dev/docs/search/everywhere).
 * Vacío en la API = todas; nosotros pasamos el CSV explícito para que
 * HN + news (tavily/perplexity) + el resto siempre entren al fan-out.
 */
export const SOCIALCRAWL_EVERYWHERE_SOURCES = [
  'reddit',
  'twitter-ai-search',
  'youtube',
  'tiktok',
  'instagram',
  'hackernews',
  'polymarket',
  'github',
  'threads',
  'pinterest',
  'perplexity',
  'tavily',
  'linkedin',
  'rumble',
].join(',');

/** @returns {string} CSV para el query param `sources` */
export function socialCrawlEverywhereSourcesCsv() {
  return SOCIALCRAWL_EVERYWHERE_SOURCES;
}
