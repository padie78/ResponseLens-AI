import { Component, ViewEncapsulation, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

@Component({
  standalone: true,
  selector: 'rl-feed-filters',
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule],
  template: `
    <div class="rl-filters">
      <label class="rl-filters__field">
        <span>Estado</span>
        <select class="rl-filters__select" [ngModel]="state().status" (ngModelChange)="patch({ status: $event })">
          <option value="all">Todos</option>
          <option value="NEW">Nuevo</option>
          <option value="CONTACTED">Contactado</option>
          <option value="WON">Ganado</option>
          <option value="SNOOZED">Pospuesto</option>
        </select>
      </label>

      <label class="rl-filters__field">
        <span>Fecha</span>
        <select class="rl-filters__select" [ngModel]="state().date" (ngModelChange)="patch({ date: $event })">
          <option value="all">Todo</option>
          <option value="24h">24 h</option>
          <option value="7d">7 días</option>
          <option value="30d">30 días</option>
        </select>
      </label>

      <label class="rl-filters__field">
        <span>Plataforma</span>
        <select class="rl-filters__select" [ngModel]="state().platform" (ngModelChange)="patch({ platform: $event })">
          <option value="all">Todas</option>
          @for (p of platformOptions; track p.id) {
            <option [value]="p.id">{{ p.label }}</option>
          }
        </select>
      </label>

      <label class="rl-filters__field">
        <span>Severidad</span>
        <select class="rl-filters__select" [ngModel]="state().severity" (ngModelChange)="patch({ severity: $event })">
          <option value="all">Todas</option>
          <option value="CRITICAL">Crítica</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Media</option>
          <option value="LOW">Baja</option>
        </select>
      </label>

      @if (mode() === 'own') {
        <label class="rl-filters__field">
          <span>Sentimiento</span>
          <select class="rl-filters__select" [ngModel]="state().sentiment" (ngModelChange)="patch({ sentiment: $event })">
            <option value="all">Todos</option>
            <option value="NEGATIVE">Negativo</option>
            <option value="POSITIVE">Positivo</option>
            <option value="NEUTRAL">Neutro</option>
            <option value="MIXED">Mixto</option>
          </select>
        </label>
      }

      @if (mode() === 'comp') {
        <label class="rl-filters__field">
          <span>Rival</span>
          <select class="rl-filters__select" [ngModel]="state().rival" (ngModelChange)="patch({ rival: $event })">
            <option value="all">Todos</option>
            @for (r of rivals(); track r) {
              <option [value]="r">{{ r }}</option>
            }
          </select>
        </label>
      }

      <label class="rl-filters__field rl-filters__field--grow">
        <span>Buscar</span>
        <input
          class="rl-filters__input"
          type="search"
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

  readonly platformOptions = PLATFORM_FILTER_OPTIONS as Array<{ id: string; label: string }>;
  readonly state = signal<FeedFilterState>({ ...DEFAULT_FEED_FILTERS });

  patch(partial: Partial<FeedFilterState>): void {
    this.state.update((s) => {
      const next = { ...s, ...partial };
      this.filterChange.emit(next);
      return next;
    });
  }
}
