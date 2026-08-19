import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { emptyUserConfig, emptyCompetitor, type CompetitorProfile, type CompanyProfile, type UserConfig } from '../models/user-config.model';
import { isConfiguredCompanyName } from '../engine/brand-setup.js';

const storageKey = (userId: string) => `rl_web_user_config_${userId}`;

@Injectable({ providedIn: 'root' })
export class UserConfigStore {
  private readonly auth = inject(AuthService);

  private readonly _config = signal<UserConfig | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _savedOk = signal(false);

  readonly config = this._config.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();
  readonly savedOk = this._savedOk.asReadonly();
  readonly companyName = computed(() => this._config()?.company.companyName?.trim() || '');
  readonly hasCompany = computed(() => isConfiguredCompanyName(this.companyName()));
  readonly competitors = computed(() => this._config()?.competitors ?? []);
  readonly activeWorkspaceId = signal<string | null>(null);
  readonly workspaceCount = signal(0);
  readonly isolateByWorkspace = computed(() => this.workspaceCount() > 1);

  load(): void {
    const userId = this.auth.userId();
    if (!userId) {
      this._config.set(null);
      return;
    }
    this._loading.set(true);
    this._error.set(null);
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) {
        this._config.set(emptyUserConfig(userId));
        return;
      }
      const parsed = JSON.parse(raw) as UserConfig;
      this._config.set({
        ...emptyUserConfig(userId),
        ...parsed,
        userId,
        company: { ...emptyUserConfig(userId).company, ...parsed.company },
        competitors: Array.isArray(parsed.competitors)
          ? parsed.competitors.map((c) => ({ ...emptyCompetitor(), ...c }))
          : [],
      });
    } catch {
      this._config.set(emptyUserConfig(userId));
      this._error.set('No se pudo leer la config local.');
    } finally {
      this._loading.set(false);
    }
  }

  async save(company: CompanyProfile, competitors: CompetitorProfile[]): Promise<void> {
    const userId = this.auth.userId();
    if (!userId) throw new Error('Sin sesión.');

    this._saving.set(true);
    this._error.set(null);
    this._savedOk.set(false);
    try {
      const next: UserConfig = {
        userId,
        company: {
          companyName: company.companyName.trim(),
          aliases: (company.aliases ?? []).map((a) => a.trim()).filter(Boolean),
          whatTheySell: company.whatTheySell.trim(),
          keyLinks: company.keyLinks.map((l) => l.trim()).filter(Boolean),
          channelUrls: (company.channelUrls ?? []).map((l) => l.trim()).filter(Boolean),
          brandVoiceNotes: company.brandVoiceNotes.trim(),
          ga4PropertyId: (company.ga4PropertyId ?? '').trim(),
          searchConsoleSiteUrl: (company.searchConsoleSiteUrl ?? '').trim(),
          metaAdsAccountId: (company.metaAdsAccountId ?? '').trim(),
          googleAdsCustomerId: (company.googleAdsCustomerId ?? '').trim(),
          slackWebhookUrl: (company.slackWebhookUrl ?? '').trim(),
        },
        competitors: competitors
          .map((c) => ({
            name: c.name.trim(),
            aliases: (c.aliases ?? []).map((a) => a.trim()).filter(Boolean),
            websiteUrl: (c.websiteUrl ?? '').trim(),
            socialHandles: (c.socialHandles ?? []).map((h) => h.trim()).filter(Boolean),
            statusUrl: (c.statusUrl ?? '').trim(),
            pricingUrl: (c.pricingUrl ?? '').trim(),
            careersUrl: (c.careersUrl ?? '').trim(),
          }))
          .filter((c) => c.name),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      this._config.set(next);
      this._savedOk.set(true);
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Error al guardar.');
      throw err;
    } finally {
      this._saving.set(false);
    }
  }

  applySnapshot(config: UserConfig): void {
    const userId = this.auth.userId();
    if (!userId) return;
    const next: UserConfig = {
      ...config,
      userId,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
    this._config.set(next);
  }
}
