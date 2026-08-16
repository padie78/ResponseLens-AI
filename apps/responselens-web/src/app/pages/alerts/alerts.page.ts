import { Component, ViewEncapsulation, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore, type ScanArrival } from '../../stores/alerts.store';

@Component({
  standalone: true,
  selector: 'rl-alerts-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Centro de alertas</h1>
            <p class="rl-page__lead">Llegadas del scanner. Las mismas que ves en la campana.</p>
          </div>
          @if (alerts.arrivals().length) {
            <button type="button" class="rl-alert__btn" (click)="alerts.markArrivalsRead()">
              Marcar leídas
            </button>
          }
        </div>

        @if (!alerts.arrivals().length) {
          <p class="rl-own__muted">Sin llegadas aún. Corré una escucha para ver menciones aquí.</p>
        } @else {
          <div class="rl-feed">
            @for (item of alerts.arrivals(); track item.id) {
              <button type="button" class="rl-alert" style="padding: 1rem 1.05rem; text-align: left; width: 100%; cursor: pointer;" (click)="open(item)">
                <strong>{{ item.title }}</strong>
                <p class="rl-own__muted">{{ item.snippet }}</p>
              </button>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class AlertsPageComponent {
  readonly alerts = inject(AlertsStore);
  private readonly router = inject(Router);

  async open(item: ScanArrival): Promise<void> {
    this.alerts.markArrivalRead(item.id);
    const route = item.brandScope === 'own' ? '/app/own' : '/app/competitors';
    await this.router.navigateByUrl(route);
  }
}
