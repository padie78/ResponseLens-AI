# ResponseLens AI

SaaS B2B — control reputacional + inteligencia competitiva (Angular/Ionic + AWS Serverless).

Monorepo hexagonal: `apps/` · `libs/` · `lambda_code/` · `infra/`.

## App

| App | Stack | Comando |
|---|---|---|
| `responselens-web` | Angular 19 + Ionic 8 standalone | `npm run start:web` |

```bash
npm run start:web          # SPA en http://localhost:4200
npm run build:web          # dist/apps/responselens-web/browser
npm run sync:env           # Terraform → .env.local + environment.ts
```

Módulos: Propios · Competencia · Stats · Ranking · Config.

## CI/CD (GitHub Actions)

| Workflow | Trigger |
|---|---|
| Deploy Infrastructure | `infra/**` → Terraform (incluye S3 + CloudFront del SPA) |
| Deploy Lambdas | `libs/**`, `lambda_code/**` |
| Deploy Frontend | `apps/responselens-web/**` → build Angular → S3 + invalidación CF |

Antes del primer deploy del SPA: aplicar infra (outputs `frontend_bucket` / `frontend_cloudfront_*`) y credenciales `AWS_DEPLOY_ROLE_ARN` + `TF_STATE_BUCKET`.
