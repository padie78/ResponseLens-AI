import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { filterAlerts } from '../../utils/alert-filters';
import {
  AlertCardComponent,
  FeedFiltersComponent,
  ScanBlockerComponent,
  type FeedFilterState,
} from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-competitors-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    IonContent,
    RouterLink,
    ButtonModule,
    AlertCardComponent,
    FeedFiltersComponent,
    ScanBlockerComponent,
  ],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />

      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Competencia</h1>
            <p class="rl-page__lead">Quejas de rivales y oportunidades de captación.</p>
          </div>
          <div class="rl-page__toolbar-actions">
            <p-button
              label="Escanear rivales"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0"
              (onClick)="runScan()"
            />
            <p-button
              label="Refrescar"
              icon="pi pi-refresh"
              severity="secondary"
              [outlined]="true"
              size="small"
              (onClick)="refresh()"
            />
            <p-button
              label="Ejemplos"
              severity="secondary"
              [text]="true"
              size="small"
              (onClick)="seed()"
            />
          </div>
        </div>

        @if (scan.lastStatus() && !scan.scanning()) {
          <p class="rl-page__status">{{ scan.lastStatus() }}</p>
        }

        @if (config.competitors().length === 0) {
          <div class="rl-page__panel">
            <p>
              Agregá rivales en <a routerLink="/app/settings">Config</a> para enfocar el escaneo.
            </p>
          </div>
        } @else {
          <div class="rl-brand-bar">
            <span>Rivales:</span>
            <strong>{{ rivalNames().join(' · ') }}</strong>
          </div>
        }

        <rl-feed-filters
          mode="comp"
          [rivals]="rivalNames()"
          (filterChange)="onFilterChange($event)"
        />

        @if (alerts.loading()) {
          <p class="rl-page__lead">Cargando…</p>
        } @else if (filtered().length === 0) {
          <div class="rl-page__panel">
            <p>No hay oportunidades con estos filtros.</p>
            <button type="button" class="rl-auth-gate__submit" style="margin-top: 1rem" (click)="runScan()">
              Escanear ahora
            </button>
          </div>
        } @else {
          <div class="rl-feed">
            @for (item of filtered(); track item.alertId) {
              <rl-alert-card
                [alert]="item"
                [showCapture]="true"
                [companyName]="config.companyName()"
                [selected]="selectedId() === item.alertId"
                (select)="selectedId.set($event)"
                (dismiss)="onDismiss($event)"
                (contact)="onContact($event)"
                (won)="onWon($event)"
              />
            }
          </div>
        }

        @if (selectedAlert(); as sel) {
          <aside class="rl-workspace rl-workspace--inline">
            <h2 class="rl-workspace__title">Pipeline — {{ sel.competitorName }}</h2>
            @if (sel.salesPitch) {
              <p class="rl-workspace__preview">{{ sel.salesPitch }}</p>
              <button type="button" class="rl-auth-gate__submit" (click)="copyPitch(sel.salesPitch)">
                Copiar pitch
              </button>
            } @else {
              <p class="rl-workspace__preview">{{ sel.originalComplaint }}</p>
            }
            <div class="rl-workspace__pipeline">
              <button type="button" class="rl-alert__btn rl-alert__btn--primary" (click)="onContact(sel.alertId)">
                Contactado
              </button>
              <button type="button" class="rl-alert__btn rl-alert__btn--ok" (click)="onWon(sel.alertId)">
                Ganado
              </button>
              <button type="button" class="rl-alert__btn" (click)="onDismiss(sel.alertId)">Descartar</button>
            </div>
          </aside>
        }
      </div>
    </ion-content>
  `,
})
export class CompetitorsPageComponent implements OnInit {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);
  readonly scan = inject(ScanService);
  readonly history = inject(HistoryStore);

  readonly filters = signal<FeedFilterState>({
    status: 'all',
    date: 'all',
    platform: 'all',
    severity: 'all',
    sentiment: 'all',
    rival: 'all',
    q: '',
  });
  readonly selectedId = signal<string | null>(null);

  readonly rivalNames = computed(() =>
    this.config.competitors().map((c) => c.name).filter(Boolean),
  );

  readonly filtered = computed(() =>
    filterAlerts(this.alerts.rivalAlerts(), this.filters()),
  );

  readonly selectedAlert = computed(() => {
    const id = this.selectedId();
    return id ? this.alerts.getById(id) : undefined;
  });

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
    this.history.load();
  }

  onFilterChange(f: FeedFilterState): void {
    this.filters.set(f);
  }

  refresh(): void {
    this.alerts.load();
    this.config.load();
  }

  seed(): void {
    this.config.load();
    this.alerts.seedExamples();
  }

  async runScan(): Promise<void> {
    await this.scan.scanCompetitors();
  }

  onDismiss(alertId: string): void {
    this.alerts.updateStatus(alertId, 'DISMISSED');
    if (this.selectedId() === alertId) this.selectedId.set(null);
  }

  onContact(alertId: string): void {
    const alert = this.alerts.getById(alertId);
    this.alerts.updateStatus(alertId, 'CONTACTED');
    if (alert) {
      this.history.add({
        kind: 'comp_capture',
        text: alert.originalComplaint,
        alertId,
        label: 'contacted',
      });
    }
  }

  onWon(alertId: string): void {
    const alert = this.alerts.getById(alertId);
    this.alerts.updateStatus(alertId, 'WON');
    if (alert) {
      this.history.add({
        kind: 'comp_capture',
        text: alert.originalComplaint,
        alertId,
        label: 'won',
      });
    }
  }

  copyPitch(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
}
