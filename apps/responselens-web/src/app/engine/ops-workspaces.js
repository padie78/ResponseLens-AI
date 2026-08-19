/** Multi-marca local: snapshots de config por empresa (workspace). */

const KEY = (userId) => `rl_web_workspaces_${userId || 'anon'}`;
const ACTIVE_KEY = (userId) => `rl_web_active_workspace_${userId || 'anon'}`;

export function loadWorkspaces(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(userId, list) {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function loadActiveWorkspaceId(userId) {
  try {
    return localStorage.getItem(ACTIVE_KEY(userId)) || '';
  } catch {
    return '';
  }
}

export function saveActiveWorkspaceId(userId, id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY(userId), id);
    else localStorage.removeItem(ACTIVE_KEY(userId));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} userId
 * @param {{ id?: string, label: string, config: object, crisisThreshold?: number }} ws
 */
export function upsertWorkspace(userId, ws) {
  const list = loadWorkspaces(userId);
  const id = ws.id || `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const next = {
    id,
    label: ws.label,
    config: ws.config,
    crisisThreshold: typeof ws.crisisThreshold === 'number' ? ws.crisisThreshold : undefined,
    savedAt: new Date().toISOString(),
  };
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = { ...list[i], ...next };
  else list.push(next);
  persist(userId, list);
  return next;
}

export function deleteWorkspace(userId, id) {
  persist(
    userId,
    loadWorkspaces(userId).filter((x) => x.id !== id),
  );
}

export function findWorkspace(userId, id) {
  return loadWorkspaces(userId).find((w) => w.id === id) || null;
}
