import { Component, ViewEncapsulation } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'rl-competitors-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Competencia</h1>
        <p class="rl-page__lead">
          Quejas de rivales, pipeline de captación y fichas de percepción. Scaffold pendiente de AppSync
          + subscription <code>onNewCompetitorAlert</code>.
        </p>
        <div class="rl-page__panel">Próximo: cards de oportunidad + CRM / share.</div>
      </div>
    </ion-content>
  `,
})
export class CompetitorsPageComponent {}
