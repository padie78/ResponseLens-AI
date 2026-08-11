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
    <ion-content>
      <div class="rl-auth">
        <div class="rl-auth__card">
          <header class="rl-auth__brand">
            <span class="rl-app-shell__mark">RL</span>
            <h1 class="rl-auth__title">ResponseLens AI</h1>
            <p class="rl-auth__tagline">
              Control de daños, conquista comercial y configuración — ahora también en web.
              La extensión Chrome se mantiene para captura en página.
            </p>
          </header>
          <div class="rl-auth__form">
            @if (auth.isAuthenticated()) {
              <a class="rl-auth__submit" routerLink="/app/own" style="text-align: center; text-decoration: none"
                >Ir al panel</a
              >
            } @else {
              <a class="rl-auth__submit" routerLink="/login" style="text-align: center; text-decoration: none"
                >Entrar</a
              >
              <a
                routerLink="/register"
                style="text-align: center; color: var(--rl-accent-hover); font-size: var(--rl-fs-sm)"
                >Crear cuenta</a
              >
            }
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class HomePageComponent {
  readonly auth = inject(AuthService);
}
