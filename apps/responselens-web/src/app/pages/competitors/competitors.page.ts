import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { AlertCardComponent } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-competitors-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, AlertCardComponent],
  template: `
    <ion-content>
      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Competencia</h1>
            <p class="rl-page__lead">Quejas de rivales y oportunidades de captación.</p>
          </div>
          <div class="rl-page__toolbar-actions">
            <button type="button" class="rl-settings__ghost" (click)="seed()">Cargar ejemplos</button>
          </div>
        </div>

        @if (config.competitors().length === 0) {
          <div class="rl-page__panel">
            <p>
              Agregá rivales en
              <a routerLink="/app/settings">Config</a>
              para enfocar el escaneo de competencia.
            </p>
          </div>
        }

        @if (alerts.loading()) {
          <p class="rl-page__lead">Cargando…</p>
        } @else if (alerts.rivalAlerts().length === 0) {
          <div class="rl-page__panel">
            <p>No hay oportunidades todavía.</p>
            <button type="button" class="rl-auth-gate__submit" style="margin-top: 1rem" (click)="seed()">
              Cargar menciones de ejemplo
            </button>
          </div>
        } @else {
          <div class="rl-feed">
            @for (item of alerts.rivalAlerts(); track item.alertId) {
              <rl-alert-card
                [alert]="item"
                [showCapture]="true"
                (dismiss)="onDismiss($event)"
                (contact)="onContact($event)"
              />
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class CompetitorsPageComponent implements OnInit {
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

  onContact(alertId: string): void {
    this.alerts.updateStatus(alertId, 'CONTACTED');
  }
}
