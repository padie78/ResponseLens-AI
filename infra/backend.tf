# Remote backend — S3 + DynamoDB locking
# Valores vía `terraform init -backend-config=...` (ver infra/bootstrap/).
terraform {
  backend "s3" {
    encrypt = true
  }
}
