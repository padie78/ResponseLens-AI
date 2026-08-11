import { Component, ViewEncapsulation } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'rl-own-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Propios</h1>
        <p class="rl-page__lead">
          Menciones de tu marca, triage de crisis y análisis IA. Scaffold — el feed se portará desde la
          extensión y AppSync.
        </p>
        <div class="rl-page__panel">Próximo: listado de alertas + filtros de plataforma + escaneo.</div>
      </div>
    </ion-content>
  `,
})
export class OwnPageComponent {}
