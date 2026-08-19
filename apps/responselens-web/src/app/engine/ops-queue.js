/**
 * SLA, leads de captación y umbral de crisis por rival (heurística local).
 */

import { SWITCH_INTENT_RE } from './competitive-intel-pack.js';

export const CRISIS_THRESHOLD_KEY = 'rl.intel.crisisThreshold';
const DAY_MS = 24 * 60 * 60 * 1000;

export function loadCrisisThreshold() {
  try {
    const n = Number(localStorage.getItem(CRISIS_THRESHOLD_KEY));
    if (Number.isFinite(n) && n >= 1) return Math.min(99, Math.round(n));
  } catch {
    /* ignore */
  }
  return 5;
}

export function saveCrisisThreshold(n) {
  const v = Math.min(99, Math.max(1, Math.round(Number(n) || 5)));
  try {
    localStorage.setItem(CRISIS_THRESHOLD_KEY, String(v));
  } catch {
    /* ignore */
  }
  return v;
}

export function hoursSince(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 36e5;
}

/** Plazo en horas según severidad / score. */
export function slaHoursFor(alert) {
  const sev = String(alert?.severity || '').toUpperCase();
  const score = typeof alert?._aiScore === 'number' ? alert._aiScore : 0;
  if (sev === 'CRITICAL' || score >= 80) return 2;
  if (sev === 'HIGH' || score >= 60) return 8;
  return 24;
}

export function isOpenStatus(status) {
  const st = String(status || 'NEW').toUpperCase();
  return st === 'NEW' || st === 'SNOOZED';
}

export function slaBreached(alert) {
  if (!alert || !isOpenStatus(alert.status)) return false;
  const own = alert.brandScope === 'own' || alert._brandScope === 'own';
  if (own) {
    const sev = String(alert.severity || '').toUpperCase();
    if (sev !== 'HIGH' && sev !== 'CRITICAL' && (alert._aiScore || 0) < 60) return false;
  }
  return hoursSince(alert.detectedAt) > slaHoursFor(alert);
}

export function slaAgeLabel(alert) {
  const h = hoursSince(alert?.detectedAt);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

export function isSwitchLead(alert) {
  if (!alert || alert.brandScope === 'own') return false;
  if (!isOpenStatus(alert.status)) return false;
  const text = String(alert.originalComplaint || '');
  return SWITCH_INTENT_RE.test(text);
}

export function listLeads(alerts = []) {
  return (alerts || []).filter(isSwitchLead);
}

/**
 * Rivales con más de `threshold` menciones abiertas en 24 h.
 * @param {object[]} alerts
 * @param {number} [threshold]
 */
export function crisisRivals(alerts = [], threshold = loadCrisisThreshold()) {
  const since = Date.now() - DAY_MS;
  /** @type {Record<string, number>} */
  const counts = {};
  for (const a of alerts || []) {
    if (a.brandScope === 'own') continue;
    const t = Date.parse(a.detectedAt || '');
    if (!Number.isFinite(t) || t < since) continue;
    const name = String(a.competitorName || '').trim();
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= threshold)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function hottestRivalName(alerts = []) {
  const crises = crisisRivals(alerts, 1);
  if (crises[0]) return crises[0].name;
  const leads = listLeads(alerts);
  if (leads[0]?.competitorName) return leads[0].competitorName;
  const rival = (alerts || []).find((a) => a.brandScope !== 'own');
  return rival?.competitorName || '';
}

export function authorKeyFromAlert(alert) {
  const existing = String(alert?._ops?.authorKey || '').trim();
  if (existing) return existing;
  const sc = alert?._scMeta || {};
  const author = String(sc.author || '').trim().toLowerCase();
  const url = String(alert?.sourceUrl || '').split('?')[0];
  return author || url || String(alert?.alertId || '');
}

export function isAssignedToMe(alert, actor) {
  const a = String(alert?._ops?.assignee || '').trim().toLowerCase();
  if (!a || !actor) return false;
  const me = String(actor).trim().toLowerCase();
  const local = me.split('@')[0];
  return a === me || a === local || (local.length > 1 && a.includes(local));
}
