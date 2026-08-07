locals {
  name_prefix = "${var.project_name}-${var.environment}"
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
  source = "./modules/lambdas"
  name_prefix = local.name_prefix

  table_name               = module.database.table_name
  table_arn                = module.database.table_arn
  openai_api_key           = var.openai_api_key
  openai_model             = var.openai_model
  llm_provider             = var.llm_provider
  gemini_api_key           = var.gemini_api_key
  competitor_scan_schedule = var.competitor_scan_schedule
}

module "api" {
  source           = "./modules/api"
  name_prefix      = local.name_prefix
  graphql_api_name = var.appsync_graphql_api_name
  appsync_api_arn  = module.lambdas.appsync_api_arn
}

module "auth" {
  source      = "./modules/auth"
  name_prefix = local.name_prefix
}
