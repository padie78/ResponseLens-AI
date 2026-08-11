import { SCAN_SOURCES } from '../engine/platforms.js';

export type ScanSourceId = (typeof SCAN_SOURCES)[number]['id'];

export interface ScanSourcesPrefs {
  hackernews: boolean;
  reddit_api: boolean;
  active_page: boolean;
  news_portals: boolean;
  youtube_api: boolean;
}

const STORAGE_KEY = 'rl_web_scan_sources';

export function defaultScanSourcesPrefs(): ScanSourcesPrefs {
  return {
    hackernews: true,
    reddit_api: true,
    active_page: false,
    news_portals: true,
    youtube_api: true,
  };
}

export function loadScanSourcesPrefs(): ScanSourcesPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultScanSourcesPrefs();
    const parsed = JSON.parse(raw) as Partial<ScanSourcesPrefs>;
    return { ...defaultScanSourcesPrefs(), ...parsed };
  } catch {
    return defaultScanSourcesPrefs();
  }
}

export function saveScanSourcesPrefs(prefs: ScanSourcesPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export { SCAN_SOURCES };
