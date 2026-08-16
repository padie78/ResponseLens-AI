import { Injectable, computed, signal } from '@angular/core';
import { getLocale, normalizeLocale, setLocale } from '../../engine/i18n.js';

export type ThemeMode = 'dark' | 'light';
export type AppLocale = 'es' | 'en' | 'fr' | 'it' | 'de';

const THEME_KEY = 'rl.ui.theme';
const LOCALE_KEY = 'rl.ui.locale';

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly _theme = signal<ThemeMode>(this.readTheme());
  private readonly _locale = signal<AppLocale>(this.readLocale());

  readonly theme = this._theme.asReadonly();
  readonly locale = this._locale.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    this.applyTheme(this._theme());
    this.applyLocale(this._locale());
  }

  setTheme(mode: ThemeMode): void {
    this._theme.set(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignore */
    }
    this.applyTheme(mode);
  }

  toggleTheme(): void {
    this.setTheme(this._theme() === 'dark' ? 'light' : 'dark');
  }

  setLocale(locale: string): void {
    const next = normalizeLocale(locale) as AppLocale;
    this._locale.set(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* ignore */
    }
    this.applyLocale(next);
  }

  private readTheme(): ThemeMode {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === 'light' || raw === 'dark') return raw;
    } catch {
      /* ignore */
    }
    return 'dark';
  }

  private readLocale(): AppLocale {
    try {
      const raw = localStorage.getItem(LOCALE_KEY);
      if (raw) return normalizeLocale(raw) as AppLocale;
    } catch {
      /* ignore */
    }
    return normalizeLocale(getLocale()) as AppLocale;
  }

  private applyTheme(mode: ThemeMode): void {
    const root = document.documentElement;
    const body = document.body;
    root.classList.toggle('rl-dark', mode === 'dark');
    root.classList.toggle('rl-light', mode === 'light');
    body.classList.toggle('rl-dark', mode === 'dark');
    body.classList.toggle('rl-light', mode === 'light');
    root.style.colorScheme = mode;
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', mode);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', mode === 'dark' ? '#090d18' : '#eef1f7');
    }
  }

  private applyLocale(locale: AppLocale): void {
    setLocale(locale);
    document.documentElement.lang = locale;
  }
}
