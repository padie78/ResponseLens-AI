import { Component, ViewEncapsulation, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import {
  computeOwnBrandHealth,
  topEntries,
} from '../../../engine/ops-stats.js';
import type { CompetitorAlert } from '../../../models/alert.model';
import type { HistoryEntry } from '../../../stores/history.store';
import type { EChartOptions } from '../../atoms/echart/echart.component';
import { EchartComponent } from '../../atoms/echart/echart.component';

export type BrandHealthVariant = 'strip' | 'dashboard';

/**
 * Brand Health — strip (siempre visible) o dashboard completo (tab Stats).
 */
@Component({
  standalone: true,
  selector: 'rl-brand-health-panel',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, ButtonModule, TagModule, EchartComponent],
  template: `
    <section class="rl-brand-health" [class.rl-brand-health--strip]="variant() === 'strip'" [attr.data-band]="health().healthBand">
      <header class="rl-brand-health__head">
        <div class="rl-brand-health__identity">
          <span class="rl-brand-health__avatar">{{ avatar() }}</span>
          <div>
            <div class="rl-brand-health__title-row">
              <h2 class="rl-brand-health__name">{{ companyName() || 'Tu marca' }}</h2>
              <p-tag [value]="health().healthLabel" [severity]="healthSeverity()" />
            </div>
            @if (aliases().length) {
              <p class="rl-brand-health__aliases">{{ aliases().join(' · ') }}</p>
            } @else {
              <p class="rl-brand-health__aliases">Monitoreo · últimos {{ health().days }} días</p>
            }
          </div>
        </div>
        <div class="rl-brand-health__actions">
          <a routerLink="/app/settings" class="rl-brand-health__cfg">Editar empresa</a>
        </div>
      </header>

      <div class="rl-brand-health__kpis">
        <article class="rl-brand-health__kpi">
          <span>Menciones</span>
          <strong>{{ health().total }}</strong>
        </article>
        <article class="rl-brand-health__kpi">
          <span>Abiertas</span>
          <strong>{{ health().open }}</strong>
        </article>
        <article class="rl-brand-health__kpi rl-brand-health__kpi--warn">
          <span>Críticas</span>
          <strong>{{ health().criticalOpen }}</strong>
        </article>
        <article class="rl-brand-health__kpi">
          <span>Score medio</span>
          <strong>{{ health().avgScore || '—' }}</strong>
        </article>
        <article class="rl-brand-health__kpi">
          <span>Negativas</span>
          <strong>{{ health().negPct }}%</strong>
        </article>
        <article class="rl-brand-health__kpi">
          <span>Respuestas</span>
          <strong>{{ health().repliesInWindow }}</strong>
        </article>
      </div>

      @if (variant() === 'dashboard') {
        <div class="rl-brand-health__charts">
          <div class="rl-brand-health__chart">
            <h3>Sentimiento</h3>
            <rl-echart [options]="sentimentOptions()" style="--rl-echart-height: 220px" />
          </div>
          <div class="rl-brand-health__chart">
            <h3>Canales</h3>
            <rl-echart [options]="channelOptions()" style="--rl-echart-height: 220px" />
          </div>
          <div class="rl-brand-health__chart">
            <h3>Severidad</h3>
            <rl-echart [options]="severityOptions()" style="--rl-echart-height: 220px" />
          </div>
        </div>
        <p class="rl-brand-health__foot">
          Descriptivo: qué pasó. Predictivo y Prescriptivo están en las otras pestañas.
        </p>
      }
    </section>
  `,
})
export class BrandHealthPanelComponent {
  readonly companyName = input('');
  readonly aliases = input<string[]>([]);
  readonly alerts = input<CompetitorAlert[]>([]);
  readonly history = input<HistoryEntry[]>([]);
  readonly days = input(14);
  readonly variant = input<BrandHealthVariant>('dashboard');

  readonly health = computed(() =>
    computeOwnBrandHealth({
      alerts: this.alerts(),
      history: this.history(),
      days: this.days(),
    }),
  );

  avatar(): string {
    const n = this.companyName().trim();
    return n ? n.charAt(0).toUpperCase() : 'M';
  }

  healthSeverity(): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    const b = this.health().healthBand;
    if (b === 'strong') return 'success';
    if (b === 'watch') return 'warn';
    if (b === 'critical') return 'danger';
    return 'info';
  }

  readonly sentimentOptions = computed((): EChartOptions => {
    const s = this.health().sentiment;
    const data = [
      { name: 'Positivo', value: s.POSITIVE },
      { name: 'Negativo', value: s.NEGATIVE },
      { name: 'Neutral', value: s.NEUTRAL },
      { name: 'Mixto', value: s.MIXED },
    ].filter((d) => d.value > 0);
    if (!data.length) return emptyChart('Sin menciones en la ventana');
    return {
      tooltip: { trigger: 'item' },
      color: ['#34d399', '#f43f5e', '#94a3b8', '#f59e0b'],
      series: [
        {
          type: 'pie',
          radius: ['42%', '70%'],
          center: ['50%', '52%'],
          label: { color: '#9aa8c0', fontSize: 11 },
          data,
        },
      ],
    };
  });

  readonly channelOptions = computed((): EChartOptions => {
    const top = topEntries(this.health().byChannel, 5) as Array<{ name: string; count: number }>;
    if (!top.length) return emptyChart('Sin canales aún');
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 72, right: 16, top: 12, bottom: 24 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: top.map((t) => t.name).reverse() },
      series: [
        {
          type: 'bar',
          data: top.map((t) => t.count).reverse(),
          itemStyle: { color: '#2dd4bf', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 16,
        },
      ],
    };
  });

  readonly severityOptions = computed((): EChartOptions => {
    const s = this.health().bySeverity;
    const labels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const colors = ['#f43f5e', '#f59e0b', '#38bdf8', '#64748b'];
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 12, top: 16, bottom: 28 },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: labels.map((k, i) => ({
            value: s[k] ?? 0,
            itemStyle: { color: colors[i] },
          })),
          barMaxWidth: 28,
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
      textStyle: { color: '#6b7a94', fontSize: 12, fontWeight: 500 },
    },
  };
}
