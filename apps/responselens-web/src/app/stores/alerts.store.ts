import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { mergeAlertLists } from '../engine/mention-dedupe.js';
import {
  clearCompetitorAlertsCloud,
  hasAlertsCloud,
  listCompetitorAlertsCloud,
  updateCompetitorAlertCloud,
  upsertCompetitorAlertsCloud,
} from '../engine/alerts-cloud.js';
import {
  createAlertId,
  type BrandScope,
  type CompetitorAlert,
} from '../models/alert.model';
import { UserConfigStore } from './user-config.store';
import { applyMockPublish } from '../utils/mock-publish';

/** Cache local opcional (offline / bootstrap); fuente de verdad = Dynamo vía AppSync. */
const storageKey = (userId: string) => `rl_web_alerts_${userId}`;

export type ScanArrivalSource = 'scan' | 'push' | 'demo';

export interface ScanArrival {
  id: string;
  alertId: string;
  brandScope: BrandScope;
  title: string;
  snippet: string;
  channel: string;
  competitorName: string;
  arrivedAt: string;
  source: ScanArrivalSource;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly auth = inject(AuthService);
  private readonly configStore = inject(UserConfigStore);

  private readonly _items = signal<CompetitorAlert[]>([]);
  private readonly _loading = signal(false);
  private readonly _cloudError = signal<string | null>(null);
  private readonly _arrivals = signal<ScanArrival[]>([]);
  private readonly _liveToast = signal<ScanArrival | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly items = this._items.asReadonly();
  readonly cloudError = this._cloudError.asReadonly();
  readonly arrivals = this._arrivals.asReadonly();
  readonly liveToast = this._liveToast.asReadonly();

  readonly ownAlerts = computed(() =>
    this._items().filter((a) => a.brandScope === 'own' && a.status !== 'DISMISSED'),
  );
  readonly rivalAlerts = computed(() =>
    this._items().filter((a) => a.brandScope === 'rival' && a.status !== 'DISMISSED'),
  );

  readonly newOwnCount = computed(
    () => this.ownAlerts().filter((a) => a.status === 'NEW').length,
  );
  readonly newRivalCount = computed(
    () => this.rivalAlerts().filter((a) => a.status === 'NEW').length,
  );
  readonly unreadArrivalCount = computed(
    () => this._arrivals().filter((a) => !a.read).length,
  );

  load(): void {
    void this.loadAsync();
  }

  async loadAsync(): Promise<void> {
    const userId = this.auth.userId();
    if (!userId) {
      this._items.set([]);
      return;
    }
    this._loading.set(true);
    this._cloudError.set(null);
    try {
      if (hasAlertsCloud()) {
        const remote = await listCompetitorAlertsCloud(userId, { limit: 100 });
        this.persistLocal(userId, remote);
        this._items.set(remote);
        return;
      }
      this._items.set(this.readLocal(userId));
    } catch (err) {
      this._cloudError.set(err instanceof Error ? err.message : String(err));
      this._items.set(this.readLocal(userId));
    } finally {
      this._loading.set(false);
    }
  }

  reset(): void {
    this._items.set([]);
    this._arrivals.set([]);
    this._liveToast.set(null);
  }

  /** Merge remoto sin re-list (push AppSync). */
  applyIncoming(alert: CompetitorAlert, source: ScanArrivalSource = 'push'): void {
    if (!alert?.alertId) return;
    const existing = this._items().find((a) => a.alertId === alert.alertId);
    const { merged } = mergeAlertLists(this._items(), [alert], {
      limit: Math.max(200, this._items().length + 1),
    });
    this.setItems(merged as CompetitorAlert[]);
    if (!existing || existing.detectedAt !== alert.detectedAt) {
      this.pushArrival(alert, source, { toast: source === 'push' });
    }
  }

  /** Tras un scan local: registra ítems en el inbox. */
  recordScanBatch(alerts: CompetitorAlert[], source: ScanArrivalSource = 'scan'): void {
    if (!alerts.length) return;
    const batch = alerts.slice(0, 12);
    for (const alert of batch) {
      this.pushArrival(alert, source, { toast: false });
    }
    const latest = this._arrivals()[0] ?? null;
    if (latest) this._liveToast.set(latest);
  }

  markArrivalsRead(): void {
    this._arrivals.update((list) => list.map((a) => ({ ...a, read: true })));
  }

  markArrivalRead(id: string): void {
    this._arrivals.update((list) =>
      list.map((a) => (a.id === id ? { ...a, read: true } : a)),
    );
  }

  dismissLiveToast(): void {
    this._liveToast.set(null);
  }

  private pushArrival(
    alert: CompetitorAlert,
    source: ScanArrivalSource,
    opts: { toast: boolean },
  ): void {
    const snippet = String(alert.originalComplaint || '').trim();
    const arrival: ScanArrival = {
      id: `${alert.alertId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      alertId: alert.alertId,
      brandScope: alert.brandScope === 'own' ? 'own' : 'rival',
      title:
        alert.brandScope === 'own'
          ? 'Nueva mención propia'
          : 'Nueva señal de competencia',
      snippet: snippet.length > 120 ? `${snippet.slice(0, 117)}…` : snippet,
      channel: String(alert.channel || 'web'),
      competitorName: String(alert.competitorName || ''),
      arrivedAt: new Date().toISOString(),
      source,
      read: false,
    };
    this._arrivals.update((list) => [arrival, ...list].slice(0, 40));
    if (opts.toast) this._liveToast.set(arrival);
  }

  private readLocal(userId: string): CompetitorAlert[] {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      const list = raw ? (JSON.parse(raw) as CompetitorAlert[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private persistLocal(userId: string, list: CompetitorAlert[]): void {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(list));
    } catch {
      /* quota / private mode */
    }
  }

  private setItems(list: CompetitorAlert[]): void {
    const userId = this.auth.userId();
    this._items.set(list);
    if (userId) this.persistLocal(userId, list);
  }

  upsert(alert: CompetitorAlert): void {
    void this.upsertMany([alert]);
  }

  async upsertMany(alerts: CompetitorAlert[]): Promise<void> {
    if (!alerts.length) return;
    const userId = this.auth.userId();
    if (!userId) return;

    const withUser = alerts.map((a) => ({ ...a, userId: a.userId || userId }));

    if (hasAlertsCloud()) {
      try {
        await upsertCompetitorAlertsCloud(withUser);
        const remote = await listCompetitorAlertsCloud(userId, { limit: 100 });
        this.setItems(remote);
        this._cloudError.set(null);
        return;
      } catch (err) {
        this._cloudError.set(err instanceof Error ? err.message : String(err));
      }
    }

    const { merged } = mergeAlertLists(this._items(), withUser, {
      limit: Math.max(200, this._items().length + withUser.length),
    });
    this.setItems(merged as CompetitorAlert[]);
  }

  async updateStatus(alertId: string, status: CompetitorAlert['status']): Promise<void> {
    const userId = this.auth.userId();
    const next = this._items().map((a) => (a.alertId === alertId ? { ...a, status } : a));
    this.setItems(next);

    if (userId && hasAlertsCloud()) {
      try {
        await updateCompetitorAlertCloud({ userId, alertId, status });
        this._cloudError.set(null);
      } catch (err) {
        this._cloudError.set(err instanceof Error ? err.message : String(err));
      }
    }
  }

  updateAlert(alertId: string, patch: Partial<CompetitorAlert>): void {
    const next = this._items().map((a) =>
      a.alertId === alertId ? { ...a, ...patch } : a,
    );
    this.setItems(next);
    const updated = next.find((a) => a.alertId === alertId);
    if (updated && hasAlertsCloud()) {
      void upsertCompetitorAlertsCloud([updated]).catch((err: unknown) => {
        this._cloudError.set(err instanceof Error ? err.message : String(err));
      });
    }
  }

  publishMockReply(alertId: string, body: string): CompetitorAlert | null {
    const alert = this.getById(alertId);
    if (!alert) return null;
    const brand =
      alert.brandScope === 'own'
        ? this.configStore.companyName() || alert.competitorName
        : this.configStore.companyName() || 'Tu marca';
    const next = applyMockPublish(alert, body, brand);
    this.updateAlert(alertId, next);
    return next;
  }

  getById(alertId: string): CompetitorAlert | undefined {
    return this._items().find((a) => a.alertId === alertId);
  }

  seedExamples(): void {
    const userId = this.auth.userId();
    if (!userId) return;
    const company = this.configStore.companyName() || 'Tu marca';
    const rival = this.configStore.competitors()[0]?.name || 'RivalCo';
    const now = Date.now();

    const samples: CompetitorAlert[] = [
      {
        alertId: createAlertId(),
        userId,
        competitorName: company,
        originalComplaint:
          `Llevo 3 días sin respuesta de soporte de ${company}. El producto se cayó en producción y nadie contesta.`,
        sourceUrl: 'https://news.ycombinator.com/',
        channel: 'hackernews',
        severity: 'HIGH',
        frustrationScore: 78,
        salesPitch: '',
        detectedAt: new Date(now - 3600_000).toISOString(),
        status: 'NEW',
        notes: '',
        brandScope: 'own',
        sentiment: 'negative',
        inboundSource: 'demo',
        _sentiment: 'NEGATIVE',
        _mentionKind: 'comment',
        _analysisSummary: 'Cliente frustrado por falta de soporte tras incidente en producción.',
      },
      {
        alertId: createAlertId(),
        userId,
        competitorName: company,
        originalComplaint: `Buen lanzamiento de ${company}, pero la documentación de la API está incompleta.`,
        sourceUrl: 'https://www.reddit.com/',
        channel: 'reddit',
        severity: 'MEDIUM',
        frustrationScore: 42,
        salesPitch: '',
        detectedAt: new Date(now - 7200_000).toISOString(),
        status: 'NEW',
        notes: '',
        brandScope: 'own',
        sentiment: 'mixed',
        inboundSource: 'demo',
        _sentiment: 'MIXED',
        _mentionKind: 'comment',
      },
      {
        alertId: createAlertId(),
        userId,
        competitorName: rival,
        originalComplaint: `Me voy de ${rival}: subieron precios 40% y el churn del soporte es inaceptable. ¿Alternativas?`,
        sourceUrl: 'https://www.reddit.com/r/SaaS/',
        channel: 'reddit',
        severity: 'CRITICAL',
        frustrationScore: 91,
        salesPitch: `Si estás buscando salir de ${rival}, ${company} puede ayudarte a migrar sin downtime.`,
        detectedAt: new Date(now - 1800_000).toISOString(),
        status: 'NEW',
        notes: '',
        brandScope: 'rival',
        sentiment: 'negative',
        inboundSource: 'demo',
        _actionable: true,
      },
      {
        alertId: createAlertId(),
        userId,
        competitorName: rival,
        originalComplaint: `${rival} tuvo otro outage esta mañana. Clientes en Twitter pidiendo reembolsos.`,
        sourceUrl: 'https://news.google.com/',
        channel: 'news',
        severity: 'HIGH',
        frustrationScore: 80,
        salesPitch: `Momento ideal para ofrecer onboarding asistido desde ${company}.`,
        detectedAt: new Date(now - 900_000).toISOString(),
        status: 'NEW',
        notes: '',
        brandScope: 'rival',
        sentiment: 'negative',
        inboundSource: 'demo',
      },
    ];

    void this.upsertMany(samples).then(() => {
      this.recordScanBatch(samples, 'demo');
    });
  }

  async clearScope(scope: BrandScope): Promise<void> {
    const userId = this.auth.userId();
    if (userId && hasAlertsCloud()) {
      try {
        await clearCompetitorAlertsCloud(userId, scope);
        const remote = await listCompetitorAlertsCloud(userId, { limit: 100 });
        this.setItems(remote);
        this._cloudError.set(null);
        return;
      } catch (err) {
        this._cloudError.set(err instanceof Error ? err.message : String(err));
      }
    }
    this.setItems(this._items().filter((a) => a.brandScope !== scope));
  }
}
