import { Component, ViewEncapsulation, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'rl-coming-soon-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, RouterLink],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">{{ title }}</h1>
        <p class="rl-page__lead">{{ lead }}</p>
        <p class="rl-own__muted">Este módulo está en el menú para definir el alcance. Todavía no hay datos en vivo.</p>
        <p><a routerLink="/app/overview">Volver al inicio</a></p>
      </div>
    </ion-content>
  `,
})
export class ComingSoonPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly title = String(this.route.snapshot.data['title'] || 'Próximamente');
  readonly lead = String(this.route.snapshot.data['lead'] || '');
}
