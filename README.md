# ResponseLens AI

SaaS B2B — control reputacional + inteligencia competitiva (Chrome Extension + AWS Serverless + Angular web).

Monorepo hexagonal: `apps/` · `libs/` · `lambda_code/` · `infra/`.

## Apps

| App | Stack | Comando |
|---|---|---|
| `responselens-extension` | Chrome MV3 (Vanilla JS) | Load unpacked en Chrome |
| `responselens-web` | Angular 19 + Ionic 8 standalone | `npm run start:web` |

```bash
npm run start:web          # SPA en http://localhost:4200
npm run build:web          # dist/apps/responselens-web
npm run sync:env           # Terraform → .env.local + environment.ts
```

La extensión se mantiene para captura/inyección en página; el SPA replica el panel (Propios, Competencia, Stats, Ranking, Config).
