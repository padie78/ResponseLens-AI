#!/usr/bin/env bash
# Inyecta SOCIALCRAWL_API_KEY en las Lambdas (appsync-api + competitor-scan).
# Uso:
#   export SOCIALCRAWL_API_KEY=sc_…
#   ./scripts/patch-socialcrawl-env.sh
#
# O definila en .env.local (gitignored):
#   SOCIALCRAWL_API_KEY=sc_…
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-eu-central-1}"
PREFIX="${NAME_PREFIX:-responselens-dev}"

if [[ -f "$ROOT/.env.local" ]]; then
  # shellcheck disable=SC1091
  set -a
  source <(grep -E '^SOCIALCRAWL_API_KEY=' "$ROOT/.env.local" || true)
  set +a
fi

KEY="${SOCIALCRAWL_API_KEY:-${TF_VAR_socialcrawl_api_key:-}}"
if [[ -z "$KEY" ]]; then
  echo "ERROR: definí SOCIALCRAWL_API_KEY (env, .env.local o TF_VAR_socialcrawl_api_key)." >&2
  exit 1
fi

patch_fn() {
  local fn="$1"
  echo "Patching $fn …"
  aws lambda get-function-configuration \
    --function-name "$fn" \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json > /tmp/rl-sc-env.json

  jq --arg key "$KEY" \
    '{Variables: (. + {SOCIALCRAWL_API_KEY: $key})}' \
    /tmp/rl-sc-env.json > /tmp/rl-sc-env-payload.json

  aws lambda update-function-configuration \
    --function-name "$fn" \
    --region "$REGION" \
    --environment "file:///tmp/rl-sc-env-payload.json" \
    --no-cli-pager >/dev/null

  aws lambda wait function-updated-v2 --function-name "$fn" --region "$REGION"
  echo "OK: $fn"
}

# Nombres desde Terraform si hay state
if command -v terraform >/dev/null && [[ -d "$ROOT/infra/.terraform" ]]; then
  FN_API="$(cd "$ROOT/infra" && terraform output -raw appsync_api_function_name 2>/dev/null || echo "${PREFIX}-appsync-api")"
  FN_SCAN="$(cd "$ROOT/infra" && terraform output -raw competitor_scan_function_name 2>/dev/null || echo "${PREFIX}-competitor-scan")"
else
  FN_API="${PREFIX}-appsync-api"
  FN_SCAN="${PREFIX}-competitor-scan"
fi

patch_fn "$FN_API"
patch_fn "$FN_SCAN"

echo ""
echo "Verificá (debe decir SET):"
aws lambda get-function-configuration \
  --function-name "$FN_API" \
  --region "$REGION" \
  --query 'Environment.Variables.SOCIALCRAWL_API_KEY' \
  --output text | awk '{ if (length($0)>0) print "SOCIALCRAWL_API_KEY: SET (" length($0) " chars)"; else print "SOCIALCRAWL_API_KEY: EMPTY" }'
