output "competitor_scan_queue_url" {
  value = aws_sqs_queue.competitor_scan.url
}

output "competitor_scan_queue_arn" {
  value = aws_sqs_queue.competitor_scan.arn
}

output "dlq_arns" {
  value = {
    competitor_scan = aws_sqs_queue.competitor_scan_dlq.arn
  }
}
