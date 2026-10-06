# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── mobile/             # Expo React Native app (Social Boost Horizon)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/mobile` (`@workspace/mobile`)

Expo React Native app: **Social Boost Horizon** — a professional mobile app for social media boost services.

- **Slug**: `social-boost-horizon`
- **Bundle ID**: `com.socialboosthorizon.app` (iOS & Android)
- **Theme**: Dark navy (#0A162B), gradient headers (#1e3c72 → #6a0dad), star background animations, glass cards, gold (#FFD700/#D4AF37) accents
- **Auth**: Firebase Auth (login/register) → Firebase ID token stored in `expo-secure-store`
- **Architecture**: Firebase Auth → ID token → Bearer token → `api-server` → Firestore REST API
- **API URL**: `EXPO_PUBLIC_API_URL` — dev falls back to `https://${EXPO_PUBLIC_DOMAIN}` (injected as `$REPLIT_DEV_DOMAIN`)
- **Old SMM Backend**: `https://social-boost-exaucenapopolo2.replit.app` — provides provider API routes; proxied via `SMM_BACKEND_URL` env var in api-server
- **Token management**: `services/tokenStore.ts` — stores/retrieves Firebase ID token via `expo-secure-store`
- **Service layer**: `services/api.ts` — REST client with auto-attached Bearer token
- **Database**: Firebase Firestore — `users`, `commandes`, `rechargements` collections
- **API Server**: `artifacts/api-server` — validates Firebase tokens via `firebase-admin`; provider proxy routes at `/api/exo-services`, `/api/mtp/services`, `/api/smmgen/services`, `/api/afriqueboost/services`, `/api/create-fapshi-checkout`
- **Payment**: Fapshi (Cameroon MTN/Orange Money) + international options; deposit history in wallet
- **Logo**: GitHub-hosted image `https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/logos/Logo%20social%20Boost%20horizon.jpg`
- **Navigation**: 5 tabs (Accueil, Commander, Commandes, Dépôt, Profil) + Auth stack + Parrainage screen
- **Shared Components**:
  - `components/StarBackground.tsx` — animated star twinkle (30 stars, pure RN Animated)
- **Screens** (all redesigned to match HTML reference files in `attached_assets/`):
  - `app/auth/login.tsx` — star bg, glass form card, gradient logo, brand tagline
  - `app/auth/register.tsx` — phone prefix selector, referral code field, glass card
  - `app/(tabs)/index.tsx` — balance card (gold shimmer), 4 quick action cards, stats row, recent orders
  - `app/(tabs)/orders.tsx` — gradient header, filter bar (5 statuses), order cards with progress bars
  - `app/(tabs)/new-order.tsx` — 4 order type tabs (Standard/Revendeur/Automatique/Avancée), provider API service list
  - `app/(tabs)/wallet.tsx` — balance display, Fapshi Cameroon + international deposit methods, history
  - `app/(tabs)/profile.tsx` — 3 tabs (Profil/Sécurité/Paramètres), stats, referral code, logout
  - `app/parrainage.tsx` — gold styling, referral code copy/share, how-it-works steps, reward tiers
- **Context**:
  - `context/AuthContext.tsx` — Firebase Auth + REST API profile via `apiClient.me.get()`; register via `POST /api/auth/register`
  - `context/OrdersContext.tsx` — REST only: `apiClient.orders.list()` on mount + 30s poll; mutations refresh state
  - `context/WalletContext.tsx` — REST only: `apiClient.wallet.get()` on mount + 30s poll; mutations refresh state
- **Services**:
  - `services/api.ts` — REST API client with auto-bearer token via `getFreshToken()`
  - `services/tokenStore.ts` — Firebase ID token persistence via `expo-secure-store`
- **Types**: `types/icons.ts` — `FeatherName` type from `@expo/vector-icons`
- **Firebase config**: `lib/firebase.ts` — apiKey, projectId `social-boost-horizon`
- **OrderStatus types** (French): `"En attente" | "en cours" | "succès" | "annulée" | "remboursé" | "partiel"`
- **Progress bars**: computed from order status (2% pending → 10-70% processing → 100% success)
- **Referral**: Auto-generated code `SBH-XXXYYY`, copy/share, 5% commission on recharges
- **Data**: `data/services.ts` — 12 services across 8 platforms (Instagram, TikTok, YouTube, Facebook, Twitter, Telegram, WhatsApp, Spotify)
- `pnpm --filter @workspace/mobile run dev` — run Expo dev server

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Primary backend for the Social Boost Horizon mobile app.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- **Auth middleware**: `src/middleware/auth.ts` — verifies Firebase ID tokens via `firebase-admin`
- **Firebase Admin**: `src/lib/firebase-admin.ts` — token verification (no credentials needed, uses Google public keys) + Firestore REST API client
- **Routes**:
  - `GET /api/healthz` — health check
  - `GET /api/me` — get user profile (requires Bearer token)
  - `PATCH /api/me` — update profile (name, phone, photoURL)
  - `GET /api/orders` — list user orders
  - `POST /api/orders` — create order
  - `POST /api/orders/:id/cancel` — cancel order
  - `GET /api/wallet` — get balance + recharge history
  - `POST /api/wallet/recharge` — submit AccountPe recharge
- Depends on: `firebase-admin`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)

#### Support WhatsApp (Twilio)

All support routes send WhatsApp messages to the admin via Twilio. Four secrets must be set:

| Secret | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Sender WhatsApp number (e.g. `+14155238886` for sandbox) |
| `MY_PHONE_NUMBER` | Admin WhatsApp recipient number (e.g. `+237699853665`) |

**Twilio Sandbox limitations** (if using the sandbox instead of a production number):
- The sandbox number is `+1 415 523 8886` — messages are sent `From: whatsapp:+14155238886`
- Only **opted-in numbers** can receive messages: the admin must text `join <sandbox-keyword>` to that number first
- Sandbox messages may carry a sandbox header notice
- Production Twilio accounts (approved WhatsApp Business sender) have no opt-in requirement

**Support routes** (all in `src/routes/support.ts`):
- `POST /support/login-help` — **public**, fire-and-forget (returns 200 immediately, sends Twilio async)
- `POST /support/contact` — authenticated (Bearer token), for profile support
- `POST /support/site-request` — authenticated, for SMM site requests
- `POST /support/service-request` — authenticated, for generic service requests

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
