import { Injectable, computed, inject, signal } from '@angular/core';
import {
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import { RuntimeConfigService } from '../config/runtime-config.service';
import {
  AuthPendingConfirmationError,
  decodeJwtPayload,
  isAlreadyAuthenticatedError,
} from './auth.errors';

const LOCAL_SESSION_KEY = 'rl_web_auth';

export type AuthMode = 'cognito' | 'local';

interface LocalSession {
  mode: 'local';
  userId: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly runtime = inject(RuntimeConfigService);

  private readonly _userId = signal<string | null>(null);
  private readonly _email = signal<string | null>(null);
  private readonly _mode = signal<AuthMode | null>(null);

  readonly userId = computed(() => this._userId());
  readonly email = computed(() => this._email());
  readonly mode = computed(() => this._mode());
  readonly isLocal = computed(() => this._mode() === 'local');
  readonly isAuthenticated = computed(() => !!this._userId());
  readonly isCognitoConfigured = this.runtime.isCognitoConfigured;

  async restoreSession(): Promise<boolean> {
    const local = this.readLocalSession();
    if (local) {
      this._userId.set(local.userId);
      this._email.set(local.email);
      this._mode.set('local');
      return true;
    }

    if (!this.isCognitoConfigured()) return false;

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) return false;
      this.applyToken(idToken);
      this._mode.set('cognito');
      await this.refreshUserAttributes();
      return true;
    } catch {
      return false;
    }
  }

  async completeOAuthRedirect(): Promise<void> {
    await this.persistSessionFromTokens();
    this._mode.set('cognito');
    await this.refreshUserAttributes();
  }

  continueAsLocal(email = 'local@responselens.dev'): void {
    const session: LocalSession = {
      mode: 'local',
      userId: `local_${crypto.randomUUID().slice(0, 8)}`,
      email,
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    this._userId.set(session.userId);
    this._email.set(session.email);
    this._mode.set('local');
  }

  async login(email: string, password: string): Promise<void> {
    this.assertCognitoConfigured();
    try {
      const result = await signIn({
        username: email,
        password,
        options: { authFlowType: 'USER_PASSWORD_AUTH' },
      });

      if (!result.isSignedIn) {
        if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          throw new AuthPendingConfirmationError(email);
        }
        throw new Error(`Login incompleto: ${result.nextStep.signInStep}`);
      }

      await this.persistSessionFromTokens();
      this._mode.set('cognito');
      await this.refreshUserAttributes();
    } catch (err) {
      if (isAlreadyAuthenticatedError(err)) {
        await this.restoreSession();
        return;
      }
      throw err;
    }
  }

  async register(email: string, password: string): Promise<void> {
    this.assertCognitoConfigured();
    await signUp({
      username: email,
      password,
      options: {
        userAttributes: { email },
      },
    });
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    this.assertCognitoConfigured();
    await confirmSignUp({ username: email, confirmationCode: code });
  }

  async resendConfirmation(email: string): Promise<void> {
    this.assertCognitoConfigured();
    await resendSignUpCode({ username: email });
  }

  async logout(): Promise<void> {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    try {
      if (this._mode() === 'cognito' && this.isCognitoConfigured()) {
        await signOut();
      }
    } finally {
      this._userId.set(null);
      this._email.set(null);
      this._mode.set(null);
    }
  }

  private assertCognitoConfigured(): void {
    if (!this.isCognitoConfigured()) {
      throw new Error(
        'Auth UserPool not configured. Pegá Region / Pool / Client (los mismos de la extensión) o usá modo local.',
      );
    }
  }

  private readLocalSession(): LocalSession | null {
    try {
      const raw = localStorage.getItem(LOCAL_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LocalSession;
      if (parsed?.mode !== 'local' || !parsed.userId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async persistSessionFromTokens(): Promise<void> {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) throw new Error('Sesión sin idToken.');
    this.applyToken(idToken);
  }

  private applyToken(idToken: string): void {
    const payload = decodeJwtPayload(idToken);
    const sub = payload?.['sub'];
    const email = payload?.['email'];
    this._userId.set(typeof sub === 'string' ? sub : null);
    this._email.set(typeof email === 'string' ? email : null);
  }

  private async refreshUserAttributes(): Promise<void> {
    try {
      const attrs = await fetchUserAttributes();
      if (attrs.email) this._email.set(attrs.email);
      if (attrs.sub) this._userId.set(attrs.sub);
    } catch {
      // idToken ya hidrató lo esencial
    }
  }
}
