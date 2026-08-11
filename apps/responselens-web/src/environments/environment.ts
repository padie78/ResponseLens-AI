import type { AppRuntimeEnvironment } from './environment.types';

/**
 * Placeholders — reemplazá con `npm run sync:env` tras terraform apply.
 */
export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: '',
    region: 'us-east-1',
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
