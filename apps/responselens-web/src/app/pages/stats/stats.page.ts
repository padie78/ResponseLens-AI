import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { TagModule } from 'primeng/tag';
import type { EChartOptions } from '../../ui/atoms/echart/echart.component';
import { EchartComponent } from '../../ui/atoms/echart/echart.component';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { computeAnalytics, topEntries } from '../../engine/ops-stats.js';

@Component({
  standalone: true,
  selector: 'rl-stats-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, EchartComponent, TagModule],
  template: `
    <ion-content>
      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Insights</h1>
            <p class="rl-page__lead">Comparativa Propios vs Competencia (14 días). La salud de tu marca vive en Propios.</p>
          </div>
          <p-tag value="Últimos 14 días" severity="secondary" />
        </div>

        <div class="rl-kpi-grid">
          <article class="rl-kpi">
            <span class="rl-kpi__label">Respuestas propias</span>
            <strong class="rl-kpi__value">{{ analytics().own.repliesInWindow }}</strong>
          </article>
          <article class="rl-kpi">
            <span class="rl-kpi__label">Escalaciones</span>
            <strong class="rl-kpi__value">{{ analytics().own.escalationsWindow }}</strong>
          </article>
          <article class="rl-kpi">
            <span class="rl-kpi__label">Oportunidades abiertas</span>
            <strong class="rl-kpi__value">{{ analytics().comp.open }}</strong>
          </article>
          <article class="rl-kpi">
            <span class="rl-kpi__label">Win rate</span>
            <strong class="rl-kpi__value">{{ analytics().comp.winRate }}%</strong>
          </article>
          <article class="rl-kpi">
            <span class="rl-kpi__label">Críticas abiertas</span>
            <strong class="rl-kpi__value">{{ analytics().comp.criticalOpen }}</strong>
          </article>
          <article class="rl-kpi">
            <span class="rl-kpi__label">Propios vs Comp</span>
            <strong class="rl-kpi__value">
              {{ analytics().comparison.ownSharePct }}% / {{ analytics().comparison.compSharePct }}%
            </strong>
          </article>
        </div>

        <div class="rl-stats-grid">
          <section class="rl-panel">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">Embudo competencia</h2>
            </header>
            <rl-echart [options]="funnelOptions()" style="--rl-echart-height: 280px" />
          </section>

          <section class="rl-panel">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">Severidad</h2>
            </header>
            <rl-echart [options]="severityOptions()" style="--rl-echart-height: 280px" />
          </section>

          <section class="rl-panel">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">Top rivales</h2>
            </header>
            <rl-echart [options]="rivalOptions()" style="--rl-echart-height: 280px" />
          </section>

          <section class="rl-panel">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">Canales — Propios</h2>
            </header>
            <rl-echart [options]="channelOptions()" style="--rl-echart-height: 280px" />
          </section>

          <section class="rl-panel rl-panel--wide">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">Mix Propios vs Competencia</h2>
            </header>
            <rl-echart [options]="shareOptions()" style="--rl-echart-height: 260px" />
          </section>
        </div>
      </div>
    </ion-content>
  `,
})
export class StatsPageComponent implements OnInit {
  private readonly alertsStore = inject(AlertsStore);
  private readonly historyStore = inject(HistoryStore);

  readonly analytics = computed(() =>
    computeAnalytics({
      history: this.historyStore.items(),
      alerts: this.alertsStore.items(),
      days: 14,
    }),
  );

  readonly funnelOptions = computed((): EChartOptions => {
    const p = this.analytics().pipeline;
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'funnel',
          left: '8%',
          width: '84%',
          label: { color: '#e8eef8' },
          data: [
            { name: 'Abiertas', value: p.open },
            { name: 'Contactadas', value: p.contacted },
            { name: 'Ganadas', value: p.won },
            { name: 'Descartadas', value: p.dismissed },
          ],
        },
      ],
    };
  });

  readonly severityOptions = computed((): EChartOptions => {
    const s = this.analytics().comp.severityCounts as Record<string, number>;
    const labels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const colors = ['#f43f5e', '#f59e0b', '#38bdf8', '#94a3b8'];
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: labels.map((k, i) => ({
            value: s[k] ?? 0,
            itemStyle: { color: colors[i] },
          })),
          barMaxWidth: 42,
        },
      ],
    };
  });

  readonly rivalOptions = computed((): EChartOptions => {
    const top = topEntries(this.analytics().comp.byCompetitor, 6) as Array<{
      name: string;
      count: number;
    }>;
    const names = top.map((t) => t.name).reverse();
    const values = top.map((t) => t.count).reverse();
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 100, right: 24, top: 16, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: names },
      series: [
        {
          type: 'bar',
          data: values,
          itemStyle: { color: '#f59e0b' },
          barMaxWidth: 18,
        },
      ],
    };
  });

  readonly channelOptions = computed((): EChartOptions => {
    const top = topEntries(this.analytics().own.byChannel, 6) as Array<{
      name: string;
      count: number;
    }>;
    if (!top.length) {
      return {
        title: {
          text: 'Sin actividad en ventana',
          left: 'center',
          top: 'middle',
          textStyle: { color: '#6b7a94', fontSize: 13, fontWeight: 500 },
        },
      };
    }
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '46%'],
          label: { color: '#9aa8c0' },
          data: top.map((t) => ({ name: t.name, value: t.count })),
        },
      ],
    };
  });

  readonly shareOptions = computed((): EChartOptions => {
    const c = this.analytics().comparison;
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          label: { formatter: '{b}: {d}%', color: '#e8eef8' },
          data: [
            { name: 'Propios', value: c.ownSharePct || 0 },
            { name: 'Competencia', value: c.compSharePct || 0 },
          ],
        },
      ],
    };
  });

  ngOnInit(): void {
    this.alertsStore.load();
    this.historyStore.load();
  }
}
