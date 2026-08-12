output "graphql_endpoint" {
  value = module.api.graphql_endpoint
}

output "appsync_endpoint" {
  value       = module.api.graphql_endpoint
  description = "Alias statsGames-compatible para CI/sync."
}

output "realtime_endpoint" {
  value = module.api.realtime_endpoint
}

output "appsync_realtime_endpoint" {
  value       = module.api.realtime_endpoint
  description = "Alias statsGames-compatible."
}

output "appsync_api_key" {
  value     = module.api.api_key
  sensitive = true
}

output "core_table_name" {
  value = module.database.table_name
}

output "appsync_api_function_name" {
  value = module.lambdas.appsync_api_function_name
}

output "competitor_scan_function_name" {
  value = module.lambdas.competitor_scan_function_name
}

output "mention_webhook_function_name" {
  value = module.lambdas.mention_webhook_function_name
}

output "socialcrawl_worker_function_name" {
  value = module.lambdas.socialcrawl_worker_function_name
}

output "socialcrawl_jobs_queue_url" {
  value = module.queues.socialcrawl_jobs_queue_url
}

output "mentions_webhook_url" {
  value       = module.http_api.mentions_webhook_url
  description = "POST inbound mentions (Mention/Zapier/Meltwater). Header X-ResponseLens-Secret."
}

output "inbound_webhook_secret" {
  value       = local.inbound_webhook_secret
  sensitive   = true
  description = "Shared secret for inbound webhook auth."
}

output "cognito_user_pool_id" {
  value = module.auth.user_pool_id
}

output "cognito_client_id" {
  value = module.auth.user_pool_client_id
}

output "cognito_domain" {
  value = module.auth.cognito_domain
}

output "cognito_endpoint" {
  value = module.auth.user_pool_endpoint
}

output "aws_region" {
  value = data.aws_region.current.name
}

output "frontend_bucket" {
  value = module.frontend_hosting.bucket_name
}

output "frontend_cloudfront_id" {
  value = module.frontend_hosting.distribution_id
}

output "frontend_cloudfront_domain" {
  value = module.frontend_hosting.distribution_domain
}

output "frontend_url" {
  value = "https://${module.frontend_hosting.distribution_domain}"
}
