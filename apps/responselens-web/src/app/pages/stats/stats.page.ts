import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { computeAnalytics, topEntries } from '../../engine/ops-stats.js';

interface BarEntry {
  label: string;
  value: number;
  pct: number;
}

@Component({
  standalone: true,
  selector: 'rl-stats-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Stats</h1>
        <p class="rl-page__lead">KPIs, embudo y comparación Propios vs Competencia (14 días).</p>

        <div class="rl-kpi-grid">
          <div class="rl-kpi">
            <span class="rl-kpi__label">Respuestas propias</span>
            <strong class="rl-kpi__value">{{ analytics().own.repliesInWindow }}</strong>
          </div>
          <div class="rl-kpi">
            <span class="rl-kpi__label">Escalaciones</span>
            <strong class="rl-kpi__value">{{ analytics().own.escalationsWindow }}</strong>
          </div>
          <div class="rl-kpi">
            <span class="rl-kpi__label">Oportunidades abiertas</span>
            <strong class="rl-kpi__value">{{ analytics().comp.open }}</strong>
          </div>
          <div class="rl-kpi">
            <span class="rl-kpi__label">Win rate</span>
            <strong class="rl-kpi__value">{{ analytics().comp.winRate }}%</strong>
          </div>
          <div class="rl-kpi">
            <span class="rl-kpi__label">Críticas abiertas</span>
            <strong class="rl-kpi__value">{{ analytics().comp.criticalOpen }}</strong>
          </div>
          <div class="rl-kpi">
            <span class="rl-kpi__label">Propios vs Comp</span>
            <strong class="rl-kpi__value">{{ analytics().comparison.ownSharePct }}% / {{ analytics().comparison.compSharePct }}%</strong>
          </div>
        </div>

        <div class="rl-stats-grid">
          <section class="rl-page__panel">
            <h2 class="rl-settings__h">Embudo competencia</h2>
            <div class="rl-bar-list">
              @for (row of pipelineBars(); track row.label) {
                <div class="rl-bar-list__row">
                  <span class="rl-bar-list__label">{{ row.label }}</span>
                  <div class="rl-bar-list__track">
                    <div class="rl-bar-list__fill" [style.width.%]="row.pct"></div>
                  </div>
                  <span class="rl-bar-list__value">{{ row.value }}</span>
                </div>
              }
            </div>
          </section>

          <section class="rl-page__panel">
            <h2 class="rl-settings__h">Severidad (alertas)</h2>
            <div class="rl-bar-list">
              @for (row of severityBars(); track row.label) {
                <div class="rl-bar-list__row">
                  <span class="rl-bar-list__label">{{ row.label }}</span>
                  <div class="rl-bar-list__track">
                    <div class="rl-bar-list__fill rl-bar-list__fill--comp" [style.width.%]="row.pct"></div>
                  </div>
                  <span class="rl-bar-list__value">{{ row.value }}</span>
                </div>
              }
            </div>
          </section>

          <section class="rl-page__panel">
            <h2 class="rl-settings__h">Top rivales</h2>
            <div class="rl-bar-list">
              @for (row of rivalBars(); track row.label) {
                <div class="rl-bar-list__row">
                  <span class="rl-bar-list__label">{{ row.label }}</span>
                  <div class="rl-bar-list__track">
                    <div class="rl-bar-list__fill" [style.width.%]="row.pct"></div>
                  </div>
                  <span class="rl-bar-list__value">{{ row.value }}</span>
                </div>
              }
            </div>
          </section>

          <section class="rl-page__panel">
            <h2 class="rl-settings__h">Canales — Propios</h2>
            <div class="rl-bar-list">
              @for (row of ownChannelBars(); track row.label) {
                <div class="rl-bar-list__row">
                  <span class="rl-bar-list__label">{{ row.label }}</span>
                  <div class="rl-bar-list__track">
                    <div class="rl-bar-list__fill rl-bar-list__fill--own" [style.width.%]="row.pct"></div>
                  </div>
                  <span class="rl-bar-list__value">{{ row.value }}</span>
                </div>
              } @empty {
                <p class="rl-settings__empty">Sin actividad en ventana.</p>
              }
            </div>
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

  readonly pipelineBars = computed(() => {
    const p = this.analytics().pipeline;
    const max = Math.max(p.open, p.contacted, p.won, p.dismissed, 1);
    return this.toBars(
      [
        ['Abiertas', p.open],
        ['Contactadas', p.contacted],
        ['Ganadas', p.won],
        ['Descartadas', p.dismissed],
      ],
      max,
    );
  });

  readonly severityBars = computed(() => {
    const s = this.analytics().comp.severityCounts as Record<string, number>;
    const max = Math.max(s['CRITICAL'] ?? 0, s['HIGH'] ?? 0, s['MEDIUM'] ?? 0, s['LOW'] ?? 0, 1);
    return this.toBars(
      [
        ['CRITICAL', s['CRITICAL'] ?? 0],
        ['HIGH', s['HIGH'] ?? 0],
        ['MEDIUM', s['MEDIUM'] ?? 0],
        ['LOW', s['LOW'] ?? 0],
      ],
      max,
    );
  });

  readonly rivalBars = computed(() => {
    const top = topEntries(this.analytics().comp.byCompetitor, 6) as Array<{
      name: string;
      count: number;
    }>;
    const max = top[0]?.count ?? 1;
    return this.toBars(
      top.map((t) => [t.name, t.count] as [string, number]),
      max,
    );
  });

  readonly ownChannelBars = computed(() => {
    const top = topEntries(this.analytics().own.byChannel, 6) as Array<{
      name: string;
      count: number;
    }>;
    const max = top[0]?.count ?? 1;
    return this.toBars(
      top.map((t) => [t.name, t.count] as [string, number]),
      max,
    );
  });

  ngOnInit(): void {
    this.alertsStore.load();
    this.historyStore.load();
  }

  private toBars(entries: Array<[string, number]>, max: number): BarEntry[] {
    return entries.map(([label, value]) => ({
      label,
      value,
      pct: Math.round((value / max) * 100),
    }));
  }
}
