import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { computeBrandAudit } from '../../engine/own-brand-insights.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { UserConfigStore } from '../../stores/user-config.store';
import {
  BrandHealthPanelComponent,
  EchartComponent,
  ListeningPulseComponent,
  ScanBlockerComponent,
  type EChartOptions,
} from '../../ui';

type AuditView = 'overview' | 'stats' | 'themes';

@Component({
  standalone: true,
  selector: 'rl-own-audit-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    IonContent,
    DecimalPipe,
    RouterLink,
    ButtonModule,
    BrandHealthPanelComponent,
    ListeningPulseComponent,
    ScanBlockerComponent,
    EchartComponent,
  ],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />

      <div class="rl-page rl-own">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Auditoría de marca</h1>
            <p class="rl-page__lead">
              Patrones de reputación de {{ config.companyName() || 'tu marca' }} · últimos {{ audit().days }} días.
              Incluye mix de piezas SocialCrawl (video, noticia, post, issue…) y cola de la bandeja.
            </p>
          </div>
          <div class="rl-own__actions">
            <p-button
              label="Escanear"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (onClick)="runScan()"
            />
            <p-button
              label="Scan demo"
              icon="pi pi-box"
              severity="help"
              [outlined]="true"
              size="small"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (onClick)="runScanMock()"
              title="Scan de prueba — no gasta créditos"
            />
            <p-button
              label="Refrescar"
              severity="secondary"
              [outlined]="true"
              size="small"
              (onClick)="refresh()"
            />
          </div>
        </header>

        @if (scan.lastStatus() && !scan.scanning()) {
          <p class="rl-page__status">{{ scan.lastStatus() }}</p>
        }

        @if (!config.hasCompany()) {
          <div class="rl-own__empty">
            <p>Configurá tu empresa en <a routerLink="/app/settings">Empresa</a> para ver la auditoría.</p>
          </div>
        } @else if (view() === 'overview') {
          <div class="rl-own__section">
            <article class="rl-audit-verdict" [attr.data-band]="audit().health.healthBand">
              <p class="rl-insight-hero__eyebrow">{{ audit().health.healthLabel }}</p>
              <h2>{{ audit().headline }}</h2>
              <div class="rl-insight-hero__metrics">
                <div>
                  <span>Piezas</span>
                  <strong>{{ audit().health.total }}</strong>
                </div>
                <div>
                  <span>Hilo</span>
                  <strong>{{ audit().listening.replyable }}</strong>
                </div>
                <div>
                  <span>Seguir</span>
                  <strong>{{ audit().listening.monitor }}</strong>
                </div>
                <div>
                  <span>Negativas</span>
                  <strong>{{ audit().health.negPct }}%</strong>
                </div>
                <div>
                  <span>Score medio</span>
                  <strong>{{ audit().health.avgScore }}</strong>
                </div>
                <div>
                  <span>Encaje SC</span>
                  <strong>{{ audit().listening.avgEncaje || '—' }}</strong>
                </div>
                <div>
                  <span>Alcance</span>
                  <strong>{{ audit().listening.points | number: '1.0-0' }}</strong>
                </div>
                <div>
                  <span>Coments. origen</span>
                  <strong>{{ audit().listening.comments | number: '1.0-0' }}</strong>
                </div>
                <div>
                  <span>Clusters</span>
                  <strong>{{ audit().listening.clusters }}</strong>
                </div>
                <div>
                  <span>Cobertura</span>
                  <strong>{{ audit().coveragePct }}%</strong>
                </div>
                <div>
                  <span>Crisis abiertas</span>
                  <strong>{{ audit().health.criticalOpen }}</strong>
                </div>
                <div>
                  <span>Respuestas</span>
                  <strong>{{ audit().replies }}</strong>
                </div>
              </div>
            </article>

            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Hallazgos</h2></header>
              <ul class="rl-audit-findings">
                @for (f of audit().findings; track f) {
                  <li>{{ f }}</li>
                }
              </ul>
              @if (audit().health.criticalOpen > 0) {
                <p class="rl-own__section-lead">
                  <a routerLink="/app/own" [queryParams]="{ inbox: 'urgent' }">Abrir urgentes en la bandeja</a>
                </p>
              }
            </section>

            <div class="rl-audit-grid">
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Tipos de pieza</h2></header>
                @if (audit().kinds.length === 0) {
                  <p class="rl-empty">Sin mix de contenido todavía.</p>
                } @else {
                  <div class="rl-themes-table">
                    @for (k of audit().kinds; track k.kind) {
                      <div class="rl-themes-table__row">
                        <strong>{{ k.label }}</strong>
                        <span>{{ k.count }}</span>
                        <span>{{ k.replyable }} hilo · {{ k.monitor }} seguir</span>
                        <span [class.rl-themes-table__neg]="k.negPct >= 40">{{ k.negPct }}% neg</span>
                      </div>
                    }
                  </div>
                  <rl-echart [options]="kindChart()" style="--rl-echart-height: 240px; margin-top: 1rem" />
                }
              </section>
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Cola</h2></header>
                <div class="rl-themes-table">
                  @for (w of audit().workflow; track w.id) {
                    <div class="rl-themes-table__row">
                      <strong>{{ w.label }}</strong>
                      <span>{{ w.count }}</span>
                    </div>
                  }
                </div>
                <rl-echart [options]="workflowChart()" style="--rl-echart-height: 200px; margin-top: 1rem" />
              </section>
            </div>

            <div class="rl-audit-grid">
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Canales</h2></header>
                @if (audit().channels.length === 0) {
                  <p class="rl-empty">Sin canales todavía.</p>
                } @else {
                  <div class="rl-themes-table">
                    @for (c of audit().channels; track c.channel) {
                      <div class="rl-themes-table__row">
                        <strong>{{ c.channel }}</strong>
                        <span>{{ c.count }} menciones</span>
                        <span [class.rl-themes-table__neg]="c.negPct >= 40">{{ c.negPct }}% neg</span>
                        <span>Score {{ c.avgScore || '—' }}</span>
                      </div>
                    }
                  </div>
                  <rl-echart [options]="channelChart()" style="--rl-echart-height: 240px; margin-top: 1rem" />
                }
              </section>
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Voces de dolor</h2></header>
                @if (audit().quotes.length === 0) {
                  <p class="rl-empty">No hay citas negativas en la ventana.</p>
                } @else {
                  <div class="rl-audit-quotes">
                    @for (q of audit().quotes; track q.alertId) {
                      <blockquote>
                        <p>{{ q.text }}</p>
                        @if (q.topComment) {
                          <p class="rl-audit-sample">Top comment: {{ q.topComment }}</p>
                        }
                        <footer>
                          {{ q.kindLabel }} · {{ q.theme }} · {{ q.channel }}
                          @if (q.score != null) { · riesgo {{ q.score }}/100 }
                          @if (q.encaje != null) { · encaje {{ q.encaje }} }
                        </footer>
                      </blockquote>
                    }
                  </div>
                }
              </section>
            </div>
          </div>
        } @else if (view() === 'stats') {
          <div class="rl-own__section">
            <div class="rl-stats-stack">
              <rl-listening-pulse
                [alerts]="alerts.items()"
                scope="own"
                mode="reputation"
                eyebrow="Auditoría · listening"
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
            <section class="rl-panel" style="margin-top: 1.25rem">
              <header class="rl-panel__head">
                <h2 class="rl-panel__title">Sentimiento diario</h2>
              </header>
              <rl-echart [options]="sentimentChart()" style="--rl-echart-height: 300px" />
            </section>
            <div class="rl-insight-grid" style="margin-top: 1.25rem">
              <article class="rl-insight-hero" [attr.data-outlook]="audit().predictive.outlook">
                <p class="rl-insight-hero__eyebrow">Outlook 7 días</p>
                <h2>{{ audit().predictive.outlookLabel }}</h2>
                <p>{{ audit().predictive.narrative }}</p>
                <div class="rl-insight-hero__metrics">
                  <div>
                    <span>Prob. crisis</span>
                    <strong>{{ audit().predictive.crisisProb }}%</strong>
                  </div>
                  <div>
                    <span>Score proyectado</span>
                    <strong>{{ audit().predictive.forecastScore7d }}</strong>
                  </div>
                  <div>
                    <span>Δ volumen</span>
                    <strong>{{ audit().predictive.volDeltaPct > 0 ? '+' : '' }}{{ audit().predictive.volDeltaPct }}%</strong>
                  </div>
                  <div>
                    <span>Δ alcance</span>
                    <strong>{{ audit().predictive.reachDeltaPct > 0 ? '+' : '' }}{{ audit().predictive.reachDeltaPct }}%</strong>
                  </div>
                </div>
              </article>
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Volumen · score · alcance (7 días)</h2></header>
                <rl-echart [options]="predictiveChart()" style="--rl-echart-height: 300px" />
              </section>
            </div>
          </div>
        } @else {
          <div class="rl-own__section">
            <section class="rl-panel">
              <header class="rl-panel__head">
                <h2 class="rl-panel__title">Temas detectados</h2>
              </header>
              @if (audit().themes.length === 0) {
                <p class="rl-empty">Escaneá o cargá menciones para ver temas.</p>
              } @else {
                <div class="rl-themes-table">
                  @for (t of audit().themes; track t.theme) {
                    <div class="rl-themes-table__row rl-themes-table__row--theme">
                      <div>
                        <strong>{{ t.theme }}</strong>
                        @if (t.samples.length) {
                          <p class="rl-audit-sample">{{ t.samples[0] }}</p>
                        }
                      </div>
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

            <section class="rl-panel" style="margin-top: 1.25rem">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Mix de contenido</h2></header>
              @if (audit().kinds.length === 0) {
                <p class="rl-empty">Sin tipos de pieza.</p>
              } @else {
                <div class="rl-themes-table">
                  @for (k of audit().kinds; track k.kind) {
                    <div class="rl-themes-table__row">
                      <strong>{{ k.label }}</strong>
                      <span>{{ k.count }} piezas</span>
                      <span>{{ k.points || 0 }} pts</span>
                      <span>{{ k.comments || 0 }} cmts</span>
                      <span [class.rl-themes-table__neg]="k.negPct >= 40">{{ k.negPct }}% neg</span>
                    </div>
                  }
                </div>
              }
            </section>

            <section class="rl-panel" style="margin-top: 1.25rem">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Playbooks por tema</h2></header>
              <p class="rl-own__section-lead">Qué patrón atacar. La cola de respuestas está en la bandeja.</p>
              <div class="rl-theme-actions">
                @for (t of audit().prescriptive.themeActions; track t.theme) {
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
        }
      </div>
    </ion-content>
  `,
})
export class OwnAuditPageComponent implements OnInit {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);
  readonly scan = inject(ScanService);
  readonly history = inject(HistoryStore);
  private readonly route = inject(ActivatedRoute);

  readonly view = signal<AuditView>('overview');

  readonly companyAliases = computed(() => this.config.config()?.company.aliases ?? []);

  readonly audit = computed(() =>
    computeBrandAudit({
      alerts: this.alerts.items(),
      history: this.history.items(),
      days: 14,
      companyName: this.config.companyName() || 'tu marca',
    }),
  );

  readonly sentimentChart = computed((): EChartOptions => {
    const s = this.audit().sentimentSeries;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      grid: { left: 44, right: 20, top: 28, bottom: 52 },
      xAxis: { type: 'category', data: s.map((d) => d.label) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: 'Positivo',
          type: 'bar',
          stack: 'sent',
          data: s.map((d) => d.pos),
          itemStyle: { color: '#34d399' },
        },
        {
          name: 'Neutral',
          type: 'bar',
          stack: 'sent',
          data: s.map((d) => d.neu),
          itemStyle: { color: '#64748b' },
        },
        {
          name: 'Mixto',
          type: 'bar',
          stack: 'sent',
          data: s.map((d) => d.mix),
          itemStyle: { color: '#fbbf24' },
        },
        {
          name: 'Negativo',
          type: 'bar',
          stack: 'sent',
          data: s.map((d) => d.neg),
          itemStyle: { color: '#f87171' },
        },
      ],
    };
  });

  readonly kindChart = computed((): EChartOptions => {
    const rows = this.audit().kinds;
    const palette = ['#38bdf8', '#fb7185', '#f0d060', '#6bcb8a', '#c4b5fd', '#f472b6', '#7dd3fc', '#94a3b8'];
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          label: { color: '#e2e8f0', fontSize: 11 },
          data: rows.map((r, i) => ({
            name: r.label,
            value: r.count,
            itemStyle: { color: palette[i % palette.length] },
          })),
        },
      ],
    };
  });

  readonly workflowChart = computed((): EChartOptions => {
    const rows = this.audit().workflow;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 88, right: 16, top: 8, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: rows.map((r) => r.label).reverse() },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.count).reverse(),
          itemStyle: { color: '#c89b3c', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 12,
        },
      ],
    };
  });

  readonly channelChart = computed((): EChartOptions => {
    const rows = this.audit().channels.slice(0, 8);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 90, right: 20, top: 12, bottom: 28 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: rows.map((r) => r.channel).reverse() },
      series: [
        {
          name: 'Menciones',
          type: 'bar',
          data: rows.map((r) => r.count).reverse(),
          itemStyle: { color: '#38bdf8', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 14,
        },
      ],
    };
  });

  readonly predictiveChart = computed((): EChartOptions => {
    const s = this.audit().predictive.series;
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
    const rows = this.audit().themes.slice(0, 8);
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
    this.route.queryParamMap.subscribe((q) => {
      const tab = q.get('tab');
      if (tab === 'stats') this.view.set('stats');
      else if (tab === 'themes') this.view.set('themes');
      else this.view.set('overview');
    });
  }

  refresh(): void {
    this.alerts.load();
    this.config.load();
  }

  async runScan(): Promise<void> {
    await this.scan.scanOwn();
  }

  async runScanMock(): Promise<void> {
    await this.scan.scanOwnMock();
  }
}
