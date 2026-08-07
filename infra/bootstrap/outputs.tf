output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "locks_table" {
  value = aws_dynamodb_table.locks.name
}
