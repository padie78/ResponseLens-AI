import {
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { chromeT, LOCALE_LABELS } from '../../../core/i18n/chrome-i18n';
import {
  APP_NAV_SECTIONS,
  flattenNavLinks,
  isNavGroup,
  type AppNavSectionId,
} from '../../../core/navigation/app-nav.config';
import {
  UiPreferencesService,
  type AppLocale,
  type ThemeMode,
} from '../../../core/preferences/ui-preferences.service';
import { SUPPORTED_LOCALES } from '../../../engine/i18n.js';
import { ScanInboxComponent } from '../../molecules/scan-inbox/scan-inbox.component';

const SECTION_ICON: Record<string, string> = {
  home: 'pi pi-home',
  ops: 'pi pi-bolt',
  intel: 'pi pi-chart-line',
  discover: 'pi pi-compass',
  system: 'pi pi-cog',
};

const SECTION_KEY: Record<string, string> = {
  home: 'chrome.nav.home',
  ops: 'chrome.nav.ops',
  intel: 'chrome.nav.intel',
  discover: 'chrome.nav.discover',
  system: 'chrome.nav.system',
};

/**
 * Línea 1 del chrome (estilo statsGames / OP.GG):
 * Brand + módulos | notificaciones + tema + idioma + cuenta
 */
@Component({
  standalone: true,
  selector: 'rl-app-topbar',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, ScanInboxComponent],
  template: `
    <nav class="rl-chrome-bar" aria-label="ResponseLens">
      <div class="rl-chrome-bar__inner">
        <a class="rl-chrome-bar__brand" routerLink="/app/overview" title="ResponseLens">
          <span class="rl-chrome-bar__brand-body">
            <span class="rl-chrome-bar__logo">RL</span>
            <span class="rl-chrome-bar__brand-name">ResponseLens</span>
          </span>
        </a>

        @if (showModules()) {
        <div class="rl-chrome-bar__modules" role="tablist" aria-label="Módulos">
          @for (section of sections; track section.id) {
            <a
              class="rl-chrome-bar__item"
              role="tab"
              [routerLink]="firstRoute(section.id)"
              [class.rl-chrome-bar__item--active]="activeSection() === section.id"
              [attr.aria-selected]="activeSection() === section.id"
              [attr.title]="sectionLabel(section.id)"
            >
              <span class="rl-chrome-bar__item-body">
                <i class="rl-chrome-bar__icon" [class]="sectionIcon(section.id)" aria-hidden="true"></i>
                <span class="rl-chrome-bar__name">{{ sectionLabel(section.id) }}</span>
              </span>
            </a>
          }
        </div>
        }

        <div class="rl-chrome-bar__end">
          <rl-scan-inbox />

          <button
            type="button"
            class="rl-chrome-bar__tool"
            [attr.title]="t('chrome.theme.toggle')"
            [attr.aria-label]="t('chrome.theme.toggle')"
            (click)="prefs.toggleTheme()"
          >
            <i class="pi" [class.pi-moon]="prefs.isDark()" [class.pi-sun]="!prefs.isDark()"></i>
          </button>

          <div class="rl-chrome-menu" [class.is-open]="langOpen()">
            <button
              type="button"
              class="rl-chrome-bar__tool"
              [attr.title]="t('chrome.language')"
              [attr.aria-expanded]="langOpen()"
              (click)="toggleLang($event)"
            >
              <i class="pi pi-globe" aria-hidden="true"></i>
              <span class="rl-chrome-bar__tool-text">{{ localeShort() }}</span>
            </button>
            @if (langOpen()) {
              <div class="rl-chrome-panel" role="menu">
                <p class="rl-chrome-panel__label">{{ t('chrome.language') }}</p>
                @for (loc of locales; track loc) {
                  <button
                    type="button"
                    class="rl-chrome-panel__item"
                    [class.is-active]="prefs.locale() === loc"
                    (click)="pickLocale(loc)"
                  >
                    <span>{{ localeLabel(loc) }}</span>
                    @if (prefs.locale() === loc) {
                      <i class="pi pi-check" aria-hidden="true"></i>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <div class="rl-chrome-account" [class.is-open]="userOpen()">
            <button
              type="button"
              class="rl-chrome-account__trigger"
              [attr.aria-expanded]="userOpen()"
              (click)="toggleUser($event)"
            >
              <span class="rl-chrome-account__avatar" aria-hidden="true">{{ initials() }}</span>
              <span class="rl-chrome-account__meta">
                <span class="rl-chrome-account__name">{{ displayName() }}</span>
                <span class="rl-chrome-account__chip">{{ t('chrome.account') }}</span>
              </span>
              <span class="rl-chrome-account__caret" aria-hidden="true"></span>
            </button>
            @if (userOpen()) {
              <div class="rl-chrome-account__menu" role="menu">
                <div class="rl-chrome-account__head">
                  <span class="rl-chrome-account__avatar rl-chrome-account__avatar--lg">{{ initials() }}</span>
                  <div class="rl-chrome-account__identity">
                    <strong>{{ displayName() }}</strong>
                    @if (auth.email(); as email) {
                      <span>{{ email }}</span>
                    }
                  </div>
                </div>
                <div class="rl-chrome-panel__group">
                  <p class="rl-chrome-panel__label">{{ t('chrome.theme') }}</p>
                  <div class="rl-chrome-seg">
                    <button type="button" class="rl-chrome-seg__btn" [class.is-active]="prefs.theme() === 'dark'" (click)="pickTheme('dark')">
                      <i class="pi pi-moon"></i> {{ t('chrome.theme.dark') }}
                    </button>
                    <button type="button" class="rl-chrome-seg__btn" [class.is-active]="prefs.theme() === 'light'" (click)="pickTheme('light')">
                      <i class="pi pi-sun"></i> {{ t('chrome.theme.light') }}
                    </button>
                  </div>
                </div>
                <a class="rl-chrome-panel__item" routerLink="/app/settings" (click)="closeMenus()">
                  <i class="pi pi-cog"></i> {{ t('chrome.settings') }}
                </a>
                <button type="button" class="rl-chrome-panel__item rl-chrome-panel__item--danger" (click)="onLogout()">
                  <i class="pi pi-sign-out"></i> {{ t('chrome.logout') }}
                </button>
              </div>
            }
          </div>
        </div>
      </div>
    </nav>
  `,
})
export class AppTopbarComponent {
  readonly companyName = input('ResponseLens AI');
  readonly showModules = input(false);
  readonly logout = output<void>();

  readonly auth = inject(AuthService);
  readonly prefs = inject(UiPreferencesService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly sections = APP_NAV_SECTIONS;
  readonly locales = SUPPORTED_LOCALES as AppLocale[];
  readonly langOpen = signal(false);
  readonly userOpen = signal(false);

  private readonly routeKey = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentRouteKey()),
      startWith(this.currentRouteKey()),
    ),
    { initialValue: this.currentRouteKey() },
  );

  readonly activeSection = computed(() => {
    const key = this.routeKey();
    for (const section of APP_NAV_SECTIONS) {
      const links = flattenNavLinks([section]);
      if (links.some((i) => i.id === key || i.route.endsWith(`/${key}`))) {
        return section.id;
      }
    }
    return 'ops' as AppNavSectionId;
  });

  readonly displayName = computed(() => {
    const email = this.auth.email();
    if (!email) return 'Usuario';
    return email.split('@')[0] || email;
  });

  readonly initials = computed(() => {
    const name = this.displayName();
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  });

  readonly localeShort = computed(() => this.prefs.locale().toUpperCase());

  t(key: string): string {
    return chromeT(key, this.prefs.locale());
  }

  sectionLabel(id: AppNavSectionId): string {
    return this.t(SECTION_KEY[id]);
  }

  sectionIcon(id: AppNavSectionId): string {
    return SECTION_ICON[id] || 'pi pi-circle';
  }

  firstRoute(id: AppNavSectionId): string {
    const section = APP_NAV_SECTIONS.find((s) => s.id === id);
    const first = section?.items[0];
    if (!first) return '/app/overview';
    return isNavGroup(first) ? first.children[0]?.route || '/app/overview' : first.route;
  }

  localeLabel(loc: AppLocale): string {
    return LOCALE_LABELS[loc] || loc;
  }

  toggleLang(ev: Event): void {
    ev.stopPropagation();
    this.langOpen.update((v) => !v);
    if (this.langOpen()) this.userOpen.set(false);
  }

  toggleUser(ev: Event): void {
    ev.stopPropagation();
    this.userOpen.update((v) => !v);
    if (this.userOpen()) this.langOpen.set(false);
  }

  pickLocale(loc: AppLocale): void {
    this.prefs.setLocale(loc);
    this.langOpen.set(false);
  }

  pickTheme(mode: ThemeMode): void {
    this.prefs.setTheme(mode);
  }

  closeMenus(): void {
    this.langOpen.set(false);
    this.userOpen.set(false);
  }

  onLogout(): void {
    this.closeMenus();
    this.logout.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) this.closeMenus();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closeMenus();
  }

  private currentRouteKey(): string {
    const path = this.router.url.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const appIdx = parts.indexOf('app');
    if (appIdx < 0) return '';
    return parts[appIdx + 1] || '';
  }
}
