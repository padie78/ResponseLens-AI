import { Component, ViewEncapsulation, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { CompetitorAlert } from '../../../models/alert.model';

@Component({
  standalone: true,
  selector: 'rl-alert-card',
  encapsulation: ViewEncapsulation.None,
  imports: [DatePipe],
  template: `
    <article class="rl-alert" [attr.data-severity]="alert().severity">
      <header class="rl-alert__head">
        <div>
          <p class="rl-alert__brand">{{ alert().competitorName }}</p>
          <p class="rl-alert__meta">
            <span class="rl-alert__badge">{{ alert().severity }}</span>
            @if (alert().channel) {
              <span>{{ alert().channel }}</span>
            }
            <time>{{ alert().detectedAt | date: 'short' }}</time>
          </p>
        </div>
        <div class="rl-alert__actions">
          @if (alert().sourceUrl) {
            <a class="rl-alert__link" [href]="alert().sourceUrl" target="_blank" rel="noopener">Ver fuente</a>
          }
          <button type="button" class="rl-alert__btn" (click)="dismiss.emit(alert().alertId)">Descartar</button>
          @if (showCapture()) {
            <button type="button" class="rl-alert__btn rl-alert__btn--primary" (click)="contact.emit(alert().alertId)">
              Contactado
            </button>
          }
        </div>
      </header>
      <p class="rl-alert__body">{{ alert().originalComplaint }}</p>
      @if (alert().salesPitch) {
        <p class="rl-alert__pitch"><strong>Pitch:</strong> {{ alert().salesPitch }}</p>
      }
    </article>
  `,
})
export class AlertCardComponent {
  readonly alert = input.required<CompetitorAlert>();
  readonly showCapture = input(false);
  readonly dismiss = output<string>();
  readonly contact = output<string>();
}
