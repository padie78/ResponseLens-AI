output "graphql_endpoint" {
  value = aws_appsync_graphql_api.this.uris["GRAPHQL"]
}

output "realtime_endpoint" {
  value = aws_appsync_graphql_api.this.uris["REALTIME"]
}

output "api_key" {
  value     = aws_appsync_api_key.this.key
  sensitive = true
}

output "api_id" {
  value = aws_appsync_graphql_api.this.id
}

output "api_arn" {
  value = aws_appsync_graphql_api.this.arn
}

output "graphql_api_name" {
  value = aws_appsync_graphql_api.this.name
}
