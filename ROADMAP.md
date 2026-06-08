# ROADMAP

## Phase 0: Scaffolding (DONE) ✅
- [x] Monorepo yapısı (apps/api, apps/admin, apps/landing, packages/shared)
- [x] API iskeleti (Express + Prisma + PostgreSQL + Redis)
- [x] Admin iskeleti (React + Vite + Material-UI)
- [x] Landing iskeleti (Vite multi-page static)
- [x] Prisma schema (multi-tenant: AIProvider, Application, AppUser, AppProviderConfig, AIUsageLog, AdminUser)
- [x] AI provider adapters (Gemini, Kimi, MiniMax) + orchestrator with fallback
- [x] Auth (JWT access + refresh, bcrypt, token rotation)
- [x] Routes: app auth, app AI, app sync, app profile, admin auth, admin CRUD
- [x] Docker Compose for local dev
- [x] Seed script (admin user, default providers, healthlens app)

## Phase 1: Dokploy Deploy (NEXT)
- [ ] Provision Dokploy project
- [ ] Wire DNS: api.setrox.com.tr, admin.setrox.com.tr, lens.setrox.com.tr
- [ ] SSL via Let's Encrypt (Dokploy auto)
- [ ] Deploy PostgreSQL service (Dokploy managed)
- [ ] Deploy Redis service (Dokploy managed)
- [ ] Deploy API service
- [ ] Deploy Admin service
- [ ] Deploy Landing service
- [ ] Run migrations in production
- [ ] Run seed in production
- [ ] Set real provider API keys via admin panel
- [ ] Update CORS_ORIGIN with production domains

## Phase 2: HealthLens iOS Integration
- [ ] Add axios + api config in HealthLens repo
- [ ] Implement token interceptor + auto-refresh
- [ ] Migrate logStore to backend sync (offline-first)
- [ ] Migrate hydrationStore to backend sync
- [ ] Migrate userStore to backend sync
- [ ] Wire aiService → backend proxy (replace direct Kimi/Gemini calls)
- [ ] Add NetInfo listener → process offline queue
- [ ] Add Sentry error tracking
- [ ] Test on physical device

## Phase 3: Polish
- [ ] Provider A/B testing (admin panel traffic split)
- [ ] Real-time usage alerts (admin email when cost > threshold)
- [ ] Subscription verification webhook (Apple/Google)
- [ ] Push notifications (OneSignal or Expo)
- [ ] Background AI jobs (BullMQ) for Pro users
- [ ] Multi-AI ensemble (parallel + voting) for Pro
- [ ] S3/MinIO for user-uploaded images
- [ ] CI/CD with GitHub Actions → Dokploy webhook

## Phase 4: Second App
- [ ] Define second app's domain (e.g. fittrack.setrox.com.tr)
- [ ] Create app in admin panel
- [ ] Configure provider assignments
- [ ] Build/reuse iOS shell
- [ ] Reuse @setrox/shared types in iOS app

## Phase 5: Future
- [ ] Multi-region (Dokploy in different continents)
- [ ] GraphQL alternative API
- [ ] Webhook system (notify external services on AI completion)
- [ ] Audit log UI in admin
- [ ] Cost forecasting / budget alerts
- [ ] White-label admin (custom branding per app)
