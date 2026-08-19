/** Política F0: cadencia, tope de rivales y créditos de scan manual. */

export const MANUAL_SCAN_LIMIT_PER_DAY = 3;
export const SCAN_MAX_RIVALS = 5;
export const CRON_LOOKBACK_DAYS = 2;
export const MANUAL_LOOKBACK_DAYS = 7;

const quotaKey = (userId) => `rl_manual_scans_${userId}`;

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function readQuota(userId) {
  if (!userId || typeof localStorage === 'undefined') {
    return { day: utcDay(), count: 0 };
  }
  try {
    const raw = localStorage.getItem(quotaKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.day === utcDay() && Number.isFinite(parsed.count)) {
      return { day: parsed.day, count: Number(parsed.count) };
    }
  } catch {
    /* ignore */
  }
  return { day: utcDay(), count: 0 };
}

function writeQuota(userId, state) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(quotaKey(userId), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string} userId
 * @returns {{ used: number, limit: number, remaining: number, exhausted: boolean }}
 */
export function peekManualScanQuota(userId) {
  const { count } = readQuota(userId);
  const remaining = Math.max(0, MANUAL_SCAN_LIMIT_PER_DAY - count);
  return {
    used: count,
    limit: MANUAL_SCAN_LIMIT_PER_DAY,
    remaining,
    exhausted: remaining <= 0,
  };
}

/**
 * Consume 1 scan manual si queda cupo. El demo/mock no debe llamar esto.
 * @param {string} userId
 * @returns {{ ok: boolean, used: number, limit: number, remaining: number }}
 */
export function consumeManualScan(userId) {
  const current = peekManualScanQuota(userId);
  if (current.exhausted) {
    return { ok: false, ...current };
  }
  const next = { day: utcDay(), count: current.used + 1 };
  writeQuota(userId, next);
  const remaining = Math.max(0, MANUAL_SCAN_LIMIT_PER_DAY - next.count);
  return {
    ok: true,
    used: next.count,
    limit: MANUAL_SCAN_LIMIT_PER_DAY,
    remaining,
  };
}

/**
 * @param {Array<{ inboundSource?: string, detectedAt?: string }>} alerts
 * @returns {string | null} ISO
 */
export function lastAutomaticScanAt(alerts) {
  let latest = 0;
  for (const a of alerts || []) {
    if (String(a.inboundSource || '') !== 'cron') continue;
    const t = Date.parse(a.detectedAt || '');
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest ? new Date(latest).toISOString() : null;
}

/**
 * @param {string | null | undefined} iso
 */
export function formatScanWhen(iso) {
  if (!iso) return 'aún no hubo pasada automática';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'aún no hubo pasada automática';
  const deltaMin = Math.round((Date.now() - t) / 60000);
  if (deltaMin < 2) return 'hace un momento';
  if (deltaMin < 60) return `hace ${deltaMin} min`;
  const hours = Math.round(deltaMin / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  return `hace ${days} d`;
}
