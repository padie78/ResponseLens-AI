import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import type { EChartOptions } from '../../ui/atoms/echart/echart.component';
import { EchartComponent } from '../../ui/atoms/echart/echart.component';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { buildMarketTrends } from '../../engine/market-intel.js';
import { loadMarketPrefs, saveMarketPrefs } from '../../engine/market-prefs.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';

@Component({
  standalone: true,
  selector: 'rl-trends-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, EchartComponent],
  template: `
    <ion-content>
      <div class="rl-page">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Tendencias del mercado</h1>
            <p class="rl-page__lead">
              Resumen de temas y señales emergentes a partir de tus keywords.
              <span class="rl-data-badge" [class]="'rl-data-badge--' + badgeKind()">{{ badgeLabel() }}</span>
            </p>
            <p class="rl-page__disclaimer">{{ trends().disclaimer }}</p>
          </div>
        </header>

        @if (!trends().topKeywords.length) {
          <section class="rl-panel">
            <p>Faltan datos o keywords para construir tendencias.</p>
            <p><a routerLink="/app/settings" [queryParams]="{ tab: 'empresa' }">Configurá categoría y keywords</a>.</p>
          </section>
        } @else {
          <section class="rl-panel" style="margin-bottom: 1rem">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Resumen</h2></header>
            <p>{{ trends().summary }}</p>
            @if (watchedThemes().length) {
              <p class="rl-page__disclaimer">Watchlist: {{ watchedThemes().join(' · ') }}</p>
            }
            @if (notice()) {
              <p class="rl-page__status">{{ notice() }}</p>
            }
          </section>

          <div class="rl-kpi-grid" style="margin-bottom: 1rem">
            <article class="rl-kpi">
              <span class="rl-kpi__label">Menciones</span>
              <strong class="rl-kpi__value">{{ trends().totalRows }}</strong>
            </article>
            <article class="rl-kpi">
              <span class="rl-kpi__label">Señal real</span>
              <strong class="rl-kpi__value">{{ trends().realRows }}</strong>
            </article>
            <article class="rl-kpi">
              <span class="rl-kpi__label">Altas / críticas</span>
              <strong class="rl-kpi__value">{{ trends().criticalCount }}</strong>
            </article>
          </div>

          <div class="rl-stats-grid" style="margin-bottom: 1rem">
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Keywords</h2></header>
              <rl-echart [options]="keywordsChart()" style="--rl-echart-height: 260px" />
            </section>
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Temas</h2></header>
              <rl-echart [options]="themesChart()" style="--rl-echart-height: 260px" />
            </section>
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Canales</h2></header>
              <rl-echart [options]="sourcesChart()" style="--rl-echart-height: 260px" />
            </section>
          </div>

          <div class="rl-stats-grid">
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Top keywords</h2></header>
              @for (row of trends().topKeywords; track row.keyword) {
                <p>{{ row.keyword }} · <strong>{{ row.count }}</strong></p>
              }
            </section>

            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Canales</h2></header>
              @for (row of trends().topSources; track row.source) {
                <p>{{ row.source }} · <strong>{{ row.count }}</strong></p>
              }
            </section>

            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Top temas</h2></header>
              @for (row of trends().topThemes; track row.theme) {
                <p>
                  {{ row.theme }} · <strong>{{ row.count }}</strong>
                  <button type="button" class="rl-settings__ghost" style="margin-left:.5rem" (click)="toggleTheme(row.theme)">
                    {{ watchedThemes().includes(row.theme) ? 'Quitar watch' : 'Vigilar tema' }}
                  </button>
                </p>
              }
            </section>

            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Severidad</h2></header>
              @for (row of trends().severities; track row.severity) {
                <p>{{ row.severity }} · <strong>{{ row.count }}</strong></p>
              }
            </section>
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class TrendsPageComponent implements OnInit {
  private readonly alerts = inject(AlertsStore);
  private readonly config = inject(UserConfigStore);
  readonly watchedThemes = signal<string[]>([]);
  readonly notice = signal('');

  readonly trends = computed(() =>
    buildMarketTrends({
      alerts: this.alerts.items(),
      industryKeywords: this.config.config()?.company?.industryKeywords ?? [],
      marketCategory: this.config.config()?.company?.marketCategory ?? '',
      whatTheySell: this.config.config()?.company?.whatTheySell ?? '',
    }),
  );

  readonly keywordsChart = computed((): EChartOptions => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 16, bottom: 32 },
    xAxis: { type: 'category', data: this.trends().topKeywords.map((r) => r.keyword) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', data: this.trends().topKeywords.map((r) => r.count), itemStyle: { color: '#38bdf8' } }],
  }));

  readonly themesChart = computed((): EChartOptions => ({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['42%', '68%'],
      label: { color: '#9aa8c0' },
      data: this.trends().topThemes.map((r) => ({ name: r.theme, value: r.count })),
    }],
  }));

  readonly sourcesChart = computed((): EChartOptions => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 16, bottom: 32 },
    xAxis: { type: 'category', data: this.trends().topSources.map((r) => r.source) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', data: this.trends().topSources.map((r) => r.count), itemStyle: { color: '#a78bfa' } }],
  }));

  badgeKind(): string {
    return dataBadgeKind(this.trends().source);
  }

  badgeLabel(): string {
    return dataBadgeLabel(this.trends().source);
  }

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
    const prefs = loadMarketPrefs(
      'trends',
      this.config.activeWorkspaceId(),
      this.config.companyName(),
      { watchedThemes: [] },
    );
    this.watchedThemes.set(Array.isArray(prefs.watchedThemes) ? prefs.watchedThemes : []);
  }

  toggleTheme(theme: string): void {
    const exists = this.watchedThemes().includes(theme);
    const next = exists
      ? this.watchedThemes().filter((t) => t !== theme)
      : [...this.watchedThemes(), theme];
    this.watchedThemes.set(next);
    saveMarketPrefs('trends', this.config.activeWorkspaceId(), this.config.companyName(), {
      watchedThemes: next,
    });
    this.notice.set(exists ? `Tema “${theme}” quitado de watchlist.` : `Tema “${theme}” agregado a watchlist.`);
    window.setTimeout(() => this.notice.set(''), 2400);
  }
}
