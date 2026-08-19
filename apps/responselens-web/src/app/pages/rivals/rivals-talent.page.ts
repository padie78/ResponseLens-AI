import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { EchartComponent, ScanBlockerComponent, type EChartOptions } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-rivals-talent-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, ButtonModule, ScanBlockerComponent, EchartComponent],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />
      <div class="rl-page rl-intel rl-talent">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Reputación y talento</h1>
            <p class="rl-page__lead">
              Roles públicos en careers de rivales. Recortes solo si aparecen en el
              <span class="rl-data-badge rl-data-badge--feed">Feed</span>.
              Sin Glassdoor.
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
            <i class="pi pi-briefcase rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ totalRoles() }}</strong>
            <span>Roles abiertos</span>
          </div>
          <div class="rl-own__kpi" data-tone="pending">
            <i class="pi pi-link rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ connectedCareers() }}</strong>
            <span>Con careers</span>
          </div>
          <div class="rl-own__kpi" data-tone="urgent">
            <i class="pi pi-exclamation-triangle rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ layoffCount() }}</strong>
            <span>Con señal de recorte</span>
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
          <article class="rl-talent-hero" [attr.data-band]="r.talent.band">
            <div class="rl-talent-hero__score">
              <p class="rl-insight-hero__eyebrow">Careers · {{ r.talent.band }}</p>
              <strong>{{ r.talent.openRoles }}</strong>
              <span>roles</span>
              <div class="rl-talent-meter" aria-hidden="true">
                <i [style.width.%]="roleBarPct(r.talent.openRoles)"></i>
              </div>
              <p>{{ r.talent.jobs.length }} títulos de muestra</p>
            </div>
            <div class="rl-talent-hero__read">
              <h2>{{ r.name }}</h2>
              <p class="rl-talent-hero__risk" [class.is-hot]="r.talent.layoff">
                {{ r.talent.layoffRisk }}
                @if (r.talent.layoff) {
                  · ventana para captar gente
                }
              </p>
              <p>{{ r.talent.recommend }}</p>
              <p class="rl-talent-hero__weak">{{ r.talent.careersUrl || 'Sin URL de careers' }}</p>
            </div>
          </article>

          <div class="rl-talent-split">
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Roles públicos</h2></header>
              <ul class="rl-talent-bars">
                @for (j of r.talent.jobs; track j.id) {
                  <li>
                    <div class="rl-talent-bars__lab">
                      <strong>{{ j.title }}</strong>
                    </div>
                    <p class="rl-vis-path">{{ j.url }}</p>
                  </li>
                } @empty {
                  <li>Sin careers URL — nada que contar.</li>
                }
              </ul>
            </section>
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Señal de recorte</h2></header>
              <p>{{ r.talent.layoffRisk }}</p>
              <p class="rl-own__section-lead">Solo el feed de menciones; no hay score Glassdoor.</p>
            </section>
          </div>
        }

        <section class="rl-panel rl-talent-chart">
          <header class="rl-panel__head"><h2 class="rl-panel__title">Comparativa de roles abiertos</h2></header>
          <rl-echart [options]="chart()" style="--rl-echart-height: 240px" />
        </section>
      </div>
    </ion-content>
  `,
})
export class RivalsTalentPageComponent implements OnInit {
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
    return dataBadgeKind(this.pack().talentSource);
  }

  badgeLabel(): string {
    return dataBadgeLabel(this.pack().talentSource);
  }

  roleBarPct(roles: number): number {
    return Math.min(100, Math.max(4, roles * 4));
  }

  readonly connectedCareers = computed(
    () => this.pack().rivals.filter((r) => r.talent.source === 'connected').length,
  );

  readonly totalRoles = computed(() =>
    this.pack().rivals.reduce((s, r) => s + r.talent.openRoles, 0),
  );

  readonly layoffCount = computed(
    () => this.pack().rivals.filter((r) => r.talent.layoff).length,
  );

  readonly chart = computed((): EChartOptions => {
    const rivals = [...this.pack().rivals].reverse();
    const max = Math.max(8, ...rivals.map((r) => r.talent.openRoles), 1);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 110, right: 28, top: 8, bottom: 24 },
      xAxis: { type: 'value', min: 0, max },
      yAxis: { type: 'category', data: rivals.map((r) => r.name) },
      series: [
        {
          type: 'bar',
          data: rivals.map((r) => r.talent.openRoles),
          itemStyle: { color: '#a78bfa', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 16,
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
