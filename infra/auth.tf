# Cognito OAuth URLs — patrón statsGames (localhost + CloudFront automático).

variable "cognito_domain_prefix" {
  type        = string
  description = "Prefijo Hosted UI ({prefix}.auth.{region}.amazoncognito.com). Vacío → name_prefix."
  default     = ""
}

variable "cognito_oauth_callback_urls" {
  type        = list(string)
  description = "URLs OAuth adicionales tras login."
  default     = []
}

variable "cognito_oauth_logout_urls" {
  type        = list(string)
  description = "URLs OAuth adicionales tras logout."
  default     = []
}

locals {
  cognito_domain_prefix = var.cognito_domain_prefix != "" ? var.cognito_domain_prefix : local.name_prefix

  cognito_oauth_callback_urls = distinct(concat(
    var.cognito_oauth_callback_urls,
    [
      "http://localhost:4200/auth/callback",
      "https://${module.frontend_hosting.distribution_domain}/auth/callback",
    ],
  ))

  cognito_oauth_logout_urls = distinct(concat(
    var.cognito_oauth_logout_urls,
    [
      "http://localhost:4200/login",
      "https://${module.frontend_hosting.distribution_domain}/login",
    ],
  ))
}
