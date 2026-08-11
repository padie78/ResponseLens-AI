import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { HistoryStore } from '../../stores/history.store';

@Component({
  standalone: true,
  selector: 'rl-history-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, DatePipe],
  template: `
    <ion-content>
      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Historial</h1>
            <p class="rl-page__lead">Respuestas, captaciones y análisis locales.</p>
          </div>
          <div class="rl-page__toolbar-actions">
            <button type="button" class="rl-settings__ghost" (click)="refresh()">Refrescar</button>
            <button type="button" class="rl-auth-gate__submit rl-page__btn-inline" (click)="exportCsv()">
              Exportar CSV
            </button>
          </div>
        </div>

        @if (history.count() === 0) {
          <div class="rl-page__panel">
            <p>Sin entradas todavía. Analizá menciones en Propios o mové oportunidades en Competencia.</p>
          </div>
        } @else {
          <div class="rl-history-list">
            @for (entry of history.items(); track entry.id) {
              <article class="rl-history-item">
                <header class="rl-history-item__head">
                  <span class="rl-alert__badge">{{ entry.kind }}</span>
                  <time>{{ entry.at | date: 'short' }}</time>
                </header>
                <p class="rl-history-item__text">{{ entry.text }}</p>
                @if (entry.alertId) {
                  <p class="rl-history-item__meta">Alert: {{ entry.alertId }}</p>
                }
                @if (entry.riskLevel || entry.label) {
                  <p class="rl-history-item__meta">
                    @if (entry.riskLevel) { Riesgo: {{ entry.riskLevel }} }
                    @if (entry.label) { · {{ entry.label }} }
                  </p>
                }
              </article>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class HistoryPageComponent implements OnInit {
  readonly history = inject(HistoryStore);

  ngOnInit(): void {
    this.history.load();
  }

  refresh(): void {
    this.history.load();
  }

  exportCsv(): void {
    this.history.downloadCsv();
  }
}
