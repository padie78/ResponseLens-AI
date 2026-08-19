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
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import { computeListeningPulse } from '../../engine/listening-insights.js';
import { crisisRivals, listLeads, loadCrisisThreshold } from '../../engine/ops-queue.js';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { filterAlerts } from '../../utils/alert-filters';
import {
  AlertCardComponent,
  DEFAULT_FEED_FILTERS,
  EchartComponent,
  FeedFiltersComponent,
  ListeningPulseComponent,
  ScanBlockerComponent,
  ListeningStatusComponent,
  type EChartOptions,
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
    TabViewModule,
    TagModule,
    AlertCardComponent,
    FeedFiltersComponent,
    ScanBlockerComponent,
    ListeningStatusComponent,
    ListeningPulseComponent,
    EchartComponent,
  ],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />

      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Competencia</h1>
            <p class="rl-page__lead">Quejas de rivales y oportunidades de captación. Hasta 5 rivales por pasada.</p>
          </div>
          <div class="rl-page__toolbar-actions">
            <p-button
              label="Forzar ahora"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0 || scan.manualQuotaExhausted()"
              (onClick)="runScan()"
              title="Adelanta la pasada diaria. No es tiempo real."
            />
            <p-button
              label="Scan demo"
              icon="pi pi-box"
              severity="help"
              [outlined]="true"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0"
              (onClick)="runScanMock()"
              title="Scan de prueba — 0 créditos, no cuenta en el tope diario"
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
              [outlined]="true"
              size="small"
              (onClick)="seed()"
            />
          </div>
        </div>

        <rl-listening-status />

        @if (config.competitors().length === 0) {
          <div class="rl-page__panel">
            <p>
              Sin rivales no hay radar. Cargá <strong>3 a 5 nombres públicos</strong> en
              <a routerLink="/app/settings" [queryParams]="{ tab: 'rivales' }">Config → Rivales</a>
              (el website no se usa como query).
            </p>
          </div>
        } @else {
          <div class="rl-brand-bar">
            <span>Rivales:</span>
            <strong>{{ rivalNames().join(' · ') }}</strong>
          </div>

          @if (crises().length) {
            <p class="rl-page__status">
              Umbral de crisis (≥ {{ threshold() }}/24 h):
              {{ crisisLabel() }}
            </p>
          }

          @if (statusIncidents().length) {
            <p class="rl-page__status" role="status">
              Status page: {{ statusIncidentLabel() }} — incidente en la página pública del rival.
            </p>
          }

          @if (leads().length) {
            <section class="rl-panel" style="margin-bottom: 1.25rem">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Leads (intención de cambio)</h2></header>
              <div class="rl-vis-queries">
                @for (a of leads(); track a.alertId) {
                  <button type="button" class="rl-vis-queries__row rl-lead-row" (click)="selectedId.set(a.alertId); activeTab = 0">
                    <strong>{{ a.competitorName }}</strong>
                    <span>{{ a._ops?.assignee || 'sin dueño' }}</span>
                    <span>{{ a._ops?.crmStage || a.status }}</span>
                    <span>{{ a._ops?.nextAction || a._ops?.sequence || '—' }}</span>
                  </button>
                }
              </div>
            </section>
          }

          <p-tabView styleClass="rl-own-tabs" [(activeIndex)]="activeTab">
            <p-tabPanel header="Feed" leftIcon="pi pi-inbox">
              <rl-feed-filters
                mode="comp"
                [rivals]="rivalNames()"
                (filterChange)="onFilterChange($event)"
              />

              <div class="rl-layout-split">
                <section class="rl-layout-split__main">
                  @if (alerts.loading()) {
                    <p class="rl-page__lead">Cargando…</p>
                  } @else if (filtered().length === 0) {
                    <div class="rl-page__panel">
                      <p>No hay oportunidades con estos filtros.</p>
                      <button
                        type="button"
                        class="rl-auth-gate__submit"
                        style="margin-top: 1rem"
                        (click)="runScanMock()"
                      >
                        Scan demo
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
                          (select)="toggleSelect($event)"
                          (dismiss)="onDismiss($event)"
                          (contact)="onContact($event)"
                          (publishReply)="onPublishReply($event)"
                          (won)="onWon($event)"
                        />
                      }
                    </div>
                  }
                </section>

                @if (selectedAlert(); as sel) {
                  <aside class="rl-workspace">
                    <h2 class="rl-workspace__title">Pipeline — {{ sel.competitorName }}</h2>
                    @if (sel._conquest?.sales_intelligence?.resumen_incidente; as resumen) {
                      <p class="rl-workspace__preview">{{ resumen }}</p>
                    }
                    @if (sel._conquest?.sales_intelligence?.score_conversion_estimado; as conv) {
                      <p class="rl-own__muted">Captación {{ conv }}</p>
                    }
                    @if (sel.salesPitch) {
                      <p class="rl-workspace__preview">{{ sel.salesPitch }}</p>
                      <p-button
                        label="Copiar pitch"
                        icon="pi pi-copy"
                        size="small"
                        (onClick)="copyPitch(sel.salesPitch)"
                      />
                    } @else {
                      <p class="rl-workspace__preview">{{ sel.originalComplaint }}</p>
                    }
                    <div class="rl-workspace__pipeline" style="margin-top: 0.85rem">
                      <button
                        type="button"
                        class="rl-alert__btn rl-alert__btn--primary"
                        (click)="onContact(sel.alertId)"
                      >
                        Contactado
                      </button>
                      <button
                        type="button"
                        class="rl-alert__btn rl-alert__btn--ok"
                        (click)="onWon(sel.alertId)"
                      >
                        Ganado
                      </button>
                      <button type="button" class="rl-alert__btn" (click)="onDismiss(sel.alertId)">
                        Descartar
                      </button>
                    </div>
                  </aside>
                }
              </div>
            </p-tabPanel>

            <p-tabPanel header="Insights" leftIcon="pi pi-chart-bar">
              <div class="rl-stats-stack">
                <rl-listening-pulse
                  [alerts]="alerts.items()"
                  scope="rival"
                  mode="capture"
                  eyebrow="Competencia · listening"
                  title="Pulse de captación"
                />

                <div class="rl-insight-grid">
                  <article class="rl-insight-hero" data-outlook="watch">
                    <p class="rl-insight-hero__eyebrow">Pipeline</p>
                    <h2>Estado de oportunidades</h2>
                    <p>
                      {{ pulse().open }} abiertas · {{ pulse().contacted }} contactadas ·
                      {{ pulse().won }} ganadas (win rate {{ pulse().winRate }}%).
                    </p>
                    <div class="rl-insight-hero__metrics">
                      <div>
                        <span>Abiertas</span>
                        <strong>{{ pulse().open }}</strong>
                      </div>
                      <div>
                        <span>Críticas</span>
                        <strong>{{ pulse().critical }}</strong>
                      </div>
                      <div>
                        <span>Alcance</span>
                        <strong>{{ pulse().points }}</strong>
                      </div>
                      <div>
                        <span>Win rate</span>
                        <strong>{{ pulse().winRate }}%</strong>
                      </div>
                    </div>
                  </article>
                  <section class="rl-panel">
                    <header class="rl-panel__head">
                      <h2 class="rl-panel__title">Volumen por rival</h2>
                    </header>
                    <rl-echart [options]="rivalChart()" style="--rl-echart-height: 260px" />
                  </section>
                </div>

                @if (pulse().topCluster; as tc) {
                  <section class="rl-panel">
                    <header class="rl-panel__head">
                      <h2 class="rl-panel__title">Oportunidad dominante</h2>
                    </header>
                    <p class="rl-page__lead" style="margin: 0">
                      <strong>{{ tc.title }}</strong> — {{ tc.count }} menciones ·
                      {{ tc.points }} pts de alcance. Priorizá pitches en este cluster.
                    </p>
                  </section>
                }
              </div>
            </p-tabPanel>
          </p-tabView>
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

  activeTab = 0;

  readonly filters = signal<FeedFilterState>({ ...DEFAULT_FEED_FILTERS });
  readonly selectedId = signal<string | null>(null);

  readonly rivalNames = computed(() =>
    this.config.competitors().map((c) => c.name).filter(Boolean),
  );

  readonly threshold = computed(() => loadCrisisThreshold());

  readonly crises = computed(() => crisisRivals(this.alerts.items(), this.threshold()));

  readonly crisisLabel = computed(() =>
    this.crises()
      .map((c) => `${c.name} (${c.count})`)
      .join(' · '),
  );

  readonly statusIncidents = computed(
    () =>
      buildRivalSurfaceIntel({
        competitors: this.config.competitors(),
        alerts: this.alerts.items(),
        days: 14,
      }).statusIncidents,
  );

  readonly statusIncidentLabel = computed(() =>
    this.statusIncidents()
      .map((s) => s.rival)
      .join(' · '),
  );

  readonly leads = computed(() => listLeads(this.alerts.items()).slice(0, 12));

  readonly filtered = computed(() =>
    filterAlerts(this.alerts.rivalAlerts(), this.filters()),
  );

  readonly selectedAlert = computed(() => {
    const id = this.selectedId();
    return id ? this.alerts.getById(id) : undefined;
  });

  readonly pulse = computed(() =>
    computeListeningPulse({
      alerts: this.alerts.items(),
      scope: 'rival',
      mode: 'capture',
    }),
  );

  readonly rivalChart = computed((): EChartOptions => {
    const rows = this.pulse().rivals.slice(0, 8);
    if (!rows.length) {
      return {
        title: {
          text: 'Sin rivales en el feed — corré un scan',
          left: 'center',
          top: 'middle',
          textStyle: { color: '#64748b', fontSize: 13 },
        },
      };
    }
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 100, right: 16, top: 12, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: rows.map((r) => r.name).reverse() },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.count).reverse(),
          itemStyle: { color: '#f59e0b', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 16,
        },
      ],
    };
  });

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
    this.history.load();
  }

  onFilterChange(f: FeedFilterState): void {
    this.filters.set(f);
  }

  toggleSelect(id: string): void {
    this.selectedId.update((cur) => (cur === id ? null : id));
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

  async runScanMock(): Promise<void> {
    await this.scan.scanCompetitorsMock();
  }

  onDismiss(alertId: string): void {
    this.alerts.updateStatus(alertId, 'DISMISSED');
    if (this.selectedId() === alertId) this.selectedId.set(null);
  }

  onContact(alertId: string): void {
    this.alerts.updateStatus(alertId, 'CONTACTED');
    this.history.add({
      kind: 'comp_capture',
      text: this.alerts.getById(alertId)?.originalComplaint || '',
      alertId,
      label: 'Contactado',
    });
  }

  onPublishReply(evt: { alertId: string; body: string }): void {
    const posted = this.alerts.publishMockReply(evt.alertId, evt.body);
    if (!posted) return;
    this.history.add({
      kind: 'comp_capture',
      text: evt.body,
      alertId: evt.alertId,
      label: `Enviado en ${posted._mockPost?.platformLabel || 'plataforma'} (demo)`,
    });
  }

  onWon(alertId: string): void {
    this.alerts.updateStatus(alertId, 'WON');
    this.history.add({
      kind: 'comp_capture',
      text: this.alerts.getById(alertId)?.originalComplaint || '',
      alertId,
      label: 'Ganado',
    });
  }

  copyPitch(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
}
