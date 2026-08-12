resource "aws_sqs_queue" "competitor_scan_dlq" {
  name                      = "${var.name_prefix}-competitor-scan-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "competitor_scan" {
  name                       = "${var.name_prefix}-competitor-scan"
  visibility_timeout_seconds = 90
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.competitor_scan_dlq.arn
    maxReceiveCount     = 3
  })
}
