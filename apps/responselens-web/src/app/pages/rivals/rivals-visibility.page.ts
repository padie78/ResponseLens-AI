import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { DecimalPipe } from '@angular/common';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
import { buildRivalSeoIntel } from '../../engine/rival-seo-intel.js';
import { buildAiVisibilityIntel } from '../../engine/ai-visibility-intel.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { EchartComponent, ScanBlockerComponent, type EChartOptions } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-rivals-visibility-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, DecimalPipe, RouterLink, ButtonModule, ScanBlockerComponent, EchartComponent],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />
      <div class="rl-page rl-intel rl-vis">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Visibilidad web</h1>
            <p class="rl-page__lead">
              Status page y /pricing públicos de rivales. Sin Similarweb ni tráfico inventado.
              <span class="rl-data-badge" [class]="'rl-data-badge--' + badgeKind()">{{ badgeLabel() }}</span>
            </p>
          </div>
          <div class="rl-own__actions">
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
            />
          </div>
        </header>

        @if (pack().usedFallback) {
          <p class="rl-page__status">
            Sin rivales en config — demo Alpha/Beta.
            Cargá nombres públicos en <a routerLink="/app/settings" [queryParams]="{ tab: 'rivales' }">Config → Rivales</a>.
            <a routerLink="/app/settings">Cargar rivales</a>
          </p>
        }

        <div class="rl-own__kpis rl-ads__kpis">
          <div class="rl-own__kpi" data-tone="total">
            <i class="pi pi-globe rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ connectedWeb() }}</strong>
            <span>Con URLs</span>
          </div>
          <div class="rl-own__kpi" data-tone="urgent">
            <i class="pi pi-exclamation-triangle rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ incidentCount() }}</strong>
            <span>Incidentes status</span>
          </div>
          <div class="rl-own__kpi" data-tone="pending">
            <i class="pi pi-tag rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ priceChangeCount() }}</strong>
            <span>Precio cambió</span>
          </div>
          <div class="rl-own__kpi" data-tone="snoozed">
            <i class="pi pi-users rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ pack().rivals.length }}</strong>
            <span>Rivales</span>
          </div>
        </div>

        <div class="rl-intel__pills" role="tablist" aria-label="Rival">
          @for (r of pack().rivals; track r.name) {
            <button
              type="button"
              class="rl-intel__pill"
              [class.is-active]="selectedName() === r.name"
              (click)="selected.set(r.name)"
            >
              {{ r.name }}
            </button>
          }
        </div>

        @if (current(); as r) {
          <article class="rl-vis-hero" [attr.data-trend]="r.visibility.trendPct >= 0 ? 'up' : 'down'">
            <div class="rl-vis-hero__score">
              <p class="rl-insight-hero__eyebrow">{{ r.visibility.band }} · status</p>
              <strong>{{ r.visibility.statusState === 'incident' ? 'Down' : r.visibility.statusState === 'operational' ? 'OK' : '—' }}</strong>
              <span>{{ r.visibility.statusState }}</span>
              <p class="rl-vis-hero__trend" [class.is-down]="r.visibility.priceChanged">
                {{ r.visibility.priceChanged ? 'Precio cambió' : 'Sin diff de pricing' }}
              </p>
              <a class="rl-vis-hero__dom" [href]="'https://' + r.visibility.domain" target="_blank" rel="noopener">
                {{ r.visibility.domain }}
              </a>
            </div>
            <div class="rl-vis-hero__read">
              <h2>{{ r.name }}</h2>
              <p>{{ r.visibility.recommend }}</p>
              <dl class="rl-ad-card__facts">
                <div>
                  <dt>Status</dt>
                  <dd>{{ r.visibility.statusUrl ? 'URL' : '—' }}</dd>
                </div>
                <div>
                  <dt>Pricing</dt>
                  <dd>{{ r.visibility.pricingUrl ? 'URL' : '—' }}</dd>
                </div>
                <div>
                  <dt>Hash</dt>
                  <dd>{{ r.visibility.priceHash ? r.visibility.priceHash.slice(0, 6) : '—' }}</dd>
                </div>
              </dl>
            </div>
          </article>

          <div class="rl-talent-split">
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Páginas públicas</h2></header>
              <ul class="rl-talent-bars">
                @for (p of r.visibility.pages; track p.path) {
                  <li>
                    <div class="rl-talent-bars__lab">
                      <strong>{{ p.title }}</strong>
                    </div>
                    <p class="rl-vis-path">{{ p.path }}</p>
                  </li>
                }
              </ul>
            </section>
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Status</h2></header>
              <p>{{ r.visibility.statusSummary }}</p>
            </section>
          </div>
        }

        <section class="rl-panel rl-intel__chart">
          <header class="rl-panel__head"><h2 class="rl-panel__title">Roles vs cambio de precio</h2></header>
          <rl-echart [options]="chart()" style="--rl-echart-height: 240px" />
        </section>

        @if (currentSeo(); as seo) {
          <section class="rl-panel" style="margin-top: 1.25rem">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">
                SEO — {{ seo.domain }}
                <span class="rl-data-badge" [class]="'rl-data-badge--' + seoBadgeKind()">{{ seoBadge() }}</span>
              </h2>
            </header>
            <p class="rl-page__disclaimer">{{ seo.disclaimer }}</p>
            @if (seo.connected) {
              <div class="rl-kpi-grid" style="margin-top: .75rem">
                <article class="rl-kpi"><span class="rl-kpi__label">Tráfico est.</span><strong class="rl-kpi__value">{{ seo.trafficIndex | number }}</strong></article>
                <article class="rl-kpi"><span class="rl-kpi__label">DA</span><strong class="rl-kpi__value">{{ seo.domainAuthority }}</strong></article>
                <article class="rl-kpi"><span class="rl-kpi__label">Keywords org.</span><strong class="rl-kpi__value">{{ seo.organicKeywords | number }}</strong></article>
                <article class="rl-kpi"><span class="rl-kpi__label">Backlinks</span><strong class="rl-kpi__value">{{ seo.backlinks | number }}</strong></article>
                <article class="rl-kpi"><span class="rl-kpi__label">Tendencia</span><strong class="rl-kpi__value">{{ seo.trendPct > 0 ? '+' : '' }}{{ seo.trendPct }}%</strong></article>
              </div>
              <h3 style="margin-top: 1rem; font-size: .9rem">Top keywords</h3>
              @for (kw of seo.topKeywords.slice(0, 5); track kw.keyword) {
                <p style="font-size: .85rem">{{ kw.keyword }} · vol. {{ kw.volume }} · pos. {{ kw.position }} · CPC \${{ kw.cpc }}</p>
              }
            }
          </section>
        }

        @if (currentAiVis(); as aiv) {
          <section class="rl-panel" style="margin-top: 1.25rem">
            <header class="rl-panel__head">
              <h2 class="rl-panel__title">
                AI Visibility
                <span class="rl-data-badge" [class]="'rl-data-badge--' + aivBadgeKind()">{{ aivBadge() }}</span>
              </h2>
            </header>
            <p class="rl-page__disclaimer">{{ aiv.disclaimer }}</p>
            @if (aiv.connected) {
              <p style="margin-top: .5rem">Presence score: <strong>{{ aiv.presenceScore }}/100</strong></p>
              @for (m of aiv.llmMentions; track m.llm) {
                <p style="font-size: .85rem">{{ m.llm }}: {{ m.mentioned ? 'Sí (pos. ' + m.rank + ', ' + m.sentiment + ')' : 'No aparece' }}</p>
              }
            }
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class RivalsVisibilityPageComponent implements OnInit {
  readonly config = inject(UserConfigStore);
  readonly alerts = inject(AlertsStore);
  readonly scan = inject(ScanService);
  readonly selected = signal('');

  readonly pack = computed(() =>
    buildRivalSurfaceIntel({
      competitors: this.config.competitors(),
      alerts: this.alerts.items(),
      days: 14,
    }),
  );

  readonly current = computed(() => {
    const list = this.pack().rivals;
    const name = this.selected() || list[0]?.name;
    return list.find((r) => r.name === name) || list[0] || null;
  });

  readonly selectedName = computed(() => this.current()?.name ?? '');

  badgeKind(): string {
    return dataBadgeKind(this.pack().webSource);
  }

  badgeLabel(): string {
    return dataBadgeLabel(this.pack().webSource);
  }

  readonly connectedWeb = computed(
    () => this.pack().rivals.filter((r) => r.visibility.source === 'connected').length,
  );

  readonly incidentCount = computed(() => this.pack().statusIncidents.length);

  readonly priceChangeCount = computed(
    () => this.pack().rivals.filter((r) => r.visibility.priceChanged).length,
  );

  readonly currentSeo = computed(() => {
    const c = this.current();
    if (!c) return null;
    return buildRivalSeoIntel({
      competitor: c,
      semrushApiKey: this.config.config()?.company?.semrushApiKey,
    });
  });

  readonly currentAiVis = computed(() => {
    const c = this.current();
    if (!c) return null;
    return buildAiVisibilityIntel({
      competitor: c,
      aiVisibilityProvider: this.config.config()?.company?.aiVisibilityProvider,
    });
  });

  seoBadgeKind(): string { return dataBadgeKind(this.currentSeo()?.source ?? 'demo'); }
  seoBadge(): string { return dataBadgeLabel(this.currentSeo()?.source ?? 'demo'); }
  aivBadgeKind(): string { return dataBadgeKind(this.currentAiVis()?.source ?? 'demo'); }
  aivBadge(): string { return dataBadgeLabel(this.currentAiVis()?.source ?? 'demo'); }

  readonly chart = computed((): EChartOptions => {
    const rows = this.pack().visChart;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      grid: { left: 36, right: 12, top: 16, bottom: 44 },
      xAxis: { type: 'category', data: rows.map((r) => r.name) },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Roles careers',
          type: 'bar',
          data: rows.map((r) => r.traffic),
          itemStyle: { color: '#38bdf8' },
        },
        {
          name: 'Cambio de precio',
          type: 'bar',
          data: rows.map((r) => r.da),
          itemStyle: { color: '#2dd4bf' },
        },
      ],
    };
  });

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
  }

  async runScan(): Promise<void> {
    await this.scan.scanCompetitors();
  }

  async runScanMock(): Promise<void> {
    await this.scan.scanCompetitorsMock();
  }
}
