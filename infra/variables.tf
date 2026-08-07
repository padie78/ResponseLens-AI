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

variable "tags" {
  type    = map(string)
  default = {}
}
