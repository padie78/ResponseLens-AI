/**
 * Credenciales de fuentes de escaneo profesionales (Reddit OAuth, NewsAPI, YouTube).
 * Persistidas en localStorage — no se suben a AppSync.
 */

const SCAN_CREDS_KEY = 'rl_scan_credentials';

export function defaultScanCredentials() {
  return {
    reddit: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      /** user-agent obligatorio por Reddit */
      userAgent: 'ResponseLensAI/0.7 (professional-scan)',
    },
    newsapi: {
      enabled: false,
      apiKey: '',
    },
    youtube: {
      enabled: false,
      apiKey: '',
    },
    socialcrawl: {
      /** Preferencias UI only — la API key NUNCA va en el cliente. */
      enabled: true,
      apiKey: '',
      /** CSV opcional: reddit,youtube,tiktok,instagram,threads,linkedin,… */
      sources: '',
      lookbackDays: 7,
    },
  };
}

function readJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadScanCredentials() {
  const raw = readJson(SCAN_CREDS_KEY, {});
  const base = defaultScanCredentials();
  const socialcrawl = { ...base.socialcrawl, ...(raw.socialcrawl || {}) };
  // Default 7 días (API default es 30). UI puede override.
  const lb = Number(socialcrawl.lookbackDays);
  socialcrawl.lookbackDays = Number.isFinite(lb) && lb >= 1 ? Math.min(lb, 30) : 7;
  // Si hay API key guardada, considerar activo aunque el checkbox se haya perdido.
  if (String(socialcrawl.apiKey || '').trim() && socialcrawl.enabled == null) {
    socialcrawl.enabled = true;
  }
  return {
    reddit: { ...base.reddit, ...(raw.reddit || {}) },
    newsapi: { ...base.newsapi, ...(raw.newsapi || {}) },
    youtube: { ...base.youtube, ...(raw.youtube || {}) },
    socialcrawl,
  };
}

export async function saveScanCredentials(cfg) {
  const base = defaultScanCredentials();
  const next = {
    reddit: { ...base.reddit, ...(cfg?.reddit || {}) },
    newsapi: { ...base.newsapi, ...(cfg?.newsapi || {}) },
    youtube: { ...base.youtube, ...(cfg?.youtube || {}) },
    socialcrawl: { ...base.socialcrawl, ...(cfg?.socialcrawl || {}) },
  };
  localStorage.setItem(SCAN_CREDS_KEY, JSON.stringify(next));
  return next;
}

export function hasRedditOAuth(creds) {
  return Boolean(creds?.reddit?.enabled && creds.reddit.clientId && creds.reddit.clientSecret);
}

export function hasNewsApi(creds) {
  return Boolean(creds?.newsapi?.enabled && creds.newsapi.apiKey);
}

export function hasYouTubeApi(creds) {
  return Boolean(creds?.youtube?.enabled && creds.youtube.apiKey);
}

/**
 * @deprecated La key SocialCrawl no vive en el cliente.
 * Usar `hasSocialCrawlServer` desde `socialcrawl-client.js`.
 */
export function hasSocialCrawl(_creds) {
  void _creds;
  return false;
}
