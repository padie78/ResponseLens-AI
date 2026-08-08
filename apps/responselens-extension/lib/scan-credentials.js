/**
 * Credenciales de fuentes de escaneo profesionales (Reddit OAuth, NewsAPI).
 * Persistidas en chrome.storage.local — no se suben a AppSync.
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
  };
}

export async function loadScanCredentials() {
  const data = await chrome.storage.local.get([SCAN_CREDS_KEY]);
  const raw = data[SCAN_CREDS_KEY] || {};
  const base = defaultScanCredentials();
  return {
    reddit: { ...base.reddit, ...(raw.reddit || {}) },
    newsapi: { ...base.newsapi, ...(raw.newsapi || {}) },
  };
}

export async function saveScanCredentials(cfg) {
  const base = defaultScanCredentials();
  const next = {
    reddit: { ...base.reddit, ...(cfg?.reddit || {}) },
    newsapi: { ...base.newsapi, ...(cfg?.newsapi || {}) },
  };
  await chrome.storage.local.set({ [SCAN_CREDS_KEY]: next });
  return next;
}

export function hasRedditOAuth(creds) {
  return Boolean(creds?.reddit?.enabled && creds.reddit.clientId && creds.reddit.clientSecret);
}

export function hasNewsApi(creds) {
  return Boolean(creds?.newsapi?.enabled && creds.newsapi.apiKey);
}
