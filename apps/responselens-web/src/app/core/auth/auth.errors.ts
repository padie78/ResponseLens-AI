export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mapAuthErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Error de autenticación.';
  const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
  const message = 'message' in err && typeof err.message === 'string' ? err.message : '';

  if (/UserPool not configured/i.test(message) || name === 'AuthUserPoolException') {
    return 'Auth no configurado. Ejecutá npm run sync:env tras terraform apply.';
  }

  switch (name) {
    case 'NotAuthorizedException':
      return 'Email o contraseña incorrectos.';
    case 'UserNotConfirmedException':
      return 'Confirmá tu email antes de entrar.';
    case 'UsernameExistsException':
      return 'Ya existe una cuenta con ese email.';
    case 'InvalidPasswordException':
      return 'La contraseña no cumple la política de Cognito.';
    case 'CodeMismatchException':
      return 'Código inválido.';
    case 'ExpiredCodeException':
      return 'El código expiró. Pedí uno nuevo.';
    default:
      return message || 'Error de autenticación.';
  }
}

export function isAlreadyAuthenticatedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
  const message = 'message' in err && typeof err.message === 'string' ? err.message : '';
  return (
    name === 'UserAlreadyAuthenticatedException' ||
    /already.+signed.?in/i.test(message)
  );
}

export class AuthPendingConfirmationError extends Error {
  constructor(readonly email: string) {
    super('PENDING_CONFIRMATION');
    this.name = 'AuthPendingConfirmationError';
  }
}
