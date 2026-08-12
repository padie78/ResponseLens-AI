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
import { setSocialCrawlMock } from '../engine/socialcrawl-mock.js';

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
    await this.runScan('own', { mock: false });
  }

  async scanCompetitors(): Promise<void> {
    await this.runScan('comp', { mock: false });
  }

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
    const userId = this.auth.userId();
    this.configStore.load();
    const cfg = this.configStore.config();
    if (!userId || !cfg) {
      this._lastStatus.set('Sin sesión o config.');
      return;
    }

    if (kind === 'own' && !cfg.company.companyName?.trim()) {
      this._lastStatus.set('Configurá el nombre de marca (ej. Stripe) en Config.');
      return;
    }
    if (kind === 'comp' && !cfg.competitors.length) {
      this._lastStatus.set('Agregá al menos un rival en Config.');
      return;
    }

    if (!hasSocialCrawlServer()) {
      this._lastStatus.set(
        opts.mock
          ? 'Scanner mock necesita AppSync (mismo pipeline SQS). Corré npm run sync:env.'
          : 'SocialCrawl off: falta AppSync (npm run sync:env).',
      );
      return;
    }

    this._scanning.set(true);
    setSocialCrawlMock(opts.mock);
    this._lastStatus.set(
      opts.mock
        ? kind === 'own'
          ? `Mock SocialCrawl via SQS “${cfg.company.companyName}”…`
          : 'Mock SocialCrawl via SQS (rivales)…'
        : kind === 'own'
          ? `SocialCrawl “${cfg.company.companyName}”…`
          : 'SocialCrawl rivales…',
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
          competitors: cfg.competitors,
        } as never)) as ScanEngineResult;
      }

      const alerts = (result.opportunities ?? []).map((opp) => {
        const mapped = mapOpportunityToAlert(opp, userId);
        // Garantiza scope correcto hacia Dynamo (Propios vs Competencia).
        if (kind === 'own') {
          mapped.brandScope = 'own';
          mapped._brandScope = 'own';
        } else {
          mapped.brandScope = 'rival';
          mapped._brandScope = 'rival';
        }
        return mapped;
      });
      // Mock: reemplaza el scope en Dynamo; real: upsert (propios y rivales).
      const scope = kind === 'own' ? 'own' : 'rival';
      if (opts.mock) {
        await this.alertsStore.clearScope(scope);
        if (alerts.length) await this.alertsStore.upsertMany(alerts);
      } else if (alerts.length) {
        await this.alertsStore.upsertMany(alerts);
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

      const scLine = opts.mock
        ? `SC MOCK ${sc}${withMeta ? ` · meta ${withMeta}` : ''}`
        : scKeyMissing
          ? 'SC ERROR (key falta en Lambda)'
          : scCredits
            ? 'SC SIN CRÉDITOS'
            : scTimeout
              ? 'SC TIMEOUT'
              : sc > 0
                ? `SC ${sc}${withMeta ? ` · meta ${withMeta}` : ''}`
                : scErrs.length
                  ? 'SC 0 (error)'
                  : 'SC 0 (sin menciones)';

      const parts = [
        found > 0 ? `${found} mención(es)` : '0 menciones',
        scLine,
        cloudErr ? `Dynamo ERROR: ${cloudErr}` : 'Dynamo OK',
      ];
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
