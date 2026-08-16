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
  selector: 'rl-rivals-talent-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, DecimalPipe, RouterLink, ButtonModule, ScanBlockerComponent, EchartComponent],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />
      <div class="rl-page rl-intel">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Reputación y talento</h1>
            <p class="rl-page__lead">
              Employer brand ilustrativo (rating, roles, temas). No es Glassdoor en vivo.
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
          <rl-echart [options]="chart()" style="--rl-echart-height: 280px" />
          <div class="rl-intel__cards">
            @for (r of pack().rivals; track r.name) {
              <article class="rl-panel rl-intel__card">
                <header class="rl-panel__head">
                  <h2 class="rl-panel__title">{{ r.name }}</h2>
                </header>
                <div class="rl-insight-hero__metrics">
                  <div>
                    <span>Rating demo</span>
                    <strong>{{ r.talent.rating }}</strong>
                  </div>
                  <div>
                    <span>Reviews</span>
                    <strong>{{ r.talent.reviews | number }}</strong>
                  </div>
                  <div>
                    <span>Roles abiertos</span>
                    <strong>{{ r.talent.openRoles }}</strong>
                  </div>
                  <div>
                    <span>Riesgo</span>
                    <strong>{{ r.talent.layoffRisk }}</strong>
                  </div>
                </div>
                <div class="rl-themes-table" style="margin-top: 1rem">
                  @for (t of r.talent.themes; track t.id) {
                    <div class="rl-themes-table__row">
                      <strong>{{ t.label }}</strong>
                      <span>{{ t.score }}/100</span>
                    </div>
                  }
                </div>
                @for (q of r.talent.quotes; track q.text) {
                  <blockquote class="rl-intel__quote">
                    <p>{{ q.text }}</p>
                    <footer>{{ q.theme }}</footer>
                  </blockquote>
                }
              </article>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class RivalsTalentPageComponent implements OnInit {
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
    const rivals = this.pack().rivals;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 120, right: 28, top: 16, bottom: 28 },
      xAxis: { type: 'value', min: 0, max: 5 },
      yAxis: { type: 'category', data: rivals.map((r) => r.name) },
      series: [
        {
          type: 'bar',
          data: rivals.map((r) => r.talent.rating),
          itemStyle: { color: '#a78bfa', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 18,
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
