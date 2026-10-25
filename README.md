# Watodo

> ⚠️ This project is under development! Not currently usable in any real use case!

Community event and responsibility management tool.

## Tech Stack

- **Backend**: Fastify v5, TypeScript, Kysely + node-pg-migrate, PostgreSQL, Redis
- **Frontend**: React 19, Vite 7, TypeScript, Material-UI v7, React Router v7
- **Tooling**: Biome (lint + format), Vitest (unit tests), Playwright (E2E tests), Node.js 24

## Getting Started

### Prerequisites

- Node.js >= 24.21.0
- Docker (for PostgreSQL and Redis)

### Setup

```bash
# Start databases
npm run docker:up

# Install dependencies
npm install

# Set up environment
cp .env.sample .env

# Run database migrations
npm run migrate -w backend

# Start development servers
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend and frontend dev servers |
| `npm run build` | Build both backend and frontend |
| `npm run test` | Run all tests |
| `npm run lint` | Lint all code with Biome |
| `npm run format:write` | Format all code with Biome |
| `npm run check:fix` | Lint + format fix all code |
| `npm run seed:data -w backend` | Generate semi-realistic test data (fresh database only: exactly one user and one organization) |

## Documentation

- [Events](docs/Events.md) - Recurring event series (rrule), occurrences, exceptions, job slots, and comments

## Project Structure

```
watodo/
├── backend/          # Fastify API server
│   ├── migrations/   # node-pg-migrate database migrations
│   ├── src/
│   │   ├── db/       # Kysely database types
│   │   ├── routes/   # API routes
│   │   ├── services/ # Business logic
│   │   ├── controllers/ # Request handlers
│   │   └── schemas/  # Zod validation schemas
│   └── tests/        # Vitest tests
├── frontend/         # React SPA
│   ├── e2e/          # Playwright E2E tests
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/    # Page components
│   │   ├── store/    # Redux state management
│   │   └── api/      # API client
│   └── public/       # Static assets
├── docs/             # Documentation
└── docker-compose.yml
```
