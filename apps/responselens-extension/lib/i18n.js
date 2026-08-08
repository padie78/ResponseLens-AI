/**
 * i18n runtime for ResponseLens side panel + libs.
 * Locales: es, en, fr, it, de. Persistido en chrome.storage.local (`rl_locale`).
 */

import es from '../locales/es.js';
import en from '../locales/en.js';
import fr from '../locales/fr.js';
import it from '../locales/it.js';
import de from '../locales/de.js';

export const SUPPORTED_LOCALES = /** @type {const} */ (['es', 'en', 'fr', 'it', 'de']);
export const LOCALE_STORAGE_KEY = 'rl_locale';

const CATALOGS = { es, en, fr, it, de };

/** @type {typeof SUPPORTED_LOCALES[number]} */
let currentLocale = 'es';

/**
 * @param {string | undefined | null} raw
 * @returns {typeof SUPPORTED_LOCALES[number]}
 */
export function normalizeLocale(raw) {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  if (SUPPORTED_LOCALES.includes(/** @type {*} */ (base))) {
    return /** @type {typeof SUPPORTED_LOCALES[number]} */ (base);
  }
  return 'es';
}

/** Locale for long-form pitch/report copy that still has es|en templates. */
export function contentLang(locale = currentLocale) {
  return normalizeLocale(locale) === 'es' ? 'es' : 'en';
}

export function getLocale() {
  return currentLocale;
}

/**
 * @param {typeof SUPPORTED_LOCALES[number]} locale
 */
export function setLocale(locale) {
  currentLocale = normalizeLocale(locale);
  try {
    document.documentElement.lang = currentLocale;
  } catch {
    /* non-DOM */
  }
  return currentLocale;
}

export function detectBrowserLocale() {
  const nav = typeof navigator !== 'undefined' ? navigator.language || navigator.languages?.[0] : '';
  return normalizeLocale(nav);
}

/**
 * @param {string} key
 * @param {Record<string, string | number> | undefined} vars
 */
export function t(key, vars) {
  const catalog = CATALOGS[currentLocale] || CATALOGS.es;
  let text = catalog[key] ?? CATALOGS.en[key] ?? CATALOGS.es[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * @param {string} key key whose value is `one|many` with optional `{n}`
 * @param {number} n
 * @param {Record<string, string | number> | undefined} vars
 */
export function tp(key, n, vars) {
  const raw = t(key, { ...(vars || {}), n });
  const parts = raw.split('|');
  const picked = n === 1 ? parts[0] : parts[1] || parts[0];
  return picked.replaceAll('{n}', String(n));
}

/**
 * Apply data-i18n / data-i18n-html / data-i18n-* attrs under root.
 * @param {ParentNode} [root]
 */
export function applyDomI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });
  const attrMap = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-value', 'value'],
  ];
  for (const [dataAttr, attr] of attrMap) {
    root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
      const key = el.getAttribute(dataAttr);
      if (!key) return;
      el.setAttribute(attr, t(key));
    });
  }
}

/**
 * @returns {Promise<typeof SUPPORTED_LOCALES[number]>}
 */
export async function loadStoredLocale() {
  try {
    const data = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
    if (data[LOCALE_STORAGE_KEY]) {
      return setLocale(data[LOCALE_STORAGE_KEY]);
    }
  } catch {
    /* ignore */
  }
  return setLocale(detectBrowserLocale());
}

/**
 * @param {typeof SUPPORTED_LOCALES[number]} locale
 */
export async function persistLocale(locale) {
  const next = setLocale(locale);
  await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: next });
  applyDomI18n();
  return next;
}

export const LOCALE_LABELS = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
};
