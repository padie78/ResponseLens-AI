import { Amplify } from 'aws-amplify';
import type { AppEnvironment } from '../environments/environment.types';

export function configureAmplify(env: AppEnvironment): void {
  const hasCognito = !!env.cognito.userPoolId && !!env.cognito.userPoolClientId;
  const hasAppSync = !!env.appsync.endpoint && !!env.appsync.apiKey;

  if (!hasCognito && !hasAppSync) {
    console.warn(
      '[ResponseLens] Amplify sin configurar. Ejecutá npm run sync:env tras terraform apply.',
    );
    return;
  }

  const redirectSignIn = env.cognito.oauthRedirectSignIn ?? `${window.location.origin}/auth/callback`;
  const redirectSignOut = env.cognito.oauthRedirectSignOut ?? `${window.location.origin}/login`;
  const oauthDomain = resolveCognitoOAuthDomain(env.cognito.domain, env.appsync.region);

  Amplify.configure({
    ...(hasCognito
      ? {
          Auth: {
            Cognito: {
              userPoolId: env.cognito.userPoolId,
              userPoolClientId: env.cognito.userPoolClientId,
              loginWith: {
                email: true,
                ...(oauthDomain
                  ? {
                      oauth: {
                        domain: oauthDomain,
                        scopes: ['openid', 'email', 'profile'],
                        redirectSignIn: [redirectSignIn],
                        redirectSignOut: [redirectSignOut],
                        responseType: 'code' as const,
                      },
                    }
                  : {}),
              },
              signUpVerificationMethod: 'code',
            },
          },
        }
      : {}),
    ...(hasAppSync
      ? {
          API: {
            GraphQL: {
              endpoint: env.appsync.endpoint,
              region: env.appsync.region,
              defaultAuthMode: 'apiKey',
              apiKey: env.appsync.apiKey,
            },
          },
        }
      : {}),
  });
}

export function resolveCognitoOAuthDomain(
  domain: string | undefined,
  region: string,
): string | undefined {
  const trimmed = domain?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('.amazoncognito.com')) return trimmed;
  return `${trimmed}.auth.${region}.amazoncognito.com`;
}

export function isOAuthConfigured(env: AppEnvironment): boolean {
  return !!resolveCognitoOAuthDomain(env.cognito.domain, env.appsync.region);
}
