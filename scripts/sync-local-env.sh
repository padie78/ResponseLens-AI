#!/usr/bin/env bash
# Sincroniza outputs de Terraform a .env.local para la extensión / scripts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infra"

if ! command -v terraform >/dev/null; then
  echo "terraform no está instalado" >&2
  exit 1
fi

GQL="$(terraform output -raw graphql_endpoint 2>/dev/null || true)"
RT="$(terraform output -raw realtime_endpoint 2>/dev/null || true)"
KEY="$(terraform output -raw appsync_api_key 2>/dev/null || true)"
COG_POOL="$(terraform output -raw cognito_user_pool_id 2>/dev/null || true)"
COG_CLIENT="$(terraform output -raw cognito_client_id 2>/dev/null || true)"
REGION="$(terraform output -raw aws_region 2>/dev/null || true)"
if [[ -z "$REGION" ]]; then
  REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
fi

if [[ -z "$GQL" ]]; then
  echo "Sin outputs Terraform. Ejecutá apply primero." >&2
  exit 1
fi

cat > "$ROOT/.env.local" <<EOF
APPSYNC_GRAPHQL_URL=$GQL
APPSYNC_REALTIME_URL=$RT
APPSYNC_API_KEY=$KEY
COGNITO_REGION=$REGION
COGNITO_USER_POOL_ID=$COG_POOL
COGNITO_CLIENT_ID=$COG_CLIENT
EOF

echo "Escrito $ROOT/.env.local"
echo "Cognito Pool: $COG_POOL"
echo "Cognito Client: $COG_CLIENT"
