#!/usr/bin/env bash
# Sincroniza outputs de Terraform a:
#   1) .env.local (scripts / tooling)
#   2) apps/responselens-web/src/environments/environment.ts (SPA Angular)
#
# Orden de resolución (primero que funcione):
#   A) terraform output (auto-init si TF_STATE_BUCKET está definido)
#   B) variables de entorno APPSYNC_* / COGNITO_*
#   C) archivo .env.local existente
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_WEB="$ROOT/apps/responselens-web/src/environments/environment.ts"
DOTENV="$ROOT/.env.local"

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-central-1}}"
GQL=""
RT=""
KEY=""
COG_POOL=""
COG_CLIENT=""
COG_DOMAIN=""

read_dotenv_var() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 1
  grep -E "^${name}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

load_from_env_or_dotenv() {
  GQL="${APPSYNC_GRAPHQL_URL:-$(read_dotenv_var "$DOTENV" APPSYNC_GRAPHQL_URL)}"
  RT="${APPSYNC_REALTIME_URL:-$(read_dotenv_var "$DOTENV" APPSYNC_REALTIME_URL)}"
  KEY="${APPSYNC_API_KEY:-$(read_dotenv_var "$DOTENV" APPSYNC_API_KEY)}"
  COG_POOL="${COGNITO_USER_POOL_ID:-$(read_dotenv_var "$DOTENV" COGNITO_USER_POOL_ID)}"
  COG_CLIENT="${COGNITO_CLIENT_ID:-$(read_dotenv_var "$DOTENV" COGNITO_CLIENT_ID)}"
  COG_DOMAIN="${COGNITO_DOMAIN:-$(read_dotenv_var "$DOTENV" COGNITO_DOMAIN)}"
  REGION="${COGNITO_REGION:-$(read_dotenv_var "$DOTENV" COGNITO_REGION)}"
  REGION="${REGION:-${AWS_REGION:-eu-central-1}}"
}

try_terraform_outputs() {
  command -v terraform >/dev/null || return 1

  cd "$ROOT/infra"

  if ! terraform output graphql_endpoint >/dev/null 2>&1; then
    if [[ -z "${TF_STATE_BUCKET:-}" ]]; then
      return 1
    fi
    echo "Inicializando Terraform backend (bucket=${TF_STATE_BUCKET})…" >&2
    terraform init -input=false -no-color \
      -backend-config="bucket=${TF_STATE_BUCKET}" \
      -backend-config="key=${TF_STATE_KEY:-dev/terraform.tfstate}" \
      -backend-config="region=${REGION}" \
      -backend-config="dynamodb_table=${TF_STATE_LOCKS_TABLE:-responselens-tf-locks}" \
      -backend-config="encrypt=true" >/dev/null
  fi

  GQL="$(terraform output -raw graphql_endpoint 2>/dev/null || true)"
  RT="$(terraform output -raw realtime_endpoint 2>/dev/null || true)"
  KEY="$(terraform output -raw appsync_api_key 2>/dev/null || true)"
  COG_POOL="$(terraform output -raw cognito_user_pool_id 2>/dev/null || true)"
  COG_CLIENT="$(terraform output -raw cognito_client_id 2>/dev/null || true)"
  COG_DOMAIN="$(terraform output -raw cognito_domain 2>/dev/null || true)"
  local tf_region
  tf_region="$(terraform output -raw aws_region 2>/dev/null || true)"
  [[ -n "$tf_region" ]] && REGION="$tf_region"

  [[ -n "$GQL" && -n "$KEY" ]]
}

write_outputs() {
  if [[ -z "$GQL" || -z "$KEY" ]]; then
    cat >&2 <<'EOF'
No se pudo resolver AppSync para el SPA local.

SocialCrawl NO se invoca si environment.ts tiene endpoint/apiKey vacíos.

Opción 1 — Terraform (recomendado):
  export TF_STATE_BUCKET=<bucket de GitHub Variables>
  export TF_STATE_KEY=dev/terraform.tfstate   # opcional
  npm run sync:env

Opción 2 — .env.local manual (copiá desde AWS Console → AppSync → Settings / API Keys):
  APPSYNC_GRAPHQL_URL=https://….appsync-api.….amazonaws.com/graphql
  APPSYNC_API_KEY=da2-…
  COGNITO_USER_POOL_ID=…
  COGNITO_CLIENT_ID=…
  npm run sync:env

Después: reiniciá `npm run start:web`.

También necesitás Deploy Lambdas en GitHub (workflow deploy-lambdas) para que
searchSocialMentions exista en la Lambda — infra solo pone la SOCIALCRAWL_API_KEY.
EOF
    exit 1
  fi

  cat > "$DOTENV" <<EOF
APPSYNC_GRAPHQL_URL=$GQL
APPSYNC_REALTIME_URL=$RT
APPSYNC_API_KEY=$KEY
COGNITO_REGION=$REGION
COGNITO_USER_POOL_ID=$COG_POOL
COGNITO_CLIENT_ID=$COG_CLIENT
COGNITO_DOMAIN=$COG_DOMAIN
EOF

  cat > "$ENV_WEB" <<EOF
import type { AppRuntimeEnvironment } from './environment.types';

/** Generado por scripts/sync-local-env.sh — no editar a mano en local. */
export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: '${GQL}',
    region: '${REGION}',
    apiKey: '${KEY}',
  },
  cognito: {
    userPoolId: '${COG_POOL}',
    userPoolClientId: '${COG_CLIENT}',
    domain: '${COG_DOMAIN}',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
};
EOF

  echo "Escrito $DOTENV"
  echo "Escrito $ENV_WEB"
  echo "AppSync: $GQL"
  echo "Cognito Pool: $COG_POOL"
  echo "Reiniciá el dev server (npm run start:web) para que SocialCrawl use el proxy."
}

if try_terraform_outputs; then
  echo "Fuente: terraform output" >&2
elif load_from_env_or_dotenv && [[ -n "$GQL" && -n "$KEY" ]]; then
  echo "Fuente: env / .env.local" >&2
else
  load_from_env_or_dotenv || true
fi

write_outputs
