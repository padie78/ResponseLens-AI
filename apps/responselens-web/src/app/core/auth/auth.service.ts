import { Injectable, computed, signal } from '@angular/core';
import {
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import {
  AuthPendingConfirmationError,
  decodeJwtPayload,
  isAlreadyAuthenticatedError,
} from './auth.errors';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _userId = signal<string | null>(null);
  private readonly _email = signal<string | null>(null);

  readonly userId = computed(() => this._userId());
  readonly email = computed(() => this._email());
  readonly isAuthenticated = computed(() => !!this._userId());

  async restoreSession(): Promise<boolean> {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) return false;
      this.applyToken(idToken);
      await this.refreshUserAttributes();
      return true;
    } catch {
      return false;
    }
  }

  async completeOAuthRedirect(): Promise<void> {
    await this.persistSessionFromTokens();
    await this.refreshUserAttributes();
  }

  async login(email: string, password: string): Promise<void> {
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
    await signUp({
      username: email,
      password,
      options: {
        userAttributes: { email },
      },
    });
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    await confirmSignUp({ username: email, confirmationCode: code });
  }

  async resendConfirmation(email: string): Promise<void> {
    await resendSignUpCode({ username: email });
  }

  async logout(): Promise<void> {
    try {
      await signOut();
    } finally {
      this._userId.set(null);
      this._email.set(null);
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
