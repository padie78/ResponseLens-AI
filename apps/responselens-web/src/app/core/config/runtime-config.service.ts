import { Injectable, computed, signal } from '@angular/core';
import { configureAmplify } from '../../amplify.config';
import { environment } from '../../../environments/environment';
import type { AppRuntimeEnvironment } from '../../../environments/environment.types';

const STORAGE_KEY = 'rl_web_cloud_config';

/** Override local de Cognito/AppSync (dev) cuando environment.ts está vacío. */
export interface CloudConfigOverride {
  region: string;
  userPoolId: string;
  clientId: string;
  graphqlUrl?: string;
  apiKey?: string;
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly _override = signal<CloudConfigOverride | null>(this.readOverride());

  readonly override = this._override.asReadonly();

  readonly resolved = computed((): AppRuntimeEnvironment => {
    const base = environment;
    const o = this._override();
    if (!o?.userPoolId || !o?.clientId) return base;

    return {
      ...base,
      appsync: {
        endpoint: o.graphqlUrl?.trim() || base.appsync.endpoint,
        region: o.region?.trim() || base.appsync.region,
        apiKey: o.apiKey?.trim() || base.appsync.apiKey,
      },
      cognito: {
        ...base.cognito,
        userPoolId: o.userPoolId.trim(),
        userPoolClientId: o.clientId.trim(),
      },
    };
  });

  readonly isCognitoConfigured = computed(() => {
    const env = this.resolved();
    return !!env.cognito.userPoolId && !!env.cognito.userPoolClientId;
  });

  /** Llamar al boot y tras guardar Config. */
  applyAmplify(): void {
    configureAmplify(this.resolved());
  }

  saveOverride(cfg: CloudConfigOverride): void {
    const cleaned: CloudConfigOverride = {
      region: cfg.region.trim(),
      userPoolId: cfg.userPoolId.trim(),
      clientId: cfg.clientId.trim(),
      graphqlUrl: cfg.graphqlUrl?.trim() || undefined,
      apiKey: cfg.apiKey?.trim() || undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    this._override.set(cleaned);
    this.applyAmplify();
  }

  clearOverride(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._override.set(null);
    this.applyAmplify();
  }

  private readOverride(): CloudConfigOverride | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CloudConfigOverride;
      if (!parsed?.userPoolId || !parsed?.clientId) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
