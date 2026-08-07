provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge({
      Project     = var.project_name
      Environment = var.environment
      Platform    = "responselens-ai"
      ManagedBy   = "terraform"
    }, var.tags)
  }
}
