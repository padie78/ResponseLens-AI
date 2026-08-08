variable "name_prefix" {
  type = string
}

variable "graphql_api_name" {
  type = string
}

variable "cognito_user_pool_id" {
  type        = string
  description = "Cognito User Pool para auth de la extensión (además de API_KEY)."
  default     = ""
}
