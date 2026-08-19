import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import {
  crisisRivals,
  hottestRivalName,
  listLeads,
  loadCrisisThreshold,
  slaBreached,
} from '../../engine/ops-queue.js';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';

@Component({
  standalone: true,
  selector: 'rl-overview-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Inicio</h1>
        <p class="rl-page__lead">
          {{ config.hasCompany() ? config.companyName() : 'Configurá tu marca' }} · el trabajo de hoy, no un dashboard vacío.
        </p>

        @if (!config.hasCompany()) {
          <div class="rl-page__panel">
            <p>
              Empezá por <a routerLink="/app/settings">Config</a>: nombre público y 3–5 rivales.
              Sin eso el cron y Forzar ahora no tienen query.
            </p>
          </div>
        }

        @if (crises().length) {
          <p class="rl-page__status">
            Crisis de rival (≥ {{ threshold() }} menciones / 24 h):
            {{ crisisLabel() }}.
            <a routerLink="/app/competitors">Abrir radar</a>
          </p>
        }

        <div class="rl-kpi-grid">
          <a class="rl-kpi" routerLink="/app/own" [queryParams]="{ inbox: 'urgent' }">
            <span class="rl-kpi__label">Crisis / urgentes</span>
            <strong class="rl-kpi__value">{{ alerts.newOwnCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/own" [queryParams]="{ inbox: 'sla' }">
            <span class="rl-kpi__label">SLA vencido</span>
            <strong class="rl-kpi__value">{{ slaCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/competitors">
            <span class="rl-kpi__label">Señales de rivales</span>
            <strong class="rl-kpi__value">{{ alerts.newRivalCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/alerts">
            <span class="rl-kpi__label">Alertas sin leer</span>
            <strong class="rl-kpi__value">{{ alerts.unreadArrivalCount() }}</strong>
          </a>
          <a class="rl-kpi" routerLink="/app/settings">
            <span class="rl-kpi__label">Empresa</span>
            <strong class="rl-kpi__value">{{ config.hasCompany() ? config.companyName() : 'Configurar' }}</strong>
          </a>
        </div>

        <h2 class="rl-panel__title">Hoy</h2>
        <div class="rl-today">
          <section class="rl-panel">
            <header class="rl-panel__head"><h3 class="rl-panel__title">3 urgentes propios</h3></header>
            @for (a of urgentOwn(); track a.alertId) {
              <a class="rl-today__row" routerLink="/app/own" [queryParams]="{ inbox: 'urgent' }">
                <strong>{{ a.competitorName }}</strong>
                <span>{{ snippet(a.originalComplaint) }}</span>
              </a>
            } @empty {
              <p class="rl-empty">Sin urgentes abiertos.</p>
            }
          </section>
          <section class="rl-panel">
            <header class="rl-panel__head"><h3 class="rl-panel__title">3 leads rivales</h3></header>
            @for (a of leads(); track a.alertId) {
              <a class="rl-today__row" routerLink="/app/competitors">
                <strong>{{ a.competitorName }}</strong>
                <span>{{ snippet(a.originalComplaint) }}</span>
              </a>
            } @empty {
              <p class="rl-empty">Sin intención de cambio abierta.</p>
            }
          </section>
          <section class="rl-panel">
            <header class="rl-panel__head"><h3 class="rl-panel__title">Ficha caliente</h3></header>
            @if (hotRival()) {
              <p>{{ hotRival() }}</p>
              <a routerLink="/app/rivals/battlecards">Abrir ficha de batalla</a>
            } @else {
              <p class="rl-empty">Cargá rivales o corré un scan.</p>
            }
          </section>
        </div>

        <h2 class="rl-panel__title" style="margin: 1.75rem 0 0.85rem">Ir a</h2>
        <div class="rl-overview-links">
          <a routerLink="/app/own/audit">Auditoría de marca</a>
          <a routerLink="/app/digest">Digest diario</a>
          <a routerLink="/app/rivals/battlecards">Fichas de batalla</a>
          <a routerLink="/app/ranking">Ranking</a>
          <a routerLink="/app/stats">Insights</a>
          <a routerLink="/app/rivals/ads">Radar de anuncios</a>
          <a routerLink="/app/rivals/talent">Talento</a>
          <a routerLink="/app/rivals/visibility">Visibilidad web</a>
          <a routerLink="/app/history">Historial</a>
          <a routerLink="/app/discovery">Feed global</a>
          <a routerLink="/app/trends">Tendencias</a>
        </div>
      </div>
    </ion-content>
  `,
})
export class OverviewPageComponent {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);

  readonly ready = computed(() => this.config.hasCompany());
  readonly threshold = computed(() => loadCrisisThreshold());

  readonly slaCount = computed(
    () => this.alerts.items().filter((a) => a.brandScope === 'own' && slaBreached(a)).length,
  );

  readonly crises = computed(() => crisisRivals(this.alerts.items(), this.threshold()));

  readonly crisisLabel = computed(() =>
    this.crises()
      .map((c) => `${c.name} (${c.count})`)
      .join(' · '),
  );

  readonly urgentOwn = computed(() =>
    this.alerts
      .items()
      .filter(
        (a) =>
          a.brandScope === 'own' &&
          (a.status === 'NEW' || a.status === 'SNOOZED') &&
          (a.severity === 'HIGH' || a.severity === 'CRITICAL'),
      )
      .slice(0, 3),
  );

  readonly leads = computed(() => listLeads(this.alerts.items()).slice(0, 3));

  readonly hotRival = computed(
    () => hottestRivalName(this.alerts.items()) || this.config.competitors()[0]?.name || '',
  );

  snippet(text: string): string {
    const t = String(text || '').trim();
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  }
}
