---
description: "Use when modifying Azure Bicep templates, Dockerfile, deployment configuration, or infrastructure-as-code."
applyTo: "infra/**/*.bicep, app/Dockerfile, azure.yaml"
---
# Infrastructure Conventions

## Bicep

- Entry point: `infra/main.bicep` (subscription-level)
- Resources: `infra/resources.bicep`
- All secrets in Azure Key Vault — never in parameters or environment variables
- Use Managed Identity for RBAC-based access
- Do not hardcode resource names

## Dockerfile

Next.js standalone output requires explicit COPY for these directories in the runner stage:
- `.next/standalone` — Server bundle
- `.next/static` — Static assets
- `public/` — Favicon and static files
- `drizzle/` — Migration SQL files

### AI Analyst — Copilot CLI

The AI Analyst uses `@github/copilot-sdk`, which spawns the `@github/copilot` CLI as a child process.
Next's standalone tracer cannot follow the SDK's dynamic require for it, so:
- A dedicated `copilot-cli` build stage installs the CLI as a flat tree; the runner copies it to
  `copilot-cli/node_modules` and sets `COPILOT_CLI_PATH` to its `index.js` entry.
- Keep the pinned `@github/copilot` version in the `copilot-cli` stage in sync with `pnpm-lock.yaml`.
- On Alpine the CLI loads a musl binary (`@github/copilot-linuxmusl-*`); the runner installs `libstdc++`.
- The Copilot token is supplied at runtime from settings (Key Vault) — never baked into the image.

## Deployment

- `azd up` for full provision + deploy
- `azd deploy` for app-only deploy
- Always run `cd app && pnpm run build` before deploying to catch errors early
