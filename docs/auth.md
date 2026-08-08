# Auth (Cognito)

## Qué hay
- Terraform: `infra/modules/auth` → User Pool + App Client (email/password).
- AppSync: Cognito como auth principal + API_KEY adicional.
- Extensión v0.4: pantalla de login / registro / modo local.

## Flujo usuario
1. Deploy infra (`terraform apply`).
2. `scripts/sync-local-env.sh` → copiar Cognito + AppSync a Config de la extensión.
3. Crear cuenta (email) → código de verificación → Entrar.
4. Sin nube: **Continuar en modo local**.

## Notas
- User ID ya no se edita a mano: sale del `sub` de Cognito (o `local_*` en modo local).
- GraphQL usa `Authorization: <idToken>` si hay sesión Cognito; si no, `x-api-key`.
