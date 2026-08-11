import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import {
  createAlertId,
  type BrandScope,
  type CompetitorAlert,
} from '../models/alert.model';
import { UserConfigStore } from './user-config.store';

const storageKey = (userId: string) => `rl_web_alerts_${userId}`;

@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly auth = inject(AuthService);
  private readonly configStore = inject(UserConfigStore);

  private readonly _items = signal<CompetitorAlert[]>([]);
  private readonly _loading = signal(false);

  readonly loading = this._loading.asReadonly();
  readonly items = this._items.asReadonly();

  readonly ownAlerts = computed(() =>
    this._items().filter((a) => a.brandScope === 'own' && a.status !== 'DISMISSED'),
  );
  readonly rivalAlerts = computed(() =>
    this._items().filter((a) => a.brandScope === 'rival' && a.status !== 'DISMISSED'),
  );

  load(): void {
    const userId = this.auth.userId();
    if (!userId) {
      this._items.set([]);
      return;
    }
    this._loading.set(true);
    try {
      const raw = localStorage.getItem(storageKey(userId));
      const list = raw ? (JSON.parse(raw) as CompetitorAlert[]) : [];
      this._items.set(Array.isArray(list) ? list : []);
    } catch {
      this._items.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  reset(): void {
    this._items.set([]);
  }

  private persist(list: CompetitorAlert[]): void {
    const userId = this.auth.userId();
    if (!userId) return;
    localStorage.setItem(storageKey(userId), JSON.stringify(list));
    this._items.set(list);
  }

  upsert(alert: CompetitorAlert): void {
    const idx = this._items().findIndex((a) => a.alertId === alert.alertId);
    if (idx >= 0) {
      const next = [...this._items()];
      next[idx] = { ...next[idx], ...alert };
      this.persist(next);
    } else {
      this.persist([alert, ...this._items()]);
    }
  }

  upsertMany(alerts: CompetitorAlert[]): void {
    if (!alerts.length) return;
    const map = new Map(this._items().map((a) => [a.alertId, a]));
    for (const incoming of alerts) {
      const existing = map.get(incoming.alertId);
      map.set(incoming.alertId, existing ? { ...existing, ...incoming } : incoming);
    }
    const merged = [...map.values()].sort(
      (a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt),
    );
    this.persist(merged);
  }

  updateStatus(alertId: string, status: CompetitorAlert['status']): void {
    const next = this._items().map((a) => (a.alertId === alertId ? { ...a, status } : a));
    this.persist(next);
  }

  updateAlert(alertId: string, patch: Partial<CompetitorAlert>): void {
    const next = this._items().map((a) =>
      a.alertId === alertId ? { ...a, ...patch } : a,
    );
    this.persist(next);
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

    this.upsertMany(samples);
  }

  clearScope(scope: BrandScope): void {
    this.persist(this._items().filter((a) => a.brandScope !== scope));
  }
}
