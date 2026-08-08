/**
 * Auth Cognito (email/password) para la extensión.
 * Si no hay pool configurado → modo local (device user).
 */

const AUTH_KEY = 'rl_auth';
const COGNITO_KEY = 'rl_cognito';

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(obj) {
  return chrome.storage.local.set(obj);
}

export async function getCognitoConfig() {
  const data = await storageGet([COGNITO_KEY]);
  const cfg = data[COGNITO_KEY] || {};
  if (cfg.userPoolId && cfg.clientId && cfg.region) return cfg;
  return null;
}

export async function saveCognitoConfig(cfg) {
  await storageSet({
    [COGNITO_KEY]: {
      region: String(cfg.region || '').trim(),
      userPoolId: String(cfg.userPoolId || '').trim(),
      clientId: String(cfg.clientId || '').trim(),
    },
  });
}

function cognitoEndpoint(region) {
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

async function cognitoCall(region, target, body) {
  const res = await fetch(cognitoEndpoint(region), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.__type || json.message) {
    const msg = json.message || json.__type || `Cognito HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function sessionFromAuthResult(authResult, email) {
  const idToken = authResult.IdToken;
  const accessToken = authResult.AccessToken;
  const refreshToken = authResult.RefreshToken;
  const expiresIn = Number(authResult.ExpiresIn || 3600);
  const payload = decodeJwtPayload(idToken) || {};
  return {
    mode: 'cognito',
    email: email || payload.email || '',
    userId: payload.sub || '',
    idToken,
    accessToken,
    refreshToken: refreshToken || null,
    expiresAt: Date.now() + expiresIn * 1000 - 60_000,
  };
}

export async function getSession() {
  const data = await storageGet([AUTH_KEY]);
  const session = data[AUTH_KEY] || null;
  if (!session?.userId) return null;
  if (session.mode === 'local') return session;
  if (session.expiresAt && Date.now() > session.expiresAt && session.refreshToken) {
    try {
      return await refreshSession(session);
    } catch {
      await clearSession();
      return null;
    }
  }
  if (session.expiresAt && Date.now() > session.expiresAt) {
    await clearSession();
    return null;
  }
  return session;
}

export async function clearSession() {
  await storageSet({ [AUTH_KEY]: null });
}

export async function saveSession(session) {
  await storageSet({ [AUTH_KEY]: session });
}

export async function startLocalSession(emailHint = '') {
  const data = await storageGet([AUTH_KEY, 'rl_user_config']);
  let userId = data[AUTH_KEY]?.userId;
  if (!userId || data[AUTH_KEY]?.mode !== 'local') {
    userId = `local_${crypto.randomUUID().slice(0, 8)}`;
  }
  // Reusar userId de config si ya existía en modo local previo
  const cfgId = data.rl_user_config?.userId;
  if (cfgId && String(cfgId).startsWith('local_')) userId = cfgId;

  const session = {
    mode: 'local',
    email: emailHint || 'local@device',
    userId,
    idToken: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  };
  await saveSession(session);
  return session;
}

export async function signUp({ email, password }) {
  const cfg = await getCognitoConfig();
  if (!cfg) throw new Error('Cognito no configurado. Usá modo local o cargá el pool en Config.');
  await cognitoCall(cfg.region, 'SignUp', {
    ClientId: cfg.clientId,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
  return { needsConfirmation: true, email };
}

export async function confirmSignUp({ email, code }) {
  const cfg = await getCognitoConfig();
  if (!cfg) throw new Error('Cognito no configurado');
  await cognitoCall(cfg.region, 'ConfirmSignUp', {
    ClientId: cfg.clientId,
    Username: email,
    ConfirmationCode: String(code || '').trim(),
  });
}

export async function signIn({ email, password }) {
  const cfg = await getCognitoConfig();
  if (!cfg) throw new Error('Cognito no configurado. Usá modo local o cargá el pool en Config.');
  const out = await cognitoCall(cfg.region, 'InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: cfg.clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });
  if (!out.AuthenticationResult) {
    throw new Error(out.ChallengeName ? `Challenge: ${out.ChallengeName}` : 'Login falló');
  }
  const session = sessionFromAuthResult(out.AuthenticationResult, email);
  await saveSession(session);
  return session;
}

export async function refreshSession(session) {
  const cfg = await getCognitoConfig();
  if (!cfg || !session?.refreshToken) throw new Error('No refresh');
  const out = await cognitoCall(cfg.region, 'InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: cfg.clientId,
    AuthParameters: {
      REFRESH_TOKEN: session.refreshToken,
    },
  });
  if (!out.AuthenticationResult) throw new Error('Refresh falló');
  const next = sessionFromAuthResult(
    {
      ...out.AuthenticationResult,
      RefreshToken: session.refreshToken,
    },
    session.email,
  );
  await saveSession(next);
  return next;
}

export async function signOut() {
  const session = await getSession();
  const cfg = await getCognitoConfig();
  if (session?.accessToken && cfg) {
    try {
      await cognitoCall(cfg.region, 'GlobalSignOut', {
        AccessToken: session.accessToken,
      });
    } catch {
      /* ignore */
    }
  }
  await clearSession();
}

export function authHeaders(session, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (session?.mode === 'cognito' && session.idToken) {
    headers.Authorization = session.idToken;
  } else if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}
