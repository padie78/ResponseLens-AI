output "table_name" {
  value = aws_dynamodb_table.core.name
}

output "table_arn" {
  value = aws_dynamodb_table.core.arn
}
