import { Component, ViewEncapsulation, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { CompetitorAlert } from '../../../models/alert.model';

@Component({
  standalone: true,
  selector: 'rl-alert-card',
  encapsulation: ViewEncapsulation.None,
  imports: [DatePipe],
  template: `
    <article
      class="rl-alert"
      [class.rl-alert--selected]="selected()"
      [attr.data-severity]="alert().severity"
      (click)="select.emit(alert().alertId)"
    >
      <header class="rl-alert__head">
        <div>
          <p class="rl-alert__brand">{{ alert().competitorName }}</p>
          <p class="rl-alert__meta">
            <span class="rl-alert__badge">{{ alert().severity }}</span>
            @if (sentimentLabel()) {
              <span class="rl-alert__badge rl-alert__badge--sentiment" [attr.data-sentiment]="sentimentLabel()">
                {{ sentimentLabel() }}
              </span>
            }
            @if (mentionKind()) {
              <span class="rl-alert__badge rl-alert__badge--kind">{{ mentionKindLabel() }}</span>
            }
            @if (alert().channel) {
              <span>{{ alert().channel }}</span>
            }
            <time>{{ alert().detectedAt | date: 'short' }}</time>
          </p>
        </div>
        <div class="rl-alert__actions" (click)="$event.stopPropagation()">
          @if (alert().sourceUrl && !alert().sourceUrl.startsWith('manual://')) {
            <a class="rl-alert__link" [href]="alert().sourceUrl" target="_blank" rel="noopener">Ver fuente</a>
          }
          @if (showAnalyze()) {
            <button type="button" class="rl-alert__btn" (click)="analyze.emit(alert().alertId)">Analizar</button>
          }
          @if (alert().salesPitch) {
            <button type="button" class="rl-alert__btn" (click)="copyText(alert().salesPitch)">Copiar pitch</button>
          }
          <button type="button" class="rl-alert__btn" (click)="dismiss.emit(alert().alertId)">Descartar</button>
          @if (showCapture()) {
            <button type="button" class="rl-alert__btn rl-alert__btn--primary" (click)="contact.emit(alert().alertId)">
              Contactado
            </button>
            <button type="button" class="rl-alert__btn rl-alert__btn--ok" (click)="won.emit(alert().alertId)">
              Ganado
            </button>
          }
        </div>
      </header>

      <p class="rl-alert__body">{{ alert().originalComplaint }}</p>

      @if (alert()._analysisSummary) {
        <p class="rl-alert__summary">{{ alert()._analysisSummary }}</p>
      }

      @if (alert().salesPitch) {
        <p class="rl-alert__pitch"><strong>Pitch:</strong> {{ alert().salesPitch }}</p>
      }

      @if (alert().status !== 'NEW') {
        <p class="rl-alert__status">Estado: {{ alert().status }}</p>
      }
    </article>
  `,
})
export class AlertCardComponent {
  readonly alert = input.required<CompetitorAlert>();
  readonly showCapture = input(false);
  readonly showAnalyze = input(false);
  readonly selected = input(false);

  readonly dismiss = output<string>();
  readonly contact = output<string>();
  readonly won = output<string>();
  readonly analyze = output<string>();
  readonly select = output<string>();

  sentimentLabel(): string {
    const s = this.alert()._sentiment || this.alert().sentiment;
    return String(s || '').toUpperCase();
  }

  mentionKind(): string {
    return this.alert()._mentionKind || '';
  }

  mentionKindLabel(): string {
    const k = this.mentionKind();
    if (k === 'media') return 'Medio';
    if (k === 'comment') return 'Comentario';
    return k;
  }

  copyText(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
}
