#!/usr/bin/env bash
# Sincroniza outputs de Terraform a:
#   1) .env.local (scripts / tooling)
#   2) apps/responselens-web/src/environments/environment.ts (SPA Angular)
#
# Orden de resolución:
#   A) terraform output -json (auto-init con bucket del bootstrap si hace falta)
#   B) variables de entorno APPSYNC_* / COGNITO_*
#   C) archivo .env.local existente
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_WEB="$ROOT/apps/responselens-web/src/environments/environment.ts"
DOTENV="$ROOT/.env.local"
INFRA="$ROOT/infra"
BOOTSTRAP="$ROOT/infra/bootstrap"

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

resolve_tf_state_bucket() {
  if [[ -n "${TF_STATE_BUCKET:-}" ]]; then
    echo "$TF_STATE_BUCKET"
    return 0
  fi
  if [[ -f "$BOOTSTRAP/terraform.tfstate" ]] && command -v jq >/dev/null; then
    local from_bootstrap
    from_bootstrap="$(jq -r '.outputs.state_bucket.value // empty' "$BOOTSTRAP/terraform.tfstate" 2>/dev/null || true)"
    if [[ -n "$from_bootstrap" ]]; then
      echo "$from_bootstrap"
      return 0
    fi
  fi
  if command -v aws >/dev/null && command -v jq >/dev/null; then
    local account_id bucket
    account_id="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
    if [[ -n "$account_id" ]]; then
      bucket="responselens-tfstate-${account_id}"
      if aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
        echo "$bucket"
        return 0
      fi
    fi
  fi
  return 1
}

ensure_terraform_init() {
  command -v terraform >/dev/null || return 1
  cd "$INFRA"

  if terraform output -json >/dev/null 2>&1; then
    local keys
    keys="$(terraform output -json 2>/dev/null | jq -r 'keys | length' 2>/dev/null || echo 0)"
    if [[ "$keys" != "0" ]]; then
      return 0
    fi
  fi

  local bucket
  bucket="$(resolve_tf_state_bucket || true)"
  if [[ -z "$bucket" ]]; then
    return 1
  fi

  echo "Inicializando Terraform backend (bucket=${bucket})…" >&2
  terraform init -input=false -no-color \
    -backend-config="bucket=${bucket}" \
    -backend-config="key=${TF_STATE_KEY:-dev/terraform.tfstate}" \
    -backend-config="region=${REGION}" \
    -backend-config="dynamodb_table=${TF_STATE_LOCKS_TABLE:-responselens-tf-locks}" \
    -backend-config="encrypt=true" >/dev/null
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
  command -v jq >/dev/null || return 1
  ensure_terraform_init || return 1

  cd "$INFRA"
  local outputs
  outputs="$(terraform output -json 2>/dev/null || true)"
  if [[ -z "$outputs" || "$outputs" == "{}" ]]; then
    return 1
  fi

  GQL="$(echo "$outputs" | jq -r '.appsync_endpoint.value // .graphql_endpoint.value // empty')"
  RT="$(echo "$outputs" | jq -r '.appsync_realtime_endpoint.value // .realtime_endpoint.value // empty')"
  KEY="$(echo "$outputs" | jq -r '.appsync_api_key.value // empty')"
  COG_POOL="$(echo "$outputs" | jq -r '.cognito_user_pool_id.value // empty')"
  COG_CLIENT="$(echo "$outputs" | jq -r '.cognito_client_id.value // empty')"
  COG_DOMAIN="$(echo "$outputs" | jq -r '.cognito_domain.value // empty')"
  REGION="$(echo "$outputs" | jq -r '.aws_region.value // empty')" 
  [[ -z "$REGION" || "$REGION" == "null" ]] && REGION="${AWS_REGION:-eu-central-1}"

  # Fallback: client id desde AWS si el output aún no está en state
  if [[ -z "$COG_CLIENT" && -n "$COG_POOL" ]] && command -v aws >/dev/null; then
    COG_CLIENT="$(aws cognito-idp list-user-pool-clients \
      --user-pool-id "$COG_POOL" \
      --max-results 1 \
      --region "$REGION" \
      --query 'UserPoolClients[0].ClientId' \
      --output text 2>/dev/null || true)"
    [[ "$COG_CLIENT" == "None" || "$COG_CLIENT" == "null" ]] && COG_CLIENT=""
  fi

  [[ -n "$GQL" && -n "$KEY" ]]
}

write_outputs() {
  if [[ -z "$GQL" || -z "$KEY" ]]; then
    cat >&2 <<EOF
No se pudo resolver AppSync para el SPA local.

Causa habitual: infra aún no aplicada (terraform output vacío).

Pasos:
  1. cd infra && terraform apply     (o GitHub → Deploy Infrastructure)
  2. npm run sync:env                (detecta bucket del bootstrap automáticamente)
  3. npm run start:web               (reiniciar dev server)

Si ya aplicaste infra, verificá:
  cd infra/bootstrap && terraform output -raw state_bucket
  aws appsync list-graphql-apis --region ${REGION}

Deploy Lambdas (GitHub) sube el handler searchSocialMentions — infra solo pone secrets.
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
  if [[ -z "$COG_CLIENT" ]]; then
    echo "WARN: Cognito client id vacío — corré 'terraform apply' en infra/ si falta login." >&2
  fi
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
