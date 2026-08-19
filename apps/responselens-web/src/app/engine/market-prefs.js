function prefKey(scope, workspaceId, companyName) {
  return `rl_market_${scope}_${workspaceId || 'default'}_${String(companyName || 'anon')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')}`;
}

export function loadMarketPrefs(scope, workspaceId, companyName, fallback) {
  try {
    const raw = localStorage.getItem(prefKey(scope, workspaceId, companyName));
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function saveMarketPrefs(scope, workspaceId, companyName, prefs) {
  try {
    localStorage.setItem(prefKey(scope, workspaceId, companyName), JSON.stringify(prefs));
  } catch {
    /* ignore localStorage failures */
  }
}
