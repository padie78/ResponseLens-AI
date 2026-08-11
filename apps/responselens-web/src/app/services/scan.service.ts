import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import {
  mapOpportunityToAlert,
  type ScanOpportunity,
} from '../models/alert.model';
import { loadScanSourcesPrefs } from '../models/scan-sources.model';
import { AlertsStore } from '../stores/alerts.store';
import { UserConfigStore } from '../stores/user-config.store';
import { runOwnBrandScan, runCompetitorScan } from '../engine/competitor-scan.js';
import { loadScanCredentials } from '../engine/scan-credentials.js';

interface ScanEngineResult {
  opportunities?: ScanOpportunity[];
  errors?: string[];
  stats?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly auth = inject(AuthService);
  private readonly configStore = inject(UserConfigStore);
  private readonly alertsStore = inject(AlertsStore);

  private readonly _scanning = signal(false);
  private readonly _lastStatus = signal('');

  readonly scanning = this._scanning.asReadonly();
  readonly lastStatus = this._lastStatus.asReadonly();

  async scanOwn(): Promise<void> {
    await this.runScan('own');
  }

  async scanCompetitors(): Promise<void> {
    await this.runScan('comp');
  }

  private async runScan(kind: 'own' | 'comp'): Promise<void> {
    const userId = this.auth.userId();
    const cfg = this.configStore.config();
    if (!userId || !cfg) {
      this._lastStatus.set('Sin sesión o config.');
      return;
    }

    this._scanning.set(true);
    this._lastStatus.set('Escaneando…');

    try {
      const credentials = await loadScanCredentials();
      const sources = { ...loadScanSourcesPrefs() };
      const company = {
        ...cfg.company,
        socialHandles: cfg.company.channelUrls ?? [],
      };

      const baseArgs = {
        company,
        userId,
        pageMentions: [],
        sources,
        credentials,
      };

      let result: ScanEngineResult;
      if (kind === 'own') {
        result = (await runOwnBrandScan(baseArgs)) as ScanEngineResult;
      } else {
        result = (await runCompetitorScan({
          ...baseArgs,
          competitors: cfg.competitors,
        } as never)) as ScanEngineResult;
      }

      const alerts = (result.opportunities ?? []).map((opp) =>
        mapOpportunityToAlert(opp, userId),
      );
      if (alerts.length) {
        this.alertsStore.upsertMany(alerts);
      }

      const found = alerts.length;
      const errs = result.errors?.length ? ` · ${result.errors.length} aviso(s)` : '';
      this._lastStatus.set(
        found > 0
          ? `${found} mención(es) nueva(s)${errs}`
          : `Sin menciones nuevas${errs}`,
      );
    } catch (err) {
      this._lastStatus.set(
        err instanceof Error ? err.message : 'Error al escanear.',
      );
    } finally {
      this._scanning.set(false);
    }
  }
}
