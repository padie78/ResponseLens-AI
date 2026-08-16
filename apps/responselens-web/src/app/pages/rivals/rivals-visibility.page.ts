import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
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
      <div class="rl-page rl-intel">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Visibilidad web</h1>
            <p class="rl-page__lead">
              Tráfico relativo, autoridad y keywords (índice demo). No es Similarweb / Ahrefs.
            </p>
          </div>
          <div class="rl-page__toolbar-actions">
            <p-button
              label="Escanear rivales"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0"
              (onClick)="runScan()"
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
        </div>
        <p class="rl-intel__disclaimer">{{ pack().disclaimer }}</p>

        @if (config.competitors().length === 0) {
          <div class="rl-panel">
            <p>Agregá rivales en <a routerLink="/app/settings">Configuración</a>.</p>
          </div>
        } @else {
          <rl-echart [options]="chart()" style="--rl-echart-height: 320px" />
          <div class="rl-intel__cards">
            @for (r of pack().rivals; track r.name) {
              <article class="rl-panel">
                <header class="rl-panel__head">
                  <h2 class="rl-panel__title">{{ r.visibility.domain }}</h2>
                </header>
                <p class="rl-own__section-lead">{{ r.name }}</p>
                <div class="rl-insight-hero__metrics">
                  <div>
                    <span>Tráfico índice</span>
                    <strong>{{ r.visibility.trafficIndex }}</strong>
                  </div>
                  <div>
                    <span>DA demo</span>
                    <strong>{{ r.visibility.domainAuthority }}</strong>
                  </div>
                  <div>
                    <span>Keywords</span>
                    <strong>{{ r.visibility.organicKeywords | number }}</strong>
                  </div>
                  <div>
                    <span>SoV</span>
                    <strong>{{ r.visibility.shareOfVoicePct }}%</strong>
                  </div>
                  <div>
                    <span>Tendencia 30d</span>
                    <strong>{{ r.visibility.trendPct > 0 ? '+' : '' }}{{ r.visibility.trendPct }}%</strong>
                  </div>
                </div>
                <div class="rl-themes-table" style="margin-top: 1rem">
                  @for (p of r.visibility.pages; track p.path) {
                    <div class="rl-themes-table__row">
                      <strong>{{ p.title }}</strong>
                      <span>{{ p.path }}</span>
                      <span>{{ p.traffic }}</span>
                    </div>
                  }
                </div>
              </article>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class RivalsVisibilityPageComponent implements OnInit {
  readonly config = inject(UserConfigStore);
  readonly alerts = inject(AlertsStore);
  readonly scan = inject(ScanService);

  readonly pack = computed(() =>
    buildRivalSurfaceIntel({
      competitors: this.config.competitors(),
      alerts: this.alerts.items(),
      days: 14,
    }),
  );

  readonly chart = computed((): EChartOptions => {
    const rows = this.pack().visChart;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: '#9aa8c0' } },
      grid: { left: 48, right: 20, top: 24, bottom: 48 },
      xAxis: { type: 'category', data: rows.map((r) => r.name) },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Tráfico índice',
          type: 'bar',
          data: rows.map((r) => r.traffic),
          itemStyle: { color: '#38bdf8' },
        },
        {
          name: 'DA',
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
