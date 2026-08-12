# Terraform Bootstrap

Crea el backend remoto para el stack principal de ResponseLens:

- Bucket S3 versionado y cifrado para `terraform.tfstate`
- Tabla DynamoDB para locks (`LockID`)

Se ejecuta **una sola vez** con state local.

## Uso

```bash
cd infra/bootstrap

terraform init
terraform apply \
  -var "aws_account_id=$(aws sts get-caller-identity --query Account --output text)" \
  -var "aws_region=eu-central-1"
```

Outputs → GitHub Variables:

```bash
terraform output -raw state_bucket   # TF_STATE_BUCKET
terraform output -raw locks_table    # TF_STATE_LOCKS_TABLE
```

Init del stack principal (`infra/`):

```bash
terraform init \
  -backend-config="bucket=$(terraform -chdir=../bootstrap output -raw state_bucket)" \
  -backend-config="key=dev/terraform.tfstate" \
  -backend-config="region=eu-central-1" \
  -backend-config="dynamodb_table=$(terraform -chdir=../bootstrap output -raw locks_table)"
```
