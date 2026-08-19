export interface AppRuntimeEnvironment {
  production: boolean;
  /** true = SocialCrawl y otras APIs externas usan mocks (default hasta integración real). */
  externalApisMock: boolean;
  appsync: {
    endpoint: string;
    region: string;
    apiKey: string;
  };
  cognito: {
    userPoolId: string;
    userPoolClientId: string;
    domain?: string;
    oauthRedirectSignIn?: string;
    oauthRedirectSignOut?: string;
  };
}

export type AppEnvironment = AppRuntimeEnvironment;
