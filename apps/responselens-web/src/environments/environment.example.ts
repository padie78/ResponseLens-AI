import type { AppRuntimeEnvironment } from './environment.types';

/** Plantilla dev — copiá a environment.ts o usá `npm run sync:env`. */
export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: '',
    region: 'eu-central-1',
    apiKey: '',
  },
  cognito: {
    userPoolId: '',
    userPoolClientId: '',
    domain: '',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
};
