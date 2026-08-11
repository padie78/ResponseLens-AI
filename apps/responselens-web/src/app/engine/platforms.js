/**
 * Catálogo de plataformas de detección / fuentes de escaneo.
 * - page: content script en el DOM
 * - api: Escanear ahora (HN / Reddit search)
 * - custom: dominio agregado por el usuario (permiso opcional + selectores genéricos)
 */

export const SCAN_SOURCES = [
  {
    id: 'hackernews',
    label: 'Hacker News',
    hint: 'API pública (Algolia)',
  },
  {
    id: 'reddit_api',
    label: 'Reddit (búsqueda)',
    hint: 'Search JSON vía service worker',
  },
  {
    id: 'active_page',
    label: 'Pestaña activa',
    hint: 'Importa menciones en la página abierta',
  },
  {
    id: 'news_portals',
    label: 'Portales de noticias',
    hint: 'Google News RSS / NewsAPI · artículos de la marca',
  },
  {
    id: 'youtube_api',
    label: 'YouTube (videos)',
    hint: 'Data API (key) o índice News site:youtube.com',
  },
];

/** Plataformas para filtros / etiquetas en Propios y Competencia (incl. SocialCrawl). */
export const PLATFORM_FILTER_OPTIONS = [
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'news', label: 'Noticias' },
  { id: 'page', label: 'Página' },
  { id: 'web', label: 'Web' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'ebay', label: 'eBay' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'threads', label: 'Threads' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'bluesky', label: 'Bluesky' },
  { id: 'glassdoor', label: 'Glassdoor' },
  { id: 'g2', label: 'G2' },
  { id: 'capterra', label: 'Capterra' },
  { id: 'producthunt', label: 'Product Hunt' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'trustpilot', label: 'Trustpilot' },
  { id: 'manual', label: 'Manual' },
];

const PLATFORM_LABEL_BY_ID = Object.fromEntries(
  PLATFORM_FILTER_OPTIONS.map((p) => [p.id, p.label]),
);

const CHANNEL_ALIASES = {
  twitter: 'x',
  hn: 'hackernews',
  'hacker-news': 'hackernews',
  'hacker news': 'hackernews',
  ycombinator: 'hackernews',
  google: 'news',
  googlenews: 'news',
  'google-news': 'news',
  fb: 'facebook',
  ig: 'instagram',
  bsky: 'bluesky',
  'product-hunt': 'producthunt',
  product_hunt: 'producthunt',
};

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizePlatformChannel(raw) {
  const ch = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/-ai-search$/, '')
    .replace(/\s+/g, ' ');
  if (!ch) return null;
  if (CHANNEL_ALIASES[ch]) return CHANNEL_ALIASES[ch];
  if (PLATFORM_LABEL_BY_ID[ch]) return ch;
  if (ch.includes('reddit')) return 'reddit';
  if (ch.includes('youtube') || ch === 'yt') return 'youtube';
  if (ch.includes('facebook')) return 'facebook';
  if (ch.includes('instagram')) return 'instagram';
  if (ch.includes('tiktok')) return 'tiktok';
  if (ch.includes('threads')) return 'threads';
  if (ch.includes('linkedin')) return 'linkedin';
  if (ch.includes('bluesky') || ch.includes('bsky')) return 'bluesky';
  if (ch.includes('amazon')) return 'amazon';
  if (ch.includes('ebay')) return 'ebay';
  if (ch.includes('glassdoor')) return 'glassdoor';
  if (ch.includes('capterra')) return 'capterra';
  if (ch.includes('producthunt') || ch.includes('product hunt')) return 'producthunt';
  if (ch.includes('indeed')) return 'indeed';
  if (ch.includes('trustpilot')) return 'trustpilot';
  if (ch.includes('twitter') || ch === 'x') return 'x';
  if (ch.includes('hacker') || ch === 'hn') return 'hackernews';
  if (ch === 'news' || ch.includes('noticia')) return 'news';
  if (ch === 'web' || ch === 'www' || ch === 'internet') return 'web';
  if (ch === 'page' || ch === 'dom' || ch === 'active_page') return 'page';
  if (ch === 'manual' || ch === 'demo' || ch === 'synthetic') return 'manual';
  if (ch === 'g2') return 'g2';
  return null;
}

/**
 * @param {string} url
 * @returns {string | null}
 */
export function platformKeyFromUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return null;
  if (u.startsWith('manual://')) return 'manual';
  if (u.includes('socialcrawl.dev')) return null;
  if (u.includes('reddit.com')) return 'reddit';
  if (u.includes('news.google') || u.includes('/rss/')) return 'news';
  if (u.includes('ycombinator') || u.includes('hn.algolia') || u.includes('news.ycombinator')) {
    return 'hackernews';
  }
  if (u.includes('amazon.')) return 'amazon';
  if (u.includes('ebay.')) return 'ebay';
  if (u.includes('youtube.') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('x.com/') || u.includes('twitter.com')) return 'x';
  if (u.includes('facebook.') || u.includes('fb.com')) return 'facebook';
  if (u.includes('instagram.')) return 'instagram';
  if (u.includes('tiktok.')) return 'tiktok';
  if (u.includes('threads.')) return 'threads';
  if (u.includes('linkedin.')) return 'linkedin';
  if (u.includes('bsky.app')) return 'bluesky';
  if (u.includes('glassdoor.')) return 'glassdoor';
  if (u.includes('g2.com')) return 'g2';
  if (u.includes('capterra.')) return 'capterra';
  if (u.includes('producthunt.')) return 'producthunt';
  if (u.includes('indeed.')) return 'indeed';
  if (u.includes('trustpilot.')) return 'trustpilot';
  return null;
}

/**
 * Clave estable de plataforma para filtros y badges.
 * @param {object | null | undefined} alert
 * @returns {string}
 */
export function resolvePlatformKey(alert) {
  if (!alert || typeof alert !== 'object') return 'manual';

  const src = String(alert._source || '').toLowerCase();
  const chRaw = String(alert.channel || '').toLowerCase();
  const url = String(alert.sourceUrl || '');
  const fromChannel = normalizePlatformChannel(chRaw);
  const fromUrl = platformKeyFromUrl(url);

  if (src === 'hackernews') return 'hackernews';
  if (src === 'reddit') return 'reddit';
  if (src === 'news') return 'news';
  if (src === 'youtube') return 'youtube';

  // SocialCrawl / inbound: el canal real manda (tiktok, ig, …), no el proveedor
  if (src === 'socialcrawl' || alert._provider === 'socialcrawl') {
    return fromChannel || fromUrl || 'web';
  }

  if (src === 'page') return fromChannel || fromUrl || 'page';

  if (fromChannel) return fromChannel;
  if (fromUrl) return fromUrl;

  if (alert._demo || alert._synthetic) return 'manual';
  if (chRaw === 'manual' || url.toLowerCase().startsWith('manual://')) return 'manual';
  if (url && !url.toLowerCase().includes('socialcrawl.dev')) return 'page';
  return 'manual';
}

/**
 * Etiqueta legible de plataforma.
 * @param {string | object | null | undefined} keyOrAlert
 * @param {{ news?: string, page?: string, manual?: string }} [i18n]
 */
export function platformDisplayLabel(keyOrAlert, i18n = {}) {
  const key =
    keyOrAlert && typeof keyOrAlert === 'object'
      ? resolvePlatformKey(keyOrAlert)
      : String(keyOrAlert || '');
  if (key === 'news' && i18n.news) return i18n.news;
  if (key === 'page' && i18n.page) return i18n.page;
  if (key === 'manual' && i18n.manual) return i18n.manual;
  return PLATFORM_LABEL_BY_ID[key] || (key ? key : '');
}

/**
 * Rellena un <select> de filtro de plataforma (conserva selección).
 * @param {HTMLSelectElement | null} selectEl
 * @param {{ allLabel?: string, newsLabel?: string, pageLabel?: string, manualLabel?: string }} [labels]
 */
export function fillPlatformFilterSelect(selectEl, labels = {}) {
  if (!selectEl) return;
  const prev = selectEl.value || 'all';
  const opts = [
    { id: 'all', label: labels.allLabel || 'Todas' },
    ...PLATFORM_FILTER_OPTIONS.map((p) => {
      if (p.id === 'news') return { id: p.id, label: labels.newsLabel || p.label };
      if (p.id === 'page') return { id: p.id, label: labels.pageLabel || p.label };
      if (p.id === 'manual') return { id: p.id, label: labels.manualLabel || p.label };
      return p;
    }),
  ];
  selectEl.innerHTML = opts
    .map(
      (o) =>
        `<option value="${o.id}"${o.id === prev ? ' selected' : ''}>${escapeAttr(o.label)}</option>`,
    )
    .join('');
  if (![...selectEl.options].some((o) => o.value === prev)) {
    selectEl.value = 'all';
  } else {
    selectEl.value = prev;
  }
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export const PAGE_PLATFORMS = [
  {
    id: 'amazon',
    label: 'Amazon',
    hosts: ['amazon.com', 'amazon.es'],
    openUrl: 'https://www.amazon.com/',
  },
  {
    id: 'ebay',
    label: 'eBay',
    hosts: ['ebay.com', 'ebay.es'],
    openUrl: 'https://www.ebay.com/',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hosts: ['youtube.com', 'google.com'],
    openUrl: 'https://www.youtube.com/',
  },
  {
    id: 'x',
    label: 'X / Twitter',
    hosts: ['x.com', 'twitter.com'],
    openUrl: 'https://x.com/',
  },
  {
    id: 'reddit',
    label: 'Reddit (página)',
    hosts: ['reddit.com'],
    openUrl: 'https://old.reddit.com/r/shopify/comments/',
  },
  {
    id: 'hackernews',
    label: 'Hacker News',
    hosts: ['news.ycombinator.com'],
    openUrl: 'https://news.ycombinator.com/item?id=32247991',
  },
  {
    id: 'trustpilot',
    label: 'Trustpilot',
    hosts: ['trustpilot.com'],
    openUrl: 'https://www.trustpilot.com/review/shopify.com',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hosts: ['facebook.com', 'fb.com'],
    openUrl: 'https://www.facebook.com/',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hosts: ['instagram.com'],
    openUrl: 'https://www.instagram.com/',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hosts: ['tiktok.com'],
    openUrl: 'https://www.tiktok.com/search?q=shopify',
  },
  {
    id: 'threads',
    label: 'Threads',
    hosts: ['threads.net', 'threads.com'],
    openUrl: 'https://www.threads.net/search?q=shopify&serp_type=default',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    hosts: ['linkedin.com'],
    openUrl: 'https://www.linkedin.com/search/results/content/?keywords=shopify',
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    hosts: ['bsky.app'],
    openUrl: 'https://bsky.app/search?q=shopify',
  },
  {
    id: 'glassdoor',
    label: 'Glassdoor',
    hosts: ['glassdoor.com'],
    openUrl: 'https://www.glassdoor.com/Reviews/index.htm',
  },
  {
    id: 'g2',
    label: 'G2',
    hosts: ['g2.com'],
    openUrl: 'https://www.g2.com/search?query=shopify',
  },
  {
    id: 'capterra',
    label: 'Capterra',
    hosts: ['capterra.com'],
    openUrl: 'https://www.capterra.com/search/?search=shopify',
  },
  {
    id: 'producthunt',
    label: 'Product Hunt',
    hosts: ['producthunt.com'],
    openUrl: 'https://www.producthunt.com/search?q=shopify',
  },
  {
    id: 'indeed',
    label: 'Indeed (reviews)',
    hosts: ['indeed.com'],
    openUrl: 'https://www.indeed.com/cmp',
  },
];

export function defaultPlatformPrefs() {
  return {
    scanSources: {
      hackernews: true,
      reddit_api: true,
      active_page: true,
      news_portals: true,
      youtube_api: true,
    },
    pageEnabled: Object.fromEntries(PAGE_PLATFORMS.map((p) => [p.id, true])),
    custom: [],
  };
}

/** Fusiona prefs guardadas con defaults (migraciones suaves). */
export function normalizePlatformPrefs(raw) {
  const base = defaultPlatformPrefs();
  if (!raw || typeof raw !== 'object') return base;

  const scanSources = { ...base.scanSources, ...(raw.scanSources || {}) };
  const pageEnabled = { ...base.pageEnabled, ...(raw.pageEnabled || {}) };
  const custom = Array.isArray(raw.custom)
    ? raw.custom
        .map((c) => normalizeCustomPlatform(c))
        .filter(Boolean)
    : [];

  return { scanSources, pageEnabled, custom };
}

export function normalizeHost(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0];
  s = s.replace(/^www\./, '');
  // Quitar puerto
  s = s.split(':')[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return '';
  return s;
}

export function normalizeCustomPlatform(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const host = normalizeHost(raw.host || raw.domain || raw.label);
  if (!host) return null;
  const id = String(raw.id || `custom_${host.replace(/\./g, '_')}`);
  return {
    id,
    label: String(raw.label || host).trim() || host,
    host,
    enabled: raw.enabled !== false,
  };
}

export function matchPatternsForHost(host) {
  const h = normalizeHost(host);
  if (!h) return [];
  return [`https://*.${h}/*`, `https://${h}/*`];
}

/** Resuelve id de plataforma built-in para un hostname. */
export function resolveBuiltInPlatformId(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  for (const p of PAGE_PLATFORMS) {
    if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p.id;
  }
  return null;
}

/**
 * ¿La detección en página está habilitada para este host?
 */
export function isPagePlatformEnabled(hostname, prefs) {
  const p = normalizePlatformPrefs(prefs);
  const builtIn = resolveBuiltInPlatformId(hostname);
  if (builtIn) return p.pageEnabled[builtIn] !== false;

  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  const custom = p.custom.find(
    (c) => c.enabled && (host === c.host || host.endsWith(`.${c.host}`)),
  );
  return Boolean(custom);
}

export function collectPlatformPrefsFromDom(root = document) {
  const scanSources = {};
  for (const s of SCAN_SOURCES) {
    const el = root.getElementById(`cfg-scan-${s.id}`);
    scanSources[s.id] = el ? Boolean(el.checked) : true;
  }
  const pageEnabled = {};
  for (const p of PAGE_PLATFORMS) {
    const el = root.getElementById(`cfg-page-${p.id}`);
    pageEnabled[p.id] = el ? Boolean(el.checked) : true;
  }
  const custom = [];
  for (const row of root.querySelectorAll('[data-custom-platform]')) {
    const host = normalizeHost(row.querySelector('[data-field="host"]')?.value);
    if (!host) continue;
    custom.push({
      id: row.dataset.customPlatform || `custom_${host.replace(/\./g, '_')}`,
      label: row.querySelector('[data-field="label"]')?.value?.trim() || host,
      host,
      enabled: Boolean(row.querySelector('[data-field="enabled"]')?.checked),
    });
  }
  return normalizePlatformPrefs({ scanSources, pageEnabled, custom });
}

/** URLs a abrir en Chrome según plataformas de página activas. */
export function listOpenUrlsForPrefs(prefs) {
  const p = normalizePlatformPrefs(prefs);
  const urls = [];
  for (const plat of PAGE_PLATFORMS) {
    if (p.pageEnabled[plat.id] === false) continue;
    if (plat.openUrl) urls.push(plat.openUrl);
  }
  for (const c of p.custom || []) {
    if (!c.enabled || !c.host) continue;
    urls.push(`https://www.${c.host}/`);
  }
  return [...new Set(urls)];
}
