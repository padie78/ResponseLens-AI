output "appsync_api_arn" {
  value = aws_lambda_function.appsync_api.arn
}

output "appsync_api_function_name" {
  value = aws_lambda_function.appsync_api.function_name
}

output "competitor_scan_function_name" {
  value = aws_lambda_function.competitor_scan.function_name
}

output "mention_webhook_function_name" {
  value = aws_lambda_function.mention_webhook.function_name
}

output "mention_webhook_arn" {
  value = aws_lambda_function.mention_webhook.arn
}

output "socialcrawl_worker_function_name" {
  value = aws_lambda_function.socialcrawl_worker.function_name
}

output "lambda_exec_role_arn" {
  value = aws_iam_role.lambda_exec.arn
}
