# CI/CD — ResponseLens AI

| Workflow | Trigger | Qué hace |
|----------|---------|----------|
| `deploy-infra.yml` | push en `infra/**` o manual | Terraform apply |
| `deploy-lambdas.yml` | push en `lambda_code/**` / `libs/**`, tras infra OK, o manual | build + deploy + patch AppSync env |
| `deploy-frontend.yml` | push en `apps/responselens-web/**` o manual | build Angular + S3 + CloudFront |

## Primer deploy

```text
1. infra/bootstrap/terraform apply
2. scripts/setup-github-oidc.sh
3. GitHub Variables: TF_STATE_BUCKET, TF_STATE_LOCKS_TABLE, AWS_REGION
4. GitHub Secrets: AWS_DEPLOY_ROLE_ARN, SOCIALCRAWL_API_KEY, …
5. workflow_dispatch → Deploy Infrastructure
6. Deploy Lambdas (auto tras infra, o manual)
7. Local: export TF_STATE_BUCKET=… && npm run sync:env && npm run start:web
8. workflow_dispatch → Deploy Frontend
```

## Variables obligatorias

| Nombre | Ejemplo |
|--------|---------|
| `TF_STATE_BUCKET` | `responselens-tfstate-473959757331` |
| `TF_STATE_LOCKS_TABLE` | `responselens-tf-locks` |
| `AWS_REGION` | `eu-central-1` |
| `TF_STATE_KEY` | `dev/terraform.tfstate` |

```bash
cd infra/bootstrap && terraform output -raw state_bucket
```

## SocialCrawl en local

La key SC va en Terraform/Lambda. El SPA necesita AppSync:

```bash
export TF_STATE_BUCKET=responselens-tfstate-ACCOUNT
npm run sync:env
```

Reiniciá `npm run start:web` después.
