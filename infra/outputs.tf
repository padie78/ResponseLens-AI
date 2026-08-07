output "graphql_endpoint" {
  value = module.api.graphql_endpoint
}

output "realtime_endpoint" {
  value = module.api.realtime_endpoint
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
