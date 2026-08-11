import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';

export type HistoryKind = 'own_reply' | 'comp_capture' | 'manual' | 'analyze';

export interface HistoryEntry {
  id: string;
  at: string;
  kind: HistoryKind;
  text: string;
  alertId?: string;
  tone?: string;
  riskLevel?: string;
  recommendedAction?: string;
  label?: string;
}

const storageKey = (userId: string) => `rl_web_history_${userId}`;

@Injectable({ providedIn: 'root' })
export class HistoryStore {
  private readonly auth = inject(AuthService);
  private readonly _items = signal<HistoryEntry[]>([]);

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);

  load(): void {
    const userId = this.auth.userId();
    if (!userId) {
      this._items.set([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(userId));
      const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
      this._items.set(Array.isArray(list) ? list : []);
    } catch {
      this._items.set([]);
    }
  }

  private persist(list: HistoryEntry[]): void {
    const userId = this.auth.userId();
    if (!userId) return;
    localStorage.setItem(storageKey(userId), JSON.stringify(list));
    this._items.set(list);
  }

  add(entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: string; id?: string }): HistoryEntry {
    const full: HistoryEntry = {
      id: entry.id ?? `h_${crypto.randomUUID().slice(0, 10)}`,
      at: entry.at ?? new Date().toISOString(),
      kind: entry.kind,
      text: entry.text,
      alertId: entry.alertId,
      tone: entry.tone,
      riskLevel: entry.riskLevel,
      recommendedAction: entry.recommendedAction,
      label: entry.label,
    };
    this.persist([full, ...this._items()]);
    return full;
  }

  exportCsv(): string {
    const rows = [
      ['id', 'at', 'kind', 'text', 'alertId', 'tone', 'riskLevel', 'recommendedAction'],
      ...this._items().map((h) => [
        h.id,
        h.at,
        h.kind,
        `"${h.text.replace(/"/g, '""')}"`,
        h.alertId ?? '',
        h.tone ?? '',
        h.riskLevel ?? '',
        h.recommendedAction ?? '',
      ]),
    ];
    return rows.map((r) => r.join(',')).join('\n');
  }

  downloadCsv(): void {
    const csv = this.exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `responselens-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
