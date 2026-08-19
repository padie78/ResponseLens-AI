import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
import { dataBadgeKind, dataBadgeLabel } from '../../engine/data-badge.js';
import { ScanService } from '../../services/scan.service';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { ScanBlockerComponent } from '../../ui';

@Component({
  standalone: true,
  selector: 'rl-rivals-battlecards-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink, ButtonModule, ScanBlockerComponent],
  template: `
    <ion-content>
      <rl-scan-blocker [active]="scan.scanning()" [message]="scan.lastStatus()" />
      <div class="rl-page rl-intel rl-battle">
        <header class="rl-own__header">
          <div class="rl-own__intro">
            <h1 class="rl-page__title">Fichas de batalla</h1>
            <p class="rl-page__lead">
              Una ficha por rival: qué duele en el
              <span class="rl-data-badge rl-data-badge--feed">Feed</span>
              y superficies
              <span class="rl-data-badge" [class]="'rl-data-badge--' + adsBadgeKind()">{{ adsBadge() }}</span>
              ads /
              <span class="rl-data-badge" [class]="'rl-data-badge--' + talentBadgeKind()">{{ talentBadge() }}</span>
              HR /
              <span class="rl-data-badge" [class]="'rl-data-badge--' + webBadgeKind()">{{ webBadge() }}</span>
              web
            </p>
          </div>
          <div class="rl-own__actions">
            <p-button
              label="Forzar ahora"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0 || scan.manualQuotaExhausted()"
              (onClick)="runScan()"
              title="Adelanta la pasada diaria. No es tiempo real."
            />
            <p-button
              label="Scan demo"
              icon="pi pi-box"
              severity="help"
              [outlined]="true"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0"
              (onClick)="runScanMock()"
            />
          </div>
        </header>

        @if (pack().usedFallback) {
          <p class="rl-page__status">
            Sin rivales en config — demo Alpha/Beta.
            Cargá nombres públicos en <a routerLink="/app/settings" [queryParams]="{ tab: 'rivales' }">Config → Rivales</a>.
            <a routerLink="/app/settings">Cargar rivales</a>
          </p>
        }

        <div class="rl-own__kpis rl-ads__kpis">
          <div class="rl-own__kpi" data-tone="total">
            <i class="pi pi-book rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ pack().rivals.length }}</strong>
            <span>Fichas</span>
          </div>
          <div class="rl-own__kpi" data-tone="urgent">
            <i class="pi pi-bolt rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ avgPerception() }}</strong>
            <span>Percepción media</span>
          </div>
          <div class="rl-own__kpi" data-tone="pending">
            <i class="pi pi-replay rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ maxSwitch() }}%</strong>
            <span>Máx. intención de cambio</span>
          </div>
          <div class="rl-own__kpi" data-tone="responded">
            <i class="pi pi-megaphone rl-own__kpi-icon" aria-hidden="true"></i>
            <strong>{{ adsActive() }}</strong>
            <span>Ads activas</span>
          </div>
        </div>

        <div class="rl-intel__pills" role="tablist" aria-label="Rival">
          @for (r of pack().rivals; track r.name) {
            <button
              type="button"
              class="rl-intel__pill"
              [class.is-active]="selectedName() === r.name"
              (click)="selected.set(r.name)"
            >
              {{ r.name }}
            </button>
          }
        </div>

        @if (current(); as r) {
          <article class="rl-battle-hero">
            <div class="rl-battle-hero__score">
              <p class="rl-insight-hero__eyebrow">{{ r.digitalBand || 'Percepción' }}</p>
              <strong>{{ r.perception.perceptionScore }}</strong>
              <span>/ 100</span>
              <div class="rl-talent-meter" aria-hidden="true">
                <i [style.width.%]="r.perception.perceptionScore"></i>
              </div>
              <p>Más alto = peor imagen pública del rival</p>
            </div>
            <div class="rl-battle-hero__read">
              <h2>{{ r.name }}</h2>
              <p>{{ r.perception.voiceLine }}</p>
              <dl class="rl-ad-card__facts">
                <div>
                  <dt>Menciones</dt>
                  <dd>{{ r.perception.mentionCount }}</dd>
                </div>
                <div>
                  <dt>Cambio</dt>
                  <dd>{{ r.perception.switchIntentPct }}%</dd>
                </div>
                <div>
                  <dt>Win rate</dt>
                  <dd>{{ r.perception.pipeline.winRate }}%</dd>
                </div>
              </dl>
            </div>
          </article>

          <div class="rl-battle-surfaces">
            <a class="rl-battle-surf" routerLink="/app/rivals/ads">
              <i class="pi pi-megaphone" aria-hidden="true"></i>
              <strong>Ads <span class="rl-data-badge" [class]="'rl-data-badge--' + adsBadgeKind()">{{ adsBadge() }}</span></strong>
              <span>{{ r.ads.active }} activas · {{ r.ads.platforms.join(', ') || '—' }}</span>
            </a>
            <a class="rl-battle-surf" routerLink="/app/rivals/talent">
              <i class="pi pi-users" aria-hidden="true"></i>
              <strong>Talento <span class="rl-data-badge" [class]="'rl-data-badge--' + talentBadgeKind()">{{ talentBadge() }}</span></strong>
              <span>{{ r.talent.openRoles }} roles · {{ r.talent.layoffRisk }}</span>
            </a>
            <a class="rl-battle-surf" routerLink="/app/rivals/visibility">
              <i class="pi pi-globe" aria-hidden="true"></i>
              <strong>Web <span class="rl-data-badge" [class]="'rl-data-badge--' + webBadgeKind()">{{ webBadge() }}</span></strong>
              <span>{{ r.visibility.statusState }} · {{ r.visibility.priceChanged ? 'precio cambió' : 'pricing estable' }}</span>
            </a>
          </div>

          <div class="rl-talent-split">
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Dónde duele</h2></header>
              <ul class="rl-battle-list rl-battle-list--weak">
                @for (w of r.battle.weaknesses; track w) {
                  <li>{{ w }}</li>
                }
              </ul>
            </section>
            <section class="rl-panel">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Dónde está fuerte</h2></header>
              <ul class="rl-battle-list rl-battle-list--strong">
                @for (s of r.battle.strengths; track s) {
                  <li>{{ s }}</li>
                }
              </ul>
            </section>
          </div>

          <section class="rl-panel">
            <header class="rl-panel__head"><h2 class="rl-panel__title">Cómo atacar</h2></header>
            <ol class="rl-battle-plays">
              @for (p of r.battle.plays; track p; let i = $index) {
                <li>
                  <span>{{ i + 1 }}</span>
                  <p>{{ p }}</p>
                </li>
              }
            </ol>
            <p class="rl-own__section-lead">
              <a routerLink="/app/competitors">Abrir radar de menciones</a>
            </p>
          </section>

          @if (r.perception.sampleQuotes.length) {
            <section class="rl-panel" style="margin-top: 1.25rem">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Voces del feed</h2></header>
              @for (q of r.perception.sampleQuotes; track q.text) {
                <blockquote class="rl-talent-quote">
                  <p>{{ q.text }}</p>
                  <footer>{{ q.channel }}</footer>
                </blockquote>
              }
            </section>
          }
        }
      </div>
    </ion-content>
  `,
})
export class RivalsBattlecardsPageComponent implements OnInit {
  readonly config = inject(UserConfigStore);
  readonly alerts = inject(AlertsStore);
  readonly scan = inject(ScanService);
  readonly selected = signal('');

  readonly pack = computed(() =>
    buildRivalSurfaceIntel({
      competitors: this.config.competitors(),
      alerts: this.alerts.items(),
      days: 14,
    }),
  );

  readonly current = computed(() => {
    const list = this.pack().rivals;
    const name = this.selected() || list[0]?.name;
    return list.find((r) => r.name === name) || list[0] || null;
  });

  readonly selectedName = computed(() => this.current()?.name ?? '');

  readonly avgPerception = computed(() => {
    const list = this.pack().rivals;
    if (!list.length) return '—';
    return Math.round(
      list.reduce((s, r) => s + r.perception.perceptionScore, 0) / list.length,
    );
  });

  readonly maxSwitch = computed(() => {
    const list = this.pack().rivals;
    if (!list.length) return 0;
    return Math.max(...list.map((r) => r.perception.switchIntentPct));
  });

  readonly adsActive = computed(() =>
    this.pack().rivals.reduce((s, r) => s + r.ads.active, 0),
  );

  adsBadgeKind(): string {
    return dataBadgeKind(this.pack().adsSource);
  }
  adsBadge(): string {
    return dataBadgeLabel(this.pack().adsSource);
  }
  talentBadgeKind(): string {
    return dataBadgeKind(this.pack().talentSource);
  }
  talentBadge(): string {
    return dataBadgeLabel(this.pack().talentSource);
  }
  webBadgeKind(): string {
    return dataBadgeKind(this.pack().webSource);
  }
  webBadge(): string {
    return dataBadgeLabel(this.pack().webSource);
  }

  ngOnInit(): void {
    this.config.load();
    this.alerts.load();
  }

  async runScan(): Promise<void> {
    await this.scan.scanCompetitors();
  }

  async runScanMock(): Promise<void> {
    await this.scan.scanCompetitorsMock();
  }
}
