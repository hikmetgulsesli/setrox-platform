# Setrox Platform

Multi-tenant AI API Gateway + Admin Panel + Landing Pages for the Setrox ecosystem.

## What is this?

A single backend that lets you:

- 🔌 **Plug in any AI provider** (Gemini, Kimi, MiniMax, OpenAI...) and switch between them without code changes.
- 🏷️ **Manage multiple client apps** (HealthLens today, more tomorrow) from one admin panel.
- 📊 **Track usage & cost** per provider, per app, per day.
- 🔐 **Plug-and-play auth** with JWT access + refresh tokens.
- 💸 **Daily free quotas** for free-tier users, unlimited for premium.

## Apps

| App | Tech | Port | Purpose |
|-----|------|------|---------|
| `apps/api` | Node 22 + Express + Prisma + PostgreSQL + Redis | 4000 | Public API + admin API |
| `apps/admin` | React + Vite + Material-UI | 5173 | Admin panel (`admin.setrox.com.tr`) |
| `apps/landing` | Vite static | 4173 | App-specific marketing pages |

## Packages

- `packages/shared` — TypeScript types & Zod schemas shared across API, Admin, and clients.

## Quick Start

```bash
# 1. Install
npm install

# 2. Copy env
cp .env.example .env
# Edit .env: set JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY to 32-byte random values
openssl rand -hex 32  # use for each

# 3. Start DB
docker compose up -d postgres redis

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run all apps
npm run dev
# API:      http://localhost:4000
# Admin:    http://localhost:5173
# Landing:  http://localhost:4173
```

## Default Admin Login

After `npm run db:seed`:
- **Email**: `admin@setrox.com.tr`
- **Password**: whatever you set in `.env` (default: `change-me-on-first-login`)

**⚠️ Change this immediately in production.**

## Architecture

```
┌──────────────────┐    ┌──────────────────────┐
│  iOS App (RN)    │───▶│  api.setrox.com.tr   │
│  HealthLens v1   │    │   Express + AI       │
└──────────────────┘    │   Orchestrator       │
                       │   ↓                  │
┌──────────────────┐    │   ┌────────────┐    │
│  Admin Panel     │───▶│   │ AIProvider │    │
│ admin.setrox.com │    │   │  (DB)      │    │
└──────────────────┘    │   └────────────┘    │
                       │   ↓                  │
                       │  Gemini/Kimi/        │
                       │  MiniMax (per app)   │
                       └──────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ PostgreSQL  +  Redis   │
                    └────────────────────────┘
```

## Dokploy Deployment

Each app is independently deployable. See `dokploy.example.yml` for service definitions.

Typical Dokploy setup:
1. PostgreSQL service (Dokploy managed or external)
2. Redis service (Dokploy managed or external)
3. **API** service → `apps/api` Dockerfile, port 4000
4. **Admin** service → `apps/admin` Dockerfile, port 80 (nginx)
5. **Landing** service → `apps/landing` Dockerfile, port 80 (nginx)
6. Set env vars in Dokploy UI
7. Wire DNS:
   - `api.setrox.com.tr` → API service
   - `admin.setrox.com.tr` → Admin service
   - `lens.setrox.com.tr` → Landing service

## Adding a New Client App

1. Admin panel → **Applications** → New Application
2. Copy the generated API key
3. Admin panel → **AI Providers** → enable at least one for the new app
4. In the client app, set the API key as `X-Api-Key` header and the API base URL
5. Done — same auth/AI/sync endpoints work for any app

## License

UNLICENSED — private project.
