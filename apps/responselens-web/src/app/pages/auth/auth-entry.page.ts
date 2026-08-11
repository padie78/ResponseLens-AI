import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import {
  AuthPendingConfirmationError,
  mapAuthErrorMessage,
} from '../../core/auth/auth.errors';
import { AuthService } from '../../core/auth/auth.service';
import { RuntimeConfigService } from '../../core/config/runtime-config.service';

type AuthMode = 'signin' | 'signup' | 'confirm';

@Component({
  standalone: true,
  selector: 'rl-auth-entry-page',
  encapsulation: ViewEncapsulation.None,
  imports: [ReactiveFormsModule, RouterLink, IonContent],
  template: `
    <ion-content>
      <div class="rl-auth">
        <div class="rl-auth__card">
          <header class="rl-auth__brand">
            <span class="rl-app-shell__mark">RL</span>
            <h1 class="rl-auth__title">ResponseLens AI</h1>
            <p class="rl-auth__tagline">Reputación y conquista comercial</p>
          </header>

          @if (!auth.isCognitoConfigured()) {
            <div class="rl-auth__hint" role="status">
              <p>
                Cognito no está en <code>environment.ts</code>. Ejecutá
                <code>npm run sync:env</code> tras terraform apply, o pegá Region / Pool / Client
                acá (dev).
              </p>
              <form class="rl-auth__form" [formGroup]="cloudForm" (ngSubmit)="saveCloud()">
                <label class="rl-auth__label">
                  Región
                  <input class="rl-auth__input" formControlName="region" placeholder="eu-central-1" />
                </label>
                <label class="rl-auth__label">
                  User Pool ID
                  <input class="rl-auth__input" formControlName="userPoolId" placeholder="eu-central-1_xxxxx" />
                </label>
                <label class="rl-auth__label">
                  App Client ID
                  <input class="rl-auth__input" formControlName="clientId" placeholder="…" />
                </label>
                <button class="rl-auth__submit" type="submit" [disabled]="cloudForm.invalid">
                  Guardar Cognito
                </button>
              </form>
            </div>
          }

          @if (mode() !== 'confirm') {
            <nav class="rl-subnav" style="padding: 0 0 1rem" aria-label="Modo">
              <a
                class="rl-subnav__tab"
                [class.rl-subnav__tab--active]="mode() === 'signin'"
                routerLink="/login"
                >Entrar</a
              >
              <a
                class="rl-subnav__tab"
                [class.rl-subnav__tab--active]="mode() === 'signup'"
                routerLink="/register"
                >Crear cuenta</a
              >
            </nav>
          }

          <form class="rl-auth__form" [formGroup]="form" (ngSubmit)="submit()">
            <label class="rl-auth__label">
              Email
              <input class="rl-auth__input" type="email" formControlName="email" autocomplete="username" />
            </label>

            @if (mode() !== 'confirm') {
              <label class="rl-auth__label">
                Contraseña
                <input
                  class="rl-auth__input"
                  type="password"
                  formControlName="password"
                  autocomplete="current-password"
                />
              </label>
            } @else {
              <label class="rl-auth__label">
                Código de verificación
                <input class="rl-auth__input" type="text" formControlName="code" autocomplete="one-time-code" />
              </label>
            }

            @if (error()) {
              <p class="rl-auth__error">{{ error() }}</p>
            }

            <button
              class="rl-auth__submit"
              type="submit"
              [disabled]="busy() || form.invalid || !auth.isCognitoConfigured()"
            >
              {{ submitLabel() }}
            </button>
          </form>

          <button type="button" class="rl-auth__local" (click)="enterLocal()" [disabled]="busy()">
            Continuar en modo local
          </button>
        </div>
      </div>
    </ion-content>
  `,
})
export class AuthEntryPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly runtime = inject(RuntimeConfigService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly mode = signal<AuthMode>('signin');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    code: [''],
  });

  readonly cloudForm = this.fb.nonNullable.group({
    region: ['eu-central-1', Validators.required],
    userPoolId: ['', Validators.required],
    clientId: ['', Validators.required],
  });

  readonly submitLabel = signal('Entrar');

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    if (path === 'register') {
      this.mode.set('signup');
      this.submitLabel.set('Crear cuenta');
    }

    const existing = this.runtime.override();
    if (existing) {
      this.cloudForm.patchValue({
        region: existing.region || 'eu-central-1',
        userPoolId: existing.userPoolId,
        clientId: existing.clientId,
      });
    }
  }

  saveCloud(): void {
    if (this.cloudForm.invalid) return;
    this.runtime.saveOverride(this.cloudForm.getRawValue());
    this.error.set(null);
  }

  async enterLocal(): Promise<void> {
    this.auth.continueAsLocal();
    await this.router.navigateByUrl('/app/own');
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    const { email, password, code } = this.form.getRawValue();

    try {
      if (this.mode() === 'confirm') {
        await this.auth.confirmRegistration(email, code);
        await this.auth.login(email, password);
        await this.router.navigateByUrl('/app/own');
        return;
      }

      if (this.mode() === 'signup') {
        await this.auth.register(email, password);
        this.mode.set('confirm');
        this.submitLabel.set('Confirmar');
        this.form.controls.code.setValidators([Validators.required]);
        this.form.controls.code.updateValueAndValidity();
        return;
      }

      await this.auth.login(email, password);
      await this.router.navigateByUrl('/app/own');
    } catch (err) {
      if (err instanceof AuthPendingConfirmationError) {
        this.mode.set('confirm');
        this.submitLabel.set('Confirmar');
        this.error.set('Confirmá tu email con el código enviado.');
        return;
      }
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
