import { Component, ViewEncapsulation } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'rl-ranking-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Ranking</h1>
        <p class="rl-page__lead">Score de vida digital por rival (0–100).</p>
        <div class="rl-page__panel">Próximo: lista ranking + informe por competidor.</div>
      </div>
    </ion-content>
  `,
})
export class RankingPageComponent {}
