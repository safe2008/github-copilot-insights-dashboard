# Copilot Insights

Enterprise analytics dashboard for **GitHub Copilot** — giving engineering leaders full visibility into usage, adoption, licensing costs, and AI model activity across their organization.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Why Copilot Insights?

GitHub Copilot is transforming how teams write code — but without visibility into how it's being used, it's hard to measure the return on your investment. Copilot Insights bridges that gap by providing:

- **Adoption tracking** — see which teams and users are actively using Copilot, and where adoption lags
- **License optimization** — identify unused seats and potential savings across your enterprise
- **Model intelligence** — understand which AI models drive the most value and how premium request budgets are consumed
- **Productivity metrics** — measure code completions, agent usage, PR impact, and CLI adoption in one place
- **Enterprise governance** — role-based access, audit logging, and team-level filtering for compliance

## Dashboard Pages

| Page | Route | Description |
|---|---|---|
| **Copilot Usage** | `/metrics` | Daily/weekly active users, code completions, chat mode breakdown, model & language analytics |
| **Code Generation** | `/code-generation` | LOC added/deleted by user vs agent, breakdowns by feature, model, and language |
| **PR & Autofix** | `/pull-requests` | AI-assisted PR creation, Copilot code review suggestions, autofix analytics, and merge metrics |
| **Agent Impact** | `/agents` | Agent adoption rate, IDE Agent vs GitHub Coding Agent breakdown, top agent users |
| **CLI Impact** | `/cli` | CLI adoption, session/request volumes, token consumption, version distribution |
| **Copilot Licensing** | `/seats` | Seat assignments, license utilization, plan distribution, savings opportunities (live from GitHub API) |
| **Premium Requests** | `/premium-requests` | Premium model request consumption, quota tracking, and per-user breakdown (live from GitHub API) |
| **Models** | `/models` | AI model catalog with usage stats, premium vs included tiers, and feature breakdown |
| **Users** | `/users` | Individual user activity explorer with license status, engagement patterns, and feature adoption |
| **Enterprise Teams** | `/enterprise-teams` | Team management with member sync from GitHub Enterprise Teams API |
| **Metrics Reference** | `/reference` | 200+ metric definitions, calculation formulas, and data sources |

### Cross-cutting Features

- **Internationalization** — 4 languages (English, Arabic RTL, Spanish, French) via `useTranslation()` hook
- **Dark/Light/System theme** — three-mode theme with `dark:` Tailwind variants and theme-aware Chart.js options
- **PDF export** — one-click PDF generation for all dashboard pages
- **Multi-select filters** — filter charts by organization, enterprise team, user, model, or language
- **Configuration banner** — shown when GitHub token or enterprise slug is missing
- **Audit logging** — tracks admin actions for compliance
- **Dashboard auth gate** — optional password protection for all dashboard pages

## Screenshots

### Landing Page

Welcome page with feature overview cards and quick navigation to all dashboards.

![Landing Page](docs/screenshots/landing.png)

### Copilot Usage

Daily and weekly active users, code completions, chat requests, and model usage trends.

![Copilot Usage](docs/screenshots/copilot-usage.png)

### Code Generation

Lines of code added and deleted across modes, models, and languages.

![Code Generation](docs/screenshots/code-generation.png)

### PR & Autofix

AI-assisted pull request creation, Copilot code review suggestions, and autofix analytics.

![PR & Autofix](docs/screenshots/pr-autofix.png)

### Agent Impact

Agent adoption rate, IDE Agent vs GitHub Coding Agent breakdown, and top agent users.

![Agent Impact](docs/screenshots/agent-impact.png)

### CLI Impact

GitHub Copilot CLI adoption, session and request volumes, and token consumption.

![CLI Impact](docs/screenshots/cli-impact.png)

### Copilot Licensing

License utilization, seat costs, and savings opportunities — live from GitHub API.

![Copilot Licensing](docs/screenshots/copilot-licensing.png)

### Premium Requests

Premium model request consumption, quota allocation, and per-user breakdown.

![Premium Requests](docs/screenshots/premium-requests.png)

### Users

Individual user activity explorer with license status, engagement metrics, and feature adoption.

![Users](docs/screenshots/users.png)

### Enterprise Teams

Enterprise team management with member sync from GitHub Enterprise Teams API.

![Enterprise Teams](docs/screenshots/enterprise-teams.png)

### Metrics Reference

200+ metric definitions with calculation formulas, data sources, and usage guidance.

![Metrics Reference](docs/screenshots/metrics-reference.png)

### Settings — Configuration

Manage your GitHub connection and enterprise slug.

![Settings](docs/screenshots/settings.png)

### Settings — Data Sync

Schedule automatic syncs, trigger manual pulls, or upload NDJSON exports.

![Data Sync](docs/screenshots/data-sync.png)

## Architecture

- **Frontend**: Next.js 16.2 App Router, React 19.2, Tailwind CSS 4.2, Chart.js 4.5
- **Backend**: Next.js API routes, Drizzle ORM 0.45, Zod 4.3
- **Database**: PostgreSQL 18 (star schema — 10 dimensions + 8 fact tables)
- **ETL**: Custom ingest pipeline with GitHub Copilot Usage Metrics API (v2026-03-10)
- **Live data**: Seats and Premium Requests proxied directly from GitHub Billing API
- **Infrastructure**: Azure Container Apps, Azure Database for PostgreSQL, Azure Container Registry, Key Vault

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Prerequisites

- **Node.js** 24+ and **pnpm** (`corepack enable`)
- **PostgreSQL** 18+ (local or cloud)
- **GitHub Enterprise Cloud** with Copilot enabled
- **GitHub Personal Access Token** with `manage_billing:copilot`, `read:enterprise`, `read:org` scopes

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ghcp-dashboard.git
cd ghcp-dashboard

# 2. Install dependencies
cd app
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your database URL and admin password

# 4. Run database migrations
pnpm exec drizzle-kit migrate

# 5. Start the development server
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) and navigate to **Settings** to configure your GitHub token and sync schedule.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `ADMIN_PASSWORD` | No | Password for Settings page access. If unset, settings are open to all. Only leave this unset for local development on a trusted machine |
| `DASHBOARD_PASSWORD` | No | Password gate for all dashboard pages. If unset, dashboards are open to all. Only leave this unset for local development or intentionally public dashboards |
| `NEXT_PUBLIC_BUILD_ID` | No | Git commit SHA shown in sidebar footer (auto-set in Docker) |
| `NEXT_PUBLIC_BUILD_TIME` | No | Build timestamp shown in sidebar footer (auto-set in Docker) |

> [!WARNING]
> For any non-local deployment, set `ADMIN_PASSWORD` to protect the **Settings** page. The Settings UI can configure the GitHub token, Enterprise slug, and sync interval. If dashboard pages should not be publicly accessible, also set `DASHBOARD_PASSWORD`. Leaving these unset is only recommended for local development on a trusted machine.
The **GitHub token**, **Enterprise slug**, and **sync interval** are configured via the Settings UI and stored in the database.

## Deploy to Azure

This project includes Infrastructure as Code (Bicep) for Azure deployment via the [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/).

```bash
# Install Azure Developer CLI if needed
# https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd

# Deploy everything (infrastructure + app)
azd up

# Subsequent deploys (app only)
azd deploy
```

Resources provisioned:
- Azure Container Apps (0.5 vCPU, 1 GiB, scale 0–3)
- Azure Database for PostgreSQL Flexible Server (B1ms, 32 GB)
- Azure Container Registry (Basic)
- Azure Key Vault (secrets for DB URL, GitHub token, admin password)
- Application Insights + Log Analytics

## Project Structure

```
ghcp-dashboard/
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/                  # Pages and API routes
│   │   │   ├── api/              # REST API endpoints (31 routes)
│   │   │   ├── metrics/          # Copilot Usage dashboard
│   │   │   ├── code-generation/  # Code generation report
│   │   │   ├── pull-requests/    # PR & Autofix report
│   │   │   ├── agents/           # Agent impact report
│   │   │   ├── cli/              # CLI impact report
│   │   │   ├── seats/            # Licensing page (live)
│   │   │   ├── premium-requests/ # Premium requests page (live)
│   │   │   ├── models/           # AI model catalog
│   │   │   ├── users/            # User explorer
│   │   │   ├── enterprise-teams/ # Enterprise team management
│   │   │   ├── reference/        # Metrics reference
│   │   │   └── settings/         # Configuration, data sync, audit log & app info
│   │   ├── components/           # Shared React components
│   │   ├── lib/                  # Database, ETL, i18n, theme, utilities
│   │   └── types/                # TypeScript type definitions
│   ├── drizzle/                  # Database migrations
│   ├── public/                   # Static assets
│   ├── Dockerfile                # Multi-stage production build
│   └── package.json
├── infra/                        # Azure Bicep IaC
├── docs/                         # Documentation & screenshots
└── azure.yaml                    # Azure Developer CLI config
```

## Scripts

```bash
pnpm run dev          # Start dev server
pnpm run build        # Production build
pnpm run start        # Start production server
pnpm run lint         # ESLint check
pnpm run db:generate  # Generate Drizzle migrations
pnpm run db:migrate   # Run migrations
pnpm run db:push      # Push schema to DB
pnpm run ingest       # Manual data ingest
```

## Data Sync

The dashboard supports two sync modes:

1. **Auto-sync**: Background sync on a configurable interval (default: every 6 hours). Runs via `instrumentation.ts` on server startup.
2. **Manual sync**: Trigger from the Settings → Data Sync page via SSE streaming.

Both modes call the GitHub Copilot Usage Metrics API (v2026-03-10) and transform the data into a star schema for analytics queries.

## License

[MIT](LICENSE)
