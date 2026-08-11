import type { AppRuntimeEnvironment } from './environment.types';

/** Dev Cognito — mismo patrón que statsGames (valores locales de desarrollo). */
export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: '',
    region: 'eu-central-1',
    apiKey: '',
  },
  cognito: {
    userPoolId: 'eu-central-1_8f9Trsfwx',
    userPoolClientId: '4luoqsj0am3mn85pcfciukg9s9',
    domain: '',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
};
