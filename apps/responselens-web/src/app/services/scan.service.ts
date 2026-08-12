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
import { hasSocialCrawlServer } from '../engine/socialcrawl-client.js';

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

    this._scanning.set(true);
    this._lastStatus.set(
      kind === 'own'
        ? `Escaneando “${cfg.company.companyName}” (SocialCrawl + HN/news)…`
        : 'Escaneando rivales…',
    );

    try {
      const credentials = await loadScanCredentials();
      const sources = { ...loadScanSourcesPrefs() };
      const company = {
        ...cfg.company,
        socialHandles: cfg.company.channelUrls ?? [],
      };

      if (!hasSocialCrawlServer()) {
        this._lastStatus.set(
          'SocialCrawl server off: corré terraform + sync:env (la API key va en Terraform, no en el SPA). Seguimos con HN…',
        );
      }

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
      const sc = Number(result.stats?.['socialcrawl'] ?? 0);
      const hn = Number(result.stats?.['hn'] ?? 0);
      const news = Number(result.stats?.['news'] ?? 0);
      const withMeta = alerts.filter((a) => Boolean(a._scMeta)).length;
      const scCreds = hasSocialCrawlServer();
      const scLine = scCreds
        ? sc > 0
          ? `SC ${sc}${withMeta ? ` · meta ${withMeta}` : ''}`
          : 'SC 0 (proxy OK pero sin menciones nuevas)'
        : 'SC OFF (falta AppSync/Terraform — key solo en servidor)';
      const parts = [
        found > 0 ? `${found} mención(es)` : '0 menciones',
        scLine,
        hn ? `HN ${hn}` : null,
        news ? `News ${news}` : null,
      ].filter(Boolean);

      const errs = (result.errors ?? []).filter(Boolean);
      const scErrs = errs.filter((e) => /socialcrawl/i.test(e));
      const otherErrs = errs.filter((e) => !/socialcrawl/i.test(e));
      const prioritized = [...scErrs, ...otherErrs].slice(0, 4).join(' · ');
      this._lastStatus.set(prioritized ? `${parts.join(' · ')} — ${prioritized}` : parts.join(' · '));
    } catch (err) {
      this._lastStatus.set(
        err instanceof Error ? err.message : 'Error al escanear.',
      );
    } finally {
      this._scanning.set(false);
    }
  }
}
