import type { AppRuntimeEnvironment } from './environment.types';

/** Generado por scripts/sync-local-env.sh — no editar a mano en local. */
export const environment: AppRuntimeEnvironment = {
  production: false,
  externalApisMock: true,
  appsync: {
    endpoint: 'https://eshcxes22jgm5cp3rsydvcao4e.appsync-api.eu-central-1.amazonaws.com/graphql',
    region: 'eu-central-1',
    apiKey: 'da2-43zfrhnjgvanhicvdnh2xmtase',
  },
  cognito: {
    userPoolId: 'eu-central-1_RoyesUZgQ',
    userPoolClientId: '4ft3hbims0ea5o36jdbpep0tf0',
    domain: 'responselens-dev',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
};
