#!/usr/bin/env bash
# Compila libs + lambdas y publica código a AWS Lambda.
# Patrón statsGames: nombres desde Terraform output + patch APPSYNC_* en publishers.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-central-1}}"
export AWS_REGION
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  if [[ -z "${AWS_PROFILE:-}" ]] && [[ -z "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" ]]; then
    echo "ERROR: faltan credenciales AWS (AWS_ACCESS_KEY_ID/SECRET o OIDC/profile)." >&2
    exit 1
  fi
fi

resolve_function_name() {
  local tf_output="$1"
  local fallback="$2"

  if [[ -n "${TF_STATE_BUCKET:-}" ]] && command -v terraform >/dev/null && command -v jq >/dev/null; then
    (
      cd "$ROOT/infra"
      if ! terraform output "$tf_output" >/dev/null 2>&1; then
        terraform init -input=false \
          -backend-config="bucket=${TF_STATE_BUCKET}" \
          -backend-config="key=${TF_STATE_KEY:-dev/terraform.tfstate}" \
          -backend-config="region=${AWS_REGION}" \
          -backend-config="dynamodb_table=${TF_STATE_LOCKS_TABLE:-responselens-tf-locks}" \
          -backend-config="encrypt=true" >/dev/null 2>&1 || true
      fi
      terraform output -raw "$tf_output" 2>/dev/null || echo "$fallback"
    )
  else
    echo "$fallback"
  fi
}

patch_appsync_env() {
  local fn="$1"
  local gql api_key

  if [[ -z "${TF_STATE_BUCKET:-}" ]] || ! command -v terraform >/dev/null || ! command -v jq >/dev/null; then
    echo "WARN: sin TF_STATE_BUCKET — omitiendo patch AppSync en ${fn}" >&2
    return 0
  fi

  (
    cd "$ROOT/infra"
    gql="$(terraform output -raw appsync_endpoint 2>/dev/null || terraform output -raw graphql_endpoint 2>/dev/null || true)"
    api_key="$(terraform output -raw appsync_api_key 2>/dev/null || true)"
  )

  if [[ -z "$gql" || -z "$api_key" ]]; then
    echo "WARN: sin outputs AppSync — omitiendo patch en ${fn}" >&2
    return 0
  fi

  aws lambda get-function-configuration \
    --function-name "$fn" \
    --query 'Environment.Variables' \
    --output json > /tmp/rl-env.json

  jq \
    --arg url "$gql" \
    --arg key "$api_key" \
    '{Variables: (. + {APPSYNC_GRAPHQL_URL: $url, APPSYNC_API_KEY: $key})}' \
    /tmp/rl-env.json > /tmp/rl-env-payload.json

  aws lambda update-function-configuration \
    --function-name "$fn" \
    --environment "file:///tmp/rl-env-payload.json" \
    --no-cli-pager >/dev/null

  aws lambda wait function-updated-v2 --function-name "$fn"
  echo "Patched AppSync env on $fn"
}

PREFIX="${NAME_PREFIX:-responselens-dev}"
echo "Deploying lambdas → region=${AWS_REGION}"

npm run build:lambdas

FN_APPSYNC="$(resolve_function_name appsync_api_function_name "${PREFIX}-appsync-api")"
FN_SCAN="$(resolve_function_name competitor_scan_function_name "${PREFIX}-competitor-scan")"
FN_WEBHOOK="$(resolve_function_name mention_webhook_function_name "${PREFIX}-mention-webhook")"

zip_and_publish() {
  local dir="$1"
  local fn="$2"
  (
    cd "$dir"
    if [[ ! -f dist/index.js ]]; then
      echo "ERROR: falta dist/index.js en ${dir}" >&2
      exit 1
    fi
    zip -q -j "/tmp/${fn}.zip" dist/index.js dist/index.js.map 2>/dev/null || zip -q -j "/tmp/${fn}.zip" dist/index.js
    aws lambda wait function-active-v2 --function-name "$fn" 2>/dev/null || true
    aws lambda update-function-code \
      --function-name "$fn" \
      --zip-file "fileb:///tmp/${fn}.zip" \
      --publish \
      --no-cli-pager >/dev/null
    aws lambda wait function-updated-v2 --function-name "$fn"
    echo "Published $fn"
  )
}

zip_and_publish "$ROOT/lambda_code/api/api" "$FN_APPSYNC"
zip_and_publish "$ROOT/lambda_code/ingestion/competitor_scan" "$FN_SCAN"
zip_and_publish "$ROOT/lambda_code/ingestion/mention_webhook" "$FN_WEBHOOK"

patch_appsync_env "$FN_SCAN"
patch_appsync_env "$FN_WEBHOOK"

echo "Deploy complete"
