import {
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import {
  SCAN_SOURCES,
  defaultScanSourcesPrefs,
  loadScanSourcesPrefs,
  saveScanSourcesPrefs,
  type ScanSourcesPrefs,
} from '../../models/scan-sources.model';
import type { CompetitorProfile } from '../../models/user-config.model';
import { UserConfigStore } from '../../stores/user-config.store';
import { loadScanCredentials, saveScanCredentials } from '../../engine/scan-credentials.js';
import { hasSocialCrawlServer } from '../../engine/socialcrawl-client.js';

@Component({
  standalone: true,
  selector: 'rl-settings-page',
  encapsulation: ViewEncapsulation.None,
  imports: [ReactiveFormsModule, IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Configuración</h1>
        <p class="rl-page__lead">
          Empresa, rivales, fuentes de escaneo y credenciales de APIs.
        </p>

        <form class="rl-settings" [formGroup]="form" (ngSubmit)="saveAll()">
          <details class="rl-page__panel rl-disclosure" open>
            <summary class="rl-disclosure__summary">Mi empresa</summary>
            <label class="rl-settings__label">
              Nombre de la marca
              <input class="rl-settings__input" formControlName="companyName" placeholder="Acme Inc." />
            </label>
            <label class="rl-settings__label">
              Aliases (coma)
              <input class="rl-settings__input" formControlName="aliasesText" placeholder="acme, Acme Inc" />
            </label>
            <label class="rl-settings__label">
              Website
              <input class="rl-settings__input" formControlName="websiteUrl" placeholder="https://acme.com" />
            </label>
            <label class="rl-settings__label">
              Qué venden
              <textarea
                class="rl-settings__input rl-settings__textarea"
                formControlName="whatTheySell"
                rows="3"
                placeholder="SaaS de facturación…"
              ></textarea>
            </label>
            <label class="rl-settings__label">
              Tono de marca
              <textarea
                class="rl-settings__input rl-settings__textarea"
                formControlName="brandVoiceNotes"
                rows="2"
                placeholder="Cercano, técnico…"
              ></textarea>
            </label>
            <label class="rl-settings__label">
              URLs de canales (uno por línea)
              <textarea
                class="rl-settings__input rl-settings__textarea"
                formControlName="channelUrlsText"
                rows="3"
                placeholder="https://twitter.com/acme&#10;https://linkedin.com/company/acme"
              ></textarea>
            </label>
          </details>

          <details class="rl-page__panel rl-disclosure" open>
            <summary class="rl-disclosure__summary">Rivales</summary>
            <div class="rl-settings__row">
              <span></span>
              <button type="button" class="rl-settings__ghost" (click)="addCompetitor()">+ Agregar rival</button>
            </div>
            <div formArrayName="competitors">
              @for (ctrl of competitors.controls; track $index; let i = $index) {
                <div class="rl-settings__rival" [formGroupName]="i">
                  <label class="rl-settings__label">
                    Nombre
                    <input class="rl-settings__input" formControlName="name" placeholder="RivalCo" />
                  </label>
                  <label class="rl-settings__label">
                    Aliases (coma)
                    <input class="rl-settings__input" formControlName="aliasesText" placeholder="rival co" />
                  </label>
                  <label class="rl-settings__label">
                    Website
                    <input class="rl-settings__input" formControlName="websiteUrl" placeholder="https://…" />
                  </label>
                  <button type="button" class="rl-settings__ghost rl-settings__ghost--danger" (click)="removeCompetitor(i)">
                    Quitar
                  </button>
                </div>
              } @empty {
                <p class="rl-settings__empty">Sin rivales. Agregá al menos uno para Competencia.</p>
              }
            </div>
          </details>

          <details class="rl-page__panel rl-disclosure">
            <summary class="rl-disclosure__summary">Fuentes de escaneo</summary>
            <p class="rl-settings__empty">Activá las fuentes que usa el motor al escanear.</p>
            @for (src of scanSources; track src.id) {
              <label class="rl-settings__toggle">
                <input
                  type="checkbox"
                  [checked]="isSourceEnabled(src.id)"
                  (change)="toggleSource(src.id, $event)"
                />
                <span>
                  <strong>{{ src.label }}</strong>
                  <small>{{ src.hint }}</small>
                </span>
              </label>
            }
          </details>

          <details class="rl-page__panel rl-disclosure" open>
            <summary class="rl-disclosure__summary">
              APIs y credenciales
              @if (scServerReady()) {
                <span class="rl-badge rl-badge--sent-pos">SocialCrawl server</span>
              } @else {
                <span class="rl-badge rl-badge--sent-neu">SC vía Terraform</span>
              }
            </summary>
            <p class="rl-settings__empty">
              La API key de SocialCrawl <strong>no se configura aquí</strong>: vive en el servidor
              (<code>socialcrawl_api_key</code> en Terraform → Lambda). El SPA solo llama AppSync.
            </p>

            <h3 class="rl-settings__subh">SocialCrawl (preferencias)</h3>
            <label class="rl-settings__label">
              Fuentes (CSV opcional — el escaneo usa todas: HN, news, reddit, YT, X, …)
              <input class="rl-settings__input" formControlName="socialcrawlSources" placeholder="vacío = todas las de SocialCrawl" />
            </label>
            <label class="rl-settings__label">
              Lookback (días)
              <input class="rl-settings__input" type="number" min="1" max="90" formControlName="socialcrawlLookback" />
            </label>

            <h3 class="rl-settings__subh">Reddit OAuth</h3>
            <label class="rl-settings__toggle">
              <input type="checkbox" formControlName="redditEnabled" />
              <span>Activar Reddit OAuth</span>
            </label>
            <label class="rl-settings__label">
              Client ID
              <input class="rl-settings__input" formControlName="redditClientId" autocomplete="off" />
            </label>
            <label class="rl-settings__label">
              Client Secret
              <input class="rl-settings__input" formControlName="redditClientSecret" type="password" autocomplete="off" />
            </label>

            <h3 class="rl-settings__subh">NewsAPI</h3>
            <label class="rl-settings__toggle">
              <input type="checkbox" formControlName="newsapiEnabled" />
              <span>Activar NewsAPI</span>
            </label>
            <label class="rl-settings__label">
              API Key
              <input class="rl-settings__input" formControlName="newsapiKey" type="password" autocomplete="off" />
            </label>

            <h3 class="rl-settings__subh">YouTube Data API</h3>
            <label class="rl-settings__toggle">
              <input type="checkbox" formControlName="youtubeEnabled" />
              <span>Activar YouTube API</span>
            </label>
            <label class="rl-settings__label">
              API Key
              <input class="rl-settings__input" formControlName="youtubeKey" type="password" autocomplete="off" />
            </label>
          </details>

          @if (store.error(); as err) {
            <p class="rl-auth-gate__error">{{ err }}</p>
          }
          @if (savedNotice()) {
            <p class="rl-auth-gate__notice">{{ savedNotice() }}</p>
          }

          <button class="rl-auth-gate__submit" type="submit" [disabled]="store.saving()">
            {{ store.saving() ? 'Guardando…' : 'Guardar todo' }}
          </button>
        </form>
      </div>
    </ion-content>
  `,
})
export class SettingsPageComponent implements OnInit {
  readonly store = inject(UserConfigStore);
  private readonly fb = inject(FormBuilder);

  readonly scanSources = SCAN_SOURCES;
  readonly sourcePrefs = signal<ScanSourcesPrefs>(defaultScanSourcesPrefs());
  readonly savedNotice = signal('');
  readonly scServerReady = signal(false);

  readonly form = this.fb.nonNullable.group({
    companyName: ['', Validators.required],
    aliasesText: [''],
    websiteUrl: [''],
    whatTheySell: [''],
    brandVoiceNotes: [''],
    channelUrlsText: [''],
    competitors: this.fb.array([] as ReturnType<SettingsPageComponent['competitorGroup']>[]),
    redditEnabled: [false],
    redditClientId: [''],
    redditClientSecret: [''],
    newsapiEnabled: [false],
    newsapiKey: [''],
    youtubeEnabled: [false],
    youtubeKey: [''],
    socialcrawlSources: [''],
    socialcrawlLookback: [7],
  });

  get competitors(): FormArray {
    return this.form.controls.competitors;
  }

  ngOnInit(): void {
    this.store.load();
    this.sourcePrefs.set(loadScanSourcesPrefs());

    const cfg = this.store.config();
    if (cfg) {
      const links = cfg.company.keyLinks ?? [];
      this.form.patchValue({
        companyName: cfg.company.companyName,
        aliasesText: (cfg.company.aliases ?? []).join(', '),
        websiteUrl: links[0] ?? '',
        whatTheySell: cfg.company.whatTheySell,
        brandVoiceNotes: cfg.company.brandVoiceNotes,
        channelUrlsText: (cfg.company.channelUrls ?? []).join('\n'),
      });
      this.competitors.clear();
      for (const c of cfg.competitors) {
        this.competitors.push(this.competitorGroup(c));
      }
    }

    void this.loadCreds();
  }

  async loadCreds(): Promise<void> {
    const creds = await loadScanCredentials();
    this.form.patchValue({
      redditEnabled: creds.reddit.enabled,
      redditClientId: creds.reddit.clientId,
      redditClientSecret: creds.reddit.clientSecret,
      newsapiEnabled: creds.newsapi.enabled,
      newsapiKey: creds.newsapi.apiKey,
      youtubeEnabled: creds.youtube.enabled,
      youtubeKey: creds.youtube.apiKey,
      socialcrawlSources: creds.socialcrawl.sources,
      socialcrawlLookback: creds.socialcrawl.lookbackDays || 7,
    });
    this.scServerReady.set(hasSocialCrawlServer());
    // Limpiar key legacy si quedó en localStorage
    if (creds.socialcrawl?.apiKey) {
      await saveScanCredentials({
        ...creds,
        socialcrawl: {
          ...creds.socialcrawl,
          apiKey: '',
          enabled: true,
        },
      });
    }
  }

  competitorGroup(c?: Partial<CompetitorProfile> & { aliasesText?: string }) {
    return this.fb.nonNullable.group({
      name: [c?.name ?? '', Validators.required],
      aliasesText: [(c?.aliases ?? []).join(', ')],
      websiteUrl: [c?.websiteUrl ?? ''],
    });
  }

  addCompetitor(): void {
    this.competitors.push(this.competitorGroup());
  }

  removeCompetitor(index: number): void {
    this.competitors.removeAt(index);
  }

  toggleSource(id: string, event: Event): void {
    const key = id as keyof ScanSourcesPrefs;
    const checked = (event.target as HTMLInputElement).checked;
    this.sourcePrefs.update((p) => {
      const next = { ...p, [key]: checked };
      saveScanSourcesPrefs(next);
      return next;
    });
  }

  isSourceEnabled(id: string): boolean {
    const key = id as keyof ScanSourcesPrefs;
    return this.sourcePrefs()[key];
  }

  async saveAll(): Promise<void> {
    // Quitar rivales vacíos que bloquean el form
    for (let i = this.competitors.length - 1; i >= 0; i -= 1) {
      const name = String(this.competitors.at(i).get('name')?.value || '').trim();
      if (!name) this.competitors.removeAt(i);
    }

    if (this.form.controls.companyName.invalid) {
      this.savedNotice.set('Completá el nombre de empresa antes de Guardar todo.');
      setTimeout(() => this.savedNotice.set(''), 5000);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.savedNotice.set('Hay campos inválidos (revisá rivales).');
      setTimeout(() => this.savedNotice.set(''), 6000);
      return;
    }
    const v = this.form.getRawValue();

    const keyLinks = v.websiteUrl.trim()
      ? [v.websiteUrl.trim(), ...v.channelUrlsText.split('\n').map((s) => s.trim()).filter(Boolean)]
      : v.channelUrlsText.split('\n').map((s) => s.trim()).filter(Boolean);

    const competitors: CompetitorProfile[] = v.competitors.map((c) => ({
      name: c.name,
      aliases: c.aliasesText.split(',').map((s) => s.trim()).filter(Boolean),
      websiteUrl: c.websiteUrl,
      socialHandles: [],
    }));

    await this.store.save(
      {
        companyName: v.companyName,
        aliases: v.aliasesText.split(',').map((s) => s.trim()).filter(Boolean),
        whatTheySell: v.whatTheySell,
        keyLinks: [...new Set(keyLinks)],
        channelUrls: v.channelUrlsText.split('\n').map((s) => s.trim()).filter(Boolean),
        brandVoiceNotes: v.brandVoiceNotes,
      },
      competitors,
    );

    await saveScanCredentials({
      reddit: {
        enabled: v.redditEnabled,
        clientId: v.redditClientId,
        clientSecret: v.redditClientSecret,
        userAgent: 'ResponseLensAI/0.7 (professional-scan)',
      },
      newsapi: { enabled: v.newsapiEnabled, apiKey: v.newsapiKey },
      youtube: { enabled: v.youtubeEnabled, apiKey: v.youtubeKey },
      socialcrawl: {
        enabled: true,
        apiKey: '', // never store SC key in the browser
        sources: v.socialcrawlSources,
        lookbackDays: Number(v.socialcrawlLookback) || 7,
      },
    });

    saveScanSourcesPrefs(this.sourcePrefs());
    this.scServerReady.set(hasSocialCrawlServer());
    this.savedNotice.set(
      hasSocialCrawlServer()
        ? 'Guardado. SocialCrawl usa la key del servidor (AppSync OK).'
        : 'Guardado. SocialCrawl requiere Terraform socialcrawl_api_key + sync:env.',
    );
    setTimeout(() => this.savedNotice.set(''), 6000);
  }
}
