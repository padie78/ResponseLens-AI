variable "project_name" {
  type        = string
  description = "Nombre del proyecto (prefijo de recursos)."
  default     = "responselens"
}

variable "environment" {
  type        = string
  description = "Entorno de despliegue (dev, staging, prod)."
  default     = "dev"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "appsync_graphql_api_name" {
  type        = string
  default     = "responselens-api"
  description = "Nombre visible de la API GraphQL en AppSync."
}

variable "openai_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "API key OpenAI para analyzeReply."
}

variable "openai_model" {
  type    = string
  default = "gpt-4o-mini"
}

variable "llm_provider" {
  type    = string
  default = "openai"
}

variable "gemini_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "competitor_scan_schedule" {
  type        = string
  default     = "rate(15 minutes)"
  description = "Schedule EventBridge para escaneo competitivo."
}

variable "reddit_client_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Reddit app client id (script) para OAuth app-only en competitor_scan."
}

variable "reddit_client_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Reddit app client secret."
}

variable "reddit_user_agent" {
  type        = string
  default     = "ResponseLensAI/0.7 (competitor-scan)"
  description = "User-Agent obligatorio en llamadas Reddit."
}

variable "newsapi_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "NewsAPI.org key para menciones de prensa en competitor_scan."
}

variable "tags" {
  type    = map(string)
  default = {}
}
