locals {
  name_prefix            = "${var.project_name}-${var.environment}"
  inbound_webhook_secret = var.inbound_webhook_secret != "" ? var.inbound_webhook_secret : random_password.inbound_webhook.result
}

data "aws_region" "current" {}

resource "random_password" "inbound_webhook" {
  length  = 32
  special = false
}

module "database" {
  source      = "./modules/database"
  name_prefix = local.name_prefix
}

module "storage" {
  source      = "./modules/storage"
  name_prefix = local.name_prefix
}

module "queues" {
  source      = "./modules/queues"
  name_prefix = local.name_prefix
}

# Lambdas primero (bootstrap); AppSync URL se inyecta post-apply vía script/CI
# para evitar ciclo lambdas ↔ api (mismo patrón que statsGames).
module "lambdas" {
  source      = "./modules/lambdas"
  name_prefix = local.name_prefix

  table_name                 = module.database.table_name
  table_arn                  = module.database.table_arn
  openai_api_key             = var.openai_api_key
  openai_model               = var.openai_model
  llm_provider               = var.llm_provider
  gemini_api_key             = var.gemini_api_key
  competitor_scan_schedule       = var.competitor_scan_schedule
  competitor_scan_max_rivals     = var.competitor_scan_max_rivals
  intel_surfaces_schedule        = var.intel_surfaces_schedule
  meta_ad_library_token          = var.meta_ad_library_token
  socialcrawl_cron_lookback_days = var.socialcrawl_cron_lookback_days
  manual_scan_limit_per_day      = var.manual_scan_limit_per_day
  reddit_client_id           = var.reddit_client_id
  reddit_client_secret       = var.reddit_client_secret
  reddit_user_agent          = var.reddit_user_agent
  newsapi_api_key            = var.newsapi_api_key
  socialcrawl_api_key        = var.socialcrawl_api_key
  socialcrawl_lookback_days  = var.socialcrawl_lookback_days
  socialcrawl_sources        = var.socialcrawl_sources
  inbound_webhook_secret     = local.inbound_webhook_secret
  socialcrawl_jobs_queue_url = module.queues.socialcrawl_jobs_queue_url
  external_apis_mock         = var.external_apis_mock
  socialcrawl_jobs_queue_arn = module.queues.socialcrawl_jobs_queue_arn
}

module "frontend_hosting" {
  source      = "./modules/frontend_hosting"
  name_prefix = local.name_prefix
}

module "auth" {
  source      = "./modules/auth"
  name_prefix = local.name_prefix
  aws_region  = data.aws_region.current.name

  domain_prefix       = local.cognito_domain_prefix
  oauth_callback_urls = local.cognito_oauth_callback_urls
  oauth_logout_urls   = local.cognito_oauth_logout_urls
}

module "api" {
  source               = "./modules/api"
  name_prefix          = local.name_prefix
  graphql_api_name     = var.appsync_graphql_api_name
  appsync_api_arn      = module.lambdas.appsync_api_arn
  cognito_user_pool_id = module.auth.user_pool_id
}

module "http_api" {
  source                      = "./modules/http_api"
  name_prefix                 = local.name_prefix
  mention_webhook_lambda_arn  = module.lambdas.mention_webhook_arn
  mention_webhook_lambda_name = module.lambdas.mention_webhook_function_name
}
