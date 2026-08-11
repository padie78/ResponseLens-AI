import { Injectable } from '@angular/core';

/**
 * Stub GraphQL — espejo del client Amplify de stats-games-web.
 * Las operaciones reales (listCompetitorAlerts, upsert, subscriptions) se portan después.
 */
@Injectable({ providedIn: 'root' })
export class AlertsApiService {
  async listAlerts(_userId: string): Promise<readonly unknown[]> {
    return [];
  }
}
