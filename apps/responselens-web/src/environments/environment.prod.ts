import type { AppRuntimeEnvironment } from './environment.types';

export const environment: AppRuntimeEnvironment = {
  production: true,
  appsync: {
    endpoint: '',
    region: 'us-east-1',
    apiKey: '',
  },
  cognito: {
    userPoolId: '',
    userPoolClientId: '',
    domain: '',
  },
};
