import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { AlertCardComponent } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-own-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, AlertCardComponent],
  template: `
    <ion-content>
      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Propios</h1>
            <p class="rl-page__lead">
              Menciones y crisis de
              {{ config.companyName() || 'tu marca' }}.
            </p>
          </div>
          <div class="rl-page__toolbar-actions">
            <button type="button" class="rl-settings__ghost" (click)="seed()">Cargar ejemplos</button>
          </div>
        </div>

        @if (!config.hasCompany()) {
          <div class="rl-page__panel">
            <p>
              Primero configurá tu empresa en
              <a routerLink="/app/settings">Config</a>
              para etiquetar menciones propias.
            </p>
          </div>
        }

        @if (alerts.loading()) {
          <p class="rl-page__lead">Cargando…</p>
        } @else if (alerts.ownAlerts().length === 0) {
          <div class="rl-page__panel">
            <p>No hay menciones propias todavía.</p>
            <p class="rl-settings__empty">
              El plugin escaneaba HN/Reddit/noticias en el navegador. En la web el feed viene de
              AppSync / webhooks (cuando esté deployado) o de ejemplos locales.
            </p>
            <button type="button" class="rl-auth-gate__submit" style="margin-top: 1rem" (click)="seed()">
              Cargar menciones de ejemplo
            </button>
          </div>
        } @else {
          <div class="rl-feed">
            @for (item of alerts.ownAlerts(); track item.alertId) {
              <rl-alert-card [alert]="item" (dismiss)="onDismiss($event)" />
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class OwnPageComponent implements OnInit {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
  }

  seed(): void {
    this.config.load();
    this.alerts.seedExamples();
  }

  onDismiss(alertId: string): void {
    this.alerts.updateStatus(alertId, 'DISMISSED');
  }
}
