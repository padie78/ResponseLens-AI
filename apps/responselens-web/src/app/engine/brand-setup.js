/**
 * Onboarding F1: nombre público vs placeholder, tope de rivales, mensajes accionables.
 */

import { SCAN_MAX_RIVALS } from './listening-policy.js';

const PLACEHOLDER_NAMES = new Set([
  'tumarca',
  'tu marca',
  'tuempresa',
  'tu empresa',
  'yourbrand',
  'your brand',
  'acme',
  'acme inc',
  'acme inc.',
  'empresa',
  'company',
]);

export { SCAN_MAX_RIVALS };

export function normalizeBrandKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[.'"´`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre listo para escanear (no vacío ni placeholder de onboarding). */
export function isConfiguredCompanyName(name) {
  const key = normalizeBrandKey(name);
  if (!key || key.length < 2) return false;
  return !PLACEHOLDER_NAMES.has(key);
}

export function companySetupMessage(name) {
  const raw = String(name || '').trim();
  if (!raw) {
    return 'Configurá el nombre público de tu marca en Config → Mi empresa (cómo te mencionan, no el legal).';
  }
  if (!isConfiguredCompanyName(raw)) {
    return `Reemplazá “${raw}” por el nombre público real (ej. Stripe, Mercado Pago) en Config → Mi empresa.`;
  }
  return '';
}

export function rivalsSetupMessage(competitors) {
  const n = Array.isArray(competitors) ? competitors.filter((c) => String(c?.name || '').trim()).length : 0;
  if (n === 0) {
    return 'Agregá 3 a 5 rivales en Config → Rivales. Usá el nombre público; el website no se usa como query.';
  }
  return '';
}

export function rivalCapMessage(count) {
  if (count >= SCAN_MAX_RIVALS) {
    return `Tope de ${SCAN_MAX_RIVALS} rivales por pasada. Quitá uno para agregar otro (el cron ignora el resto).`;
  }
  return '';
}
