#!/usr/bin/env bash
# Apply completo de la infraestructura ResponseLens (patrón statsGames).
set -euo pipefail

terraform apply -auto-approve -parallelism=1

echo ""
echo "=== AppSync ==="
terraform output graphql_endpoint || true
terraform output appsync_endpoint || true

echo ""
echo "=== Lambdas ==="
terraform output appsync_api_function_name || true
terraform output competitor_scan_function_name || true
terraform output mention_webhook_function_name || true
terraform output socialcrawl_worker_function_name || true

echo ""
echo "=== Frontend ==="
terraform output frontend_url || true

echo ""
echo "=== Webhook inbound ==="
terraform output mentions_webhook_url || true
