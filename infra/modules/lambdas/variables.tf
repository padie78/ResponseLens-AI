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
  type        = string
  default     = "cron(0 11 * * ? *)"
  description = "1×/día (11:00 UTC ≈ 08:00 AR)."
}

variable "competitor_scan_max_rivals" {
  type    = number
  default = 5
}

variable "socialcrawl_cron_lookback_days" {
  type    = number
  default = 2
}

variable "manual_scan_limit_per_day" {
  type    = number
  default = 3
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

variable "socialcrawl_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "SocialCrawl API key (server-only). Never expose to the SPA."
}

variable "socialcrawl_lookback_days" {
  type        = number
  default     = 7
  description = "Lookback scan manual (AppSync/worker)."
}

variable "socialcrawl_sources" {
  type        = string
  default     = ""
  description = "Optional CSV allowlist for SocialCrawl sources (empty = all)."
}

variable "inbound_webhook_secret" {
  type        = string
  sensitive   = true
  description = "Shared secret for POST /v1/webhooks/mentions (X-ResponseLens-Secret)."
}

variable "socialcrawl_jobs_queue_url" {
  type        = string
  description = "SQS URL for async SocialCrawl jobs started from AppSync."
}

variable "socialcrawl_jobs_queue_arn" {
  type        = string
  description = "SQS ARN for socialcrawl_worker event source mapping."
}

variable "external_apis_mock" {
  type        = string
  default     = "true"
  description = "true = mocks para APIs externas (SocialCrawl, Reddit, NewsAPI, intel F2)."
}

variable "intel_surfaces_schedule" {
  type        = string
  default     = "cron(30 11 * * ? *)"
  description = "F2: 1×/día, 11:30 UTC (después del competitor_scan)."
}

variable "meta_ad_library_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Token Meta Ad Library (opcional). Vacío + mock = ads mock."
}
