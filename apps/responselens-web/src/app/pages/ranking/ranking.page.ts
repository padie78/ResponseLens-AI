import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { AlertsStore } from '../../stores/alerts.store';
import { UserConfigStore } from '../../stores/user-config.store';
import { scoreAllCompetitorsDigitalLife } from '../../engine/digital-life-score.js';

@Component({
  standalone: true,
  selector: 'rl-ranking-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Ranking</h1>
        <p class="rl-page__lead">Score de vida digital por rival (0–100, últimos 14 días).</p>

        @if (board().rivals.length === 0) {
          <div class="rl-page__panel">
            <p>Sin rivales configurados o sin señal en el feed.</p>
          </div>
        } @else {
          <div class="rl-ranking-list">
            @for (row of board().rivals; track row.competitorName; let i = $index) {
              <article class="rl-ranking-card">
                <div class="rl-ranking-card__rank">#{{ i + 1 }}</div>
                <div class="rl-ranking-card__body">
                  <div class="rl-ranking-card__head">
                    <strong>{{ row.competitorName }}</strong>
                    <span class="rl-ranking-card__score">{{ row.score }}/100</span>
                  </div>
                  <div class="rl-ranking-card__bar">
                    <div class="rl-ranking-card__fill" [style.width.%]="row.score"></div>
                  </div>
                  @if (row.bandLabel) {
                    <p class="rl-ranking-card__band">{{ row.bandLabel }}</p>
                  }
                  @if (row.bandHint) {
                    <p class="rl-ranking-card__hint">{{ row.bandHint }}</p>
                  }
                  @if (row.drivers.length) {
                    <ul class="rl-ranking-card__drivers">
                      @for (d of row.drivers.slice(0, 4); track d.id) {
                        <li>{{ d.label }} (+{{ d.points }})</li>
                      }
                    </ul>
                  }
                </div>
              </article>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class RankingPageComponent implements OnInit {
  private readonly alertsStore = inject(AlertsStore);
  private readonly configStore = inject(UserConfigStore);

  readonly board = computed(() =>
    scoreAllCompetitorsDigitalLife({
      competitors: this.configStore.competitors(),
      alerts: this.alertsStore.items(),
      days: 14,
    }),
  );

  ngOnInit(): void {
    this.configStore.load();
    this.alertsStore.load();
  }
}
