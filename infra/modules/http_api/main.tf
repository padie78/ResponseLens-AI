variable "name_prefix" {
  type = string
}

variable "mention_webhook_lambda_arn" {
  type = string
}

variable "mention_webhook_lambda_name" {
  type = string
}

output "webhooks_api_endpoint" {
  value = aws_apigatewayv2_api.webhooks.api_endpoint
}

output "mentions_webhook_url" {
  value = "${aws_apigatewayv2_api.webhooks.api_endpoint}/v1/webhooks/mentions"
}

resource "aws_apigatewayv2_api" "webhooks" {
  name          = "${var.name_prefix}-webhooks"
  protocol_type = "HTTP"
  description   = "Inbound webhooks (Mention / Meltwater / Brandwatch / Zapier)"

  cors_configuration {
    allow_headers = ["content-type", "x-responselens-secret", "x-webhook-secret"]
    allow_methods = ["POST", "OPTIONS"]
    allow_origins = ["*"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "mention_webhook" {
  api_id                 = aws_apigatewayv2_api.webhooks.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.mention_webhook_lambda_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "mention_webhook" {
  api_id    = aws_apigatewayv2_api.webhooks.id
  route_key = "POST /v1/webhooks/mentions"
  target    = "integrations/${aws_apigatewayv2_integration.mention_webhook.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.webhooks.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "mention_webhook_apigw" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = var.mention_webhook_lambda_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhooks.execution_arn}/*/*/v1/webhooks/mentions"
}
