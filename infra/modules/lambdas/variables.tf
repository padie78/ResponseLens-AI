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
