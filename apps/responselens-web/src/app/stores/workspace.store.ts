import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { isConfiguredCompanyName, normalizeBrandKey } from '../engine/brand-setup.js';
import {
  deleteWorkspace,
  loadActiveWorkspaceId,
  loadWorkspaces,
  saveActiveWorkspaceId,
  upsertWorkspace,
} from '../engine/ops-workspaces.js';
import { loadCrisisThreshold, saveCrisisThreshold } from '../engine/ops-queue.js';
import type { WorkspaceSnapshot } from '../engine/workspace-scope';
import { emptyUserConfig, type UserConfig } from '../models/user-config.model';
import { AlertsStore } from './alerts.store';
import { HistoryStore } from './history.store';
import { UserConfigStore } from './user-config.store';

export interface CompanyOption {
  id: string;
  label: string;
  rivalCount: number;
  companyName: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly auth = inject(AuthService);
  private readonly config = inject(UserConfigStore);
  private readonly alerts = inject(AlertsStore);
  private readonly history = inject(HistoryStore);

  private readonly _items = signal<WorkspaceSnapshot[]>([]);
  readonly items = this._items.asReadonly();
  readonly activeId = computed(() => this.config.activeWorkspaceId());

  readonly options = computed((): CompanyOption[] => {
    const active = this.activeId();
    return this._items().map((ws) => {
      const name = String(ws.config?.company?.companyName || '').trim();
      return {
        id: ws.id,
        label: ws.label || name || 'Empresa',
        companyName: name,
        rivalCount: (ws.config?.competitors ?? []).filter((c) => String(c.name || '').trim()).length,
        active: ws.id === active,
      };
    });
  });

  readonly activeLabel = computed(() => {
    const id = this.activeId();
    const ws = this._items().find((w) => w.id === id);
    return ws?.label || this.config.companyName() || '';
  });

  hydrate(): void {
    const userId = this.auth.userId();
    if (!userId) {
      this._items.set([]);
      this.config.activeWorkspaceId.set(null);
      this.config.workspaceCount.set(0);
      return;
    }

    if (!this.config.config()) this.config.load();
    const live = this.config.config();
    let list = loadWorkspaces(userId) as WorkspaceSnapshot[];

    if (!list.length && live && isConfiguredCompanyName(live.company.companyName)) {
      const created = upsertWorkspace(userId, {
        label: live.company.companyName,
        config: live,
        crisisThreshold: loadCrisisThreshold(),
      }) as WorkspaceSnapshot;
      list = [created];
    }

    let activeId = loadActiveWorkspaceId(userId);
    if (activeId && !list.some((w) => w.id === activeId)) activeId = '';
    if (!activeId && live) {
      const key = normalizeBrandKey(live.company.companyName);
      const match = list.find((w) => normalizeBrandKey(w.config?.company?.companyName) === key);
      activeId = match?.id || list[0]?.id || '';
    }
    if (!activeId && list[0]) activeId = list[0].id;

    this._items.set(list);
    this.config.activeWorkspaceId.set(activeId || null);
    this.config.workspaceCount.set(list.length);
    if (activeId) saveActiveWorkspaceId(userId, activeId);

    const active = list.find((w) => w.id === activeId);
    const liveName = String(live?.company?.companyName || '').trim();
    if (active?.config && !liveName) {
      this.config.applySnapshot(active.config);
      if (typeof active.crisisThreshold === 'number') saveCrisisThreshold(active.crisisThreshold);
    }

    this.persistActive();
    this.history.load();
  }

  persistActive(): WorkspaceSnapshot | null {
    const userId = this.auth.userId();
    const cfg = this.config.config();
    if (!userId || !cfg) return null;
    const id = this.config.activeWorkspaceId();
    const named = isConfiguredCompanyName(cfg.company.companyName);
    if (!id && !named) return null;
    if (!named && id) {
      const existing = this._items().find((w) => w.id === id);
      if (isConfiguredCompanyName(existing?.config?.company?.companyName)) {
        return existing || null;
      }
    }
    const label = named
      ? cfg.company.companyName.trim()
      : this._items().find((w) => w.id === id)?.label || 'Nueva empresa';
    const saved = upsertWorkspace(userId, {
      id: id || undefined,
      label,
      config: cfg,
      crisisThreshold: loadCrisisThreshold(),
    }) as WorkspaceSnapshot;

    this.config.activeWorkspaceId.set(saved.id);
    saveActiveWorkspaceId(userId, saved.id);
    this.refreshList();
    return saved;
  }

  switchTo(id: string): boolean {
    const userId = this.auth.userId();
    if (!userId || !id || id === this.config.activeWorkspaceId()) return false;
    const target = this._items().find((w) => w.id === id);
    if (!target?.config) return false;

    this.persistActive();
    this.config.applySnapshot(target.config as UserConfig);
    if (typeof target.crisisThreshold === 'number') saveCrisisThreshold(target.crisisThreshold);
    this.config.activeWorkspaceId.set(id);
    saveActiveWorkspaceId(userId, id);
    this.refreshList();
    this.alerts.clearTransient();
    this.history.load();
    return true;
  }

  createBlank(): WorkspaceSnapshot | null {
    const userId = this.auth.userId();
    if (!userId) return null;
    this.persistActive();
    const empty = emptyUserConfig(userId);
    const created = upsertWorkspace(userId, {
      label: 'Nueva empresa',
      config: empty,
      crisisThreshold: 5,
    }) as WorkspaceSnapshot;
    this.config.applySnapshot(empty);
    saveCrisisThreshold(5);
    this.config.activeWorkspaceId.set(created.id);
    saveActiveWorkspaceId(userId, created.id);
    this.refreshList();
    this.alerts.clearTransient();
    this.history.load();
    return created;
  }

  remove(id: string): void {
    const userId = this.auth.userId();
    if (!userId || !id) return;
    deleteWorkspace(userId, id);
    const remaining = loadWorkspaces(userId) as WorkspaceSnapshot[];
    this._items.set(remaining);
    this.config.workspaceCount.set(remaining.length);
    if (this.config.activeWorkspaceId() === id) {
      const next = remaining[0];
      if (next?.config) {
        this.config.applySnapshot(next.config);
        this.config.activeWorkspaceId.set(next.id);
        saveActiveWorkspaceId(userId, next.id);
        if (typeof next.crisisThreshold === 'number') saveCrisisThreshold(next.crisisThreshold);
      } else {
        this.config.applySnapshot(emptyUserConfig(userId));
        this.config.activeWorkspaceId.set(null);
        saveActiveWorkspaceId(userId, '');
      }
      this.alerts.clearTransient();
      this.history.load();
    }
  }

  refreshList(): void {
    const userId = this.auth.userId();
    if (!userId) {
      this._items.set([]);
      this.config.workspaceCount.set(0);
      return;
    }
    const list = loadWorkspaces(userId) as WorkspaceSnapshot[];
    this._items.set(list);
    this.config.workspaceCount.set(list.length);
  }
}
