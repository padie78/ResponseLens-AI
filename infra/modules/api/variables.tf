variable "name_prefix" {
  type = string
}

variable "graphql_api_name" {
  type = string
}

variable "appsync_api_arn" {
  type        = string
  description = "ARN de la Lambda appsync-api (resolvers UNIT)."
}
