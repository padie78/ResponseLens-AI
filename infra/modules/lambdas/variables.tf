variable "name_prefix" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "openai_api_key" {
  type      = string
  sensitive = true
  default   = ""
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
  type    = string
  default = "rate(15 minutes)"
}

variable "reddit_client_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "reddit_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "reddit_user_agent" {
  type    = string
  default = "ResponseLensAI/0.7 (competitor-scan)"
}

variable "newsapi_api_key" {
  type      = string
  sensitive = true
  default   = ""
}
