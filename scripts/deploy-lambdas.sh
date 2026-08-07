#!/usr/bin/env bash
# Compila libs + lambdas y publica código a AWS Lambda.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Región vacía → endpoint inválido: https://lambda..amazonaws.com
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
if [[ -z "${AWS_REGION}" ]]; then
  AWS_REGION="eu-central-1"
  echo "WARN: AWS_REGION no definido; usando default ${AWS_REGION}" >&2
fi
export AWS_REGION
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  if [[ -z "${AWS_PROFILE:-}" ]] && [[ -z "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" ]]; then
    echo "ERROR: faltan credenciales AWS (AWS_ACCESS_KEY_ID/SECRET o OIDC/profile)." >&2
    exit 1
  fi
fi

echo "Deploying lambdas → region=${AWS_REGION} prefix=${NAME_PREFIX:-responselens-dev}"

npm run build:lambdas

PREFIX="${NAME_PREFIX:-responselens-dev}"

zip_and_publish() {
  local dir="$1"
  local fn="$2"
  (
    cd "$dir"
    if [[ ! -f dist/index.js ]]; then
      echo "ERROR: falta dist/index.js en ${dir} (build falló?)" >&2
      exit 1
    fi
    zip -q -j "/tmp/${fn}.zip" dist/index.js dist/index.js.map 2>/dev/null || zip -q -j "/tmp/${fn}.zip" dist/index.js
    aws lambda update-function-code \
      --region "${AWS_REGION}" \
      --function-name "$fn" \
      --zip-file "fileb:///tmp/${fn}.zip" >/dev/null
    echo "Published $fn"
  )
}

zip_and_publish "$ROOT/lambda_code/api/api" "${PREFIX}-appsync-api"
zip_and_publish "$ROOT/lambda_code/ingestion/competitor_scan" "${PREFIX}-competitor-scan"
