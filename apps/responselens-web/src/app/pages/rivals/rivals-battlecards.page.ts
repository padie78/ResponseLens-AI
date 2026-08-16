import { Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ButtonModule } from 'primeng/button';
import { buildRivalSurfaceIntel } from '../../engine/rival-surface-intel.js';
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
      <div class="rl-page rl-intel">
        <div class="rl-page__toolbar">
          <div>
            <h1 class="rl-page__title">Fichas de batalla</h1>
            <p class="rl-page__lead">
              Una ficha por rival: percepción del feed + ads / talento / web demo.
            </p>
          </div>
          <div class="rl-page__toolbar-actions">
            <p-button
              label="Escanear rivales"
              icon="pi pi-search"
              size="small"
              [disabled]="scan.scanning() || config.competitors().length === 0"
              (onClick)="runScan()"
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
        </div>
        <p class="rl-intel__disclaimer">{{ pack().disclaimer }}</p>

        @if (config.competitors().length === 0) {
          <div class="rl-panel">
            <p>Agregá rivales en <a routerLink="/app/settings">Configuración</a>.</p>
          </div>
        } @else {
          <div class="rl-intel__pills" role="tablist">
            @for (r of pack().rivals; track r.name) {
              <button
                type="button"
                class="rl-intel__pill"
                [class.is-active]="selected() === r.name"
                (click)="selected.set(r.name)"
              >
                {{ r.name }}
              </button>
            }
          </div>

          @if (current(); as r) {
            <article class="rl-audit-verdict">
              <p class="rl-insight-hero__eyebrow">{{ r.digitalBand || 'Rival' }}</p>
              <h2>{{ r.name }}</h2>
              <p>{{ r.perception.voiceLine }}</p>
              <div class="rl-insight-hero__metrics">
                <div>
                  <span>Percepción (feed)</span>
                  <strong>{{ r.perception.perceptionScore }}/100</strong>
                </div>
                <div>
                  <span>Menciones</span>
                  <strong>{{ r.perception.mentionCount }}</strong>
                </div>
                <div>
                  <span>Intención de cambio</span>
                  <strong>{{ r.perception.switchIntentPct }}%</strong>
                </div>
                <div>
                  <span>Win rate pipeline</span>
                  <strong>{{ r.perception.pipeline.winRate }}%</strong>
                </div>
                <div>
                  <span>Ads activas</span>
                  <strong>{{ r.ads.active }}</strong>
                </div>
                <div>
                  <span>Rating talento</span>
                  <strong>{{ r.talent.rating }}</strong>
                </div>
                <div>
                  <span>Tráfico índice</span>
                  <strong>{{ r.visibility.trafficIndex }}</strong>
                </div>
              </div>
            </article>

            <div class="rl-audit-grid">
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Debilidades (feed)</h2></header>
                <ul class="rl-audit-findings">
                  @for (w of r.battle.weaknesses; track w) {
                    <li>{{ w }}</li>
                  }
                </ul>
              </section>
              <section class="rl-panel">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Fortalezas relativas</h2></header>
                <ul class="rl-audit-findings">
                  @for (s of r.battle.strengths; track s) {
                    <li>{{ s }}</li>
                  }
                </ul>
              </section>
            </div>

            <section class="rl-panel" style="margin-top: 1.25rem">
              <header class="rl-panel__head"><h2 class="rl-panel__title">Cómo atacar</h2></header>
              <ul class="rl-audit-findings">
                @for (p of r.battle.plays; track p) {
                  <li>{{ p }}</li>
                }
              </ul>
              <p class="rl-own__section-lead">
                <a routerLink="/app/competitors">Abrir radar de menciones</a>
              </p>
            </section>

            @if (r.perception.sampleQuotes.length) {
              <section class="rl-panel" style="margin-top: 1.25rem">
                <header class="rl-panel__head"><h2 class="rl-panel__title">Voces del feed</h2></header>
                <div class="rl-audit-quotes">
                  @for (q of r.perception.sampleQuotes; track q.text) {
                    <blockquote>
                      <p>{{ q.text }}</p>
                      <footer>{{ q.channel }}</footer>
                    </blockquote>
                  }
                </div>
              </section>
            }
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
