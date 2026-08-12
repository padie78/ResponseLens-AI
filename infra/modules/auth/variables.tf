variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "domain_prefix" {
  type        = string
  description = "Prefijo del dominio Hosted UI de Cognito."
}

variable "oauth_callback_urls" {
  type        = list(string)
  description = "URLs de redirección OAuth tras login."
}

variable "oauth_logout_urls" {
  type        = list(string)
  description = "URLs de redirección tras logout."
}
