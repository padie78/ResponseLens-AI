# Terraform crea las funciones con un handler bootstrap mínimo.
# El código real se publica después (CI o `scripts/deploy-lambdas.sh`).
data "archive_file" "bootstrap" {
  type        = "zip"
  output_path = "${path.module}/.artifacts/bootstrap.zip"

  source {
    filename = "index.js"
    content  = <<-EOT
      exports.handler = async () => ({
        statusCode: 503,
        body: JSON.stringify({
          message: "Lambda bootstrap. Publish real code via deploy-lambdas."
        })
      });
    EOT
  }
}

resource "aws_lambda_function" "appsync_api" {
  function_name    = "${var.name_prefix}-appsync-api"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 29
  memory_size      = 512
  architectures    = ["arm64"]

  environment {
    variables = {
      CORE_TABLE_NAME = var.table_name
      OPENAI_API_KEY  = var.openai_api_key
      OPENAI_MODEL    = var.openai_model
      LLM_PROVIDER    = var.llm_provider
      GEMINI_API_KEY  = var.gemini_api_key
      LOG_LEVEL       = "INFO"
    }
  }
}

resource "aws_cloudwatch_log_group" "appsync_api" {
  name              = "/aws/lambda/${aws_lambda_function.appsync_api.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "competitor_scan" {
  function_name    = "${var.name_prefix}-competitor-scan"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 60
  memory_size      = 512
  architectures    = ["arm64"]

  environment {
    variables = {
      CORE_TABLE_NAME     = var.table_name
      APPSYNC_GRAPHQL_URL = ""
      APPSYNC_API_KEY     = ""
      LOG_LEVEL           = "INFO"
    }
  }
}

resource "aws_cloudwatch_log_group" "competitor_scan" {
  name              = "/aws/lambda/${aws_lambda_function.competitor_scan.function_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_event_rule" "competitor_scan" {
  name                = "${var.name_prefix}-competitor-scan"
  description         = "Competitive mention scan"
  schedule_expression = var.competitor_scan_schedule
}

resource "aws_cloudwatch_event_target" "competitor_scan" {
  rule      = aws_cloudwatch_event_rule.competitor_scan.name
  target_id = "competitor-scan"
  arn       = aws_lambda_function.competitor_scan.arn
}

resource "aws_lambda_permission" "competitor_scan_events" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.competitor_scan.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.competitor_scan.arn
}
