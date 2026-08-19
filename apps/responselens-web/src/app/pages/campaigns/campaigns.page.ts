import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildOwnAdsIntel } from '../../engine/own-ads-intel.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';
import { UserConfigStore } from '../../stores/user-config.store';

@Component({
  standalone: true,
  selector: 'rl-campaigns-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, DecimalPipe, RouterLink, ButtonModule],
  template: `
    <ion-content>
      <div class="rl-page rl-campaigns">
        <header class="rl-campaigns__header">
          <div>
            <h1 class="rl-page__title">Mis campañas</h1>
            <p class="rl-page__lead">
              Campañas de ads propios (Meta + Google).
              <span class="rl-badge" [attr.data-kind]="badgeKind()">{{ badgeLabel() }}</span>
            </p>
            <p class="rl-page__disclaimer">{{ intel().disclaimer }}</p>
          </div>
        </header>

        @if (!intel().connected) {
          <section class="rl-campaigns__empty">
            <i class="pi pi-megaphone" style="font-size: 2.5rem; opacity: .3"></i>
            <p>Sin cuenta de ads conectada.</p>
            <p>
              Cargá tu <strong>Meta Ads Account ID</strong> o <strong>Google Ads Customer ID</strong>
              en <a routerLink="/app/settings" [queryParams]="{ tab: 'integraciones' }">Config → Integraciones</a>.
            </p>
          </section>
        } @else {
          <section class="rl-campaigns__kpis">
            <div class="rl-kpi">
              <span class="rl-kpi__value">{{ activeCampaigns().length }}</span>
              <span class="rl-kpi__label">Activas</span>
            </div>
            <div class="rl-kpi">
              <span class="rl-kpi__value">\${{ intel().totalSpend7d }}</span>
              <span class="rl-kpi__label">Gasto 7d (band)</span>
            </div>
            <div class="rl-kpi">
              <span class="rl-kpi__value">{{ topCtrLabel() }}</span>
              <span class="rl-kpi__label">Mejor CTR</span>
            </div>
          </section>

          <section class="rl-campaigns__grid">
            @for (camp of intel().campaigns; track camp.id) {
              <article class="rl-campaign-card" [attr.data-status]="camp.status">
                <header class="rl-campaign-card__head">
                  <span class="rl-campaign-card__platform">{{ camp.platform === 'meta' ? 'Meta' : 'Google' }}</span>
                  <span class="rl-campaign-card__status">{{ camp.status }}</span>
                </header>
                <h3 class="rl-campaign-card__name">{{ camp.name }}</h3>
                <ul class="rl-campaign-card__facts">
                  <li><strong>Gasto 7d:</strong> \${{ camp.spend7d }} ({{ camp.spendBand }})</li>
                  <li><strong>Impresiones:</strong> {{ camp.impressions | number }}</li>
                  <li><strong>Clicks:</strong> {{ camp.clicks | number }}</li>
                  <li><strong>CTR:</strong> {{ camp.ctrPct }}</li>
                  <li><strong>Inicio:</strong> {{ camp.startedAt }}</li>
                  @if (camp.endedAt) {
                    <li><strong>Fin:</strong> {{ camp.endedAt }}</li>
                  }
                </ul>
              </article>
            }
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .rl-campaigns__empty {
      text-align: center;
      padding: 4rem 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .75rem;
    }
    .rl-campaigns__kpis {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }
    .rl-campaigns__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }
    .rl-campaign-card {
      background: var(--rl-surface-card, #fff);
      border: 1px solid var(--rl-border, #e5e7eb);
      border-radius: .75rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .rl-campaign-card[data-status="paused"] { opacity: .7; }
    .rl-campaign-card[data-status="ended"] { opacity: .5; }
    .rl-campaign-card__head {
      display: flex;
      justify-content: space-between;
      font-size: .75rem;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .rl-campaign-card__platform { font-weight: 600; }
    .rl-campaign-card__status { opacity: .6; }
    .rl-campaign-card__name { font-size: 1rem; font-weight: 600; margin: 0; }
    .rl-campaign-card__facts {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: .85rem;
      display: flex;
      flex-direction: column;
      gap: .25rem;
    }
  `],
})
export class CampaignsPageComponent {
  protected readonly config = inject(UserConfigStore);

  protected readonly intel = computed(() => {
    const company = this.config.config()?.company;
    return buildOwnAdsIntel({
      companyName: company?.companyName,
      metaAdsAccountId: company?.metaAdsAccountId,
      googleAdsCustomerId: company?.googleAdsCustomerId,
    });
  });

  protected readonly activeCampaigns = computed(() =>
    this.intel().campaigns.filter((c: { status: string }) => c.status === 'active'),
  );

  protected readonly topCtrLabel = computed(() => {
    const top = this.intel().topCampaign;
    return top ? `${top.ctrPct} — ${top.name}` : '—';
  });

  protected badgeKind(): string {
    return dataBadgeKind(this.intel().source);
  }

  protected badgeLabel(): string {
    return dataBadgeLabel(this.intel().source);
  }
}
