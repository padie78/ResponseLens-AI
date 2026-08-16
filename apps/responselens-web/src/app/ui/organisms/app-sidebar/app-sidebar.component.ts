import { Component, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import {
  APP_NAV_SECTIONS,
  isNavGroup,
  type AppNavGroup,
  type AppNavLink,
  type AppNavNode,
} from '../../../core/navigation/app-nav.config';
import { chromeT } from '../../../core/i18n/chrome-i18n';
import { UiPreferencesService } from '../../../core/preferences/ui-preferences.service';
import { AlertsStore } from '../../../stores/alerts.store';

const COLLAPSE_KEY = 'rl.ui.sidebarCollapsed';

@Component({
  standalone: true,
  selector: 'rl-app-sidebar',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink],
  template: `
    <aside class="rl-sidebar" [class.rl-sidebar--collapsed]="collapsed()">
      <div class="rl-sidebar__brand">
        <a class="rl-sidebar__logo" routerLink="/app/overview" title="ResponseLens">
          <span class="rl-sidebar__mark">RL</span>
          @if (!collapsed()) {
            <span class="rl-sidebar__brand-text">
              <span class="rl-sidebar__name">ResponseLens</span>
              <span class="rl-sidebar__product">AI</span>
            </span>
          }
        </a>
        <button
          type="button"
          class="rl-sidebar__collapse"
          [attr.aria-label]="collapsed() ? t('chrome.nav.expand') : t('chrome.nav.collapse')"
          (click)="toggleCollapsed()"
        >
          <i class="pi" [class.pi-angle-left]="!collapsed()" [class.pi-angle-right]="collapsed()"></i>
        </button>
      </div>

      @if (!collapsed()) {
        <a class="rl-sidebar__company" routerLink="/app/settings" [attr.title]="companyName()">
          <span class="rl-sidebar__company-mark" aria-hidden="true">{{ companyInitial() }}</span>
          <span class="rl-sidebar__company-body">
            <span class="rl-sidebar__company-kicker">Empresa</span>
            <span class="rl-sidebar__company-name">{{ companyName() }}</span>
          </span>
          <i class="pi pi-chevron-down" aria-hidden="true"></i>
        </a>
      }

      <nav class="rl-sidebar__nav" [attr.aria-label]="t('chrome.nav.aria')">
        @for (section of sections; track section.id) {
          <div class="rl-sidebar__section">
            @if (!collapsed() && section.label) {
              <p class="rl-sidebar__section-label">{{ section.label }}</p>
            }
            @for (node of section.items; track node.id) {
              @if (isGroup(node)) {
                <div class="rl-sidebar__group" [class.is-open]="isGroupOpen(node)">
                  <button
                    type="button"
                    class="rl-sidebar__group-btn"
                    [class.is-active]="isGroupActive(node)"
                    [attr.title]="node.label"
                    (click)="toggleGroup(node.id)"
                  >
                    <i class="rl-sidebar__icon" [class]="node.icon"></i>
                    @if (!collapsed()) {
                      <span class="rl-sidebar__label">{{ node.label }}</span>
                      <i class="pi pi-chevron-down rl-sidebar__caret" aria-hidden="true"></i>
                    }
                  </button>
                  @if (!collapsed() && isGroupOpen(node)) {
                    <div class="rl-sidebar__children">
                      @for (child of node.children; track child.id) {
                        <a
                          class="rl-sidebar__item rl-sidebar__item--child"
                          [class.rl-sidebar__item--active]="isLinkActive(child)"
                          [routerLink]="child.route"
                          [queryParams]="child.queryParams || {}"
                          [attr.title]="child.title + ' — ' + child.description"
                        >
                          <i class="rl-sidebar__icon" [class]="child.icon"></i>
                          <span class="rl-sidebar__label">{{ child.label }}</span>
                          @if (badgeCount(child); as count) {
                            <span class="rl-sidebar__badge">{{ count > 9 ? '9+' : count }}</span>
                          }
                        </a>
                      }
                    </div>
                  }
                </div>
              } @else {
                <a
                  class="rl-sidebar__item"
                  [class.rl-sidebar__item--active]="isLinkActive(node)"
                  [routerLink]="node.route"
                  [queryParams]="node.queryParams || {}"
                  [attr.title]="node.title + ' — ' + node.description"
                >
                  <i class="rl-sidebar__icon" [class]="node.icon"></i>
                  @if (!collapsed()) {
                    <span class="rl-sidebar__label">{{ node.label }}</span>
                  }
                  @if (badgeCount(node); as count) {
                    <span class="rl-sidebar__badge">{{ count > 9 ? '9+' : count }}</span>
                  }
                </a>
              }
            }
          </div>
        }
      </nav>
    </aside>
  `,
})
export class AppSidebarComponent {
  private readonly prefs = inject(UiPreferencesService);
  private readonly alerts = inject(AlertsStore);
  private readonly router = inject(Router);

  readonly companyName = input('Empresa');
  readonly collapsed = signal(this.readCollapsed());
  readonly sections = APP_NAV_SECTIONS;
  readonly openGroups = signal<Record<string, boolean>>(this.defaultOpenGroups());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly locale = computed(() => this.prefs.locale());

  companyInitial(): string {
    const name = this.companyName().trim();
    return name ? name.slice(0, 1).toUpperCase() : 'E';
  }

  t(key: string): string {
    return chromeT(key, this.locale());
  }

  isGroup(node: AppNavNode): node is AppNavGroup {
    return isNavGroup(node);
  }

  isGroupOpen(node: AppNavGroup): boolean {
    if (this.isGroupActive(node)) return true;
    return this.openGroups()[node.id] !== false;
  }

  isGroupActive(node: AppNavGroup): boolean {
    return node.children.some((c) => this.isLinkActive(c));
  }

  isLinkActive(link: AppNavLink): boolean {
    const current = this.url();
    const [path, query] = current.split('?');
    if (path !== link.route && !path.endsWith(link.route)) return false;
    const wanted = link.queryParams || {};
    const keys = Object.keys(wanted);
    if (!keys.length) {
      return !/[?&]tab=/.test(current);
    }
    const params = new URLSearchParams(query || '');
    return keys.every((k) => params.get(k) === wanted[k]);
  }

  toggleGroup(id: string): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
      try {
        localStorage.setItem(COLLAPSE_KEY, '0');
      } catch {
        /* ignore */
      }
    }
    this.openGroups.update((m) => ({ ...m, [id]: m[id] === false }));
  }

  badgeCount(link: AppNavLink): number {
    if (link.badge === 'own') return this.alerts.newOwnCount();
    if (link.badge === 'rival') return this.alerts.newRivalCount();
    if (link.badge === 'alerts') return this.alerts.unreadArrivalCount();
    return 0;
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  private defaultOpenGroups(): Record<string, boolean> {
    return { inbox: true, audit: true, rivals: true };
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
