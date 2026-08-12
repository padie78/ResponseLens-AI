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
  timeout          = 30
  memory_size      = 1024
  architectures    = ["arm64"]

  environment {
    variables = {
      CORE_TABLE_NAME              = var.table_name
      OPENAI_API_KEY               = var.openai_api_key
      OPENAI_MODEL                 = var.openai_model
      LLM_PROVIDER                 = var.llm_provider
      GEMINI_API_KEY               = var.gemini_api_key
      LOG_LEVEL                    = "INFO"
      APPSYNC_GRAPHQL_URL          = ""
      APPSYNC_API_KEY              = ""
      SOCIALCRAWL_API_KEY          = var.socialcrawl_api_key
      SOCIALCRAWL_LOOKBACK_DAYS    = tostring(var.socialcrawl_lookback_days)
      SOCIALCRAWL_SOURCES          = var.socialcrawl_sources
      SOCIALCRAWL_FETCH_TIMEOUT_MS = "25000"
      SOCIALCRAWL_JOB_QUEUE_URL    = var.socialcrawl_jobs_queue_url
    }
  }

  # Terraform es dueño de este environment (TF_VAR_socialcrawl_api_key en CI).
  # No usar ignore_changes acá: un apply vacío borraría la key.
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
      CORE_TABLE_NAME           = var.table_name
      APPSYNC_GRAPHQL_URL       = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY           = "placeholder-will-be-patched"
      LOG_LEVEL                 = "INFO"
      REDDIT_CLIENT_ID          = var.reddit_client_id
      REDDIT_CLIENT_SECRET      = var.reddit_client_secret
      REDDIT_USER_AGENT         = var.reddit_user_agent
      NEWSAPI_API_KEY           = var.newsapi_api_key
      SOCIALCRAWL_API_KEY       = var.socialcrawl_api_key
      SOCIALCRAWL_LOOKBACK_DAYS = tostring(var.socialcrawl_lookback_days)
      SOCIALCRAWL_SOURCES       = var.socialcrawl_sources
    }
  }

  # CI patea APPSYNC_* reales post-deploy; no pisarlos en apply de infra.
  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_cloudwatch_log_group" "competitor_scan" {
  name              = "/aws/lambda/${aws_lambda_function.competitor_scan.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "mention_webhook" {
  function_name    = "${var.name_prefix}-mention-webhook"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 29
  memory_size      = 256
  architectures    = ["arm64"]

  environment {
    variables = {
      CORE_TABLE_NAME        = var.table_name
      APPSYNC_GRAPHQL_URL    = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY        = "placeholder-will-be-patched"
      INBOUND_WEBHOOK_SECRET = var.inbound_webhook_secret
      LOG_LEVEL              = "INFO"
    }
  }

  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_cloudwatch_log_group" "mention_webhook" {
  name              = "/aws/lambda/${aws_lambda_function.mention_webhook.function_name}"
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

resource "aws_lambda_function" "socialcrawl_worker" {
  function_name    = "${var.name_prefix}-socialcrawl-worker"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.bootstrap.output_path
  source_code_hash = data.archive_file.bootstrap.output_base64sha256
  timeout          = 120
  memory_size      = 1024
  architectures    = ["arm64"]

  environment {
    variables = {
      LOG_LEVEL                    = "INFO"
      APPSYNC_GRAPHQL_URL          = "https://placeholder-will-be-patched"
      APPSYNC_API_KEY              = "placeholder-will-be-patched"
      SOCIALCRAWL_API_KEY          = var.socialcrawl_api_key
      SOCIALCRAWL_LOOKBACK_DAYS    = tostring(var.socialcrawl_lookback_days)
      SOCIALCRAWL_SOURCES          = var.socialcrawl_sources
      SOCIALCRAWL_FETCH_TIMEOUT_MS = "110000"
    }
  }

  # CI patea APPSYNC_* reales post-deploy; no pisarlos en apply de infra.
  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_cloudwatch_log_group" "socialcrawl_worker" {
  name              = "/aws/lambda/${aws_lambda_function.socialcrawl_worker.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_event_source_mapping" "socialcrawl_jobs" {
  event_source_arn        = var.socialcrawl_jobs_queue_arn
  function_name           = aws_lambda_function.socialcrawl_worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config {
    maximum_concurrency = 2
  }
}
