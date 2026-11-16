# Watodo

[![Sponsored](https://img.shields.io/badge/chilicorn-sponsored-brightgreen.svg?logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAA4AAAAPCAMAAADjyg5GAAABqlBMVEUAAAAzmTM3pEn%2FSTGhVSY4ZD43STdOXk5lSGAyhz41iz8xkz2HUCWFFhTFFRUzZDvbIB00Zzoyfj9zlHY0ZzmMfY0ydT0zjj92l3qjeR3dNSkoZp4ykEAzjT8ylUBlgj0yiT0ymECkwKjWqAyjuqcghpUykD%2BUQCKoQyAHb%2BgylkAyl0EynkEzmkA0mUA3mj86oUg7oUo8n0k%2FS%2Bw%2Fo0xBnE5BpU9Br0ZKo1ZLmFZOjEhesGljuzllqW50tH14aS14qm17mX9%2Bx4GAgUCEx02JySqOvpSXvI%2BYvp2orqmpzeGrQh%2Bsr6yssa2ttK6v0bKxMBy01bm4zLu5yry7yb29x77BzMPCxsLEzMXFxsXGx8fI3PLJ08vKysrKy8rL2s3MzczOH8LR0dHW19bX19fZ2dna2trc3Nzd3d3d3t3f39%2FgtZTg4ODi4uLj4%2BPlGxLl5eXm5ubnRzPn5%2Bfo6Ojp6enqfmzq6urr6%2Bvt7e3t7u3uDwvugwbu7u7v6Obv8fDz8%2FP09PT2igP29vb4%2BPj6y376%2Bu%2F7%2Bfv9%2Ff39%2Fv3%2BkAH%2FAwf%2FtwD%2F9wCyh1KfAAAAKXRSTlMABQ4VGykqLjVCTVNgdXuHj5Kaq62vt77ExNPX2%2Bju8vX6%2Bvr7%2FP7%2B%2FiiUMfUAAADTSURBVAjXBcFRTsIwHAfgX%2FtvOyjdYDUsRkFjTIwkPvjiOTyX9%2FAIJt7BF570BopEdHOOstHS%2BX0s439RGwnfuB5gSFOZAgDqjQOBivtGkCc7j%2B2e8XNzefWSu%2BsZUD1QfoTq0y6mZsUSvIkRoGYnHu6Yc63pDCjiSNE2kYLdCUAWVmK4zsxzO%2BQQFxNs5b479NHXopkbWX9U3PAwWAVSY%2FpZf1udQ7rfUpQ1CzurDPpwo16Ff2cMWjuFHX9qCV0Y0Ok4Jvh63IABUNnktl%2B6sgP%2BARIxSrT%2FMhLlAAAAAElFTkSuQmCC)](http://spiceprogram.org/)

> ⚠️ This project is under development! Not currently usable in any real use case!

Community event and responsibility management tool. Primarily aimed at organizations and communities that employ a large number of volunteers and need to manage volunteer assignments and workload.

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

- [Events](docs/Events.md) - Recurring event series (rrule), occurrences, exceptions, work role slots, and comments

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
