import { normalizeBrandKey } from './brand-setup.js';
import type { CompetitorAlert } from '../models/alert.model';
import type { UserConfig } from '../models/user-config.model';

export interface WorkspaceSnapshot {
  id: string;
  label: string;
  config: UserConfig;
  savedAt: string;
  crisisThreshold?: number;
}

function keysOf(values: string[]): Set<string> {
  return new Set(values.map((v) => normalizeBrandKey(v)).filter(Boolean));
}

export function companyKeys(config: UserConfig | null): Set<string> {
  if (!config) return new Set();
  return keysOf([config.company.companyName, ...(config.company.aliases ?? [])]);
}

export function rivalKeys(config: UserConfig | null): Set<string> {
  if (!config) return new Set();
  return keysOf(
    (config.competitors ?? []).flatMap((c) => [c.name, ...(c.aliases ?? [])]),
  );
}

export function workspaceIdOfAlert(alert: CompetitorAlert): string {
  const tagged = String(alert.workspaceId || '').trim();
  if (tagged) return tagged;
  const meta = alert.metaJson;
  if (meta && typeof meta === 'object' && typeof meta['workspaceId'] === 'string') {
    return String(meta['workspaceId']).trim();
  }
  return '';
}

/** True if the alert belongs to the active company pack (own + those rivals). */
export function alertBelongsToWorkspace(
  alert: CompetitorAlert,
  config: UserConfig | null,
  workspaceId: string | null,
  isolate: boolean,
): boolean {
  const tagged = workspaceIdOfAlert(alert);
  const active = String(workspaceId || '').trim();
  if (tagged && active) return tagged === active;
  if (!isolate) return true;
  if (!config) return false;

  const key = normalizeBrandKey(alert.competitorName);
  if (!key) return false;
  const own = companyKeys(config);
  const rivals = rivalKeys(config);
  if (alert.brandScope === 'own') return own.has(key);
  return rivals.has(key);
}
