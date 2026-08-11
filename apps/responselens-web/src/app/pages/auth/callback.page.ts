import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth/auth.service';
import { mapAuthErrorMessage } from '../../core/auth/auth.errors';

@Component({
  standalone: true,
  selector: 'rl-auth-callback-page',
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, IonSpinner],
  template: `
    <ion-content>
      <div class="rl-auth">
        <div class="rl-auth__card" style="text-align: center">
          @if (error()) {
            <p class="rl-auth__error">{{ error() }}</p>
          } @else {
            <ion-spinner name="crescent" />
            <p class="rl-auth__tagline" style="margin-top: 1rem">Completando sesión…</p>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class AuthCallbackPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.auth.completeOAuthRedirect();
      await this.router.navigateByUrl('/app/own');
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    }
  }
}
