import { Component, ViewEncapsulation, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  APP_NAV_SECTIONS,
  type AppNavIcon,
} from '../../../core/navigation/app-nav.config';

const ICON_CLASS: Record<AppNavIcon, string> = {
  own: 'pi pi-shield',
  competitors: 'pi pi-bolt',
  stats: 'pi pi-chart-line',
  ranking: 'pi pi-trophy',
  history: 'pi pi-history',
  settings: 'pi pi-building',
};

@Component({
  standalone: true,
  selector: 'rl-app-sidebar',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="rl-sidebar" [class.rl-sidebar--collapsed]="collapsed()">
      <div class="rl-sidebar__brand">
        <a class="rl-sidebar__logo" routerLink="/app/own" title="ResponseLens">
          <span class="rl-sidebar__mark">RL</span>
          @if (!collapsed()) {
            <span class="rl-sidebar__name">ResponseLens</span>
          }
        </a>
        <button
          type="button"
          class="rl-sidebar__collapse"
          [attr.aria-label]="collapsed() ? 'Expandir menú' : 'Colapsar menú'"
          (click)="collapsed.set(!collapsed())"
        >
          <i class="pi" [class.pi-angle-left]="!collapsed()" [class.pi-angle-right]="collapsed()"></i>
        </button>
      </div>

      <nav class="rl-sidebar__nav" aria-label="Navegación ResponseLens">
        @for (section of sections; track section.id) {
          <div class="rl-sidebar__section">
            @if (!collapsed()) {
              <p class="rl-sidebar__section-label">{{ section.label }}</p>
            }
            @for (item of section.items; track item.id) {
              <a
                class="rl-sidebar__item"
                [routerLink]="item.route"
                routerLinkActive="rl-sidebar__item--active"
                [routerLinkActiveOptions]="{ exact: item.exact !== false }"
                [attr.title]="item.title + ' — ' + item.description"
              >
                <i class="rl-sidebar__icon" [class]="iconClass(item.icon)"></i>
                @if (!collapsed()) {
                  <span class="rl-sidebar__label">
                    <span>{{ item.label }}</span>
                    <span class="rl-sidebar__desc">{{ item.description }}</span>
                  </span>
                }
              </a>
            }
          </div>
        }
      </nav>

      @if (!collapsed()) {
        <div class="rl-sidebar__hint">
          <p class="rl-sidebar__hint-title">Salud de marca</p>
          <p class="rl-sidebar__hint-text">
            KPIs y gráficos de tu empresa viven en <strong>Propios</strong>. Empresa y rivales se editan en
            <strong>Empresa</strong>.
          </p>
        </div>
      }
    </aside>
  `,
})
export class AppSidebarComponent {
  readonly collapsed = signal(false);
  readonly sections = APP_NAV_SECTIONS;

  iconClass(icon: AppNavIcon): string {
    return ICON_CLASS[icon] || 'pi pi-circle';
  }
}
