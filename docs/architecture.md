# Arquitectura monorepo ResponseLens AI

Misma separación que statsGames:

| Carpeta | Rol |
|---|---|
| `apps/responselens-extension` | Cliente Chrome MV3 |
| `libs/*` | Hexagonal (common → domain → application → infrastructure) |
| `lambda_code/*` | Handlers thin + composition-root |
| `infra/` | Terraform (DynamoDB, AppSync, Lambdas, queues, storage) |
| `integrations/` | Productores / probes externos |
| `scripts/` | Deploy y sync de env |
| `docs/` | Documentación |

## Single-table DynamoDB

- `PK=USER#<id> SK=CONFIG` — perfil empresa + competidores
- `PK=USER#<id> SK=ALERT#<iso>#<alertId>` — oportunidades de captación
- GSI1 por `alertId`
