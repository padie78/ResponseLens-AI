import { Injectable, signal } from '@angular/core';

/** Stub — se conectará a AppSync listCompetitorAlerts / own alerts. */
@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly _loading = signal(false);
  private readonly _items = signal<readonly unknown[]>([]);

  readonly loading = this._loading.asReadonly();
  readonly items = this._items.asReadonly();

  setLoading(value: boolean): void {
    this._loading.set(value);
  }

  setItems(items: readonly unknown[]): void {
    this._items.set(items);
  }

  reset(): void {
    this._loading.set(false);
    this._items.set([]);
  }
}
