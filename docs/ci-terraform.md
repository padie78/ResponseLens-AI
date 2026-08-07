# CI / Terraform — variables de GitHub necesarias

## Por qué se trababa `terraform init`

El backend S3 está **parcial** (`infra/backend.tf`). Sin `-backend-config` y sin `-input=false`, Terraform pide el bucket en stdin y en Actions se queda colgado.

## Setup una vez

```bash
cd infra/bootstrap
terraform init
terraform apply -var="aws_account_id=$(aws sts get-caller-identity --query Account --output text)"
```

Anota outputs `state_bucket` y `locks_table`.

```bash
./scripts/setup-github-oidc.sh --repo ORG/ResponseLens-AI
```

## GitHub → Settings → Secrets and variables → Actions

| Tipo | Nombre | Ejemplo |
|---|---|---|
| Secret | `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::123:role/responselens-github-deploy` |
| Secret | `OPENAI_API_KEY` | (opcional, analyzeReply) |
| Variable | `AWS_REGION` | `eu-central-1` |
| Variable | `TF_STATE_BUCKET` | output del bootstrap |
| Variable | `TF_STATE_LOCKS_TABLE` | `responselens-tf-locks` |
| Variable | `TF_STATE_KEY` | `dev/terraform.tfstate` |
| Variable | `NAME_PREFIX` | `responselens-dev` |

Sin `AWS_DEPLOY_ROLE_ARN` / keys, el workflow **omite** apply (no cuelga).
Sin `TF_STATE_BUCKET` (con credenciales), **falla rápido** con mensaje claro.
