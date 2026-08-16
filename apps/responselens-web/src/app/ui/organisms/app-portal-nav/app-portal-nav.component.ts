import {
  Component,
  HostListener,
  ViewEncapsulation,
  inject,
  input,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { APP_SUBNAV_ITEMS } from '../../../core/navigation/app-nav.config';
import { chromeT } from '../../../core/i18n/chrome-i18n';
import { UiPreferencesService } from '../../../core/preferences/ui-preferences.service';
import { AlertsStore } from '../../../stores/alerts.store';

const ITEM_KEY: Record<string, { label: string; desc: string }> = {
  own: { label: 'chrome.nav.own', desc: 'chrome.nav.own.desc' },
  competitors: { label: 'chrome.nav.competitors', desc: 'chrome.nav.competitors.desc' },
  history: { label: 'chrome.nav.history', desc: 'chrome.nav.history.desc' },
  stats: { label: 'chrome.nav.stats', desc: 'chrome.nav.stats.desc' },
  ranking: { label: 'chrome.nav.ranking', desc: 'chrome.nav.ranking.desc' },
  settings: { label: 'chrome.nav.settings', desc: 'chrome.nav.settings.desc' },
};

/**
 * Línea 2 del chrome (estilo statsGames game-nav):
 * Workspace + tabs del portal + menú mobile
 */
@Component({
  standalone: true,
  selector: 'rl-app-portal-nav',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="rl-portal-nav" [attr.aria-label]="t('chrome.nav.aria')">
      <div class="rl-portal-nav__inner">
        <div class="rl-portal-nav__workspace">
          <span class="rl-portal-nav__mark" aria-hidden="true">RL</span>
          <div class="rl-portal-nav__titles">
            <span class="rl-portal-nav__label">{{ companyName() }}</span>
            <span class="rl-portal-nav__hint">
              <span class="rl-portal-nav__focus">{{ t('chrome.listening') }}</span>
              <span class="rl-portal-nav__hint-sep" aria-hidden="true">·</span>
              <span>{{ t('chrome.workspace') }}</span>
            </span>
          </div>
        </div>

        <nav class="rl-portal-nav__tabs" [attr.aria-label]="t('chrome.nav.aria')">
          @for (item of items; track item.id) {
            <a
              class="rl-portal-nav__tab"
              [routerLink]="item.route"
              routerLinkActive="rl-portal-nav__tab--active"
              [routerLinkActiveOptions]="{ exact: item.exact !== false }"
              [attr.title]="itemTitle(item.id)"
            >
              <i class="rl-portal-nav__tab-icon" [class]="iconClass(item.icon)" aria-hidden="true"></i>
              <span class="rl-portal-nav__tab-label">{{ itemLabel(item.id) }}</span>
              @if (badgeCount(item.id); as count) {
                <span class="rl-portal-nav__badge" [attr.data-scope]="item.id">
                  {{ count > 9 ? '9+' : count }}
                </span>
              }
            </a>
          }
        </nav>

        <div class="rl-portal-nav__actions">
          <button
            type="button"
            class="rl-portal-nav__menu-btn"
            [class.is-open]="mobileOpen()"
            [attr.aria-expanded]="mobileOpen()"
            [attr.aria-label]="t('chrome.nav.expand')"
            (click)="mobileOpen.set(!mobileOpen())"
          >
            <span class="rl-portal-nav__menu-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      @if (mobileOpen()) {
        <button type="button" class="rl-portal-nav__backdrop" [attr.aria-label]="t('chrome.nav.collapse')" (click)="mobileOpen.set(false)"></button>
        <div class="rl-portal-nav__mobile is-open">
          <div class="rl-portal-nav__mobile-head">
            <p class="rl-portal-nav__mobile-eyebrow">{{ t('chrome.workspace') }}</p>
            <p class="rl-portal-nav__mobile-focus">{{ companyName() }}</p>
          </div>
          <nav class="rl-portal-nav__mobile-nav">
            @for (item of items; track item.id) {
              <a
                class="rl-portal-nav__mobile-link"
                [routerLink]="item.route"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: item.exact !== false }"
                (click)="mobileOpen.set(false)"
              >
                <span class="rl-portal-nav__mobile-main">
                  <i [class]="iconClass(item.icon)" aria-hidden="true"></i>
                  <span>
                    <strong>{{ itemLabel(item.id) }}</strong>
                    <small>{{ itemDesc(item.id) }}</small>
                  </span>
                </span>
                @if (badgeCount(item.id); as count) {
                  <span class="rl-portal-nav__badge">{{ count }}</span>
                }
              </a>
            }
          </nav>
        </div>
      }
    </header>
  `,
})
export class AppPortalNavComponent {
  readonly companyName = input('ResponseLens AI');

  private readonly prefs = inject(UiPreferencesService);
  private readonly alerts = inject(AlertsStore);
  private readonly router = inject(Router);

  readonly items = APP_SUBNAV_ITEMS;
  readonly mobileOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.mobileOpen.set(false));
  }

  t(key: string): string {
    return chromeT(key, this.prefs.locale());
  }

  itemLabel(id: string): string {
    const keys = ITEM_KEY[id];
    return keys ? this.t(keys.label) : id;
  }

  itemDesc(id: string): string {
    const keys = ITEM_KEY[id];
    return keys ? this.t(keys.desc) : '';
  }

  itemTitle(id: string): string {
    return `${this.itemLabel(id)} — ${this.itemDesc(id)}`;
  }

  badgeCount(id: string): number {
    if (id === 'own') return this.alerts.newOwnCount();
    if (id === 'competitors') return this.alerts.newRivalCount();
    return 0;
  }

  iconClass(icon: string): string {
    return icon.startsWith('pi ') ? icon : 'pi pi-circle';
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.mobileOpen.set(false);
  }
}
