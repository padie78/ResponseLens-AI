import {
  Component,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
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
import { isReplyableContent, normalizeContentKind } from '../../engine/content-kind.js';
import {
  AlertCardComponent,
  DEFAULT_FEED_FILTERS,
  FeedFiltersComponent,
  ScanBlockerComponent,
  type FeedFilterState,
} from '../../ui';

type OwnInboxMode =
  | 'all'
  | 'urgent'
  | 'pending'
  | 'snoozed'
  | 'responded'
  | 'resolved'
  | 'dismissed';

const INBOX_TITLES: Record<OwnInboxMode, { title: string; lead: string }> = {
  all: {
    title: 'Bandeja',
    lead: 'Todas las menciones propias, abiertas y cerradas.',
  },
  urgent: {
    title: 'Urgentes / crisis',
    lead: 'Severidad alta o crítica, todavía abiertas.',
  },
  pending: {
    title: 'Pendientes',
    lead: 'Sin atender (estado nuevo).',
  },
  snoozed: {
    title: 'Pospuestas',
    lead: 'Aplazadas para retomar más tarde.',
  },
  responded: {
    title: 'Respondidas',
    lead: 'Ya marcadas como respondidas o contactadas.',
  },
  resolved: {
    title: 'Resueltas',
    lead: 'Cerradas como resueltas.',
  },
  dismissed: {
    title: 'Descartadas',
    lead: 'Fuera de la cola activa.',
  },
};

const INBOX_MODES: OwnInboxMode[] = [
  'all',
  'urgent',
  'pending',
  'snoozed',
  'responded',
  'resolved',
  'dismissed',
];

function parseInboxMode(raw: string | null): OwnInboxMode {
  return INBOX_MODES.includes(raw as OwnInboxMode) ? (raw as OwnInboxMode) : 'all';
}

function statusForInbox(mode: OwnInboxMode): string {
  if (mode === 'pending') return 'NEW';
  if (mode === 'snoozed') return 'SNOOZED';
  if (mode === 'responded') return 'CONTACTED';
  if (mode === 'resolved') return 'WON';
  if (mode === 'dismissed') return 'DISMISSED';
  return 'all';
}

function isOpenAlert(a: CompetitorAlert): boolean {
  const st = String(a.status || 'NEW').toUpperCase();
  return st === 'NEW' || st === 'SNOOZED';
}

function isClosedAlert(a: CompetitorAlert): boolean {
  const st = String(a.status || '').toUpperCase();
  return st === 'CONTACTED' || st === 'WON' || st === 'DISMISSED';
}

@Component({
  standalone: true,
  selector: 'rl-own-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    IonContent,
    RouterLink,
    FormsModule,
    ButtonModule,
    DropdownModule,
    AlertCardComponent,
    FeedFiltersComponent,
    ScanBlockerComponent,
  ],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />

      <div class="rl-page rl-own">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Bandeja</h1>
            <p class="rl-page__lead">{{ inboxLead() }}</p>
          </div>
          <div class="rl-own__actions">
            <p-button
              label="Escanear"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (onClick)="runScan()"
            />
            <p-button
              label="Scan demo"
              icon="pi pi-box"
              severity="help"
              [outlined]="true"
              size="small"
              [disabled]="scan.scanning() || !config.hasCompany()"
              (onClick)="runScanMock()"
              title="Scan de prueba — no gasta créditos"
            />
            <p-button
              label="Refrescar"
              severity="secondary"
              [outlined]="true"
              size="small"
              (onClick)="refresh()"
            />
          </div>
        </header>

        @if (scan.lastStatus() && !scan.scanning()) {
          <p class="rl-page__status">{{ scan.lastStatus() }}</p>
        }

        @if (config.hasCompany()) {
          <div class="rl-own__kpis" role="group" aria-label="Indicadores de la bandeja">
            @for (kpi of kpis(); track kpi.mode) {
              <button
                type="button"
                class="rl-own__kpi"
                [attr.data-tone]="kpi.tone"
                [class.is-active]="inboxMode() === kpi.mode"
                [class.is-zero]="kpi.value === 0"
                [attr.aria-pressed]="inboxMode() === kpi.mode"
                (click)="onInboxChange(kpi.mode)"
              >
                <i class="rl-own__kpi-icon {{ kpi.icon }}" aria-hidden="true"></i>
                <strong>{{ kpi.value }}</strong>
                <span>{{ kpi.label }}</span>
              </button>
            }
          </div>
        }

        @if (!config.hasCompany()) {
          <div class="rl-own__empty">
            <p>
              Configurá tu empresa en <a routerLink="/app/settings">Empresa</a> antes de escanear.
            </p>
          </div>
        } @else {
        <div class="rl-own__section">
          <div class="rl-own__toolbar">
            <label class="rl-filters__field">
              <span>Cola</span>
              <p-dropdown
                [options]="inboxOpts()"
                optionLabel="label"
                optionValue="value"
                [ngModel]="inboxMode()"
                (ngModelChange)="onInboxChange($event)"
                styleClass="rl-filters__dd"
                [appendTo]="'body'"
              />
            </label>
            <rl-feed-filters mode="own" [hideStatus]="true" (filterChange)="onFilterChange($event)" />
          </div>

          @if (alerts.loading()) {
            <p class="rl-own__muted">Cargando menciones…</p>
          } @else if (filtered().length === 0) {
            <div class="rl-own__empty">
              <p>
                No hay menciones propias con estos filtros.
              </p>
            </div>
          } @else {
            <div class="rl-feed">
              @for (item of filtered(); track item.alertId) {
                <rl-alert-card
                  [alert]="item"
                  [showAnalyze]="true"
                  [companyName]="config.companyName()"
                  [selected]="selectedId() === item.alertId"
                  (select)="selectAlert($event)"
                  (dismiss)="onDismiss($event)"
                  (analyze)="analyzeAlert($event)"
                  (responded)="markResponded($event)"
                  (publishReply)="onPublishReply($event)"
                  (snoozed)="markSnoozed($event)"
                  (won)="markResolved($event)"
                />
              }
            </div>
          }

          <form class="rl-manual-form" (ngSubmit)="submitManual()">
              <h2 class="rl-own__section-title">Mención manual</h2>
              <p class="rl-own__section-lead">Pegá un comentario para analizarlo sin esperar al scanner.</p>
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
                <p-button type="submit" label="Agregar" severity="secondary" [outlined]="true" size="small" />
                <p-button type="button" label="Agregar y analizar" size="small" (onClick)="submitManual(true)" />
              </div>
            </form>
        </div>
        }
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly filters = signal<FeedFilterState>({
    ...DEFAULT_FEED_FILTERS,
    sort: 'severity_desc',
  });
  readonly inboxMode = signal<OwnInboxMode>('all');
  readonly selectedId = signal<string | null>(null);
  readonly replyResult = signal<LocalReplyResult | null>(null);

  manualText = '';
  manualUrl = '';

  readonly inboxLead = computed(() => INBOX_TITLES[this.inboxMode()].lead);

  readonly ownPool = computed(() =>
    this.alerts.items().filter((a) => a.brandScope === 'own'),
  );

  readonly openOwn = computed(() => this.ownPool().filter(isOpenAlert));

  readonly closedOwn = computed(() => this.ownPool().filter(isClosedAlert));

  readonly filtered = computed(() => {
    const mode = this.inboxMode();
    const list = filterAlerts(this.ownPool(), this.filters());
    if (mode === 'urgent') {
      return list.filter(
        (a) =>
          isOpenAlert(a) && (a.severity === 'HIGH' || a.severity === 'CRITICAL'),
      );
    }
    return list;
  });

  readonly urgentCount = computed(
    () =>
      this.openOwn().filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL').length,
  );

  readonly pendingCount = computed(
    () => this.openOwn().filter((a) => a.status === 'NEW').length,
  );

  readonly snoozedCount = computed(
    () => this.openOwn().filter((a) => a.status === 'SNOOZED').length,
  );

  readonly respondedCount = computed(
    () => this.closedOwn().filter((a) => a.status === 'CONTACTED').length,
  );

  readonly resolvedCount = computed(
    () => this.closedOwn().filter((a) => a.status === 'WON').length,
  );

  readonly dismissedCount = computed(
    () => this.closedOwn().filter((a) => a.status === 'DISMISSED').length,
  );

  readonly kpis = computed(() => [
    {
      mode: 'all' as const,
      label: 'Total',
      value: this.ownPool().length,
      tone: 'total',
      icon: 'pi pi-inbox',
    },
    {
      mode: 'urgent' as const,
      label: 'Urgentes',
      value: this.urgentCount(),
      tone: 'urgent',
      icon: 'pi pi-bolt',
    },
    {
      mode: 'pending' as const,
      label: 'Pendientes',
      value: this.pendingCount(),
      tone: 'pending',
      icon: 'pi pi-clock',
    },
    {
      mode: 'snoozed' as const,
      label: 'Pospuestas',
      value: this.snoozedCount(),
      tone: 'snoozed',
      icon: 'pi pi-pause',
    },
    {
      mode: 'responded' as const,
      label: 'Respondidas',
      value: this.respondedCount(),
      tone: 'responded',
      icon: 'pi pi-send',
    },
    {
      mode: 'resolved' as const,
      label: 'Resueltas',
      value: this.resolvedCount(),
      tone: 'resolved',
      icon: 'pi pi-check',
    },
    {
      mode: 'dismissed' as const,
      label: 'Descartadas',
      value: this.dismissedCount(),
      tone: 'dismissed',
      icon: 'pi pi-times',
    },
  ]);

  readonly inboxOpts = computed(() => [
    { value: 'all', label: `Todas (${this.ownPool().length})` },
    { value: 'urgent', label: `Urgentes / crisis (${this.urgentCount()})` },
    { value: 'pending', label: `Pendientes (${this.pendingCount()})` },
    { value: 'snoozed', label: `Pospuestas (${this.snoozedCount()})` },
    { value: 'responded', label: `Respondidas (${this.respondedCount()})` },
    { value: 'resolved', label: `Resueltas (${this.resolvedCount()})` },
    { value: 'dismissed', label: `Descartadas (${this.dismissedCount()})` },
  ]);

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
    this.history.load();
    this.route.queryParamMap.subscribe((q) => {
      this.applyInboxMode(parseInboxMode(q.get('inbox')));
    });
  }

  onInboxChange(mode: OwnInboxMode): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        box: null,
        inbox: mode === 'all' ? null : mode,
      },
      queryParamsHandling: 'merge',
    });
  }

  private applyInboxMode(mode: OwnInboxMode): void {
    this.inboxMode.set(mode);
    this.filters.update((prev) => ({
      ...prev,
      status: statusForInbox(mode),
      sort: prev.sort || 'severity_desc',
    }));
  }

  onFilterChange(f: FeedFilterState): void {
    this.filters.set({ ...f, status: statusForInbox(this.inboxMode()) });
  }

  refresh(): void {
    this.alerts.load();
    this.config.load();
  }

  async runScan(): Promise<void> {
    await this.scan.scanOwn();
  }

  async runScanMock(): Promise<void> {
    await this.scan.scanOwnMock();
  }

  selectAlert(id: string): void {
    if (this.selectedId() === id) {
      this.selectedId.set(null);
      this.replyResult.set(null);
      return;
    }
    this.selectedId.set(id);
    const alert = this.alerts.getById(id);
    if (!alert) {
      this.replyResult.set(null);
      return;
    }
    if (alert.replyOptions?.length) {
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
      return;
    }
    if (
      isReplyableContent(
        normalizeContentKind(alert._mentionKind, alert.channel),
        alert._scMeta,
      )
    ) {
      const result = this.reply.analyzeLocal(alert.originalComplaint, this.config.companyName());
      if (alert._analysisSummary) result.triage.summary = alert._analysisSummary;
      this.replyResult.set(result);
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

  onPublishReply(evt: { alertId: string; body: string }): void {
    const posted = this.alerts.publishMockReply(evt.alertId, evt.body);
    if (!posted) return;
    this.history.add({
      kind: 'own_reply',
      text: evt.body,
      alertId: evt.alertId,
      tone: this.replyResult()?.options.find((o) => o.recommended)?.tone,
      riskLevel: this.replyResult()?.triage.riskLevel,
      recommendedAction: this.replyResult()?.triage.recommendedAction,
    });
  }

  markSnoozed(alertId: string): void {
    this.alerts.updateStatus(alertId, 'SNOOZED');
    if (this.selectedId() === alertId) {
      this.selectedId.set(null);
      this.replyResult.set(null);
    }
  }

  markResolved(alertId: string): void {
    this.alerts.updateStatus(alertId, 'WON');
    if (this.selectedId() === alertId) {
      this.selectedId.set(null);
      this.replyResult.set(null);
    }
  }

  copy(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
}
