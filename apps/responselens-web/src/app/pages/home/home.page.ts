import { Component, ViewEncapsulation, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'rl-home-page',
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, IonContent],
  template: `
    <ion-content class="rl-auth-gate">
      <div class="rl-auth-gate__shell">
        <header class="rl-auth-gate__brand">
          <span class="rl-auth-gate__logo">RL</span>
          <h1 class="rl-auth-gate__title">ResponseLens AI</h1>
          <p class="rl-auth-gate__tagline">
            Control de daños, conquista comercial y configuración.
          </p>
        </header>
        <section class="rl-auth-gate__card" style="display: grid; gap: 0.75rem">
          @if (auth.isAuthenticated()) {
            <a class="rl-auth-gate__submit" routerLink="/app/own" style="text-align: center; text-decoration: none"
              >Ir al panel</a
            >
          } @else {
            <a class="rl-auth-gate__submit" routerLink="/login" style="text-align: center; text-decoration: none"
              >Ingresar</a
            >
            <a
              routerLink="/register"
              style="text-align: center; color: var(--rl-accent-hover); font-size: var(--rl-fs-sm)"
              >Crear cuenta</a
            >
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class HomePageComponent {
  readonly auth = inject(AuthService);
}
