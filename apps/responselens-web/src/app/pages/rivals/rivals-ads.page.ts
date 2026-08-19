import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
import { buildRivalSocialAdsIntel } from '../../engine/rival-social-ads-intel.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { ScanBlockerComponent } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-rivals-ads-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, ButtonModule, ScanBlockerComponent],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />
      <div class="rl-page rl-intel rl-ads">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Radar de anuncios</h1>
            <p class="rl-page__lead">
              Cómo se promocionan tus rivales en Meta Ad Library: copy, CTA y fechas.
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
            <i class="pi pi-th-large rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ pack().adRows.length }}</strong>
            <span>Creatividades</span>
          </div>
          <div class="rl-own__kpi" data-tone="pending">
            <i class="pi pi-users rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ pack().rivals.length }}</strong>
            <span>Rivales</span>
          </div>
          <div class="rl-own__kpi" data-tone="responded">
            <i class="pi pi-play rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ activeCount() }}</strong>
            <span>Activas</span>
          </div>
          <div class="rl-own__kpi" data-tone="snoozed">
            <i class="pi pi-pause rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ pausedCount() }}</strong>
            <span>En pausa</span>
          </div>
        </div>

        <div class="rl-ads__filters">
          <div class="rl-intel__pills" role="group" aria-label="Rival">
            <button type="button" class="rl-intel__pill" [class.is-active]="rival() === 'all'" (click)="rival.set('all')">
              Todos
            </button>
            @for (r of pack().rivals; track r.name) {
              <button
                type="button"
                class="rl-intel__pill"
                [class.is-active]="rival() === r.name"
                (click)="rival.set(r.name)"
              >
                {{ r.name }}
              </button>
            }
          </div>
          <div class="rl-intel__pills" role="group" aria-label="Plataforma">
            <button type="button" class="rl-intel__pill" [class.is-active]="platform() === 'all'" (click)="platform.set('all')">
              Todas las redes
            </button>
            @for (p of platforms(); track p) {
              <button
                type="button"
                class="rl-intel__pill"
                [class.is-active]="platform() === p"
                (click)="platform.set(p)"
              >
                {{ p }}
              </button>
            }
          </div>
        </div>

        <div class="rl-ads__grid">
          @for (row of visible(); track row.id) {
            <article class="rl-ad-card" [attr.data-platform]="row.platform" [attr.data-status]="row.status">
              <div class="rl-ad-card__preview" aria-hidden="true">
                <i class="pi" [class]="platformIcon(row.platform)"></i>
                <span>{{ row.format }}</span>
              </div>
              <div class="rl-ad-card__body">
                <div class="rl-ad-card__meta">
                  <strong class="rl-ad-card__rival">{{ row.rival }}</strong>
                  <span class="rl-ad-card__plat">{{ row.platform }}</span>
                  <span class="rl-ad-card__status" [class.is-on]="row.status === 'Activo'">{{ row.status }}</span>
                </div>
                <h2 class="rl-ad-card__headline">{{ row.headline }}</h2>
                <p class="rl-ad-card__copy">{{ row.body }}</p>
                <div class="rl-ad-card__cta-row">
                  <span class="rl-ad-card__cta">{{ row.cta }}</span>
                  <span class="rl-ad-card__land">{{ host(row.landing) }}</span>
                </div>
                <dl class="rl-ad-card__facts">
                  <div>
                    <dt>Ángulo</dt>
                    <dd>{{ row.angle }}</dd>
                  </div>
                  <div>
                    <dt>Desde</dt>
                    <dd>{{ row.startedAt || (row.daysLive + ' d') }}</dd>
                  </div>
                  <div>
                    <dt>Al aire</dt>
                    <dd>{{ row.daysLive }} días</dd>
                  </div>
                </dl>
              </div>
            </article>
          } @empty {
            <p class="rl-empty">Nada con ese filtro.</p>
          }
        </div>

        <section class="rl-panel" style="margin-top: 1.25rem">
          <header class="rl-panel__head">
            <h2 class="rl-panel__title">
              Social Ads (TikTok / LinkedIn)
              <span class="rl-data-badge" [class]="'rl-data-badge--' + socialAdsBadgeKind()">{{ socialAdsBadge() }}</span>
            </h2>
          </header>
          <p class="rl-page__disclaimer">{{ socialAdsIntel().disclaimer }}</p>
          @if (socialAdsIntel().connected) {
            <p style="margin-top: .5rem">Activos: <strong>{{ socialAdsIntel().totalActive }}</strong></p>
            @for (ad of socialAdsAll(); track ad.id) {
              <article class="rl-ad-card" style="margin-top: .5rem; padding: .75rem; border: 1px solid var(--rl-border, #e5e7eb); border-radius: .5rem">
                <div style="display: flex; justify-content: space-between; font-size: .8rem; text-transform: uppercase">
                  <span style="font-weight: 600">{{ ad.platform }}</span>
                  <span style="opacity: .6">{{ ad.active ? 'Activo' : 'Pausado' }}</span>
                </div>
                <p style="font-size: .85rem; margin: .25rem 0 0">{{ ad.format }} · {{ ad.objective }} · {{ ad.engagementPct }} eng. · {{ ad.spendBand }}</p>
              </article>
            }
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class RivalsAdsPageComponent implements OnInit {
  readonly config = inject(UserConfigStore);
  readonly alerts = inject(AlertsStore);
  readonly scan = inject(ScanService);
  readonly rival = signal('all');
  readonly platform = signal('all');

  readonly pack = computed(() =>
    buildRivalSurfaceIntel({
      competitors: this.config.competitors(),
      alerts: this.alerts.items(),
      days: 14,
    }),
  );

  badgeKind(): string {
    return dataBadgeKind(this.pack().adsSource);
  }

  badgeLabel(): string {
    return dataBadgeLabel(this.pack().adsSource);
  }

  readonly platforms = computed(() => [...new Set(this.pack().adRows.map((r) => r.platform))]);

  readonly visible = computed(() => {
    const rival = this.rival();
    const platform = this.platform();
    return this.pack().adRows.filter((r) => {
      if (rival !== 'all' && r.rival !== rival) return false;
      if (platform !== 'all' && r.platform !== platform) return false;
      return true;
    });
  });

  readonly activeCount = computed(
    () => this.pack().adRows.filter((r) => r.status === 'Activo').length,
  );

  readonly pausedCount = computed(
    () => this.pack().adRows.filter((r) => r.status !== 'Activo').length,
  );

  readonly socialAdsIntel = computed(() => {
    const company = this.config.config()?.company;
    const competitors = this.config.competitors();
    const first = competitors[0];
    if (!first) return { source: 'demo' as const, connected: false, disclaimer: 'Sin rivales configurados.', tiktokAds: [], linkedinAds: [], totalActive: 0 };
    return buildRivalSocialAdsIntel({
      competitor: first,
      tiktokAdsAccountId: company?.tiktokAdsAccountId,
      linkedinAdsAccountId: company?.linkedinAdsAccountId,
    });
  });

  readonly socialAdsAll = computed(() =>
    [...this.socialAdsIntel().tiktokAds, ...this.socialAdsIntel().linkedinAds],
  );

  socialAdsBadgeKind(): string { return dataBadgeKind(this.socialAdsIntel().source); }
  socialAdsBadge(): string { return dataBadgeLabel(this.socialAdsIntel().source); }

  platformIcon(platform: string): string {
    if (platform === 'Meta') return 'pi-facebook';
    if (platform === 'Google Ads') return 'pi-google';
    if (platform === 'YouTube') return 'pi-youtube';
    if (platform === 'LinkedIn') return 'pi-linkedin';
    return 'pi-megaphone';
  }

  host(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

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
