import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import {
  mapOpportunityToAlert,
  type ScanOpportunity,
} from '../models/alert.model';
import { AlertsStore } from '../stores/alerts.store';
import { UserConfigStore } from '../stores/user-config.store';
import { runOwnBrandScan, runCompetitorScan } from '../engine/competitor-scan.js';
import { loadScanCredentials } from '../engine/scan-credentials.js';
import { hasSocialCrawlServer } from '../engine/socialcrawl-client.js';
import { isExternalApisMock } from '../engine/external-apis-mock.js';
import { setSocialCrawlMock } from '../engine/socialcrawl-mock.js';
import {
  consumeManualScan,
  peekManualScanQuota,
  SCAN_MAX_RIVALS,
} from '../engine/listening-policy.js';
import { companySetupMessage, rivalsSetupMessage } from '../engine/brand-setup.js';

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

  /** Tope diario de Forzar ahora (el mock/demo no cuenta). */
  manualQuotaExhausted(): boolean {
    if (isExternalApisMock()) return false;
    const userId = this.auth.userId();
    if (!userId) return false;
    return peekManualScanQuota(userId).exhausted;
  }

  /** Forzar ahora — consume cupo si no es mock. */
  async scanOwn(): Promise<void> {
    await this.runScan('own', { mock: false });
  }

  async scanCompetitors(): Promise<void> {
    await this.runScan('comp', { mock: false });
  }

  /** Scan demo — 0 créditos, no consume tope diario. */
  async scanOwnMock(): Promise<void> {
    await this.runScan('own', { mock: true });
  }

  async scanCompetitorsMock(): Promise<void> {
    await this.runScan('comp', { mock: true });
  }

  private async runScan(
    kind: 'own' | 'comp',
    opts: { mock: boolean },
  ): Promise<void> {
    const useMock = isExternalApisMock() || opts.mock;
    const userId = this.auth.userId();
    this.configStore.load();
    const cfg = this.configStore.config();
    if (!userId || !cfg) {
      this._lastStatus.set('Sin sesión o config.');
      return;
    }

    if (kind === 'own') {
      const ownErr = companySetupMessage(cfg.company.companyName);
      if (ownErr) {
        this._lastStatus.set(ownErr);
        return;
      }
    }
    if (kind === 'comp') {
      const rivalErr = rivalsSetupMessage(cfg.competitors);
      if (rivalErr) {
        this._lastStatus.set(rivalErr);
        return;
      }
    }

    if (!useMock) {
      const quota = peekManualScanQuota(userId);
      if (quota.exhausted) {
        this._lastStatus.set(
          `Tope de scans manuales (${quota.limit}/día). La pasada automática sigue ~08:00 AR. Scan demo no gasta créditos.`,
        );
        return;
      }
    }

    if (!hasSocialCrawlServer()) {
      this._lastStatus.set(
        useMock
          ? 'Scan demo necesita AppSync. Corré npm run sync:env.'
          : 'Escucha off: falta AppSync (npm run sync:env).',
      );
      return;
    }

    this._scanning.set(true);
    setSocialCrawlMock(useMock);
    this._lastStatus.set(
      useMock
        ? kind === 'own'
          ? `Scan demo “${cfg.company.companyName}” (0 créditos)…`
          : 'Scan demo rivales (0 créditos)…'
        : kind === 'own'
          ? `Forzando pasada de “${cfg.company.companyName}”…`
          : 'Forzando pasada de rivales…',
    );

    try {
      const credentials = await loadScanCredentials();
      const company = {
        ...cfg.company,
        socialHandles: cfg.company.channelUrls ?? [],
      };
      const baseArgs = {
        company,
        userId,
        pageMentions: [],
        sources: {
          hackernews: false,
          reddit_api: false,
          active_page: false,
          news_portals: false,
          youtube_api: false,
        },
        credentials,
      };

      let result: ScanEngineResult;
      if (kind === 'own') {
        result = (await runOwnBrandScan(baseArgs)) as ScanEngineResult;
      } else {
        result = (await runCompetitorScan({
          ...baseArgs,
          competitors: cfg.competitors.slice(0, SCAN_MAX_RIVALS),
        } as never)) as ScanEngineResult;
      }

      const alerts = (result.opportunities ?? []).map((opp) => {
        const mapped = mapOpportunityToAlert(opp, userId);
        const workspaceId = this.configStore.activeWorkspaceId();
        if (workspaceId) {
          mapped.workspaceId = workspaceId;
          mapped.metaJson = { ...(mapped.metaJson || {}), workspaceId };
        }
        if (kind === 'own') {
          mapped.brandScope = 'own';
          mapped._brandScope = 'own';
        } else {
          mapped.brandScope = 'rival';
          mapped._brandScope = 'rival';
        }
        return mapped;
      });
      const scope = kind === 'own' ? 'own' : 'rival';
      if (useMock) {
        await this.alertsStore.clearScope(scope);
        if (alerts.length) await this.alertsStore.upsertMany(alerts);
      } else if (alerts.length) {
        await this.alertsStore.upsertMany(alerts);
      }
      if (alerts.length) {
        this.alertsStore.recordScanBatch(alerts, useMock ? 'demo' : 'scan');
      }

      if (!useMock) {
        consumeManualScan(userId);
      }

      const cloudErr = this.alertsStore.cloudError();
      const found = alerts.length;
      const sc = Number(result.stats?.['socialcrawl'] ?? 0);
      const withMeta = alerts.filter((a) => Boolean(a._scMeta)).length;
      const errs = (result.errors ?? []).filter(Boolean);
      const scErrs = errs.filter((e) => /socialcrawl/i.test(e));
      const scKeyMissing = scErrs.some((e) =>
        /SOCIALCRAWL_API_KEY missing|key solo en servidor|socialcrawl_proxy_failed/i.test(e),
      );
      const scCredits = scErrs.some((e) =>
        /credit|quota|payment|billing|insufficient|402|429/i.test(e),
      );
      const scTimeout = scErrs.some((e) =>
        /timed out|socialcrawl_timeout|socialcrawl_job_timeout|Task timed out/i.test(e),
      );

      const quota = peekManualScanQuota(userId);
      const scLine = useMock
        ? `Demo ${sc}${withMeta ? ` · con métricas ${withMeta}` : ''} · 0 créditos`
        : scKeyMissing
          ? 'Escucha: falta key en servidor'
          : scCredits
            ? 'Escucha: sin créditos'
            : scTimeout
              ? 'Escucha: timeout'
              : sc > 0
                ? `Escucha ${sc}${withMeta ? ` · métricas ${withMeta}` : ''}`
                : scErrs.length
                  ? 'Escucha 0 (error)'
                  : 'Escucha 0 (sin menciones)';

      const parts = [
        found > 0 ? `${found} mención(es)` : '0 menciones',
        scLine,
        cloudErr ? `Dynamo ERROR: ${cloudErr}` : 'Dynamo OK',
      ];
      if (!useMock) {
        parts.push(`manuales ${quota.used}/${quota.limit} hoy`);
      }
      const detail = scErrs.slice(0, 3).join(' · ');
      this._lastStatus.set(detail ? `${parts.join(' · ')} — ${detail}` : parts.join(' · '));
    } catch (err) {
      this._lastStatus.set(
        err instanceof Error ? err.message : 'Error al escanear.',
      );
    } finally {
      setSocialCrawlMock(false);
      this._scanning.set(false);
    }
  }
}
