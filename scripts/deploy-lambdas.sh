#!/usr/bin/env bash
# Compila libs + lambdas y publica código a AWS Lambda.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build:lambdas

PREFIX="${NAME_PREFIX:-responselens-dev}"

zip_and_publish() {
  local dir="$1"
  local fn="$2"
  (
    cd "$dir"
    zip -q -j "/tmp/${fn}.zip" dist/index.js dist/index.js.map 2>/dev/null || zip -q -j "/tmp/${fn}.zip" dist/index.js
    aws lambda update-function-code --function-name "$fn" --zip-file "fileb:///tmp/${fn}.zip" >/dev/null
    echo "Published $fn"
  )
}

zip_and_publish "$ROOT/lambda_code/api/api" "${PREFIX}-appsync-api"
zip_and_publish "$ROOT/lambda_code/ingestion/competitor_scan" "${PREFIX}-competitor-scan"
