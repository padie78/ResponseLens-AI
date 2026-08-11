import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonInput } from '@ionic/angular/standalone';
import {
  AuthPendingConfirmationError,
  mapAuthErrorMessage,
} from '../../core/auth/auth.errors';
import { AuthService } from '../../core/auth/auth.service';

type AuthMode = 'signin' | 'signup' | 'confirm';

function passwordMatchValidator(control: AbstractControl) {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  if (!password || !confirm) return null;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  standalone: true,
  selector: 'rl-auth-entry-page',
  encapsulation: ViewEncapsulation.None,
  imports: [ReactiveFormsModule, IonContent, IonInput],
  template: `
    <ion-content class="rl-auth-gate">
      <div class="rl-auth-gate__shell">
        <header class="rl-auth-gate__brand">
          <span class="rl-auth-gate__logo">RL</span>
          <h1 class="rl-auth-gate__title">ResponseLens AI</h1>
          <p class="rl-auth-gate__tagline">Reputación y conquista comercial</p>
        </header>

        <section class="rl-auth-gate__card">
          @if (mode() !== 'confirm') {
            <nav class="rl-auth-gate__tabs" aria-label="Modo de autenticación">
              <button
                type="button"
                class="rl-auth-gate__tab"
                [class.rl-auth-gate__tab--active]="mode() === 'signin'"
                (click)="setMode('signin')"
              >
                Ingresar
              </button>
              <button
                type="button"
                class="rl-auth-gate__tab"
                [class.rl-auth-gate__tab--active]="mode() === 'signup'"
                (click)="setMode('signup')"
              >
                Registrarse
              </button>
            </nav>

            @if (mode() === 'signin') {
              <form [formGroup]="signinForm" (ngSubmit)="submitSignin()">
                <div class="rl-auth-gate__field">
                  <ion-input type="email" placeholder="Email" formControlName="email" autocomplete="email" />
                </div>
                <div class="rl-auth-gate__field">
                  <ion-input
                    type="password"
                    placeholder="Contraseña"
                    formControlName="password"
                    autocomplete="current-password"
                  />
                </div>

                @if (error()) {
                  <p class="rl-auth-gate__error">{{ error() }}</p>
                }

                <button
                  type="submit"
                  class="rl-auth-gate__submit"
                  [disabled]="signinForm.invalid || loading()"
                >
                  {{ loading() ? 'Ingresando…' : 'Ingresar' }}
                </button>
              </form>
            } @else {
              <form [formGroup]="signupForm" (ngSubmit)="submitSignup()">
                <div class="rl-auth-gate__field">
                  <ion-input type="email" placeholder="Email" formControlName="email" autocomplete="email" />
                </div>
                <div class="rl-auth-gate__field">
                  <ion-input
                    type="password"
                    placeholder="Contraseña"
                    formControlName="password"
                    autocomplete="new-password"
                  />
                </div>
                <div class="rl-auth-gate__field">
                  <ion-input
                    type="password"
                    placeholder="Confirmar contraseña"
                    formControlName="confirmPassword"
                    autocomplete="new-password"
                  />
                </div>

                <p class="rl-auth-gate__hint">Mín. 8 caracteres, mayúscula y número.</p>

                @if (signupForm.hasError('passwordMismatch') && signupForm.touched) {
                  <p class="rl-auth-gate__error">Las contraseñas no coinciden.</p>
                }
                @if (error()) {
                  <p class="rl-auth-gate__error">{{ error() }}</p>
                }

                <button
                  type="submit"
                  class="rl-auth-gate__submit"
                  [disabled]="signupForm.invalid || loading()"
                >
                  {{ loading() ? 'Creando…' : 'Crear cuenta' }}
                </button>
              </form>
            }
          } @else {
            <div class="rl-auth-gate__confirm">
              <h2>Verificar email</h2>
              <p>Código enviado a <strong>{{ registeredEmail() }}</strong></p>
            </div>

            <form [formGroup]="confirmForm" (ngSubmit)="submitConfirm()">
              <div class="rl-auth-gate__field">
                <ion-input
                  placeholder="Código de 6 dígitos"
                  formControlName="code"
                  inputmode="numeric"
                  maxlength="6"
                  autocomplete="one-time-code"
                />
              </div>

              @if (error()) {
                <p class="rl-auth-gate__error">{{ error() }}</p>
              }
              @if (notice()) {
                <p class="rl-auth-gate__notice">{{ notice() }}</p>
              }

              <button
                type="submit"
                class="rl-auth-gate__submit"
                [disabled]="confirmForm.invalid || loading()"
              >
                {{ loading() ? 'Verificando…' : 'Confirmar' }}
              </button>
              <button type="button" class="rl-auth-gate__link" [disabled]="loading()" (click)="resendCode()">
                Reenviar código
              </button>
              <button type="button" class="rl-auth-gate__link" (click)="setMode('signin')">
                Volver al ingreso
              </button>
            </form>
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class AuthEntryPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly mode = signal<AuthMode>('signin');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly registeredEmail = signal('');

  readonly signinForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly signupForm = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  readonly confirmForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    if (this.route.snapshot.routeConfig?.path === 'register') {
      this.setMode('signup');
    }
  }

  setMode(next: AuthMode): void {
    this.mode.set(next);
    this.error.set(null);
    this.notice.set(null);
  }

  async submitSignin(): Promise<void> {
    if (this.signinForm.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.signinForm.getRawValue();
    try {
      await this.auth.login(email, password);
      await this.router.navigateByUrl('/app/own');
    } catch (err) {
      if (err instanceof AuthPendingConfirmationError) {
        this.registeredEmail.set(email);
        this.setMode('confirm');
        this.error.set('Confirmá tu email con el código enviado.');
        return;
      }
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async submitSignup(): Promise<void> {
    if (this.signupForm.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.signupForm.getRawValue();
    try {
      await this.auth.register(email, password);
      this.registeredEmail.set(email);
      this.signinForm.patchValue({ email, password });
      this.setMode('confirm');
      this.notice.set('Te enviamos un código de verificación.');
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async submitConfirm(): Promise<void> {
    if (this.confirmForm.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const email = this.registeredEmail() || this.signupForm.controls.email.value;
    const password = this.signinForm.controls.password.value || this.signupForm.controls.password.value;
    const { code } = this.confirmForm.getRawValue();
    try {
      await this.auth.confirmRegistration(email, code);
      await this.auth.login(email, password);
      await this.router.navigateByUrl('/app/own');
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async resendCode(): Promise<void> {
    const email = this.registeredEmail();
    if (!email) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.resendConfirmation(email);
      this.notice.set('Código reenviado.');
    } catch (err) {
      this.error.set(mapAuthErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
