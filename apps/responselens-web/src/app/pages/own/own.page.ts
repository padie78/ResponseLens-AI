import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TabViewModule } from 'primeng/tabview';
import {
  createAlertId,
  type CompetitorAlert,
} from '../../models/alert.model';
import {
  computeOwnPrescriptive,
  computeOwnPredictive,
  computeOwnThemes,
} from '../../engine/own-brand-insights.js';
import { ReplyService, type LocalReplyResult } from '../../services/reply.service';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { filterAlerts } from '../../utils/alert-filters';
import {
  AlertCardComponent,
  BrandHealthPanelComponent,
  EchartComponent,
  FeedFiltersComponent,
  ListeningPulseComponent,
  ScanBlockerComponent,
  type EChartOptions,
  type FeedFilterState,
} from '../../ui';

/**
 * Propios — tabs al estilo listening tools:
 * Feed (operar) · Stats (descriptivo) · Predictivo · Prescriptivo · Temas
 */
@Component({
  standalone: true,
  selector: 'rl-own-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    IonContent,
    RouterLink,
    FormsModule,
    ButtonModule,
    TagModule,
    TabViewModule,
    AlertCardComponent,
    BrandHealthPanelComponent,
    ListeningPulseComponent,
    FeedFiltersComponent,
    ScanBlockerComponent,
    EchartComponent,
  ],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />

      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Propios</h1>
            <p class="rl-page__lead">
              Operá menciones y analizá la salud de {{ config.companyName() || 'tu empresa' }}.
            </p>
          </div>
          <div class="rl-page__toolbar-actions">
            <p-button
              label="Escanear marca"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (onClick)="runScan()"
            />
            <p-button
              label="Scanner mock"
              icon="pi pi-box"
              severity="help"
              [outlined]="true"
              size="small"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (onClick)="runScanMock()"
              title="SocialCrawl simulado — no gasta créditos"
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

        @if (!config.hasCompany()) {
          <div class="rl-page__panel">
            <p>
              Configurá tu empresa en <a routerLink="/app/settings">Empresa</a> antes de escanear.
            </p>
          </div>
        } @else {
          <rl-brand-health-panel
            variant="strip"
            [companyName]="config.companyName()"
            [aliases]="companyAliases()"
            [alerts]="alerts.items()"
            [history]="history.items()"
          />
        }

        <p-tabView styleClass="rl-own-tabs" [(activeIndex)]="activeTab">
          <p-tabPanel header="Feed" leftIcon="pi pi-inbox">
            <rl-feed-filters mode="own" (filterChange)="onFilterChange($event)" />

            <div class="rl-layout-split">
              <section class="rl-layout-split__main">
                @if (alerts.loading()) {
                  <p class="rl-page__lead">Cargando…</p>
                } @else if (filtered().length === 0) {
                  <div class="rl-page__panel">
                    <p>No hay menciones propias con estos filtros.</p>
                  </div>
                } @else {
                  <div class="rl-feed">
                    @for (item of filtered(); track item.alertId) {
                      <rl-alert-card
                        [alert]="item"
                        [showAnalyze]="true"
                        [companyName]="config.companyName()"
                        [selected]="selectedId() === item.alertId"
                        (select)="selectAlert($event)"
                        (dismiss)="onDismiss($event)"
                        (analyze)="analyzeAlert($event)"
                        (responded)="markResponded($event)"
                      />
                    }
                  </div>
                }

                <form class="rl-manual-form rl-page__panel" (ngSubmit)="submitManual()">
                  <h2 class="rl-settings__h">Mención manual</h2>
                  <label class="rl-settings__label">
                    Texto
                    <textarea
                      class="rl-settings__input rl-settings__textarea"
                      rows="3"
                      [(ngModel)]="manualText"
                      name="manualText"
                      placeholder="Pegá el comentario o queja…"
                      required
                    ></textarea>
                  </label>
                  <label class="rl-settings__label">
                    URL (opcional)
                    <input class="rl-settings__input" [(ngModel)]="manualUrl" name="manualUrl" placeholder="https://…" />
                  </label>
                  <div class="rl-manual-form__actions">
                    <p-button type="submit" label="Agregar" severity="secondary" [outlined]="true" size="small" />
                    <p-button type="button" label="Agregar y analizar" size="small" (onClick)="submitManual(true)" />
                  </div>
                </form>
              </section>

              @if (selectedAlert(); as sel) {
                <aside class="rl-workspace">
                  <h2 class="rl-workspace__title">Workspace</h2>
                  @if (sel._aiScore != null) {
                    <div class="rl-analysis-modal__score" style="margin-bottom: 0.75rem">
                      <span class="rl-score" [attr.data-band]="sel._aiScoreBand || 'medium'" [style.--rl-score]="sel._aiScore">
                        <span class="rl-score__ring" aria-hidden="true"></span>
                        <span class="rl-score__value">{{ sel._aiScore }}</span>
                      </span>
                      <div>
                        <p class="rl-analysis-modal__score-label">{{ sel._aiScoreLabel || 'Score IA' }}</p>
                        <p class="rl-muted">Análisis IA en la card para el detalle</p>
                      </div>
                    </div>
                  }
                  <p class="rl-workspace__preview">{{ sel.originalComplaint }}</p>

                  @if (replyResult(); as rr) {
                    <div class="rl-workspace__triage">
                      <p><strong>Riesgo:</strong> {{ rr.triage.riskLevel }} ({{ rr.triage.riskScore }})</p>
                      @if (rr.triage.summary) {
                        <p>{{ rr.triage.summary }}</p>
                      }
                    </div>
                    @for (opt of rr.options; track opt.tone) {
                      <div class="rl-workspace__option" [class.rl-workspace__option--rec]="opt.recommended">
                        <p class="rl-workspace__option-label">{{ opt.label }}</p>
                        <p class="rl-workspace__option-body">{{ opt.body }}</p>
                        <p-button label="Copiar" icon="pi pi-copy" severity="secondary" [outlined]="true" size="small" (onClick)="copy(opt.body)" />
                      </div>
                    }
                  } @else {
                    <p-button label="Analizar respuesta" icon="pi pi-sparkles" (onClick)="analyzeAlert(sel.alertId)" />
                  }
                  <p-button label="Marcar respondido" severity="success" [outlined]="true" size="small" (onClick)="markResponded(sel.alertId)" />
                </aside>
              }
            </div>
          </p-tabPanel>

          <p-tabPanel header="Stats" leftIcon="pi pi-chart-bar">
            @if (config.hasCompany()) {
              <div class="rl-stats-stack">
                <rl-listening-pulse
                  [alerts]="alerts.items()"
                  scope="own"
                  mode="reputation"
                  eyebrow="Propios · SocialCrawl"
                  title="Pulse de reputación"
                />
                <rl-brand-health-panel
                  variant="dashboard"
                  [companyName]="config.companyName()"
                  [aliases]="companyAliases()"
                  [alerts]="alerts.items()"
                  [history]="history.items()"
                />
              </div>
            } @else {
              <div class="rl-page__panel"><p>Configurá la empresa para ver estadísticas.</p></div>
            }
          </p-tabPanel>

          <p-tabPanel header="Predictivo" leftIcon="pi pi-forward">
            <div class="rl-insight-grid">
              <article class="rl-insight-hero" [attr.data-outlook]="predictive().outlook">
                <p class="rl-insight-hero__eyebrow">Outlook 7 días</p>
                <h2>{{ predictive().outlookLabel }}</h2>
                <p>{{ predictive().narrative }}</p>
                <div class="rl-insight-hero__metrics">
                  <div>
                    <span>Prob. crisis</span>
                    <strong>{{ predictive().crisisProb }}%</strong>
                  </div>
                  <div>
                    <span>Score proyectado</span>
                    <strong>{{ predictive().forecastScore7d }}</strong>
                  </div>
                  <div>
                    <span>Δ volumen</span>
                    <strong>{{ predictive().volDeltaPct > 0 ? '+' : '' }}{{ predictive().volDeltaPct }}%</strong>
                  </div>
                  <div>
                    <span>Δ alcance</span>
                    <strong>{{ predictive().reachDeltaPct > 0 ? '+' : '' }}{{ predictive().reachDeltaPct }}%</strong>
                  </div>
                </div>
              </article>
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Volumen · score · alcance (7 días)</h2></header>
                <rl-echart [options]="predictiveChart()" style="--rl-echart-height: 300px" />
              </section>
            </div>
          </p-tabPanel>

          <p-tabPanel header="Prescriptivo" leftIcon="pi pi-compass">
            <div class="rl-prescriptive">
              <div class="rl-prescriptive__summary">
                <p-tag [value]="prescriptive().urgentCount + ' urgentes'" severity="danger" />
                <p-tag [value]="prescriptive().openCount + ' en cola'" severity="info" />
              </div>

              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Cola de acción</h2></header>
                @if (prescriptive().queue.length === 0) {
                  <p class="rl-empty">No hay ítems abiertos para priorizar.</p>
                } @else {
                  <div class="rl-action-queue">
                    @for (row of prescriptive().queue; track row.alertId) {
                      <article class="rl-action-queue__row">
                        <div class="rl-score rl-score--sm" [attr.data-band]="row.priority >= 80 ? 'critical' : row.priority >= 60 ? 'high' : 'medium'" [style.--rl-score]="row.priority">
                          <span class="rl-score__ring" aria-hidden="true"></span>
                          <span class="rl-score__value">{{ row.priority }}</span>
                        </div>
                        <div class="rl-action-queue__body">
                          <strong>{{ row.action }}</strong>
                          <p>{{ row.snippet }}{{ row.snippet.length >= 120 ? '…' : '' }}</p>
                          <span class="rl-muted">{{ row.theme }} · {{ row.channel }} · SLA {{ row.sla }}{{ row.reach ? ' · ' + row.reach : '' }}</span>
                        </div>
                        <p-button label="Abrir" size="small" severity="secondary" [outlined]="true" (onClick)="openFromQueue(row.alertId)" />
                      </article>
                    }
                  </div>
                }
              </section>

              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Playbooks por tema</h2></header>
                <div class="rl-theme-actions">
                  @for (t of prescriptive().themeActions; track t.theme) {
                    <article class="rl-theme-actions__card">
                      <div class="rl-theme-actions__head">
                        <strong>{{ t.theme }}</strong>
                        <span class="rl-badge">{{ t.count }}</span>
                      </div>
                      <p>{{ t.playbook }}</p>
                    </article>
                  } @empty {
                    <p class="rl-empty">Sin temas accionables todavía.</p>
                  }
                </div>
              </section>
            </div>
          </p-tabPanel>

          <p-tabPanel header="Temas" leftIcon="pi pi-tags">
            <section class="rl-panel">
              <header class="rl-panel__head">
                <h2 class="rl-panel__title">Temas detectados</h2>
              </header>
              @if (themes().length === 0) {
                <p class="rl-empty">Escaneá o cargá menciones para ver temas.</p>
              } @else {
                <div class="rl-themes-table">
                  @for (t of themes(); track t.theme) {
                    <div class="rl-themes-table__row">
                      <strong>{{ t.theme }}</strong>
                      <span>{{ t.count }} menciones</span>
                      <span>{{ t.points || 0 }} pts</span>
                      <span>Score {{ t.avgScore || '—' }}</span>
                      <span [class.rl-themes-table__neg]="t.negPct >= 40">{{ t.negPct }}% neg</span>
                    </div>
                  }
                </div>
                <rl-echart [options]="themesChart()" style="--rl-echart-height: 300px; margin-top: 1rem" />
              }
            </section>
          </p-tabPanel>
        </p-tabView>
      </div>
    </ion-content>
  `,
})
export class OwnPageComponent implements OnInit {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);
  readonly scan = inject(ScanService);
  readonly reply = inject(ReplyService);
  readonly history = inject(HistoryStore);

  activeTab = 0;

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
  readonly replyResult = signal<LocalReplyResult | null>(null);

  manualText = '';
  manualUrl = '';

  readonly companyAliases = computed(() => this.config.config()?.company.aliases ?? []);

  readonly filtered = computed(() => filterAlerts(this.alerts.ownAlerts(), this.filters()));

  readonly selectedAlert = computed(() => {
    const id = this.selectedId();
    return id ? this.alerts.getById(id) : undefined;
  });

  readonly predictive = computed(() =>
    computeOwnPredictive({ alerts: this.alerts.items(), days: 14 }),
  );

  readonly prescriptive = computed(() =>
    computeOwnPrescriptive({
      alerts: this.alerts.items(),
      companyName: this.config.companyName() || 'tu marca',
    }),
  );

  readonly themes = computed(() => computeOwnThemes({ alerts: this.alerts.items() }));

  readonly predictiveChart = computed((): EChartOptions => {
    const s = this.predictive().series;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      grid: { left: 44, right: 48, top: 28, bottom: 52 },
      xAxis: { type: 'category', data: s.map((d) => d.label) },
      yAxis: [
        { type: 'value', name: 'Vol', minInterval: 1 },
        { type: 'value', name: 'Score/Reach', min: 0 },
      ],
      series: [
        {
          name: 'Volumen',
          type: 'bar',
          data: s.map((d) => d.volume),
          itemStyle: { color: '#38bdf8' },
          barMaxWidth: 22,
        },
        {
          name: 'Score medio',
          type: 'line',
          yAxisIndex: 1,
          data: s.map((d) => d.avgScore),
          itemStyle: { color: '#2dd4bf' },
          smooth: true,
        },
        {
          name: 'Alcance (pts)',
          type: 'line',
          yAxisIndex: 1,
          data: s.map((d) => d.reach || 0),
          itemStyle: { color: '#f59e0b' },
          smooth: true,
          lineStyle: { type: 'dashed' },
        },
      ],
    };
  });

  readonly themesChart = computed((): EChartOptions => {
    const rows = this.themes().slice(0, 8);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      grid: { left: 130, right: 28, top: 16, bottom: 48 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: rows.map((r) => r.theme).reverse() },
      series: [
        {
          name: 'Menciones',
          type: 'bar',
          data: rows.map((r) => r.count).reverse(),
          itemStyle: { color: '#38bdf8', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 12,
        },
        {
          name: 'Alcance (pts)',
          type: 'bar',
          data: rows.map((r) => r.points || 0).reverse(),
          itemStyle: { color: '#2dd4bf', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 12,
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

  refresh(): void {
    this.alerts.load();
    this.config.load();
  }

  seed(): void {
    this.config.load();
    this.alerts.seedExamples();
  }

  async runScan(): Promise<void> {
    await this.scan.scanOwn();
  }

  async runScanMock(): Promise<void> {
    await this.scan.scanOwnMock();
  }

  openFromQueue(alertId: string): void {
    this.activeTab = 0;
    this.selectAlert(alertId);
  }

  selectAlert(id: string): void {
    this.selectedId.set(id);
    const alert = this.alerts.getById(id);
    if (!alert) {
      this.replyResult.set(null);
      return;
    }
    if (alert.replyOptions?.length) {
      this.replyResult.set({
        originalText: alert.originalComplaint,
        options: alert.replyOptions,
        triage: {
          riskScore: 0,
          riskLevel: alert.severity,
          escalationFlags: [],
          recommendedAction: 'PUBLIC_REPLY',
          keyIssues: [],
          summary: alert._analysisSummary || '',
        },
        model: 'stored',
        generatedAt: alert.detectedAt,
        language: 'es',
      });
      return;
    }
    if (alert._mentionKind !== 'media' && alert._actionable !== false) {
      const result = this.reply.analyzeLocal(alert.originalComplaint, this.config.companyName());
      if (alert._analysisSummary) result.triage.summary = alert._analysisSummary;
      this.replyResult.set(result);
    } else {
      this.replyResult.set(null);
    }
  }

  onDismiss(alertId: string): void {
    this.alerts.updateStatus(alertId, 'DISMISSED');
    if (this.selectedId() === alertId) {
      this.selectedId.set(null);
      this.replyResult.set(null);
    }
  }

  analyzeAlert(alertId: string): void {
    const alert = this.alerts.getById(alertId);
    if (!alert) return;
    this.selectedId.set(alertId);
    const result = this.reply.analyzeLocal(alert.originalComplaint, this.config.companyName());
    this.replyResult.set(result);
    this.alerts.updateAlert(alertId, {
      replyOptions: result.options,
      _analysisSummary: result.triage.summary,
    });
    this.history.add({
      kind: 'analyze',
      text: alert.originalComplaint,
      alertId,
      riskLevel: result.triage.riskLevel,
      recommendedAction: result.triage.recommendedAction,
    });
  }

  submitManual(andAnalyze = false): void {
    const text = this.manualText.trim();
    if (!text) return;
    const userId = this.config.config()?.userId;
    if (!userId) return;

    const alert: CompetitorAlert = {
      alertId: createAlertId(),
      userId,
      competitorName: this.config.companyName() || 'Tu marca',
      originalComplaint: text,
      sourceUrl: this.manualUrl.trim() || 'manual://own',
      channel: 'manual',
      severity: 'MEDIUM',
      frustrationScore: null,
      salesPitch: '',
      detectedAt: new Date().toISOString(),
      status: 'NEW',
      notes: '',
      brandScope: 'own',
      sentiment: 'neutral',
      inboundSource: 'manual',
      _mentionKind: 'comment',
    };
    this.alerts.upsert(alert);
    this.manualText = '';
    this.manualUrl = '';
    this.selectAlert(alert.alertId);
    if (andAnalyze) this.analyzeAlert(alert.alertId);
  }

  markResponded(alertId: string): void {
    const alert = this.alerts.getById(alertId);
    if (!alert) return;
    this.alerts.updateStatus(alertId, 'CONTACTED');
    this.history.add({
      kind: 'own_reply',
      text: alert.originalComplaint,
      alertId,
      tone: this.replyResult()?.options.find((o) => o.recommended)?.tone,
      riskLevel: this.replyResult()?.triage.riskLevel,
      recommendedAction: this.replyResult()?.triage.recommendedAction,
    });
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
}
