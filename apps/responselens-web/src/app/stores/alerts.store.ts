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

/** Cache local opcional (offline / bootstrap); fuente de verdad = Dynamo vía AppSync. */
const storageKey = (userId: string) => `rl_web_alerts_${userId}`;

@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly auth = inject(AuthService);
  private readonly configStore = inject(UserConfigStore);

  private readonly _items = signal<CompetitorAlert[]>([]);
  private readonly _loading = signal(false);
  private readonly _cloudError = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly items = this._items.asReadonly();
  readonly cloudError = this._cloudError.asReadonly();

  readonly ownAlerts = computed(() =>
    this._items().filter((a) => a.brandScope === 'own' && a.status !== 'DISMISSED'),
  );
  readonly rivalAlerts = computed(() =>
    this._items().filter((a) => a.brandScope === 'rival' && a.status !== 'DISMISSED'),
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

  getById(alertId: string): CompetitorAlert | undefined {
    return this._items().find((a) => a.alertId === alertId);
  }

  /** Menciones de ejemplo para ver el feed (como demos del plugin). */
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

    void this.upsertMany(samples);
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
