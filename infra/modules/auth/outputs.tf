output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "user_pool_endpoint" {
  value = aws_cognito_user_pool.this.endpoint
}

output "cognito_domain" {
  value = aws_cognito_user_pool_domain.this.domain
}

output "cognito_hosted_ui_base_url" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}
