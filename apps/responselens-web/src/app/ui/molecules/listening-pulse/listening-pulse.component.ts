import { DecimalPipe } from '@angular/common';
import { Component, ViewEncapsulation, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import {
  computeListeningPulse,
  pulseChannelReachSeries,
  pulseClusterSeries,
} from '../../../engine/listening-insights.js';
import type { CompetitorAlert } from '../../../models/alert.model';
import type { EChartOptions } from '../../atoms/echart/echart.component';
import { EchartComponent } from '../../atoms/echart/echart.component';

export type ListeningPulseMode = 'reputation' | 'capture';
export type ListeningPulseScope = 'own' | 'rival' | 'all';

/**
 * KPIs + gráficos + narrativa a partir de alertas / _scMeta (mock o real).
 */
@Component({
  standalone: true,
  selector: 'rl-listening-pulse',
  encapsulation: ViewEncapsulation.None,
  imports: [DecimalPipe, TagModule, EchartComponent],
  template: `
    <section class="rl-pulse" [attr.data-mode]="mode()">
      <header class="rl-pulse__head">
        <div>
          <p class="rl-pulse__eyebrow">{{ eyebrow() }}</p>
          <h2 class="rl-pulse__title">{{ title() }}</h2>
        </div>
        <p-tag [value]="coverageLabel()" [severity]="coverageSeverity()" />
      </header>

      <div class="rl-pulse__kpis">
        <article class="rl-pulse__kpi">
          <span>{{ mode() === 'capture' ? 'Oportunidades' : 'Menciones' }}</span>
          <strong>{{ pulse().total }}</strong>
        </article>
        <article class="rl-pulse__kpi">
          <span>Con SocialCrawl</span>
          <strong>{{ pulse().withSc }}</strong>
        </article>
        <article class="rl-pulse__kpi rl-pulse__kpi--accent">
          <span>Alcance (pts)</span>
          <strong>{{ pulse().points | number: '1.0-0' }}</strong>
        </article>
        <article class="rl-pulse__kpi">
          <span>Comentarios</span>
          <strong>{{ pulse().comments | number: '1.0-0' }}</strong>
        </article>
        <article class="rl-pulse__kpi">
          <span>Clusters</span>
          <strong>{{ pulse().clusters.length }}</strong>
        </article>
        <article class="rl-pulse__kpi">
          <span>{{ mode() === 'capture' ? 'Win rate' : 'Score SC medio' }}</span>
          <strong>
            @if (mode() === 'capture') {
              {{ pulse().winRate }}%
            } @else {
              {{ pulse().avgFinal || '—' }}
            }
          </strong>
        </article>
        @if (mode() === 'capture') {
          <article class="rl-pulse__kpi">
            <span>Abiertas</span>
            <strong>{{ pulse().open }}</strong>
          </article>
          <article class="rl-pulse__kpi rl-pulse__kpi--warn">
            <span>Críticas</span>
            <strong>{{ pulse().critical }}</strong>
          </article>
        } @else {
          <article class="rl-pulse__kpi">
            <span>Score IA medio</span>
            <strong>{{ pulse().avgAi || '—' }}</strong>
          </article>
          <article class="rl-pulse__kpi rl-pulse__kpi--warn">
            <span>Críticas abiertas</span>
            <strong>{{ pulse().critical }}</strong>
          </article>
        }
      </div>

      <div class="rl-pulse__analysis">
        <h3>Lectura rápida</h3>
        <ul>
          @for (line of pulse().headlines; track line) {
            <li>{{ line }}</li>
          }
        </ul>
      </div>

      <div class="rl-pulse__charts">
        <div class="rl-pulse__chart">
          <h3>Alcance por canal</h3>
          <rl-echart [options]="reachChart()" style="--rl-echart-height: 240px" />
        </div>
        <div class="rl-pulse__chart">
          <h3>Clusters / temas SC</h3>
          <rl-echart [options]="clusterChart()" style="--rl-echart-height: 240px" />
        </div>
      </div>

      @if (pulse().clusters.length) {
        <div class="rl-pulse__clusters">
          <h3>Clusters activos</h3>
          <div class="rl-pulse__cluster-grid">
            @for (c of pulse().clusters; track c.id) {
              <article class="rl-pulse__cluster">
                <strong>{{ c.title }}</strong>
                <p>
                  {{ c.count }} mención(es) · {{ c.points | number: '1.0-0' }} pts
                  @if (c.score) {
                    · score {{ (c.score * 100) | number: '1.0-0' }}%
                  }
                </p>
              </article>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class ListeningPulseComponent {
  readonly alerts = input<CompetitorAlert[]>([]);
  readonly scope = input<ListeningPulseScope>('own');
  readonly mode = input<ListeningPulseMode>('reputation');
  readonly title = input('Listening pulse');
  readonly eyebrow = input('SocialCrawl · insights');

  readonly pulse = computed(() =>
    computeListeningPulse({
      alerts: this.alerts(),
      scope: this.scope(),
      mode: this.mode(),
    }),
  );

  coverageLabel(): string {
    return `SC meta ${this.pulse().scCoverage}%`;
  }

  coverageSeverity(): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    const c = this.pulse().scCoverage;
    if (c >= 70) return 'success';
    if (c >= 35) return 'warn';
    if (this.pulse().total === 0) return 'secondary';
    return 'danger';
  }

  readonly reachChart = computed((): EChartOptions => {
    const rows = pulseChannelReachSeries(this.pulse());
    if (!rows.length) return emptyChart('Sin reach todavía — corré Scanner mock');
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 88, right: 16, top: 12, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.name).reverse(),
        axisLabel: { color: '#9aa8c0' },
      },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.value).reverse(),
          itemStyle: {
            color: this.mode() === 'capture' ? '#f59e0b' : '#2dd4bf',
            borderRadius: [0, 6, 6, 0],
          },
          barMaxWidth: 16,
        },
      ],
    };
  });

  readonly clusterChart = computed((): EChartOptions => {
    const rows = pulseClusterSeries(this.pulse());
    if (!rows.length) return emptyChart('Sin clusters — el mock los une por tema');
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: { name?: string; value?: number; data?: { points?: number } }) =>
          `${p.name}<br/>menciones: ${p.value}${
            p.data?.points != null ? `<br/>pts: ${p.data.points}` : ''
          }`,
      },
      color: ['#38bdf8', '#2dd4bf', '#f59e0b', '#f43f5e', '#94a3b8', '#0ea5e9'],
      series: [
        {
          type: 'pie',
          radius: ['40%', '68%'],
          center: ['50%', '52%'],
          label: { color: '#9aa8c0', fontSize: 11 },
          data: rows.map((r) => ({ name: r.name, value: r.value, points: r.points })),
        },
      ],
    };
  });
}

function emptyChart(msg: string): EChartOptions {
  return {
    title: {
      text: msg,
      left: 'center',
      top: 'middle',
      textStyle: { color: '#64748b', fontSize: 13, fontWeight: 500 },
    },
  };
}
