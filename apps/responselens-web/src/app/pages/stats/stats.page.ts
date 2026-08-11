import { Component, ViewEncapsulation } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'rl-stats-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Stats</h1>
        <p class="rl-page__lead">KPIs, embudo y comparación Propios vs Competencia.</p>
        <div class="rl-page__panel">Próximo: charts (ECharts) portados del panel de la extensión.</div>
      </div>
    </ion-content>
  `,
})
export class StatsPageComponent {}
