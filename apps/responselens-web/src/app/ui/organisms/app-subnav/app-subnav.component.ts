import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_SUBNAV_ITEMS } from '../../../core/navigation/app-nav.config';

@Component({
  standalone: true,
  selector: 'rl-app-subnav',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="rl-subnav" aria-label="Módulos ResponseLens">
      @for (item of items(); track item.id) {
        <a
          class="rl-subnav__tab"
          [routerLink]="item.route"
          routerLinkActive="rl-subnav__tab--active"
          [routerLinkActiveOptions]="{ exact: item.exact !== false }"
          [attr.title]="item.title + ' — ' + item.description"
        >
          {{ item.label }}
        </a>
      }
    </nav>
  `,
})
export class AppSubnavComponent {
  readonly items = computed(() => APP_SUBNAV_ITEMS);
}
