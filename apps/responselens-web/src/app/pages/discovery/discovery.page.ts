import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { HistoryStore } from '../../stores/history.store';
import { buildMarketFeed } from '../../engine/market-intel.js';
import { loadMarketPrefs, saveMarketPrefs } from '../../engine/market-prefs.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';

@Component({
  standalone: true,
  selector: 'rl-discovery-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink],
  template: `
    <ion-content>
      <div class="rl-page">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Feed global</h1>
            <p class="rl-page__lead">
              Conversación de industria acotada por tus keywords, no un crawler global infinito.
              <span class="rl-data-badge" [class]="'rl-data-badge--' + badgeKind()">{{ badgeLabel() }}</span>
            </p>
            <p class="rl-page__disclaimer">{{ feed().disclaimer }}</p>
          </div>
        </header>

        @if (!feed().keywords.length) {
          <section class="rl-panel">
            <p>Faltan keywords de industria.</p>
            <p>
              Cargalas en <a routerLink="/app/settings" [queryParams]="{ tab: 'empresa' }">Config → Mi empresa</a>
              para activar este módulo.
            </p>
          </section>
        } @else {
          <section class="rl-panel" style="margin-bottom: 1rem">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Keywords activas</h2></header>
            <div style="display:flex; flex-wrap:wrap; gap:.5rem">
              @for (kw of feed().keywords; track kw) {
                <span class="rl-badge rl-badge--sent-neu">{{ kw }}</span>
              }
            </div>
          </section>

          <section class="rl-panel" style="margin-bottom: 1rem">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Research inbox</h2></header>
            @for (item of researchInbox(); track item.id) {
              <article style="padding:.75rem 0; border-top:1px solid var(--rl-border, #e5e7eb)">
                <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; font-size:.8rem; opacity:.75">
                  <span>{{ item.label || 'Mercado' }}</span>
                  <span>{{ item.at.slice(0, 16).replace('T', ' ') }}</span>
                </div>
                <p style="margin:.25rem 0 0; font-size:.9rem">{{ item.text }}</p>
                <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.5rem">
                  <span class="rl-badge rl-badge--sent-neu">{{ researchStatus(item.id) }}</span>
                  <button type="button" class="rl-settings__ghost" (click)="setResearchStatus(item.id, 'nuevo')">Nuevo</button>
                  <button type="button" class="rl-settings__ghost" (click)="setResearchStatus(item.id, 'revisando')">Revisando</button>
                  <button type="button" class="rl-settings__ghost" (click)="setResearchStatus(item.id, 'convertido')">Convertido</button>
                  <button type="button" class="rl-settings__ghost" (click)="setResearchStatus(item.id, 'descartado')">Descartado</button>
                </div>
              </article>
            } @empty {
              <p>No hay insights guardados todavía. Usá “Guardar insight” desde una señal del feed.</p>
            }
          </section>

          <section class="rl-panel" style="margin-bottom: 1rem">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Filtros</h2></header>
            <div class="rl-settings__grid">
              <label class="rl-settings__label">
                Keyword
                <select class="rl-settings__input" [value]="selectedKeyword()" (change)="setKeyword($any($event.target).value)">
                  <option value="all">Todas</option>
                  @for (kw of feed().keywords; track kw) {
                    <option [value]="kw">{{ kw }}</option>
                  }
                </select>
              </label>
              <label class="rl-settings__label">
                Canal
                <select class="rl-settings__input" [value]="selectedChannel()" (change)="setChannel($any($event.target).value)">
                  <option value="all">Todos</option>
                  @for (channel of feed().channels; track channel) {
                    <option [value]="channel">{{ channel }}</option>
                  }
                </select>
              </label>
              <label class="rl-settings__label">
                Severidad
                <select class="rl-settings__input" [value]="selectedSeverity()" (change)="setSeverity($any($event.target).value)">
                  <option value="all">Todas</option>
                  @for (sev of feed().severities; track sev) {
                    <option [value]="sev">{{ sev }}</option>
                  }
                </select>
              </label>
            </div>
            <p class="rl-page__disclaimer">Mostrando {{ filteredRows().length }} de {{ feed().rows.length }} menciones.</p>
            @if (notice()) {
              <p class="rl-page__status">{{ notice() }}</p>
            }
          </section>

          <section class="rl-panel">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Menciones de mercado</h2></header>
            @for (row of filteredRows(); track row.id) {
              <article style="padding:1rem 0; border-top:1px solid var(--rl-border, #e5e7eb)">
                <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; font-size:.8rem; opacity:.75">
                  <span>{{ row.source }} · {{ row.keyword }} · {{ row.theme }}</span>
                  <span>{{ row.severity }} · {{ row.detectedAt.slice(0, 16).replace('T', ' ') }}</span>
                </div>
                <h3 style="margin:.35rem 0 .25rem; font-size:1rem">{{ row.headline }}</h3>
                <p style="margin:0; font-size:.9rem">{{ row.snippet }}</p>
                <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.5rem">
                  <button type="button" class="rl-settings__ghost" (click)="saveInsight(row)">Guardar insight</button>
                  <button type="button" class="rl-settings__ghost" (click)="promoteKeyword(row.keyword)">Promover keyword</button>
                  <button type="button" class="rl-settings__ghost" (click)="promoteTheme(row.theme)">Promover tema</button>
                  <button type="button" class="rl-settings__ghost" (click)="createRival(row)">Crear rival</button>
                  <button type="button" class="rl-settings__ghost" (click)="addCompanyAlias(row.keyword)">Agregar alias marca</button>
                  <button type="button" class="rl-settings__ghost" (click)="sendToCompetitorRadar(row)">Enviar a Competencia</button>
                </div>
              </article>
            } @empty {
              <p>Sin actividad para las keywords configuradas.</p>
            }
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class DiscoveryPageComponent implements OnInit {
  private readonly alerts = inject(AlertsStore);
  private readonly config = inject(UserConfigStore);
  private readonly history = inject(HistoryStore);
  readonly selectedKeyword = signal('all');
  readonly selectedChannel = signal('all');
  readonly selectedSeverity = signal('all');
  readonly notice = signal('');
  readonly researchState = signal<Record<string, string>>({});

  readonly feed = computed(() =>
    buildMarketFeed({
      alerts: this.alerts.items(),
      industryKeywords: this.config.config()?.company?.industryKeywords ?? [],
      marketCategory: this.config.config()?.company?.marketCategory ?? '',
      whatTheySell: this.config.config()?.company?.whatTheySell ?? '',
    }),
  );

  readonly filteredRows = computed(() =>
    this.feed().rows.filter((row) => {
      if (this.selectedKeyword() !== 'all' && row.keyword !== this.selectedKeyword()) return false;
      if (this.selectedChannel() !== 'all' && row.source !== this.selectedChannel()) return false;
      if (this.selectedSeverity() !== 'all' && row.severity !== this.selectedSeverity()) return false;
      return true;
    }),
  );

  readonly researchInbox = computed(() =>
    this.history
      .items()
      .filter((item) => item.kind === 'analyze' && String(item.label || '').startsWith('Mercado'))
      .slice(0, 8),
  );

  badgeKind(): string {
    return dataBadgeKind(this.feed().source);
  }

  badgeLabel(): string {
    return dataBadgeLabel(this.feed().source);
  }

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
    this.history.load();
    const prefs = loadMarketPrefs(
      'discovery',
      this.config.activeWorkspaceId(),
      this.config.companyName(),
      { keyword: 'all', channel: 'all', severity: 'all' },
    );
    this.selectedKeyword.set(String(prefs.keyword || 'all'));
    this.selectedChannel.set(String(prefs.channel || 'all'));
    this.selectedSeverity.set(String(prefs.severity || 'all'));
    this.researchState.set(
      prefs.researchState && typeof prefs.researchState === 'object' ? prefs.researchState : {},
    );
  }

  private persistPrefs(): void {
    saveMarketPrefs('discovery', this.config.activeWorkspaceId(), this.config.companyName(), {
      keyword: this.selectedKeyword(),
      channel: this.selectedChannel(),
      severity: this.selectedSeverity(),
      researchState: this.researchState(),
    });
  }

  setKeyword(value: string): void {
    this.selectedKeyword.set(String(value || 'all'));
    this.persistPrefs();
  }

  setChannel(value: string): void {
    this.selectedChannel.set(String(value || 'all'));
    this.persistPrefs();
  }

  setSeverity(value: string): void {
    this.selectedSeverity.set(String(value || 'all'));
    this.persistPrefs();
  }

  saveInsight(row: { id: string; headline: string; keyword: string; theme: string; severity: string }): void {
    this.history.add({
      kind: 'analyze',
      label: `Mercado · ${row.keyword}`,
      riskLevel: row.severity,
      text: `${row.headline} · tema ${row.theme}`,
      alertId: row.id,
    });
    this.flash('Insight guardado en Historial.');
  }

  async promoteKeyword(value: string): Promise<void> {
    await this.promoteValue(value);
  }

  async promoteTheme(value: string): Promise<void> {
    await this.promoteValue(value);
  }

  private async promoteValue(value: string): Promise<void> {
    const cfg = this.config.config();
    if (!cfg) return;
    const next = [...new Set([...(cfg.company.industryKeywords || []), String(value || '').trim()])].filter(Boolean);
    await this.config.save({ ...cfg.company, industryKeywords: next }, cfg.competitors);
    this.flash(`Se agregó “${value}” a las keywords de industria.`);
  }

  async addCompanyAlias(value: string): Promise<void> {
    const cfg = this.config.config();
    if (!cfg) return;
    const next = [...new Set([...(cfg.company.aliases || []), String(value || '').trim()])].filter(Boolean);
    await this.config.save({ ...cfg.company, aliases: next }, cfg.competitors);
    this.flash(`Se agregó “${value}” como alias de marca.`);
  }

  async createRival(row: { keyword: string; theme: string }): Promise<void> {
    const cfg = this.config.config();
    if (!cfg) return;
    const name = String(row.keyword || '').trim();
    if (!name) return;
    const exists = cfg.competitors.some((c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      this.flash(`El rival “${name}” ya existe.`);
      return;
    }
    const nextCompetitors = [
      ...cfg.competitors,
      {
        name,
        aliases: row.theme ? [row.theme] : [],
        websiteUrl: '',
        socialHandles: [],
        statusUrl: '',
        pricingUrl: '',
        careersUrl: '',
      },
    ];
    await this.config.save(cfg.company, nextCompetitors);
    this.flash(`Se creó el rival “${name}”.`);
  }

  researchStatus(id: string): string {
    return this.researchState()[id] || 'nuevo';
  }

  setResearchStatus(id: string, status: 'nuevo' | 'revisando' | 'convertido' | 'descartado'): void {
    this.researchState.update((state) => ({ ...state, [id]: status }));
    this.persistPrefs();
    this.flash(`Research marcado como ${status}.`);
  }

  async sendToCompetitorRadar(row: {
    id: string;
    headline: string;
    snippet: string;
    keyword: string;
    theme: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
    source: string;
  }): Promise<void> {
    const cfg = this.config.config();
    if (!cfg) return;
    const existingRival = cfg.competitors.find(
      (c) => String(c.name || '').trim().toLowerCase() === String(row.keyword || '').trim().toLowerCase(),
    );
    const rivalName = existingRival?.name || `Market: ${row.keyword}`;
    if (!existingRival) {
      await this.createRival({ keyword: rivalName, theme: row.theme });
    }
    await this.alerts.upsertMany([
      {
        alertId: `market_${crypto.randomUUID().slice(0, 10)}`,
        userId: this.config.config()?.userId || 'local-user',
        workspaceId: this.config.activeWorkspaceId() || undefined,
        competitorName: rivalName,
        originalComplaint: row.snippet || row.headline,
        sourceUrl: '',
        channel: row.source || 'market',
        severity: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(row.severity) ? row.severity : 'MEDIUM') as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | 'CRITICAL',
        frustrationScore: null,
        salesPitch: '',
        detectedAt: new Date().toISOString(),
        status: 'NEW',
        notes: `Signal promoted from market feed · theme=${row.theme}`,
        brandScope: 'rival',
        sentiment: 'mixed',
        inboundSource: 'market',
        _brandScope: 'rival',
        _mentionKind: 'market',
        _analysisSummary: row.headline,
        _insight: { tipo: 'market', lectura: row.snippet, accion: 'Revisar en radar competitivo', tip: row.theme },
      },
    ]);
    this.flash(`Señal enviada a Competencia como “${rivalName}”.`);
  }

  private flash(message: string): void {
    this.notice.set(message);
    window.setTimeout(() => this.notice.set(''), 2400);
  }
}
