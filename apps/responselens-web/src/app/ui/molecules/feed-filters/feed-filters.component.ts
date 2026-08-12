import { Component, ViewEncapsulation, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { PLATFORM_FILTER_OPTIONS } from '../../../engine/platforms.js';

export type FeedMode = 'own' | 'comp';

export interface FeedFilterState {
  status: string;
  date: string;
  platform: string;
  severity: string;
  sentiment: string;
  rival: string;
  q: string;
}

export const DEFAULT_FEED_FILTERS: FeedFilterState = {
  status: 'all',
  date: 'all',
  platform: 'all',
  severity: 'all',
  sentiment: 'all',
  rival: 'all',
  q: '',
};

interface Opt {
  label: string;
  value: string;
}

@Component({
  standalone: true,
  selector: 'rl-feed-filters',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule, DropdownModule, InputTextModule],
  template: `
    <div class="rl-filters">
      <label class="rl-filters__field">
        <span>Estado</span>
        <p-dropdown
          [options]="statusOpts"
          optionLabel="label"
          optionValue="value"
          [ngModel]="state().status"
          (ngModelChange)="patch({ status: $event })"
          styleClass="rl-filters__dd"
          [appendTo]="'body'"
        />
      </label>

      <label class="rl-filters__field">
        <span>Fecha</span>
        <p-dropdown
          [options]="dateOpts"
          optionLabel="label"
          optionValue="value"
          [ngModel]="state().date"
          (ngModelChange)="patch({ date: $event })"
          styleClass="rl-filters__dd"
          [appendTo]="'body'"
        />
      </label>

      <label class="rl-filters__field">
        <span>Plataforma</span>
        <p-dropdown
          [options]="platformOpts"
          optionLabel="label"
          optionValue="value"
          [ngModel]="state().platform"
          (ngModelChange)="patch({ platform: $event })"
          styleClass="rl-filters__dd"
          [filter]="true"
          filterPlaceholder="Filtrar…"
          [appendTo]="'body'"
        />
      </label>

      <label class="rl-filters__field">
        <span>Severidad</span>
        <p-dropdown
          [options]="severityOpts"
          optionLabel="label"
          optionValue="value"
          [ngModel]="state().severity"
          (ngModelChange)="patch({ severity: $event })"
          styleClass="rl-filters__dd"
          [appendTo]="'body'"
        />
      </label>

      @if (mode() === 'own') {
        <label class="rl-filters__field">
          <span>Sentimiento</span>
          <p-dropdown
            [options]="sentimentOpts"
            optionLabel="label"
            optionValue="value"
            [ngModel]="state().sentiment"
            (ngModelChange)="patch({ sentiment: $event })"
            styleClass="rl-filters__dd"
            [appendTo]="'body'"
          />
        </label>
      }

      @if (mode() === 'comp') {
        <label class="rl-filters__field">
          <span>Rival</span>
          <p-dropdown
            [options]="rivalOpts()"
            optionLabel="label"
            optionValue="value"
            [ngModel]="state().rival"
            (ngModelChange)="patch({ rival: $event })"
            styleClass="rl-filters__dd"
            [appendTo]="'body'"
          />
        </label>
      }

      <label class="rl-filters__field rl-filters__field--grow">
        <span>Buscar</span>
        <input
          pInputText
          type="search"
          class="rl-filters__input"
          placeholder="Texto, URL, canal…"
          [ngModel]="state().q"
          (ngModelChange)="patch({ q: $event })"
        />
      </label>
    </div>
  `,
})
export class FeedFiltersComponent {
  readonly mode = input.required<FeedMode>();
  readonly rivals = input<string[]>([]);
  readonly filterChange = output<FeedFilterState>();

  readonly state = signal<FeedFilterState>({ ...DEFAULT_FEED_FILTERS });

  readonly statusOpts: Opt[] = [
    { label: 'Todos', value: 'all' },
    { label: 'Nuevo', value: 'NEW' },
    { label: 'Contactado', value: 'CONTACTED' },
    { label: 'Ganado', value: 'WON' },
    { label: 'Pospuesto', value: 'SNOOZED' },
  ];

  readonly dateOpts: Opt[] = [
    { label: 'Todo', value: 'all' },
    { label: '24 h', value: '24h' },
    { label: '7 días', value: '7d' },
    { label: '30 días', value: '30d' },
  ];

  readonly severityOpts: Opt[] = [
    { label: 'Todas', value: 'all' },
    { label: 'Crítica', value: 'CRITICAL' },
    { label: 'Alta', value: 'HIGH' },
    { label: 'Media', value: 'MEDIUM' },
    { label: 'Baja', value: 'LOW' },
  ];

  readonly sentimentOpts: Opt[] = [
    { label: 'Todos', value: 'all' },
    { label: 'Negativo', value: 'NEGATIVE' },
    { label: 'Positivo', value: 'POSITIVE' },
    { label: 'Neutro', value: 'NEUTRAL' },
    { label: 'Mixto', value: 'MIXED' },
  ];

  readonly platformOpts: Opt[] = [
    { label: 'Todas', value: 'all' },
    ...(PLATFORM_FILTER_OPTIONS as Array<{ id: string; label: string }>).map((p) => ({
      label: p.label,
      value: p.id,
    })),
  ];

  rivalOpts(): Opt[] {
    return [
      { label: 'Todos', value: 'all' },
      ...this.rivals().map((r) => ({ label: r, value: r })),
    ];
  }

  patch(partial: Partial<FeedFilterState>): void {
    this.state.update((s) => {
      const next = { ...s, ...partial };
      this.filterChange.emit(next);
      return next;
    });
  }
}
