# Auth (Cognito)

## Qué hay
- Terraform: `infra/modules/auth` → User Pool + App Client (email/password).
- AppSync: Cognito como auth principal + API_KEY adicional.
- SPA: login / registro / modo local en `apps/responselens-web`.

## Flujo usuario
1. Deploy infra (`terraform apply`).
2. `npm run sync:env` → escribe Cognito + AppSync en `environment.ts`.
3. Crear cuenta (email) → código de verificación → Entrar.
4. Sin nube: **Continuar en modo local** (o pegar Pool/Client en el formulario de login).

## Notas
- User ID sale del `sub` de Cognito (o `local_*` en modo local).
- GraphQL usa `Authorization: <idToken>` si hay sesión Cognito; si no, `x-api-key`.
