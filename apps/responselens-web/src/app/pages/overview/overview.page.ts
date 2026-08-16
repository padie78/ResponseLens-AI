import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';

@Component({
  standalone: true,
  selector: 'rl-overview-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Inicio</h1>
        <p class="rl-page__lead">
          {{ config.companyName() || 'Tu empresa' }} · operación, competencia y control en un solo espacio.
        </p>

        <div class="rl-kpi-grid">
          <a class="rl-kpi" routerLink="/app/own" [queryParams]="{ inbox: 'urgent' }">
            <span class="rl-kpi__label">Crisis / urgentes</span>
            <strong class="rl-kpi__value">{{ alerts.newOwnCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/competitors">
            <span class="rl-kpi__label">Señales de rivales</span>
            <strong class="rl-kpi__value">{{ alerts.newRivalCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/alerts">
            <span class="rl-kpi__label">Alertas sin leer</span>
            <strong class="rl-kpi__value">{{ alerts.unreadArrivalCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/settings">
            <span class="rl-kpi__label">Empresa</span>
            <strong class="rl-kpi__value">{{ config.companyName() || 'Configurar' }}</strong>
          </a>
        </div>
      </div>
    </ion-content>
  `,
})
export class OverviewPageComponent {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);

  readonly ready = computed(() => Boolean(this.config.companyName()));
}
