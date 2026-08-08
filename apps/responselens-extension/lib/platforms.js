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
    hint: 'Importa quejas ya resaltadas en la página abierta',
  },
];

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
    hosts: ['youtube.com'],
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
    openUrl: 'https://www.reddit.com/',
  },
];

export function defaultPlatformPrefs() {
  return {
    scanSources: {
      hackernews: true,
      reddit_api: true,
      active_page: true,
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
