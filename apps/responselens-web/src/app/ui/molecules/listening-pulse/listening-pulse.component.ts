import { DecimalPipe } from '@angular/common';
import { Component, ViewEncapsulation, computed, input, signal } from '@angular/core';
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
  imports: [DecimalPipe, EchartComponent],
  template: `
    <section class="rl-pulse" [attr.data-mode]="mode()">
      <header class="rl-pulse__head">
        <div>
          <p class="rl-pulse__eyebrow">{{ eyebrow() }}</p>
          <h2 class="rl-pulse__title">
            {{ title() }}
            <button
              type="button"
              class="rl-help-btn"
              [class.is-open]="kpiHelpOpen()"
              [attr.aria-expanded]="kpiHelpOpen()"
              aria-label="Qué significan estos KPIs"
              title="Qué significan estos KPIs"
              (click)="kpiHelpOpen.set(!kpiHelpOpen())"
            >
              <i class="pi pi-question-circle" aria-hidden="true"></i>
            </button>
          </h2>
        </div>
        <span class="rl-pulse__badge">{{ coverageLabel() }}</span>
      </header>

      @if (kpiHelpOpen()) {
        <div class="rl-kpi-help" role="region" aria-label="Explicación de KPIs">
          @for (row of kpiHelpRows(); track row.key) {
            <div class="rl-kpi-help__row">
              <div class="rl-kpi-help__head">
                <strong>{{ row.label }}</strong>
                <span class="rl-kpi-help__value">{{ row.value }}</span>
              </div>
              <p class="rl-kpi-help__meaning">{{ row.meaning }}</p>
              <p class="rl-kpi-help__read">{{ row.howToRead }}</p>
            </div>
          }
        </div>
      }

      <div class="rl-pulse__kpis">
        <article class="rl-pulse__kpi">
          <span>{{ mode() === 'capture' ? 'Oportunidades' : 'Menciones' }}</span>
          <strong>{{ pulse().total }}</strong>
        </article>
        <article class="rl-pulse__kpi">
          <span>Con métricas</span>
          <strong>{{ pulse().withSc }}</strong>
        </article>
        <article class="rl-pulse__kpi">
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
          <span>{{ mode() === 'capture' ? 'Win rate' : 'Relevancia media' }}</span>
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
          <article class="rl-pulse__kpi">
            <span>Críticas</span>
            <strong>{{ pulse().critical }}</strong>
          </article>
        } @else {
          <article class="rl-pulse__kpi">
            <span>Score IA medio</span>
            <strong>{{ pulse().avgAi || '—' }}</strong>
          </article>
          <article class="rl-pulse__kpi">
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
          <h3>Clusters / temas</h3>
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
  readonly eyebrow = input('Listening · insights');
  readonly kpiHelpOpen = signal(false);

  readonly pulse = computed(() =>
    computeListeningPulse({
      alerts: this.alerts(),
      scope: this.scope(),
      mode: this.mode(),
    }),
  );

  readonly kpiHelpRows = computed(() => {
    const p = this.pulse();
    const capture = this.mode() === 'capture';
    const fmt = (n: number) =>
      Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—';

    const rows: Array<{ key: string; label: string; value: string; meaning: string; howToRead: string }> = [
      {
        key: 'total',
        label: capture ? 'Oportunidades' : 'Menciones',
        value: String(p.total),
        meaning: capture
          ? 'Cantidad de alertas de competencia en el alcance actual.'
          : 'Cantidad de menciones propias en el alcance actual.',
        howToRead:
          p.total === 0
            ? 'Todavía no hay ítems: corré un scan o ampliá el rango.'
            : `Hay ${p.total} ítem(s) activos para este panel.`,
      },
      {
        key: 'sc',
        label: 'Con métricas',
        value: `${p.withSc} (${p.scCoverage}%)`,
        meaning:
          'Cuántas menciones traen engagement, cluster y scores de alcance.',
        howToRead:
          p.scCoverage >= 70
            ? 'Buena cobertura: los KPIs de alcance son confiables.'
            : p.scCoverage >= 35
              ? 'Cobertura media: parte del feed aún no tiene métricas de alcance.'
              : 'Poca cobertura: corré un scan para enriquecer el feed.',
      },
      {
        key: 'points',
        label: 'Alcance (pts)',
        value: fmt(p.points),
        meaning:
          'Suma de puntos de engagement en las menciones con métricas.',
        howToRead:
          p.points > 0
            ? 'Más pts = más visibilidad agregada del tema en redes.'
            : 'Sin pts todavía: faltan métricas de alcance o engagement en cero.',
      },
      {
        key: 'comments',
        label: 'Comentarios',
        value: fmt(p.comments),
        meaning: 'Suma de comentarios reportados en esas menciones.',
        howToRead: 'Indica volumen de conversación alrededor de las piezas.',
      },
      {
        key: 'clusters',
        label: 'Clusters',
        value: String(p.clusters.length),
        meaning:
          'Temas/incidentes agrupados (varias menciones del mismo eje).',
        howToRead:
          p.clusters.length > 0
            ? 'Cada cluster es un hilo temático para priorizar defensa o captación.'
            : 'Sin clusters: las menciones aún no están agrupadas por tema.',
      },
    ];

    if (capture) {
      rows.push(
        {
          key: 'win',
          label: 'Win rate',
          value: `${p.winRate}%`,
          meaning: 'Porcentaje de oportunidades marcadas como Ganadas sobre el total cerrado/relevante.',
          howToRead:
            p.winRate >= 40
              ? 'Conversión saludable: el pitch está funcionando.'
              : 'Conversión baja: revisá tono de pitch y velocidad de contacto.',
        },
        {
          key: 'open',
          label: 'Abiertas',
          value: String(p.open),
          meaning: 'Oportunidades todavía sin contactar / sin cerrar.',
          howToRead: p.open > 0 ? 'Hay cola de captación pendiente.' : 'No hay abiertas en este alcance.',
        },
        {
          key: 'critical',
          label: 'Críticas',
          value: String(p.critical),
          meaning: 'Oportunidades de severidad alta/crítica (fricción fuerte del rival).',
          howToRead: p.critical > 0 ? 'Priorizá estas primero: mayor dolor del rival.' : 'Sin críticas abiertas.',
        },
      );
    } else {
      rows.push(
        {
          key: 'scAvg',
          label: 'Relevancia media',
          value: p.avgFinal != null ? String(p.avgFinal) : '—',
          meaning: 'Promedio de relevancia (0–100) en menciones con métricas.',
          howToRead: 'Más alto = piezas más relevantes en el listening.',
        },
        {
          key: 'aiAvg',
          label: 'Score IA medio',
          value: p.avgAi != null ? String(p.avgAi) : '—',
          meaning: 'Promedio del score de riesgo IA (0–100) en las menciones propias.',
          howToRead:
            (p.avgAi ?? 0) >= 60
              ? 'Riesgo medio-alto en el feed: conviene revisar las más altas primero.'
              : 'Riesgo promedio contenido; igual mirá las críticas abiertas.',
        },
        {
          key: 'critical',
          label: 'Críticas abiertas',
          value: String(p.critical),
          meaning: 'Menciones propias aún abiertas con severidad alta/crítica.',
          howToRead: p.critical > 0 ? 'Atendelas primero: mayor riesgo reputacional.' : 'Sin críticas abiertas.',
        },
      );
    }

    return rows;
  });

  coverageLabel(): string {
    return `Métricas ${this.pulse().scCoverage}%`;
  }

  readonly reachChart = computed((): EChartOptions => {
    const rows = pulseChannelReachSeries(this.pulse());
    if (!rows.length) return emptyChart('Sin alcance todavía — corré un scan');
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
    if (!rows.length) return emptyChart('Sin clusters — corré un scan para agrupar temas');
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
