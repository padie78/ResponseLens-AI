/** Minimal i18n stub for web engine (ES default). */
let currentLocale = 'es';
export const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'it', 'de'];
export function normalizeLocale(raw) {
  const base = String(raw || '').trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(base) ? base : 'es';
}
export function contentLang(locale = currentLocale) {
  return normalizeLocale(locale) === 'es' ? 'es' : 'en';
}
export function getLocale() { return currentLocale; }
export function setLocale(locale) { currentLocale = normalizeLocale(locale); return currentLocale; }
export function t(key, vars = {}) {
  // Keys used by digital-life-score — fallback to key fragment
  const map = {
    'rank.score': 'Score',
    'rank.mentions': 'Menciones',
    'rank.crisis': 'Crisis',
  };
  let out = map[key] || String(key || '').split('.').pop() || '';
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}
