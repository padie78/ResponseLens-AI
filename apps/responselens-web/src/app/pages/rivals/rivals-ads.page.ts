import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { ScanBlockerComponent } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-rivals-ads-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, ButtonModule, TagModule, ScanBlockerComponent],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />
      <div class="rl-page rl-intel">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Radar de anuncios</h1>
            <p class="rl-page__lead">
              Creatividades y campañas de rivales (demo). No es el Ads Library en vivo.
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
          <div class="rl-insight-hero__metrics rl-intel__kpis">
            <div>
              <span>Creatividades</span>
              <strong>{{ pack().adRows.length }}</strong>
            </div>
            <div>
              <span>Rivales</span>
              <strong>{{ pack().rivals.length }}</strong>
            </div>
            <div>
              <span>Activas (demo)</span>
              <strong>{{ activeCount() }}</strong>
            </div>
          </div>

          <section class="rl-panel">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Campañas</h2></header>
            <div class="rl-themes-table">
              @for (row of pack().adRows; track row.id) {
                <div class="rl-themes-table__row rl-intel__ad">
                  <div>
                    <strong>{{ row.rival }}</strong>
                    <p class="rl-audit-sample">{{ row.headline }}</p>
                    <p class="rl-audit-sample">{{ row.body }}</p>
                  </div>
                  <span>{{ row.platform }}</span>
                  <span>{{ row.cta }}</span>
                  <span>{{ row.spendBand }} · {{ row.daysLive }}d</span>
                  <p-tag [value]="row.status" [severity]="row.status === 'Activo' ? 'success' : 'secondary'" />
                </div>
              }
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class RivalsAdsPageComponent implements OnInit {
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

  readonly activeCount = computed(
    () => this.pack().adRows.filter((r) => r.status === 'Activo').length,
  );

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
