/**
 * Estado de sesión en el navegador (heurística).
 * Expone: status + method (cookie|dom|…) + account cuando es posible.
 * No inicia login ni guarda passwords.
 */

import { PAGE_PLATFORMS, normalizeHost } from './platforms.js';

/**
 * @typedef {'in' | 'out' | 'unknown'} SessionStatus
 * @typedef {'cookie' | 'dom' | 'none' | 'permission' | 'unavailable' | 'heuristic'} SessionMethod
 * @typedef {{
 *   id: string,
 *   label: string,
 *   openUrl?: string,
 *   status: SessionStatus,
 *   method: SessionMethod,
 *   methodDetail?: string,
 *   account?: string,
 * }} PlatformSessionRow
 */

const GOOGLE_HOSTS = ['google.com', 'youtube.com', 'gmail.com', 'youtube-nocookie.com'];
const GOOGLE_ORIGINS = [
  'https://*.google.com/*',
  'https://google.com/*',
  'https://www.google.com/*',
  'https://accounts.google.com/*',
  'https://mail.google.com/*',
  'https://myaccount.google.com/*',
  'https://*.youtube.com/*',
  'https://www.youtube.com/*',
];

/** Cookies de sesión estrictas (evitar cookies de visitante / tracking). */
const SESSION_HINTS = {
  facebook: {
    domains: ['facebook.com', 'fb.com'],
    anyOf: ['c_user'],
    minValueLength: 4,
    accountFromCookie: 'c_user',
  },
  instagram: {
    domains: ['instagram.com'],
    anyOf: ['sessionid', 'ds_user_id'],
    minValueLength: 6,
    accountFromCookie: 'ds_user_id',
  },
  reddit: {
    domains: ['reddit.com'],
    anyOf: ['reddit_session'],
    minValueLength: 20,
  },
  youtube: {
    domains: GOOGLE_HOSTS,
    anyOf: [],
    special: 'google',
  },
  x: {
    domains: ['x.com', 'twitter.com'],
    anyOf: ['auth_token'],
    minValueLength: 20,
  },
  linkedin: {
    domains: ['linkedin.com'],
    anyOf: ['li_at'],
    minValueLength: 20,
  },
  tiktok: {
    domains: ['tiktok.com'],
    anyOf: ['sessionid', 'sid_tt'],
    minValueLength: 10,
  },
  threads: {
    // Sesión propia en threads.net / threads.com (IG sola no basta).
    domains: ['threads.net', 'threads.com'],
    anyOf: [],
    special: 'threads',
  },
  bluesky: {
    domains: ['bsky.app'],
    anyOf: [],
    weakAnyCookie: true,
  },
  glassdoor: {
    domains: ['glassdoor.com'],
    anyOf: ['gdId', 'cass'],
    minValueLength: 6,
  },
  amazon: {
    domains: ['amazon.com', 'amazon.es'],
    anyOf: ['at-main', 'sess-at-main', 'x-main'],
    minValueLength: 10,
  },
  ebay: {
    domains: ['ebay.com', 'ebay.es'],
    anyOf: ['__Secure-EP-SESS', 'cssub', 'shs'],
    minValueLength: 8,
  },
  trustpilot: {
    domains: ['trustpilot.com'],
    anyOf: ['Trustpilot.User.Session'],
    minValueLength: 8,
  },
  g2: {
    domains: ['g2.com'],
    anyOf: ['_g2_session'],
    minValueLength: 10,
  },
  capterra: {
    domains: ['capterra.com'],
    anyOf: ['remember_user_token'],
    minValueLength: 10,
  },
  producthunt: {
    domains: ['producthunt.com'],
    anyOf: ['remember_user_token'],
    minValueLength: 10,
  },
  indeed: {
    domains: ['indeed.com'],
    anyOf: ['PPID'],
    minValueLength: 8,
  },
  hackernews: {
    domains: ['news.ycombinator.com', 'ycombinator.com'],
    anyOf: ['user'],
    minValueLength: 4,
    accountFromCookie: 'user',
  },
};

/**
 * Selectores / parsers de cuenta en DOM por plataforma (pestaña abierta).
 * @type {Record<string, { hostRe: RegExp, extract: () => ({ loggedIn: boolean, account: string }) }>}
 */
const DOM_ACCOUNT_PROBES = {
  youtube: {
    hostRe: /(?:^|\.)((?:google)|(youtube))\.com$/i,
    extract: () => {
      const aria =
        document.querySelector('a[aria-label*="@"]')?.getAttribute('aria-label') ||
        document.querySelector('button[aria-label*="@"]')?.getAttribute('aria-label') ||
        '';
      const email = (aria.match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0] || '';
      const nameMatch = aria.match(/Cuenta de Google:\s*([^(\n]+)/i) || aria.match(/Google Account:\s*([^(\n]+)/i);
      const display = (nameMatch?.[1] || '').trim();
      const avatar = Boolean(
        document.querySelector(
          'img.gbii, img.gb_P, #avatar-btn img, ytd-topbar-menu-button-renderer img#img, a[aria-label*="Google Account"], a[aria-label*="Cuenta de Google"]',
        ),
      );
      const signIn = Boolean(
        document.querySelector(
          'a[href*="ServiceLogin"], a[href*="accounts.google.com/signin"], ytd-button-renderer a[href*="accounts.google.com"]',
        ),
      );
      return {
        loggedIn: avatar && !signIn,
        account: email || display || '',
      };
    },
  },
  reddit: {
    hostRe: /(?:^|\.)reddit\.com$/i,
    extract: () => {
      const el =
        document.querySelector('#HEADER_USER_DROPDOWN, #email-collection-tooltip-id, faceplate-tracker[noun="user_dropdown"]');
      const aria = el?.getAttribute('aria-label') || el?.textContent || '';
      const fromLink = document.querySelector('a[href*="/user/"]')?.getAttribute('href') || '';
      const user = (fromLink.match(/\/user\/([^/?#]+)/) || [])[1] || (aria.match(/u\/[\w-]+/) || [])[0] || '';
      const loggedIn = Boolean(user) || Boolean(document.querySelector('#USER_DROPDOWN_ID, #email-collection-tooltip-id'));
      const signIn = Boolean(document.querySelector('a[href*="/login"], auth-flow-link'));
      return { loggedIn: loggedIn && !signIn, account: user ? (user.startsWith('u/') ? user : `u/${user}`) : '' };
    },
  },
  x: {
    hostRe: /(?:^|\.)((?:x)|(twitter))\.com$/i,
    extract: () => {
      const href = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href') || '';
      const user = (href.match(/^\/([^/?#]+)/) || [])[1] || '';
      const loggedIn = Boolean(user) || Boolean(document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'));
      const signIn = Boolean(document.querySelector('a[href*="/login"], a[href*="/i/flow/login"]'));
      return { loggedIn: loggedIn && !signIn, account: user ? `@${user}` : '' };
    },
  },
  facebook: {
    hostRe: /(?:^|\.)((?:facebook)|(fb))\.com$/i,
    extract: () => {
      const aria = document.querySelector('[aria-label*="Tu perfil"], [aria-label*="Your profile"]')?.getAttribute('aria-label') || '';
      const name = (aria.replace(/Tu perfil|Your profile/i, '').trim()) || '';
      const loggedIn = Boolean(document.querySelector('[aria-label*="Tu perfil"], [aria-label*="Your profile"], [data-click="profile_icon"]'));
      return { loggedIn, account: name };
    },
  },
  linkedin: {
    hostRe: /(?:^|\.)linkedin\.com$/i,
    extract: () => {
      const img = document.querySelector('img.global-nav__me-photo, img.evi-image');
      const name = img?.getAttribute('alt') || '';
      const loggedIn = Boolean(img) || Boolean(document.querySelector('.global-nav__me'));
      return { loggedIn, account: name.replace(/photo|foto/i, '').trim() };
    },
  },
  ebay: {
    hostRe: /(?:^|\.)ebay\./i,
    extract: () => {
      const el = document.querySelector('#gh-ug, .gh-ug, a#gh-ug');
      const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const user = (text.match(/Hola\s+(.+)/i) || text.match(/Hi\s+(.+)/i) || [])[1] || '';
      const loggedIn = /Hola|Hi\s/i.test(text) && !/iniciar|sign in|login/i.test(text);
      return { loggedIn, account: user };
    },
  },
  amazon: {
    hostRe: /(?:^|\.)amazon\./i,
    extract: () => {
      const el = document.querySelector('#nav-link-accountList-nav-line-1, #nav-link-accountList .nav-line-1');
      const text = (el?.textContent || '').trim();
      const user = (text.match(/Hola,?\s*(.+)/i) || text.match(/Hello,?\s*(.+)/i) || [])[1] || '';
      const loggedIn = Boolean(user) && !/identif|sign in/i.test(text);
      return { loggedIn, account: user };
    },
  },
  instagram: {
    hostRe: /(?:^|\.)instagram\.com$/i,
    extract: () => {
      const href = document.querySelector('a[href^="/"][href$="/"] img[alt*="foto"], a[href^="/"] img[alt*="profile"]')
        ?.closest('a')
        ?.getAttribute('href');
      const user = (href || '').replace(/\//g, '') || '';
      const loggedIn = Boolean(document.querySelector('svg[aria-label="Inicio"], svg[aria-label="Home"]'));
      return { loggedIn, account: user ? `@${user}` : '' };
    },
  },
  threads: {
    hostRe: /(?:^|\.)threads\.(net|com)$/i,
    extract: () => {
      const text = (document.body?.innerText || '').slice(0, 4000);
      const profile = document.querySelector('a[href*="/@"] img, a[href^="/@"]');
      const href =
        profile?.closest?.('a')?.getAttribute('href') || profile?.getAttribute('href') || '';
      const user = (href.match(/\/@([^/?#]+)/) || [])[1] || '';
      const hasAppChrome = Boolean(
        document.querySelector(
          '[aria-label="Profile"], [aria-label="Perfil"], [aria-label="Activity"], [aria-label="Actividad"], [aria-label="Home"], [aria-label="Inicio"], a[href="/settings"], svg[aria-label="Profile"], svg[aria-label="Perfil"]',
        ),
      );
      // Solo muro de login claro — no matchear “log in” suelto en el feed (daba falso rojo).
      const loginWall =
        /continuar con instagram|continue with instagram|log\s*in\s*with\s*instagram|iniciar\s*sesi[oó]n con instagram|log\s*in\s*to\s*threads/i.test(
          text,
        ) &&
        Boolean(
          document.querySelector(
            'a[href*="login"], a[href*="/login"], button[type="submit"]',
          ),
        );

      if (loginWall && !user && !hasAppChrome) {
        return { loggedIn: false, account: '' };
      }
      if (user || hasAppChrome) {
        return { loggedIn: true, account: user ? `@${user}` : '' };
      }
      return { loggedIn: null, account: '' };
    },
  },
};

/**
 * @param {string[]} origins
 * @param {boolean} [allowRequest] solo true desde clic del usuario
 */
async function ensureOrigins(origins, allowRequest = false) {
  if (!chrome?.permissions?.contains) return true;
  try {
    const has = await chrome.permissions.contains({ origins });
    if (has) return true;
    if (!allowRequest || !chrome.permissions.request) return false;
    return Boolean(await chrome.permissions.request({ origins }));
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
async function allReadableCookies() {
  if (!chrome?.cookies?.getAll) return [];
  try {
    if (chrome.cookies.getAllCookieStores) {
      const stores = await chrome.cookies.getAllCookieStores();
      /** @type {chrome.cookies.Cookie[]} */
      const bag = [];
      for (const store of stores || []) {
        const list = (await chrome.cookies.getAll({ storeId: store.id })) || [];
        bag.push(...list);
      }
      if (bag.length) return bag;
    }
    return (await chrome.cookies.getAll({})) || [];
  } catch {
    try {
      return (await chrome.cookies.getAll({})) || [];
    } catch {
      return [];
    }
  }
}

/**
 * @param {string} domain
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
async function cookiesForDomain(domain) {
  if (!chrome?.cookies?.getAll) return [];
  const d = normalizeHost(domain) || String(domain || '').replace(/^\./, '');
  if (!d) return [];
  try {
    const [a, b] = await Promise.all([
      chrome.cookies.getAll({ domain: d }),
      chrome.cookies.getAll({ domain: `.${d}` }),
    ]);
    const map = new Map();
    for (const c of [...(a || []), ...(b || [])]) {
      if (!c?.name) continue;
      map.set(`${c.domain}|${c.name}|${c.path}`, c);
    }
    return [...map.values()];
  } catch {
    return [];
  }
}

/**
 * @param {string} url
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
async function cookiesForUrl(url) {
  if (!chrome?.cookies?.getAll || !url) return [];
  try {
    return (await chrome.cookies.getAll({ url })) || [];
  } catch {
    return [];
  }
}

/**
 * @param {string} cookieDomain
 * @param {string[]} hosts
 */
function cookieOnHosts(cookieDomain, hosts) {
  const d = String(cookieDomain || '')
    .replace(/^\./, '')
    .toLowerCase();
  return hosts.some((h) => d === h || d.endsWith(`.${h}`));
}

/** @param {string} name */
function isGoogleAuthCookieName(name) {
  const n = String(name || '');
  if (!n) return false;
  if (
    /^(LOGIN_INFO|SID|SSID|HSID|APISID|SAPISID|LSID|ACCOUNT_CHOOSER|__Host-GAPS|OSID|__Secure-OSID)$/i.test(
      n,
    )
  ) {
    return true;
  }
  if (/^__Secure-[13]PSID(TS)?$/i.test(n)) return true;
  if (/^__Host-1PLSID$/i.test(n)) return true;
  if (/PSID/i.test(n) && /__Secure|__Host/i.test(n)) return true;
  if (/^SAPISIDHASH$/i.test(n)) return true;
  return false;
}

/** @type {chrome.tabs.Tab[] | null} */
let tabsCache = null;
/** @type {number} */
let tabsCacheAt = 0;

async function getTabsCached() {
  const now = Date.now();
  if (tabsCache && now - tabsCacheAt < 2500) return tabsCache;
  try {
    tabsCache = (await chrome.tabs.query({})) || [];
  } catch {
    tabsCache = [];
  }
  tabsCacheAt = now;
  return tabsCache;
}

/**
 * @param {string} platformId
 * @returns {Promise<{ loggedIn: boolean | null, account: string } | null>}
 */
async function probeAccountFromOpenTabs(platformId) {
  const probe = DOM_ACCOUNT_PROBES[platformId === 'youtube' ? 'youtube' : platformId];
  if (!probe || !chrome?.tabs?.query || !chrome?.scripting?.executeScript) return null;

  tabsCache = null;
  tabsCacheAt = 0;
  const tabs = await getTabsCached();
  const candidates = tabs.filter((tab) => {
    try {
      const host = new URL(tab.url || '').hostname.replace(/^www\./, '');
      return probe.hostRe.test(host);
    } catch {
      return false;
    }
  });
  if (!candidates.length) return null;

  for (const tab of candidates.slice(0, 3)) {
    if (!tab.id) continue;
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: probe.extract,
      });
      if (!result) continue;
      const account = String(result.account || '').trim();
      if (result.loggedIn === true || result.loggedIn === false || result.loggedIn === null || account) {
        return {
          loggedIn: result.loggedIn === true ? true : result.loggedIn === false ? false : null,
          account,
        };
      }
    } catch {
      /* pestaña restringida */
    }
  }
  return null;
}

/**
 * @returns {Promise<{ status: SessionStatus, method: SessionMethod, methodDetail?: string, account?: string }>}
 */
async function probeGoogleSession() {
  if (!chrome?.cookies?.getAll) {
    return { status: 'unknown', method: 'unavailable', methodDetail: 'api' };
  }

  const permitted = await ensureOrigins(GOOGLE_ORIGINS, false);
  if (!permitted) {
    return { status: 'unknown', method: 'permission', methodDetail: 'perm' };
  }

  /** @type {chrome.cookies.Cookie[]} */
  const bag = [];
  bag.push(...(await allReadableCookies()));
  for (const url of [
    'https://www.google.com/',
    'https://google.com/',
    'https://accounts.google.com/',
    'https://mail.google.com/',
    'https://www.youtube.com/',
    'https://myaccount.google.com/',
  ]) {
    bag.push(...(await cookiesForUrl(url)));
  }
  for (const host of GOOGLE_HOSTS) {
    bag.push(...(await cookiesForDomain(host)));
  }

  const map = new Map();
  for (const c of bag) {
    if (!c?.name) continue;
    map.set(`${c.domain}|${c.name}|${c.path}|${c.storeId || ''}`, c);
  }

  const onGoogle = [...map.values()].filter((c) => cookieOnHosts(c.domain, GOOGLE_HOSTS));
  const auth = onGoogle.find((c) => c.value && isGoogleAuthCookieName(c.name));

  const dom = await probeAccountFromOpenTabs('youtube');

  if (auth) {
    return {
      status: 'in',
      method: 'cookie',
      methodDetail: auth.name,
      account: dom?.account || '',
    };
  }

  if (dom?.loggedIn) {
    return {
      status: 'in',
      method: 'dom',
      methodDetail: 'dom',
      account: dom.account || '',
    };
  }

  if (onGoogle.length) {
    if (dom && dom.loggedIn === false) {
      return { status: 'out', method: 'dom', methodDetail: 'signin-dom' };
    }
    return { status: 'out', method: 'cookie', methodDetail: 'anon' };
  }

  if (dom && dom.loggedIn === false) {
    return { status: 'out', method: 'dom', methodDetail: 'signin-dom' };
  }

  return { status: 'unknown', method: 'none', methodDetail: 'empty' };
}

/**
 * Threads: sesión = cookie `sessionid` en threads.net/threads.com, o DOM claro.
 * Instagram sola no cuenta (logout de Threads deja IG).
 * DOM “out” solo con muro de login explícito (no texto “log in” suelto).
 * @returns {Promise<{ status: SessionStatus, method: SessionMethod, methodDetail?: string, account?: string }>}
 */
async function probeThreadsSession() {
  if (!chrome?.cookies?.getAll) {
    return { status: 'unknown', method: 'unavailable', methodDetail: 'api' };
  }

  const THREADS_HOSTS = ['threads.net', 'threads.com'];

  /** @type {chrome.cookies.Cookie[]} */
  const bag = [];
  for (const host of THREADS_HOSTS) {
    bag.push(...(await cookiesForDomain(host)));
  }
  for (const url of [
    'https://www.threads.net/',
    'https://threads.net/',
    'https://www.threads.com/',
    'https://threads.com/',
  ]) {
    bag.push(...(await cookiesForUrl(url)));
  }

  const map = new Map();
  for (const c of bag) {
    if (!c?.name) continue;
    if (!cookieOnHosts(c.domain, THREADS_HOSTS)) continue;
    map.set(`${c.domain}|${c.name}|${c.path}|${c.storeId || ''}`, c);
  }

  /** @type {chrome.cookies.Cookie | null} */
  let session = null;
  /** @type {chrome.cookies.Cookie | null} */
  let dsUser = null;
  for (const c of map.values()) {
    const name = String(c.name || '').toLowerCase();
    const val = String(c.value || '');
    if (!val) continue;
    if (name === 'ds_user_id' && val.length >= 4) dsUser = c;
    // sessionid es la señal fuerte; ds_user_id sola puede quedar residual
    if (name === 'sessionid' && val.length >= 10) session = c;
  }

  const dom = await probeAccountFromOpenTabs('threads');

  if (dom?.loggedIn === true) {
    return {
      status: 'in',
      method: 'dom',
      methodDetail: 'dom',
      account: dom.account || (dsUser?.value ? `id:${dsUser.value}` : ''),
    };
  }

  if (session) {
    return {
      status: 'in',
      method: 'cookie',
      methodDetail: `sessionid@${String(session.domain || 'threads').replace(/^\./, '')}`,
      account: dom?.account || (dsUser?.value ? `id:${dsUser.value}` : ''),
    };
  }

  // Muro de login claro (pestaña abierta) → out aunque queden restos
  if (dom?.loggedIn === false) {
    return { status: 'out', method: 'dom', methodDetail: 'signin-dom' };
  }

  return { status: 'out', method: 'cookie', methodDetail: '' };
}

/**
 * @param {{ domains: string[], anyOf: string[], urls?: string[], weakAnyCookie?: boolean, special?: string, minValueLength?: number, accountFromCookie?: string }} hint
 * @param {string} platformId
 */
async function probeHint(hint, platformId) {
  if (hint.special === 'google') {
    return probeGoogleSession();
  }
  if (hint.special === 'threads') {
    return probeThreadsSession();
  }
  if (!chrome?.cookies?.getAll) {
    return { status: /** @type {SessionStatus} */ ('unknown'), method: /** @type {SessionMethod} */ ('unavailable'), methodDetail: 'api' };
  }

  const names = new Set((hint.anyOf || []).map((n) => n.toLowerCase()));
  const minLen = Number(hint.minValueLength) > 0 ? Number(hint.minValueLength) : 1;
  let anyCookie = false;
  /** @type {chrome.cookies.Cookie[]} */
  const bag = [];
  /** @type {chrome.cookies.Cookie | null} */
  let accountCookie = null;

  for (const domain of hint.domains || []) {
    bag.push(...(await cookiesForDomain(domain)));
  }
  for (const url of hint.urls || []) {
    bag.push(...(await cookiesForUrl(url)));
  }

  const map = new Map();
  for (const c of bag) {
    if (!c?.name) continue;
    map.set(`${c.domain}|${c.name}|${c.path}`, c);
  }

  /** @type {chrome.cookies.Cookie | null} */
  let hit = null;
  for (const c of map.values()) {
    const val = String(c.value || '');
    if (val) anyCookie = true;
    if (hint.accountFromCookie && c.name.toLowerCase() === hint.accountFromCookie.toLowerCase() && val) {
      accountCookie = c;
    }
    if (names.has(String(c.name).toLowerCase()) && val.length >= minLen) {
      hit = c;
    }
  }

  const dom = await probeAccountFromOpenTabs(platformId);

  if (hit) {
    let account = '';
    if (accountCookie?.value) {
      account =
        hint.accountFromCookie === 'c_user' || hint.accountFromCookie === 'ds_user_id'
          ? `id:${accountCookie.value}`
          : String(accountCookie.value).slice(0, 64);
    }
    if (dom?.account) account = dom.account;
    return {
      status: /** @type {SessionStatus} */ ('in'),
      method: /** @type {SessionMethod} */ ('cookie'),
      methodDetail: hit.name,
      account,
    };
  }

  if (dom?.loggedIn) {
    return {
      status: /** @type {SessionStatus} */ ('in'),
      method: /** @type {SessionMethod} */ ('dom'),
      methodDetail: 'dom',
      account: dom.account || '',
    };
  }

  if (hint.anyOf?.length) {
    if (dom && dom.loggedIn === false) {
      return {
        status: /** @type {SessionStatus} */ ('out'),
        method: /** @type {SessionMethod} */ ('dom'),
        methodDetail: 'signin-dom',
      };
    }
    return {
      status: /** @type {SessionStatus} */ ('out'),
      method: /** @type {SessionMethod} */ ('cookie'),
      methodDetail: '',
    };
  }

  if (hint.weakAnyCookie) {
    return {
      status: /** @type {SessionStatus} */ (anyCookie ? 'unknown' : 'out'),
      method: /** @type {SessionMethod} */ ('heuristic'),
      methodDetail: anyCookie ? 'weak' : '',
    };
  }

  return {
    status: /** @type {SessionStatus} */ ('unknown'),
    method: /** @type {SessionMethod} */ ('none'),
  };
}

/**
 * @param {string} host
 */
async function probeCustomHost(host) {
  const cookies = await cookiesForDomain(host);
  const sessionish = cookies.filter((c) =>
    /session|auth|login|token|sid|user/i.test(c.name || ''),
  );
  if (sessionish.some((c) => c.value)) {
    return {
      status: /** @type {SessionStatus} */ ('in'),
      method: /** @type {SessionMethod} */ ('cookie'),
      methodDetail: sessionish[0].name,
    };
  }
  if (cookies.length) {
    return {
      status: /** @type {SessionStatus} */ ('unknown'),
      method: /** @type {SessionMethod} */ ('heuristic'),
      methodDetail: 'weak',
    };
  }
  return {
    status: /** @type {SessionStatus} */ ('out'),
    method: /** @type {SessionMethod} */ ('cookie'),
  };
}

/**
 * @param {{ custom?: Array<{ id: string, label: string, host: string, enabled?: boolean }> }} [opts]
 * @returns {Promise<PlatformSessionRow[]>}
 */
export async function listPlatformSessions(opts = {}) {
  tabsCache = null;
  tabsCacheAt = 0;
  /** @type {PlatformSessionRow[]} */
  const rows = [];

  for (const plat of PAGE_PLATFORMS) {
    const hint = SESSION_HINTS[plat.id];
    /** @type {SessionStatus} */
    let status = 'unknown';
    /** @type {SessionMethod} */
    let method = 'none';
    let methodDetail = '';
    let account = '';

    if (hint) {
      const r = await probeHint(hint, plat.id);
      status = r.status;
      method = r.method;
      methodDetail = r.methodDetail || '';
      account = r.account || '';
    } else {
      const r = await probeHint(
        {
          domains: plat.hosts || [],
          anyOf: [],
          weakAnyCookie: true,
        },
        plat.id,
      );
      status = r.status;
      method = r.method;
      methodDetail = r.methodDetail || '';
      account = r.account || '';
    }

    rows.push({
      id: plat.id,
      label: plat.label,
      openUrl: plat.openUrl,
      status,
      method,
      methodDetail,
      account,
    });
  }

  for (const c of opts.custom || []) {
    if (!c?.host) continue;
    const r = await probeCustomHost(c.host);
    rows.push({
      id: c.id || `custom_${c.host}`,
      label: c.label || c.host,
      openUrl: `https://www.${c.host}/`,
      status: r.status,
      method: r.method,
      methodDetail: r.methodDetail || '',
      account: '',
    });
  }

  return rows;
}

export function sessionStatusLabel(status, localeMessages) {
  const map = localeMessages || {
    in: 'Logueado',
    out: 'No logueado',
    unknown: 'Sin confirmar',
  };
  return map[status] || map.unknown;
}

/** Orígenes Google/YouTube para pedir permiso en un clic de usuario. */
export const SESSION_GOOGLE_ORIGINS = GOOGLE_ORIGINS;

export async function requestSessionHostAccess() {
  return ensureOrigins(GOOGLE_ORIGINS, true);
}
