variable "project_name" {
  type    = string
  default = "responselens"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "aws_account_id" {
  type        = string
  description = "Account ID donde vive el remote state."
}

variable "state_bucket_name_override" {
  type    = string
  default = ""
}

variable "locks_table_name_override" {
  type    = string
  default = ""
}
