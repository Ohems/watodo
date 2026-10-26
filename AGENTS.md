# Watodo Agent Instructions

Instructions for AI agents working in this repository. Follow them unless the
user explicitly overrides them.

## Project Overview

Watodo is a community event and responsibility management tool. It is a
monorepo with two npm workspaces:

- `backend/` - Fastify v5 REST API server (TypeScript, Node.js)
- `frontend/` - React 19 single-page application (Vite, TypeScript, Mantine)

## Tech Stack

- **Backend**: Fastify v5, TypeScript, Kysely + node-pg-migrate, PostgreSQL 17, Redis, pino, Zod v4
- **Frontend**: React 19, Vite 7, TypeScript, Mantine v9, React Router v7, Redux Toolkit
- **Tooling**: Biome (lint + format), Vitest (unit/component tests), Playwright (E2E tests)
- **Runtime**: Node.js >= 24.21.0 (see `.nvmrc`)

## Getting Started

```sh
docker compose up -d       # start PostgreSQL, Redis and the test PostgreSQL (port 6432)
npm install                # install all workspace dependencies
cp .env.sample .env       # configure environment
cp .env.sample backend/.env # backend commands run with cwd=backend/ and load .env from there
npm run migrate -w backend # apply database migrations
npm run dev                # start both dev servers
```

The backend test suite runs against the dedicated test database (`watodo-postgres-test`,
host port 6432) configured by `backend/.env.test` (committed to Git, placeholder values
only). It needs no setup beyond `docker compose up -d`: `backend/tests/global-setup.ts`
applies migrations and seeds the permissions table before the test files run.
```

The backend runs on port 3000, the frontend on port 5173 (with API proxy to :3000).
API docs (Swagger) are available at `http://localhost:3000/docs`.

## Commands

Run from the repository root:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend and frontend dev servers |
| `npm run dev:backend` | Start only the backend |
| `npm run dev:frontend` | Start only the frontend |
| `npm run build` | Build both workspaces |
| `npm run build:dev` | Type-check everything (source, tests, tool configs) without emitting |
| `npm run test` | Run all unit tests (backend + frontend) |
| `npm run test:backend` | Run backend tests only |
| `npm run test:frontend` | Run frontend unit tests only |
| `npm run lint` | Lint all code with Biome |
| `npm run lint:fix` | Lint with auto-fix |
| `npm run check` | Biome check (lint + format) |
| `npm run check:fix` | Biome check with auto-fix |
| `npm run format:write` | Format all code |

Run from `backend/`:

| Command | Description |
|---------|-------------|
| `npm run migrate` | Apply pending migrations (node-pg-migrate up) |
| `npm run migrate:down` | Revert the latest migration |
| `npm run migrate:create -- <name>` | Create a new migration file |
| `npm run migrate:status` | Show migration status |
| `npm run migrate:redo` | Revert and re-apply the latest migration |
| `npm run seed:permissions` | Seed the permissions table from the registry (idempotent) |
| `npm run seed:data` | Generate semi-realistic test data (only on a fresh database: exactly one user and one organization) |

Run from `frontend/`:

| Command | Description |
|---------|-------------|
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:headed` | Run E2E tests in headed mode |
| `npm run test:e2e:ui` | Run E2E tests with Playwright UI |
| `npm run test:all` | Run unit tests + E2E tests |
| `npm run playwright:install` | Install Playwright browsers |

## Code Conventions

### TypeScript

- **Backend**: `module: NodeNext`, `moduleResolution: NodeNext`, target `ES2023`, strict mode.
  All imports use the `.js` extension (e.g. `import { db } from '../database.js'`).
- **Frontend**: `module: ESNext`, `moduleResolution: bundler`, target `ES2022`, strict mode.
  Imports also use the `.js` extension for consistency.
- Both workspaces have `noUnusedLocals` and `noUnusedParameters` enabled.
- Use `import type` for type-only imports.
- Each workspace has two TypeScript configs:
  - `tsconfig.json` - production build (`npm run build`). Covers only the deployable
    source and emits build files (backend: `src/` to `dist/`; frontend: `src/` to
    `build/`, then Vite bundles to `dist/`). Test files are excluded.
  - `tsconfig.dev.json` - development build (`npm run build:dev`). Covers everything
    (source, tests, migrations, tool configs such as `vitest.config.ts`) with
    `noEmit`, so it never produces build files. `npm test` runs this first in each
    workspace.

### Biome (Formatting & Linting)

- Single quotes, semicolons always, 2-space indentation, trailing commas, 100 character line width.
- `useConst` and `useTemplate` are errors. `noExplicitAny` is a warning.
- `noUnusedVariables` and `noUnusedImports` are errors.
- The root `biome.json` is the base config. Each workspace's `biome.json` extends it via `"extends": "//"`.
- Always run `npm run check:fix` before finishing work.

### General

- Do not use the em dash character in code comments or markdown files. Use the basic hyphen (`-`) instead.
- Prefer `const` over `let`. Use template literals over string concatenation.
- Handle errors explicitly. Do not silently swallow exceptions.
- When a comment describes the following variable or function, use a JSDoc comment
  (`/** ... */`) instead of a standard `//` comment. Only add tags like `@param` or
  `@returns` when the function is not trivial.

## Backend Architecture

The backend follows a layered architecture: routes, controllers, services, database.

```
backend/src/
├── index.ts              # Entry point: connects DB/Redis, starts server
├── app.ts                # Fastify app builder (plugins, error handlers, routes)
├── config.ts             # Environment configuration (dotenv)
├── logger.ts             # pino logger with pino-pretty in dev
├── database.ts           # Kysely instance (PostgresDialect + pg.Pool)
├── redis.ts              # ioredis client (lazy connect)
├── permissions.ts        # Registry of system-defined permissions (codes like 'admin')
├── db/
│   └── types.ts          # Kysely Database interface (all tables, snake_case)
├── schemas/
│   └── index.ts          # Zod v4 validation schemas + inferred types
├── middleware/
│   └── auth.ts           # authenticate, requirePermissions (x-token header or cookie)
├── routes/
│   ├── index.ts          # Route registration + health check
│   ├── auth.ts           # OAuth login/callback routes per provider + logout
│   ├── users.ts          # User CRUD routes
│   ├── operations.ts     # Operations + assignments routes
│   └── roles.ts          # Role + role assignment routes (organization scoped)
├── controllers/          # Request handlers (parse input, call services, send response)
└── services/             # Business logic (database queries via Kysely)
    └── auth-providers/   # OAuth provider logic, one file per provider
        ├── index.ts      # Provider registry + lookup (SUPPORTED_PROVIDERS, getProvider)
        ├── types.ts      # AuthProviderDefinition interface
        ├── shared.ts     # Shared OAuth HTTP helpers (token exchange, profile fetch)
        ├── discord.ts    # Discord OAuth provider
        ├── google.ts     # Google OAuth provider
        └── microsoft.ts  # Microsoft OAuth provider
```

`backend/scripts/` holds one-off CLI scripts run with tsx (e.g. `seed-permissions.ts`,
run via `npm run seed:permissions`, and `seed-data.ts`, run via `npm run seed:data`).

### Key patterns

- **Database queries**: All queries go through the Kysely `db` instance from `database.ts`.
  Table types are in `db/types.ts` using snake_case column names. Use `db.selectFrom()`,
  `db.insertInto()`, `db.updateTable()`, `db.deleteFrom()` with `.returningAll()` where needed.
- **Transactions**: Use `db.transaction().execute(async tx => { ... })` for multi-step operations.
- **Validation**: Controllers parse request bodies/queries with Zod schemas from `schemas/index.ts`.
  Zod errors are caught by the global error handler and return 400.
- **Auth**: Routes use `requirePermissions(...)` as a `preHandler`. The middleware reads the
  `x-token` header (or the `token` cookie), resolves the user and their effective permissions,
  and attaches them to the request as `request.auth` (`{ token, user, permissions }`).
  Permissions are defined by the system (see `permissions.ts`; the initial migration
  and `npm run seed:permissions` seed the `permissions` table from it), granted to organization-specific roles (`roles` + `role_permissions`), and
  assigned to users (`user_roles`, optionally scoped to a team and/or an event type). A user's
  effective permissions are the union of the permissions of all roles they hold in organizations
  they belong to. The `admin` permission bypasses all checks. Users can have multiple linked
  authentication accounts (`auth_accounts`) from Discord, Google or Microsoft; the OAuth logic
  for each provider lives in its own file under `services/auth-providers/` and is wired together
  by the registry in `services/auth-providers/index.ts`. When the first user ever logs in (the
  `users` table was empty), `handleNewLogin` creates a default organization and makes that user
  an admin of it (an `Admin` role with the `admin` permission, assigned in the same transaction).
- **Logging**: Use `createLogger('name')` from `logger.ts` to get a child logger.
  Available levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace` (NOT `silly`; pino uses `trace`).

### API Endpoints

- `GET /api/health` - Health check (no auth)
- `GET /api/v1/auth/providers` - List supported auth providers (no auth)
- `GET /api/v1/auth/:provider/login` - Start OAuth flow (discord, google, microsoft)
- `GET /api/v1/auth/:provider/callback` - OAuth callback
- `POST /api/v1/auth/:provider/link` - Start an OAuth flow that connects another login method to the current account (auth required)
- `GET /api/v1/auth/logout` - Logout
- `GET /api/v1/users` - List users with permissions (paginated, `user-management:read`)
- `GET /api/v1/users/list` - Simple user list (id + name, no auth)
- `GET /api/v1/users/@me` - Current user with permissions (auth required)
- `PATCH /api/v1/users/@me` - Update own personal information (auth required)
- `DELETE /api/v1/users/@me` - Delete own account (auth required)
- `GET /api/v1/users/@me/auth-accounts` - List connected login methods (auth required)
- `DELETE /api/v1/users/@me/auth-accounts/:provider` - Disconnect a login method (auth required)
- `GET /api/v1/users/:userId` - Get user with permissions (`user-management:read`)
- `PATCH /api/v1/users/:userId` - Update user (`user-management:write`)
- `DELETE /api/v1/users/:userId` - Delete user (`user-management:write`)
- `GET /api/v1/organizations` - List the current user's organizations (auth required)
- `GET /api/v1/organizations/:organizationId` - Get organization details (members only)
- `PATCH /api/v1/organizations/:organizationId` - Update organization details (`organization:write`)
- `GET /api/v1/operations` - List operations with assignments (`operations:read`)
- `GET /api/v1/operations/:id` - Get operation (`operations:read`)
- `POST /api/v1/operations` - Create/update operation (`operations:write`)
- `DELETE /api/v1/operations/:id` - Delete operation (`operations:write`)
- `POST /api/v1/operations/:id/assignments` - Add assignment (`operations:write`)
- `PATCH /api/v1/operations/:id/assignments/:aid` - Update assignment (`operations:write`)
- `DELETE /api/v1/operations/:id/assignments/:aid` - Delete assignment (`operations:write`)
- `GET /api/v1/organizations/:organizationId/roles` - List roles with permissions (`role-management:read`)
- `POST /api/v1/organizations/:organizationId/roles` - Create role (`role-management:write`)
- `PATCH /api/v1/organizations/:organizationId/roles/:roleId` - Update role (`role-management:write`)
- `DELETE /api/v1/organizations/:organizationId/roles/:roleId` - Delete role (`role-management:write`)
- `GET /api/v1/organizations/:organizationId/roles/:roleId/assignments` - List role assignments (`role-management:read`)
- `POST /api/v1/organizations/:organizationId/roles/:roleId/assignments` - Assign role to user, optionally scoped to a team/event type (`role-management:write`)
- `DELETE /api/v1/organizations/:organizationId/roles/:roleId/assignments/:assignmentId` - Remove role assignment (`role-management:write`)
- `GET /api/v1/organizations/:organizationId/sites` - List sites (paginated, `site-management:read`)
- `GET /api/v1/organizations/:organizationId/sites/all` - List all sites (no pagination, `site-management:read`)
- `POST /api/v1/organizations/:organizationId/sites` - Create site (`site-management:write`)
- `GET /api/v1/organizations/:organizationId/sites/:siteId` - Get site (`site-management:read`)
- `PATCH /api/v1/organizations/:organizationId/sites/:siteId` - Update site (`site-management:write`)
- `DELETE /api/v1/organizations/:organizationId/sites/:siteId` - Delete site and its rooms (`site-management:write`)
- `GET /api/v1/organizations/:organizationId/sites/:siteId/rooms` - List rooms in a site (paginated, `room-management:read`)
- `GET /api/v1/organizations/:organizationId/sites/:siteId/rooms/all` - List all rooms in a site (`room-management:read`)
- `POST /api/v1/organizations/:organizationId/sites/:siteId/rooms` - Create room (`room-management:write`)
- `GET /api/v1/organizations/:organizationId/sites/:siteId/rooms/:roomId` - Get room (`room-management:read`)
- `PATCH /api/v1/organizations/:organizationId/sites/:siteId/rooms/:roomId` - Update room (`room-management:write`)
- `DELETE /api/v1/organizations/:organizationId/sites/:siteId/rooms/:roomId` - Delete room (`room-management:write`)
- `GET /api/v1/organizations/:organizationId/rooms` - List all rooms in an organization, optionally filtered by `siteId` (`room-management:read`)
- `GET /api/v1/organizations/:organizationId/rooms/all` - List all rooms in an organization, optionally filtered by `siteId` (`room-management:read`)

## Frontend Architecture

```
frontend/src/
├── main.tsx              # Entry point (Redux Provider + Router)
├── App.tsx               # Route definitions
├── api/
│   └── index.ts          # RTK Query api (createApi): queries, mutations, cache tags
├── types/
│   └── index.ts          # TypeScript types (User, Operation, etc.)
├── store/
│   ├── index.ts          # Redux store configuration (api reducer + middleware)
│   ├── organization-slice.ts # Active organization selection (persisted to localStorage)
│   └── session.ts        # logout / deleteCurrentUser thunks (clear token + api state)
├── hooks/
│   └── redux.ts          # Typed useAppDispatch / useAppSelector
├── components/
│   ├── NavBar/           # Top navigation bar
│   ├── Calendar/         # react-big-calendar wrapper
│   ├── EditField/        # Inline edit field
│   ├── UserCard/         # User card component
│   ├── ToolbarButton/    # Toolbar button
│   └── NavigationButton/ # Navigation button
└── pages/
    ├── Home/             # Calendar view (default route)
    ├── UserList/         # User list (Contacts)
    ├── UserProfile/      # User profile detail
    ├── Account/          # Account page: personal info, login methods, account deletion
    ├── ErrorPage/        # Error page (uses useRouteError)
    ├── Login/            # Login screen (shown when unauthenticated)
    └── NoOrganizationPage/ # Shown when user has no organization
```

### Key patterns

- **State management**: Redux Toolkit. The store holds the RTK Query api reducer
  (with `api.middleware`) and the organization slice. Use `useAppDispatch` and
  `useAppSelector` from `hooks/redux.ts` (typed wrappers).
- **API calls**: All API calls go through the RTK Query api defined with
  `createApi` in `api/index.ts`. Components use the generated hooks
  (`useGetCurrentUserQuery`, `useUpdateTeamMutation`, ...); RTK Query deduplicates
  concurrent requests for the same cache key and caches results, so `React.StrictMode`
  double effects do not cause duplicate requests. Queries declare `providesTags`
  and mutations `invalidatesTags` for automatic refetching. The base query reads
  the auth token from localStorage and sends it as the `x-token` header. Use
  `skipToken` as the hook argument to skip a query conditionally, and
  `getApiErrorMessage(error)` to display a mutation/query error.
- **Authentication gate**: `App.tsx` fetches the current user via
  `useGetCurrentUserQuery`. While the check is pending a spinner is shown;
  unauthenticated users are greeted with the `Login` page (provider buttons
  linking to `/api/v1/auth/:provider/login`) instead of the app. Logging out
  (`logout` thunk in `store/session.ts`) clears the token and resets the api
  state, which makes the current-user query fail and shows the login page.
- **Routing**: React Router v7 with `createBrowserRouter`. Routes are defined in `App.tsx`.
- **UI**: Mantine v9 components. Use the `style` prop or Mantine style props for styling.
- **Components**: Each component lives in its own folder with an `index.ts` barrel export.

## Database

- **ORM**: Kysely (type-safe SQL query builder). No Prisma.
- **Migrations**: node-pg-migrate. Migration files live in `backend/migrations/`.
- **Schema**: tables covering users, authentication accounts (multi-provider),
  access tokens, records, permissions, roles, role permissions, user roles,
  organizations, teams, sites (physical locations), rooms (within sites),
  calendars, event types, jobs, events, responsibilities, assignments,
  operations, and operation assignments. Events can be assigned to a site
  (optionally reserving the whole site) and/or a specific room within a site.
- **Auth tables**: `permissions` holds the system-defined permission codes;
  `auth_accounts` links users to provider accounts (discord, google, microsoft);
  `roles` belong to an organization and are granted permissions via
  `role_permissions`; `user_roles` assigns roles to users and can be scoped to
  a team and/or an event type.
- **Table types**: Defined in `backend/src/db/types.ts` using snake_case column names
  (e.g. `provider_account_id`, `created_at`). Use `Generated<T>` for auto-generated columns.

### Migration workflow

1. Create a migration: `npm run migrate:create -w backend -- <name>`
2. Edit the migration file in `backend/migrations/`
3. Apply it: `npm run migrate -w backend`
4. Never edit or delete existing migration files.

## Testing

Group backend tests by the endpoint or entity type they test: a top-level `describe`
block per entity (for example `Events API` or `Calendars API`) containing one
nested `describe` block per endpoint, named with the exact endpoint path (for
example `describe('GET /api/v1/event-series/occurrences')`). Do not invent
plain-text descriptions for endpoint groups, and do not group tests by a
cross-cutting concern: a test that spans several endpoints (like organization
scoping across the occurrences, event series, calendar and management
endpoints) must be split so that each test lives in the describe of the
endpoint it tests.

Group frontend tests by the page or component being tested, for example `AccountPage`.

### Backend (Vitest)

- Tests live in `backend/tests/`.
- API tests use Fastify's `app.inject()` for HTTP testing without a running server.
- Run: `npm run test -w backend`
- Integration tests run against the dedicated test database (`watodo-postgres-test`,
  host port 6432). `backend/.env.test` (committed, placeholder values only) configures
  the connection: `tests/setup.ts` loads it in every test worker and
  `tests/global-setup.ts` applies migrations and seeds the permissions table once
  before the test files run (via the node-pg-migrate programmatic API).
- Tests that need Redis or a database skip themselves when the test database is not
  reachable (e.g. 302 or 500 for login without Redis).

### Frontend Unit/Component (Vitest)

- Tests live next to sources as `*.test.ts` or `*.test.tsx`.
- Uses jsdom environment with `@testing-library/react`.
- Run: `npm run test -w frontend` (or `npm run test:unit -w frontend`)
- Setup file: `frontend/src/test/setup.ts` (imports `@testing-library/jest-dom`)
- Test helpers in `frontend/src/test/`: `api-mock.ts` stubs global fetch with
  route-based JSON responses (`mockApi().on(method, path, response, status)`,
  `callCount`, `lastBody`) and `test-utils.tsx` provides `createTestStore()` and
  `renderWithProviders(ui, { store, route, strict })` (Provider + MantineProvider +
  BrowserRouter, optionally wrapped in `React.StrictMode`).

### Frontend E2E (Playwright)

- Tests live in `frontend/e2e/`.
- Config: `frontend/playwright.config.ts` (3 browsers: chromium, firefox, webkit).
- The dev server starts automatically before tests (port 5173).
- Run: `npm run test:e2e -w frontend`
- Install browsers first: `npm run playwright:install -w frontend`

## Environment Variables

See `.env.sample` for all variables. Key ones:

- `DATABASE_URL` - PostgreSQL connection string (`backend/.env.test` points it at the
  test database on port 6432 for the backend test suite)
- `REDIS_URL` - Redis connection string
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` - Discord OAuth credentials
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` - Microsoft OAuth credentials
- `BASE_URL` - Public URL of the backend (used for OAuth redirect)
- `PORT` / `HOST` - Server bind address (default: 3000 / 0.0.0.0)
- `NODE_ENV` - Environment (development / production / test)

## Rules and Constraints

- Always run `npm run check:fix` and `npm run test` before finishing work.
- When you add a feature that persists data, update `backend/scripts/seed-data.ts` (run with
  `npm run seed:data -w backend`) so the generated test data covers the new feature. The script
  generates semi-realistic test data for both organizations, mock users, roles, teams, calendars,
  event types, event series (previous/current/next month), exceptions, job slots, comments and
  operations. It must keep refusing to run unless the database has exactly one user and one
  organization (the state after the first login).
- Never change the database schema directly. Always create a migration.
- Never rename or renumber existing migration files.
- Do not introduce new dependencies without good reason. The project uses specific
  modern versions of all libraries. Mantine extensions (official `@mantine/*`
  packages) and community extensions are acceptable when they provide clear value.
- When adding a new dependency, check that the version used is the latest one with
  `npm view <package-name> version`.
- Do not use `any` types. If a type is truly unknown, use `unknown` and narrow it.
- Backend imports must use `.js` extensions (NodeNext module resolution).
- The frontend uses `.js` extensions in imports too (for consistency with the backend).
- Do not use `logger.silly()`; pino uses `logger.trace()` for the most verbose level.
- Most endpoints must require filtering by organization ID (a required `organizationId` query
  parameter or path segment, validated by the Zod schema so a missing value returns 400). Only
  leave the organization filter out when the endpoint is used on the Home page or another page
  that displays cross-organization data (for example the occurrence and notification lists shown
  on the Home page). The frontend must pass the active organization's ID from every other view.
