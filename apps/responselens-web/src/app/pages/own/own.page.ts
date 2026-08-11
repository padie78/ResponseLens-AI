import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import {
  createAlertId,
  type CompetitorAlert,
} from '../../models/alert.model';
import { ReplyService, type LocalReplyResult } from '../../services/reply.service';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { HistoryStore } from '../../stores/history.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { filterAlerts } from '../../utils/alert-filters';
import {
  AlertCardComponent,
  FeedFiltersComponent,
  ScanBlockerComponent,
  type FeedFilterState,
} from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-own-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    IonContent,
    RouterLink,
    FormsModule,
    AlertCardComponent,
    FeedFiltersComponent,
    ScanBlockerComponent,
  ],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />

      <div class="rl-page">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Propios</h1>
            <p class="rl-page__lead">
              Menciones y crisis de {{ config.companyName() || 'tu marca' }}.
            </p>
          </div>
          <div class="rl-page__toolbar-actions">
            <button
              type="button"
              class="rl-auth-gate__submit rl-page__btn-inline"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (click)="runScan()"
            >
              Escanear marca
            </button>
            <button type="button" class="rl-settings__ghost" (click)="refresh()">Refrescar</button>
            <button type="button" class="rl-settings__ghost" (click)="seed()">Ejemplos</button>
          </div>
        </div>

        @if (scan.lastStatus() && !scan.scanning()) {
          <p class="rl-page__status">{{ scan.lastStatus() }}</p>
        }

        @if (config.hasCompany()) {
          <div class="rl-brand-bar">
            <strong>{{ config.companyName() }}</strong>
            @if (companyAliases().length) {
              <span class="rl-brand-bar__aliases">
                {{ companyAliases().join(' · ') }}
              </span>
            }
          </div>
        } @else {
          <div class="rl-page__panel">
            <p>
              Configurá tu empresa en <a routerLink="/app/settings">Config</a> antes de escanear.
            </p>
          </div>
        }

        <rl-feed-filters mode="own" (filterChange)="onFilterChange($event)" />

        <div class="rl-layout-split">
          <section class="rl-layout-split__main">
            @if (alerts.loading()) {
              <p class="rl-page__lead">Cargando…</p>
            } @else if (filtered().length === 0) {
              <div class="rl-page__panel">
                <p>No hay menciones propias con estos filtros.</p>
              </div>
            } @else {
              <div class="rl-feed">
                @for (item of filtered(); track item.alertId) {
                  <rl-alert-card
                    [alert]="item"
                    [showAnalyze]="true"
                    [selected]="selectedId() === item.alertId"
                    (select)="selectAlert($event)"
                    (dismiss)="onDismiss($event)"
                    (analyze)="analyzeAlert($event)"
                  />
                }
              </div>
            }

            <form class="rl-manual-form rl-page__panel" (ngSubmit)="submitManual()">
              <h2 class="rl-settings__h">Mención manual</h2>
              <label class="rl-settings__label">
                Texto
                <textarea
                  class="rl-settings__input rl-settings__textarea"
                  rows="3"
                  [(ngModel)]="manualText"
                  name="manualText"
                  placeholder="Pegá el comentario o queja…"
                  required
                ></textarea>
              </label>
              <label class="rl-settings__label">
                URL (opcional)
                <input class="rl-settings__input" [(ngModel)]="manualUrl" name="manualUrl" placeholder="https://…" />
              </label>
              <div class="rl-manual-form__actions">
                <button type="submit" class="rl-settings__ghost">Agregar</button>
                <button type="button" class="rl-auth-gate__submit rl-page__btn-inline" (click)="submitManual(true)">
                  Agregar y analizar
                </button>
              </div>
            </form>
          </section>

          @if (selectedAlert(); as sel) {
            <aside class="rl-workspace">
              <h2 class="rl-workspace__title">Workspace</h2>
              <p class="rl-workspace__preview">{{ sel.originalComplaint }}</p>

              @if (replyResult(); as rr) {
                <div class="rl-workspace__triage">
                  <p><strong>Riesgo:</strong> {{ rr.triage.riskLevel }} ({{ rr.triage.riskScore }})</p>
                  <p>{{ rr.triage.summary }}</p>
                  <p><strong>Acción:</strong> {{ rr.triage.recommendedAction }}</p>
                </div>

                @for (opt of rr.options; track opt.tone) {
                  <div class="rl-workspace__option" [class.rl-workspace__option--rec]="opt.recommended">
                    <p class="rl-workspace__option-label">
                      {{ opt.label }}
                      @if (opt.recommended) {
                        <span class="rl-alert__badge">Recomendada</span>
                      }
                    </p>
                    <p class="rl-workspace__option-body">{{ opt.body }}</p>
                    <button type="button" class="rl-settings__ghost" (click)="copy(opt.body)">Copiar respuesta</button>
                  </div>
                }
              } @else {
                <button type="button" class="rl-auth-gate__submit" (click)="analyzeAlert(sel.alertId)">
                  Analizar respuesta
                </button>
              }

              <button type="button" class="rl-settings__ghost rl-workspace__responded" (click)="markResponded(sel.alertId)">
                Marcar respondido
              </button>
            </aside>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class OwnPageComponent implements OnInit {
  readonly alerts = inject(AlertsStore);
  readonly config = inject(UserConfigStore);
  readonly scan = inject(ScanService);
  readonly reply = inject(ReplyService);
  readonly history = inject(HistoryStore);

  readonly filters = signal<FeedFilterState>({
    status: 'all',
    date: 'all',
    platform: 'all',
    severity: 'all',
    sentiment: 'all',
    rival: 'all',
    q: '',
  });
  readonly selectedId = signal<string | null>(null);
  readonly replyResult = signal<LocalReplyResult | null>(null);

  manualText = '';
  manualUrl = '';

  readonly companyAliases = computed(
    () => this.config.config()?.company.aliases ?? [],
  );

  readonly filtered = computed(() =>
    filterAlerts(this.alerts.ownAlerts(), this.filters()),
  );

  readonly selectedAlert = computed(() => {
    const id = this.selectedId();
    return id ? this.alerts.getById(id) : undefined;
  });

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
    this.history.load();
  }

  onFilterChange(f: FeedFilterState): void {
    this.filters.set(f);
  }

  refresh(): void {
    this.alerts.load();
    this.config.load();
  }

  seed(): void {
    this.config.load();
    this.alerts.seedExamples();
  }

  async runScan(): Promise<void> {
    await this.scan.scanOwn();
  }

  selectAlert(id: string): void {
    this.selectedId.set(id);
    const alert = this.alerts.getById(id);
    if (alert?.replyOptions?.length) {
      this.replyResult.set({
        originalText: alert.originalComplaint,
        options: alert.replyOptions,
        triage: {
          riskScore: 0,
          riskLevel: alert.severity,
          escalationFlags: [],
          recommendedAction: 'PUBLIC_REPLY',
          keyIssues: [],
          summary: alert._analysisSummary || '',
        },
        model: 'stored',
        generatedAt: alert.detectedAt,
        language: 'es',
      });
    } else {
      this.replyResult.set(null);
    }
  }

  onDismiss(alertId: string): void {
    this.alerts.updateStatus(alertId, 'DISMISSED');
    if (this.selectedId() === alertId) {
      this.selectedId.set(null);
      this.replyResult.set(null);
    }
  }

  analyzeAlert(alertId: string): void {
    const alert = this.alerts.getById(alertId);
    if (!alert) return;
    this.selectedId.set(alertId);
    const result = this.reply.analyzeLocal(alert.originalComplaint, this.config.companyName());
    this.replyResult.set(result);
    this.alerts.updateAlert(alertId, {
      replyOptions: result.options,
      _analysisSummary: result.triage.summary,
    });
    this.history.add({
      kind: 'analyze',
      text: alert.originalComplaint,
      alertId,
      riskLevel: result.triage.riskLevel,
      recommendedAction: result.triage.recommendedAction,
    });
  }

  submitManual(andAnalyze = false): void {
    const text = this.manualText.trim();
    if (!text) return;
    const userId = this.config.config()?.userId;
    if (!userId) return;

    const alert: CompetitorAlert = {
      alertId: createAlertId(),
      userId,
      competitorName: this.config.companyName() || 'Tu marca',
      originalComplaint: text,
      sourceUrl: this.manualUrl.trim() || 'manual://own',
      channel: 'manual',
      severity: 'MEDIUM',
      frustrationScore: null,
      salesPitch: '',
      detectedAt: new Date().toISOString(),
      status: 'NEW',
      notes: '',
      brandScope: 'own',
      sentiment: 'neutral',
      inboundSource: 'manual',
      _mentionKind: 'comment',
    };
    this.alerts.upsert(alert);
    this.manualText = '';
    this.manualUrl = '';
    this.selectAlert(alert.alertId);
    if (andAnalyze) this.analyzeAlert(alert.alertId);
  }

  markResponded(alertId: string): void {
    const alert = this.alerts.getById(alertId);
    if (!alert) return;
    this.alerts.updateStatus(alertId, 'CONTACTED');
    this.history.add({
      kind: 'own_reply',
      text: alert.originalComplaint,
      alertId,
      tone: this.replyResult()?.options.find((o) => o.recommended)?.tone,
      riskLevel: this.replyResult()?.triage.riskLevel,
      recommendedAction: this.replyResult()?.triage.recommendedAction,
    });
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
}
