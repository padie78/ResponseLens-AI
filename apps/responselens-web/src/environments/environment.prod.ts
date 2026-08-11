import type { AppRuntimeEnvironment } from './environment.types';

export const environment: AppRuntimeEnvironment = {
  production: true,
  appsync: {
    endpoint: '',
    region: 'eu-central-1',
    apiKey: '',
  },
  cognito: {
    userPoolId: 'eu-central-1_8f9Trsfwx',
    userPoolClientId: '4luoqsj0am3mn85pcfciukg9s9',
    domain: '',
  },
};
