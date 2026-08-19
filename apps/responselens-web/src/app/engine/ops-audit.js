/** Log local de quién abrió texto (PII / compliance). */

const KEY = (userId) => `rl_web_pii_log_${userId || 'anon'}`;

/**
 * @param {{ userId?: string, actor?: string, alertId: string, snippet?: string }} row
 */
export function logPiiView(row) {
  const item = {
    at: new Date().toISOString(),
    actor: String(row.actor || 'usuario').slice(0, 80),
    alertId: String(row.alertId || ''),
    snippet: String(row.snippet || '').slice(0, 80),
  };
  const list = loadPiiLog(row.userId);
  list.unshift(item);
  try {
    localStorage.setItem(KEY(row.userId), JSON.stringify(list.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

export function loadPiiLog(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function piiLogCsv(userId) {
  const rows = loadPiiLog(userId);
  const head = 'at,actor,alertId,snippet';
  const body = rows.map((r) =>
    [r.at, r.actor, r.alertId, JSON.stringify(r.snippet || '')].join(','),
  );
  return [head, ...body].join('\n');
}
