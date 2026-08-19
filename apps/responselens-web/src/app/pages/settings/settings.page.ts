import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import {
  defaultScanSourcesPrefs,
  loadScanSourcesPrefs,
  saveScanSourcesPrefs,
  type ScanSourcesPrefs,
} from '../../models/scan-sources.model';
import type { CompetitorProfile } from '../../models/user-config.model';
import { UserConfigStore } from '../../stores/user-config.store';
import { loadScanCredentials, saveScanCredentials } from '../../engine/scan-credentials.js';
import { loadCrisisThreshold, saveCrisisThreshold } from '../../engine/ops-queue.js';
import { SCAN_MAX_RIVALS } from '../../engine/listening-policy.js';
import {
  companySetupMessage,
  isConfiguredCompanyName,
  rivalCapMessage,
} from '../../engine/brand-setup.js';
import { hasSocialCrawlServer } from '../../engine/socialcrawl-client.js';
import { SOCIALCRAWL_EVERYWHERE_SOURCES } from '../../engine/socialcrawl-sources.js';
import { loadPiiLog, piiLogCsv } from '../../engine/ops-audit.js';
import { WorkspaceStore } from '../../stores/workspace.store';
import type { WorkspaceSnapshot } from '../../engine/workspace-scope';
import { AuthService } from '../../core/auth/auth.service';

type SettingsTab = 'empresa' | 'rivales' | 'escucha' | 'espacios' | 'integraciones' | 'avanzado';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'empresa', label: 'Empresa', icon: 'pi pi-building' },
  { id: 'rivales', label: 'Rivales', icon: 'pi pi-users' },
  { id: 'escucha', label: 'Escucha', icon: 'pi pi-wifi' },
  { id: 'espacios', label: 'Empresas', icon: 'pi pi-th-large' },
  { id: 'integraciones', label: 'Integraciones', icon: 'pi pi-link' },
  { id: 'avanzado', label: 'Avanzado', icon: 'pi pi-cog' },
];

const SC_SOURCE_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  'twitter-ai-search': 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  hackernews: 'HN',
  polymarket: 'Polymarket',
  github: 'GitHub',
  threads: 'Threads',
  pinterest: 'Pinterest',
  perplexity: 'Perplexity',
  tavily: 'News',
  linkedin: 'LinkedIn',
  rumble: 'Rumble',
};

const ALL_SC_SOURCES = SOCIALCRAWL_EVERYWHERE_SOURCES.split(',').map((s: string) => s.trim());

function parseCsv(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCsv(list: string[]): string {
  return list.join(', ');
}

function normalizeWebsite(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

@Component({
  standalone: true,
  selector: 'rl-settings-page',
  encapsulation: ViewEncapsulation.None,
  imports: [ReactiveFormsModule, IonContent, ButtonModule],
  template: `
    <ion-content>
      <div class="rl-page rl-settings-page">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Configuración</h1>
            <p class="rl-page__lead">
              El scan busca exactamente estos nombres. Completá marca y 3–5 rivales para que la pasada diaria tenga foco.
            </p>
          </div>
          <div class="rl-own__actions">
            <p-button
              type="button"
              [label]="store.saving() ? 'Guardando…' : dirty() ? 'Guardar cambios' : 'Guardado'"
              icon="pi pi-save"
              size="small"
              [disabled]="store.saving() || !dirty()"
              (onClick)="saveAll()"
            />
          </div>
        </header>

        @if (dirty()) {
          <p class="rl-settings__banner" role="status">Hay cambios sin guardar.</p>
        }
        @if (store.error(); as err) {
          <p class="rl-auth-gate__error">{{ err }}</p>
        }
        @if (savedNotice()) {
          <p class="rl-auth-gate__notice">{{ savedNotice() }}</p>
        }

        <div class="rl-own__kpis rl-settings__kpis" role="group" aria-label="Estado de configuración">
          <div class="rl-own__kpi" [attr.data-tone]="setup().brandOk ? 'responded' : 'urgent'">
            <strong>{{ setup().brandOk ? 'Lista' : 'Falta' }}</strong>
            <span>Marca pública</span>
          </div>
          <div class="rl-own__kpi" [attr.data-tone]="setup().rivalsOk ? 'responded' : setup().rivalCount ? 'pending' : 'urgent'">
            <strong>{{ setup().rivalCount }} / {{ maxRivals }}</strong>
            <span>Rivales</span>
          </div>
          <div class="rl-own__kpi" data-tone="total">
            <strong>{{ setup().lookback }}d</strong>
            <span>Lookback manual</span>
          </div>
          <div class="rl-own__kpi" data-tone="snoozed">
            <strong>≥ {{ setup().crisis }}</strong>
            <span>Crisis / 24 h</span>
          </div>
          <div class="rl-own__kpi" [attr.data-tone]="scServerReady() ? 'responded' : 'pending'">
            <strong>{{ scServerReady() ? 'OK' : 'Terraform' }}</strong>
            <span>Escucha</span>
          </div>
        </div>

        <nav class="rl-settings__tabs" aria-label="Secciones">
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              class="rl-intel__pill"
              [class.is-active]="activeTab() === tab.id"
              (click)="setTab(tab.id)"
            >
              <i [class]="tab.icon" aria-hidden="true"></i>
              {{ tab.label }}
              @if (tab.id === 'rivales' && setup().rivalCount) {
                <span class="rl-settings__tab-count">{{ setup().rivalCount }}</span>
              }
            </button>
          }
        </nav>

        <form class="rl-settings" [formGroup]="form" (ngSubmit)="saveAll()">
          @if (activeTab() === 'empresa') {
            <section class="rl-settings__card">
              <header class="rl-settings__card-head">
                <h2>Mi empresa</h2>
                <p>Nombre público: cómo sale en un hilo. No uses el legal (S.A., LLC).</p>
              </header>
              <div class="rl-settings__grid">
                <label class="rl-settings__label">
                  Nombre público
                  <span class="rl-settings__hint">Ej. Mercado Pago, no MercadoLibre S.R.L.</span>
                  <input class="rl-settings__input" formControlName="companyName" placeholder="Stripe" />
                </label>
                <label class="rl-settings__label">
                  Website
                  <span class="rl-settings__hint">Ficha y contexto. No es query de escucha.</span>
                  <input class="rl-settings__input" formControlName="websiteUrl" placeholder="acme.com" />
                </label>
              </div>
              <label class="rl-settings__label">
                Aliases
                <span class="rl-settings__hint">Productos, servicios, siglas o handles. Cada alias se escanea como query independiente.</span>
                <div class="rl-settings__chips">
                  @for (alias of companyAliases(); track alias) {
                    <button type="button" class="rl-settings__chip" (click)="removeCompanyAlias(alias)" [title]="'Quitar ' + alias">
                      {{ alias }} <i class="pi pi-times" aria-hidden="true"></i>
                    </button>
                  }
                  <input
                    class="rl-settings__chip-input"
                    placeholder="ej: Slack Connect, MSFT…"
                    [value]="aliasDraft()"
                    (input)="onAliasDraft($event)"
                    (keydown.enter)="commitCompanyAlias($event)"
                    (keydown.comma)="commitCompanyAlias($event)"
                  />
                </div>
              </label>
              <div class="rl-settings__grid">
                <label class="rl-settings__label">
                  Qué venden
                  <textarea class="rl-settings__input rl-settings__textarea" formControlName="whatTheySell" rows="3" placeholder="SaaS de facturación…"></textarea>
                </label>
                <label class="rl-settings__label">
                  Tono de marca
                  <textarea class="rl-settings__input rl-settings__textarea" formControlName="brandVoiceNotes" rows="3" placeholder="Cercano, técnico…"></textarea>
                </label>
              </div>
              <div class="rl-settings__grid">
                <label class="rl-settings__label">
                  Categoría / mercado
                  <span class="rl-settings__hint">Sirve para agrupar tendencias. Ej: pagos online, CRM, ciberseguridad.</span>
                  <input class="rl-settings__input" formControlName="marketCategory" placeholder="pagos online" />
                </label>
                <label class="rl-settings__label">
                  Keywords de industria
                  <span class="rl-settings__hint">Una por línea o separadas por coma. Alimentan Feed global y Tendencias.</span>
                  <textarea
                    class="rl-settings__input rl-settings__textarea"
                    formControlName="industryKeywordsText"
                    rows="3"
                    placeholder="fintech&#10;pagos&#10;fraude&#10;checkout"
                  ></textarea>
                </label>
              </div>
              <label class="rl-settings__label">
                URLs de canales (una por línea)
                <textarea
                  class="rl-settings__input rl-settings__textarea"
                  formControlName="channelUrlsText"
                  rows="3"
                  placeholder="https://x.com/acme"
                ></textarea>
              </label>
            </section>
          }

          @if (activeTab() === 'rivales') {
            <section class="rl-settings__card">
              <header class="rl-settings__card-head">
                <div>
                  <h2>Rivales</h2>
                  <p>Nombre público. El website alimenta la ficha, no la query. Máximo {{ maxRivals }} por pasada.</p>
                </div>
                <button
                  type="button"
                  class="rl-settings__ghost"
                  (click)="addCompetitor()"
                  [disabled]="competitors.length >= maxRivals"
                >
                  + Agregar
                </button>
              </header>
              <div class="rl-settings__progress" [style.--pct]="rivalPct()">
                <span>{{ competitors.length }} / {{ maxRivals }}</span>
              </div>
              <div class="rl-settings__rivals" formArrayName="competitors">
                @for (ctrl of competitors.controls; track $index; let i = $index) {
                  <article class="rl-settings__rival-card" [formGroupName]="i" [class.is-dup]="isDupName(i)">
                    <header class="rl-settings__rival-card__head">
                      <strong>{{ ctrl.get('name')?.value || 'Nuevo rival' }}</strong>
                      <button type="button" class="rl-settings__ghost rl-settings__ghost--danger" (click)="removeCompetitor(i)">
                        Quitar
                      </button>
                    </header>
                    @if (isDupName(i)) {
                      <p class="rl-settings__warn">Nombre repetido: el cron solo usa una query.</p>
                    }
                    <label class="rl-settings__label">
                      Nombre público
                      <input class="rl-settings__input" formControlName="name" placeholder="PayPal" />
                    </label>
                    <label class="rl-settings__label">
                      Aliases
                      <span class="rl-settings__hint">Productos, sub-marcas o siglas. Cada uno se escanea por separado.</span>
                      <div class="rl-settings__chips">
                        @for (alias of rivalAliases(i); track alias) {
                          <button type="button" class="rl-settings__chip" (click)="removeRivalAlias(i, alias)">
                            {{ alias }} <i class="pi pi-times" aria-hidden="true"></i>
                          </button>
                        }
                        <input
                          class="rl-settings__chip-input"
                          placeholder="ej: PayPal Credit, Venmo…"
                          (keydown.enter)="commitRivalAlias(i, $event)"
                          (keydown.comma)="commitRivalAlias(i, $event)"
                        />
                      </div>
                    </label>
                    <label class="rl-settings__label">
                      Website
                      <input class="rl-settings__input" formControlName="websiteUrl" placeholder="paypal.com" />
                    </label>
                    <div class="rl-settings__grid">
                      <label class="rl-settings__label">
                        Status page
                        <span class="rl-settings__hint">F2.2 — RSS/JSON/HTML público.</span>
                        <input class="rl-settings__input" formControlName="statusUrl" placeholder="status.acme.com" />
                      </label>
                      <label class="rl-settings__label">
                        Pricing
                        <span class="rl-settings__hint">F2.3 — URL de /pricing para diff diario.</span>
                        <input class="rl-settings__input" formControlName="pricingUrl" placeholder="acme.com/pricing" />
                      </label>
                      <label class="rl-settings__label">
                        Careers
                        <span class="rl-settings__hint">F2.4 — tablero de empleo, no Glassdoor.</span>
                        <input class="rl-settings__input" formControlName="careersUrl" placeholder="acme.com/careers" />
                      </label>
                    </div>
                  </article>
                } @empty {
                  <div class="rl-settings__empty-card">
                    <p>Todavía no hay rivales. Agregá 3 a 5 para Competencia, battlecards y el cron.</p>
                    <button type="button" class="rl-settings__ghost" (click)="addCompetitor()">+ Primer rival</button>
                  </div>
                }
              </div>
            </section>
          }

          @if (activeTab() === 'escucha') {
            <section class="rl-settings__card">
              <header class="rl-settings__card-head">
                <h2>Escucha</h2>
                <p>
                  Pasada automática 1× al día (~08:00 AR), lookback de cron 2 días.
                  Forzar ahora usa el lookback de acá. Scan demo no gasta créditos.
                </p>
              </header>
              <div class="rl-settings__metrics">
                <label class="rl-settings__metric">
                  <span>Lookback Forzar ahora</span>
                  <span class="rl-settings__hint">Días hacia atrás al adelantar la pasada.</span>
                  <div class="rl-settings__stepper">
                    <button type="button" (click)="bump('socialcrawlLookback', -1, 1, 30)" aria-label="Menos días">−</button>
                    <input class="rl-settings__input" type="number" min="1" max="30" formControlName="socialcrawlLookback" />
                    <button type="button" (click)="bump('socialcrawlLookback', 1, 1, 30)" aria-label="Más días">+</button>
                  </div>
                </label>
                <label class="rl-settings__metric">
                  <span>Umbral de crisis</span>
                  <span class="rl-settings__hint">Menciones de un rival en 24 h.</span>
                  <div class="rl-settings__stepper">
                    <button type="button" (click)="bump('crisisThreshold', -1, 1, 99)" aria-label="Bajar umbral">−</button>
                    <input class="rl-settings__input" type="number" min="1" max="99" formControlName="crisisThreshold" />
                    <button type="button" (click)="bump('crisisThreshold', 1, 1, 99)" aria-label="Subir umbral">+</button>
                  </div>
                </label>
              </div>
              <div class="rl-settings__label">
                <span>Fuentes SocialCrawl</span>
                <span class="rl-settings__hint">Vacío / todas = fan-out completo. Desmarcá para acotar.</span>
                <div class="rl-settings__chips rl-settings__chips--wrap">
                  @for (src of scSources; track src) {
                    <button
                      type="button"
                      class="rl-settings__chip"
                      [class.is-on]="isScSourceOn(src)"
                      (click)="toggleScSource(src)"
                    >
                      {{ scLabel(src) }}
                    </button>
                  }
                </div>
                <button type="button" class="rl-settings__ghost" (click)="resetScSources()">Usar todas</button>
              </div>
            </section>
          }

          @if (activeTab() === 'espacios') {
            <section class="rl-settings__card">
              <header class="rl-settings__card-head">
                <h2>Empresas</h2>
                <p>
                  Cada empresa tiene su pack de rivales, bandeja y radar.
                  El combo del menú cambia el espacio de análisis.
                </p>
              </header>
              <div class="rl-settings__workspace-form">
                <button type="button" class="rl-settings__ghost" (click)="addCompany()">
                  + Nueva empresa
                </button>
              </div>
              <div class="rl-settings__ws-list">
                @for (ws of workspaces.items(); track ws.id) {
                  <article class="rl-settings__ws" [class.is-active]="ws.id === workspaces.activeId()">
                    <div>
                      <strong>{{ ws.label }}</strong>
                      <span>
                        {{ rivalCount(ws) }} rivales
                        @if (ws.id === workspaces.activeId()) { · activa }
                        · {{ formatSaved(ws.savedAt) }}
                      </span>
                    </div>
                    <div class="rl-settings__ws-actions">
                      @if (ws.id !== workspaces.activeId()) {
                        <button type="button" class="rl-settings__ghost" (click)="loadWorkspace(ws.id)">Usar</button>
                      }
                      <button type="button" class="rl-settings__ghost rl-settings__ghost--danger" (click)="removeWorkspace(ws.id)">Quitar</button>
                    </div>
                  </article>
                } @empty {
                  <p class="rl-settings__empty">Guardá la empresa actual para poder agregar otra.</p>
                }
              </div>
            </section>
          }

          @if (activeTab() === 'integraciones') {
            <section class="rl-settings__card">
              <header class="rl-settings__card-head">
                <h2>Integraciones</h2>
                <p>Conectá tus cuentas de ads y herramientas. OAuth real próximamente.</p>
              </header>

              <h3 class="rl-settings__subh">Ads propios (F3.1)</h3>
              <p class="rl-settings__hint" style="margin-bottom: .75rem">
                Campañas Meta y Google Ads de tu marca. Datos en mock hasta OAuth.
              </p>
              <div class="rl-settings__grid">
                <label class="rl-settings__label">
                  Meta Ads Account ID
                  <span class="rl-settings__hint">act_123456789 (de Business Manager).</span>
                  <input class="rl-settings__input" formControlName="metaAdsAccountId" placeholder="act_123456789" />
                </label>
                <label class="rl-settings__label">
                  Google Ads Customer ID
                  <span class="rl-settings__hint">123-456-7890 (de Google Ads).</span>
                  <input class="rl-settings__input" formControlName="googleAdsCustomerId" placeholder="123-456-7890" />
                </label>
              </div>
              <p class="rl-settings__empty">
                @if (form.controls.metaAdsAccountId.value || form.controls.googleAdsCustomerId.value) {
                  <span class="rl-badge rl-badge--sent-pos">Conectado (mock)</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Pendiente</span>
                }
                <button type="button" class="rl-settings__ghost" disabled title="Requiere OAuth — próximamente">
                  <i class="pi pi-lock"></i> Conectar con OAuth
                </button>
              </p>

              <h3 class="rl-settings__subh">Slack Digest (F3.7)</h3>
              <p class="rl-settings__hint" style="margin-bottom: .75rem">
                Webhook de Slack para enviar el digest diario automáticamente.
              </p>
              <label class="rl-settings__label">
                Incoming Webhook URL
                <span class="rl-settings__hint">https://hooks.slack.com/services/…</span>
                <input class="rl-settings__input" formControlName="slackWebhookUrl" placeholder="https://hooks.slack.com/services/T.../B.../xxx" />
              </label>
              <p class="rl-settings__empty">
                @if (form.controls.slackWebhookUrl.value) {
                  <span class="rl-badge rl-badge--sent-pos">Slack conectado</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Sin webhook</span>
                }
              </p>

              <h3 class="rl-settings__subh">SEO — Semrush / Similarweb (F4.1)</h3>
              <label class="rl-settings__label">
                Semrush API Key
                <span class="rl-settings__hint">API key de tu plan Semrush.</span>
                <input class="rl-settings__input" formControlName="semrushApiKey" type="password" placeholder="xxxxxxxxxxxxxxxx" autocomplete="off" />
              </label>
              <p class="rl-settings__empty">
                @if (form.controls.semrushApiKey.value) {
                  <span class="rl-badge rl-badge--sent-pos">Conectado (mock)</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Pendiente — requiere contrato</span>
                }
              </p>

              <h3 class="rl-settings__subh">Reviews — G2 / Capterra (F4.2)</h3>
              <label class="rl-settings__label">
                G2 Company Slug
                <span class="rl-settings__hint">Slug del perfil G2 (ej: "responselens").</span>
                <input class="rl-settings__input" formControlName="g2CompanySlug" placeholder="responselens" />
              </label>
              <p class="rl-settings__empty">
                @if (form.controls.g2CompanySlug.value) {
                  <span class="rl-badge rl-badge--sent-pos">Conectado (mock)</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Pendiente — requiere partner</span>
                }
              </p>

              <h3 class="rl-settings__subh">Employer brand — Glassdoor (F4.3)</h3>
              <label class="rl-settings__label">
                Glassdoor Employer ID
                <span class="rl-settings__hint">ID numérico del perfil Glassdoor.</span>
                <input class="rl-settings__input" formControlName="glassdoorEmployerId" placeholder="123456" />
              </label>
              <p class="rl-settings__empty">
                @if (form.controls.glassdoorEmployerId.value) {
                  <span class="rl-badge rl-badge--sent-pos">Conectado (mock)</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Pendiente — enterprise</span>
                }
              </p>

              <h3 class="rl-settings__subh">Social Ads — TikTok / LinkedIn (F4.4)</h3>
              <div class="rl-settings__grid">
                <label class="rl-settings__label">
                  TikTok Ads Account ID
                  <input class="rl-settings__input" formControlName="tiktokAdsAccountId" placeholder="7xxx..." />
                </label>
                <label class="rl-settings__label">
                  LinkedIn Ads Account ID
                  <input class="rl-settings__input" formControlName="linkedinAdsAccountId" placeholder="5xxx..." />
                </label>
              </div>
              <p class="rl-settings__empty">
                @if (form.controls.tiktokAdsAccountId.value || form.controls.linkedinAdsAccountId.value) {
                  <span class="rl-badge rl-badge--sent-pos">Conectado (mock)</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Pendiente — ToS + pago</span>
                }
              </p>

              <h3 class="rl-settings__subh">AI Visibility — Prism / Otterly (F4.5)</h3>
              <label class="rl-settings__label">
                Proveedor
                <span class="rl-settings__hint">"prism" u "otterly".</span>
                <input class="rl-settings__input" formControlName="aiVisibilityProvider" placeholder="prism" />
              </label>
              <p class="rl-settings__empty">
                @if (form.controls.aiVisibilityProvider.value) {
                  <span class="rl-badge rl-badge--sent-pos">Conectado (mock)</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Pendiente — pago por query</span>
                }
              </p>
            </section>
          }

          @if (activeTab() === 'avanzado') {
            <section class="rl-settings__card">
              <header class="rl-settings__card-head">
                <h2>Avanzado</h2>
                <p>
                  La key de escucha vive en Terraform, no acá.
                  Reddit / NewsAPI / YouTube <strong>no alimentan</strong> el scan actual (solo SocialCrawl).
                </p>
              </header>
              <div class="rl-settings__grid">
                <label class="rl-settings__label">
                  GA4 property id
                  <span class="rl-settings__hint">F2.5 — marca propia. Mock hasta OAuth Google.</span>
                  <input class="rl-settings__input" formControlName="ga4PropertyId" placeholder="G-XXXX o 123456789" />
                </label>
                <label class="rl-settings__label">
                  Search Console — sitio
                  <span class="rl-settings__hint">URL de la propiedad (https://acme.com).</span>
                  <input class="rl-settings__input" formControlName="searchConsoleSiteUrl" placeholder="https://acme.com" />
                </label>
              </div>
              <p class="rl-settings__empty">
                @if (scServerReady()) {
                  <span class="rl-badge rl-badge--sent-pos">Escucha lista</span>
                } @else {
                  <span class="rl-badge rl-badge--sent-neu">Falta AppSync / Terraform</span>
                }
              </p>

              <details class="rl-settings__legacy">
                <summary>Credenciales legacy (no usadas por el scan)</summary>
                <h3 class="rl-settings__subh">Reddit OAuth</h3>
                <label class="rl-settings__toggle">
                  <input type="checkbox" formControlName="redditEnabled" />
                  <span>Activar Reddit OAuth</span>
                </label>
                <div class="rl-settings__grid">
                  <label class="rl-settings__label">
                    Client ID
                    <input class="rl-settings__input" formControlName="redditClientId" autocomplete="off" />
                  </label>
                  <label class="rl-settings__label">
                    Client Secret
                    <input class="rl-settings__input" formControlName="redditClientSecret" type="password" autocomplete="off" />
                  </label>
                </div>
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

              <div class="rl-settings__pii">
                <h3 class="rl-settings__subh">Compliance (vistas de PII)</h3>
                <p class="rl-settings__hint">Registro local de quién abrió el informe. No sale a un SIEM.</p>
                <p class="rl-settings__pii-count">{{ piiCount() }} eventos</p>
                <button type="button" class="rl-settings__ghost" (click)="exportPiiCsv()" [disabled]="piiCount() === 0">
                  Descargar CSV
                </button>
              </div>
            </section>
          }
        </form>

        @if (dirty()) {
          <div class="rl-settings__dock">
            <span>Cambios sin guardar</span>
            <p-button type="button" label="Guardar" size="small" [disabled]="store.saving()" (onClick)="saveAll()" />
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class SettingsPageComponent implements OnInit, OnDestroy {
  readonly store = inject(UserConfigStore);
  readonly workspaces = inject(WorkspaceStore);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly tabs = TABS;
  readonly scSources = ALL_SC_SOURCES;
  readonly maxRivals = SCAN_MAX_RIVALS;
  readonly sourcePrefs = signal<ScanSourcesPrefs>(defaultScanSourcesPrefs());
  readonly savedNotice = signal('');
  readonly scServerReady = signal(false);
  readonly piiCount = signal(0);
  readonly dirty = signal(false);
  readonly activeTab = signal<SettingsTab>('empresa');
  readonly aliasDraft = signal('');
  readonly formTick = signal(0);

  private hydrating = true;
  private skipWsSync = true;
  private sub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.workspaces.activeId();
      void id;
      void this.store.config()?.updatedAt;
      if (this.skipWsSync) return;
      this.hydrating = true;
      this.applyConfigToForm();
      this.refreshLocalOps();
      this.hydrating = false;
      this.dirty.set(false);
    });
  }

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
    crisisThreshold: [5],
    ga4PropertyId: [''],
    searchConsoleSiteUrl: [''],
    metaAdsAccountId: [''],
    googleAdsCustomerId: [''],
    slackWebhookUrl: [''],
    semrushApiKey: [''],
    g2CompanySlug: [''],
    glassdoorEmployerId: [''],
    tiktokAdsAccountId: [''],
    linkedinAdsAccountId: [''],
    aiVisibilityProvider: [''],
    industryKeywordsText: [''],
    marketCategory: [''],
  });

  readonly setup = computed(() => {
    this.formTick();
    const name = this.form.controls.companyName.value;
    const rivals = this.competitors.controls.filter((c) => String(c.get('name')?.value || '').trim()).length;
    return {
      brandOk: isConfiguredCompanyName(name),
      rivalCount: rivals,
      rivalsOk: rivals >= 3,
      lookback: Number(this.form.controls.socialcrawlLookback.value) || 7,
      crisis: Number(this.form.controls.crisisThreshold.value) || 5,
    };
  });

  get competitors(): FormArray {
    return this.form.controls.competitors;
  }

  ngOnInit(): void {
    this.store.load();
    this.sourcePrefs.set(loadScanSourcesPrefs());
    this.applyConfigToForm();
    void this.loadCreds().then(() => {
      this.hydrating = false;
      this.dirty.set(false);
      this.skipWsSync = false;
    });
    this.refreshLocalOps();
    this.sub = this.form.valueChanges.subscribe(() => {
      this.formTick.update((n) => n + 1);
      if (!this.hydrating) this.dirty.set(true);
    });
    const tab = this.parseTab(this.route.snapshot.queryParamMap.get('tab'));
    if (tab) this.activeTab.set(tab);
    this.route.queryParamMap.subscribe((q) => {
      const next = this.parseTab(q.get('tab'));
      if (next) this.activeTab.set(next);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    ev.preventDefault();
    ev.returnValue = true;
  }

  setTab(id: SettingsTab): void {
    this.activeTab.set(id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  companyAliases(): string[] {
    this.formTick();
    return parseCsv(this.form.controls.aliasesText.value);
  }

  rivalAliases(index: number): string[] {
    this.formTick();
    return parseCsv(String(this.competitors.at(index).get('aliasesText')?.value || ''));
  }

  rivalPct(): string {
    return `${Math.round((this.competitors.length / this.maxRivals) * 100)}%`;
  }

  scLabel(id: string): string {
    return SC_SOURCE_LABELS[id] || id;
  }

  isScSourceOn(id: string): boolean {
    this.formTick();
    const csv = this.form.controls.socialcrawlSources.value.trim();
    if (!csv) return true;
    return parseCsv(csv).includes(id);
  }

  toggleScSource(id: string): void {
    const csv = this.form.controls.socialcrawlSources.value.trim();
    const current = csv ? parseCsv(csv) : [...ALL_SC_SOURCES];
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
    if (!next.length) {
      this.form.controls.socialcrawlSources.setValue('');
      return;
    }
    const allOn = ALL_SC_SOURCES.every((s) => next.includes(s)) && next.length === ALL_SC_SOURCES.length;
    this.form.controls.socialcrawlSources.setValue(allOn ? '' : next.join(','));
  }

  resetScSources(): void {
    this.form.controls.socialcrawlSources.setValue('');
  }

  onAliasDraft(ev: Event): void {
    this.aliasDraft.set(String((ev.target as HTMLInputElement).value || ''));
  }

  commitCompanyAlias(ev: Event): void {
    ev.preventDefault();
    const value = this.aliasDraft().replace(/,/g, '').trim();
    if (!value) return;
    const next = [...this.companyAliases().filter((a) => a.toLowerCase() !== value.toLowerCase()), value];
    this.form.controls.aliasesText.setValue(toCsv(next));
    this.aliasDraft.set('');
  }

  removeCompanyAlias(alias: string): void {
    this.form.controls.aliasesText.setValue(toCsv(this.companyAliases().filter((a) => a !== alias)));
  }

  commitRivalAlias(index: number, ev: Event): void {
    ev.preventDefault();
    const input = ev.target as HTMLInputElement;
    const value = String(input.value || '').replace(/,/g, '').trim();
    if (!value) return;
    const cur = this.rivalAliases(index).filter((a) => a.toLowerCase() !== value.toLowerCase());
    this.competitors.at(index).get('aliasesText')?.setValue(toCsv([...cur, value]));
    input.value = '';
  }

  removeRivalAlias(index: number, alias: string): void {
    this.competitors.at(index).get('aliasesText')?.setValue(toCsv(this.rivalAliases(index).filter((a) => a !== alias)));
  }

  isDupName(index: number): boolean {
    this.formTick();
    const name = String(this.competitors.at(index).get('name')?.value || '')
      .trim()
      .toLowerCase();
    if (!name) return false;
    return this.competitors.controls.filter((c) => String(c.get('name')?.value || '').trim().toLowerCase() === name)
      .length > 1;
  }

  bump(ctrl: 'socialcrawlLookback' | 'crisisThreshold', delta: number, min: number, max: number): void {
    const cur = Number(this.form.controls[ctrl].value) || min;
    this.form.controls[ctrl].setValue(Math.min(max, Math.max(min, cur + delta)));
  }

  formatSaved(iso: string): string {
    return formatWhen(iso);
  }

  private parseTab(raw: string | null): SettingsTab | null {
    const v = String(raw || '').toLowerCase();
    if (v === 'rivals') return 'rivales';
    if (v === 'listen') return 'escucha';
    if (v === 'spaces') return 'espacios';
    if (v === 'advanced') return 'avanzado';
    if (TABS.some((t) => t.id === v)) return v as SettingsTab;
    return null;
  }

  private applyConfigToForm(): void {
    const cfg = this.store.config();
    if (!cfg) return;
    const links = cfg.company.keyLinks ?? [];
    this.form.patchValue({
      companyName: cfg.company.companyName,
      aliasesText: (cfg.company.aliases ?? []).join(', '),
      websiteUrl: links[0] ?? '',
      whatTheySell: cfg.company.whatTheySell,
      brandVoiceNotes: cfg.company.brandVoiceNotes,
      channelUrlsText: (cfg.company.channelUrls ?? []).join('\n'),
      crisisThreshold: loadCrisisThreshold(),
      ga4PropertyId: cfg.company.ga4PropertyId ?? '',
      searchConsoleSiteUrl: cfg.company.searchConsoleSiteUrl ?? '',
      metaAdsAccountId: cfg.company.metaAdsAccountId ?? '',
      googleAdsCustomerId: cfg.company.googleAdsCustomerId ?? '',
      slackWebhookUrl: cfg.company.slackWebhookUrl ?? '',
      semrushApiKey: cfg.company.semrushApiKey ?? '',
      g2CompanySlug: cfg.company.g2CompanySlug ?? '',
      glassdoorEmployerId: cfg.company.glassdoorEmployerId ?? '',
      tiktokAdsAccountId: cfg.company.tiktokAdsAccountId ?? '',
      linkedinAdsAccountId: cfg.company.linkedinAdsAccountId ?? '',
      aiVisibilityProvider: cfg.company.aiVisibilityProvider ?? '',
      industryKeywordsText: (cfg.company.industryKeywords ?? []).join('\n'),
      marketCategory: cfg.company.marketCategory ?? '',
    });
    this.competitors.clear();
    for (const c of cfg.competitors.slice(0, SCAN_MAX_RIVALS)) {
      this.competitors.push(this.competitorGroup(c));
    }
    this.formTick.update((n) => n + 1);
  }

  private refreshLocalOps(): void {
    const uid = this.auth.userId() || 'anon';
    this.workspaces.refreshList();
    this.piiCount.set(loadPiiLog(uid).length);
  }

  rivalCount(ws: WorkspaceSnapshot): number {
    return (ws.config?.competitors ?? []).filter((c) => String(c.name || '').trim()).length;
  }

  addCompany(): void {
    if (this.dirty() && !window.confirm('Hay cambios sin guardar. ¿Crear otra empresa igual?')) return;
    this.skipWsSync = true;
    this.workspaces.createBlank();
    this.hydrating = true;
    this.applyConfigToForm();
    this.hydrating = false;
    this.dirty.set(false);
    this.skipWsSync = false;
    this.setTab('empresa');
    this.flash('Nueva empresa. Completá el nombre público y los rivales.');
  }

  loadWorkspace(id: string): void {
    if (this.dirty() && !window.confirm('Hay cambios sin guardar. ¿Cambiar de empresa igual?')) return;
    this.skipWsSync = true;
    this.workspaces.switchTo(id);
    this.hydrating = true;
    this.applyConfigToForm();
    this.hydrating = false;
    this.dirty.set(false);
    this.skipWsSync = false;
    const ws = this.workspaces.items().find((w) => w.id === id);
    this.flash(`Espacio de análisis: ${ws?.label || 'empresa'}.`);
  }

  removeWorkspace(id: string): void {
    const ws = this.workspaces.items().find((w) => w.id === id);
    if (!window.confirm(`¿Quitar la empresa “${ws?.label || id}”?`)) return;
    this.workspaces.remove(id);
    this.hydrating = true;
    this.applyConfigToForm();
    this.hydrating = false;
    this.dirty.set(false);
    this.refreshLocalOps();
  }

  exportPiiCsv(): void {
    const csv = piiLogCsv(this.auth.userId() || 'anon');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'responselens-pii-log.csv';
    a.click();
    URL.revokeObjectURL(url);
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
    if (creds.socialcrawl?.apiKey) {
      await saveScanCredentials({
        ...creds,
        socialcrawl: { ...creds.socialcrawl, apiKey: '', enabled: true },
      });
    }
    this.formTick.update((n) => n + 1);
  }

  competitorGroup(c?: Partial<CompetitorProfile> & { aliasesText?: string }) {
    return this.fb.nonNullable.group({
      name: [c?.name ?? '', Validators.required],
      aliasesText: [(c?.aliases ?? []).join(', ')],
      websiteUrl: [c?.websiteUrl ?? ''],
      statusUrl: [c?.statusUrl ?? ''],
      pricingUrl: [c?.pricingUrl ?? ''],
      careersUrl: [c?.careersUrl ?? ''],
    });
  }

  addCompetitor(): void {
    if (this.competitors.length >= SCAN_MAX_RIVALS) {
      this.flash(rivalCapMessage(this.competitors.length));
      return;
    }
    this.competitors.push(this.competitorGroup());
    this.setTab('rivales');
  }

  removeCompetitor(index: number): void {
    const name = String(this.competitors.at(index).get('name')?.value || '').trim() || 'este rival';
    if (!window.confirm(`¿Quitar ${name} de la lista?`)) return;
    this.competitors.removeAt(index);
  }

  async saveAll(): Promise<void> {
    for (let i = this.competitors.length - 1; i >= 0; i -= 1) {
      const name = String(this.competitors.at(i).get('name')?.value || '').trim();
      if (!name) this.competitors.removeAt(i);
    }

    if (!isConfiguredCompanyName(this.form.controls.companyName.value)) {
      this.setTab('empresa');
      this.flash(companySetupMessage(this.form.controls.companyName.value));
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.setTab('rivales');
      this.flash('Hay campos inválidos (revisá rivales).');
      return;
    }
    const v = this.form.getRawValue();
    const website = normalizeWebsite(v.websiteUrl);
    this.form.controls.websiteUrl.setValue(website, { emitEvent: false });

    const keyLinks = website
      ? [website, ...v.channelUrlsText.split('\n').map((s) => s.trim()).filter(Boolean)]
      : v.channelUrlsText.split('\n').map((s) => s.trim()).filter(Boolean);

    const competitors: CompetitorProfile[] = v.competitors
      .map((c) => ({
        name: c.name.trim(),
        aliases: parseCsv(c.aliasesText),
        websiteUrl: normalizeWebsite(c.websiteUrl),
        socialHandles: [],
        statusUrl: normalizeWebsite(c.statusUrl),
        pricingUrl: normalizeWebsite(c.pricingUrl),
        careersUrl: normalizeWebsite(c.careersUrl),
      }))
      .filter((c) => c.name)
      .slice(0, SCAN_MAX_RIVALS);

    saveCrisisThreshold(v.crisisThreshold);
    const lookback = Math.min(30, Math.max(1, Number(v.socialcrawlLookback) || 7));

    await this.store.save(
      {
        companyName: v.companyName.trim(),
        aliases: parseCsv(v.aliasesText),
        whatTheySell: v.whatTheySell,
        keyLinks: [...new Set(keyLinks)],
        channelUrls: v.channelUrlsText.split('\n').map((s) => s.trim()).filter(Boolean),
        brandVoiceNotes: v.brandVoiceNotes,
        ga4PropertyId: v.ga4PropertyId.trim(),
        searchConsoleSiteUrl: normalizeWebsite(v.searchConsoleSiteUrl),
        metaAdsAccountId: v.metaAdsAccountId.trim(),
        googleAdsCustomerId: v.googleAdsCustomerId.trim(),
        slackWebhookUrl: v.slackWebhookUrl.trim(),
        semrushApiKey: v.semrushApiKey.trim(),
        g2CompanySlug: v.g2CompanySlug.trim(),
        glassdoorEmployerId: v.glassdoorEmployerId.trim(),
        tiktokAdsAccountId: v.tiktokAdsAccountId.trim(),
        linkedinAdsAccountId: v.linkedinAdsAccountId.trim(),
        aiVisibilityProvider: v.aiVisibilityProvider.trim(),
        industryKeywords: [
          ...new Set(
            v.industryKeywordsText
              .split(/\n|,/)
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ],
        marketCategory: v.marketCategory.trim(),
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
        apiKey: '',
        sources: v.socialcrawlSources,
        lookbackDays: lookback,
      },
    });

    saveScanSourcesPrefs(this.sourcePrefs());
    this.scServerReady.set(hasSocialCrawlServer());
    this.workspaces.persistActive();
    this.dirty.set(false);
    this.flash(
      this.scServerReady()
        ? `Guardado · ${competitors.length} rival(es) · lookback ${lookback}d · crisis ≥ ${v.crisisThreshold}`
        : 'Guardado. Escucha requiere Terraform + sync:env.',
    );
  }

  private flash(msg: string): void {
    this.savedNotice.set(msg);
    setTimeout(() => this.savedNotice.set(''), 6000);
  }
}
