output "appsync_api_arn" {
  value = aws_lambda_function.appsync_api.arn
}

output "appsync_api_function_name" {
  value = aws_lambda_function.appsync_api.function_name
}

output "competitor_scan_function_name" {
  value = aws_lambda_function.competitor_scan.function_name
}

output "lambda_exec_role_arn" {
  value = aws_iam_role.lambda_exec.arn
}
