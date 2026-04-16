# Setup Runbook

## Prerequisites

- Node.js and npm.
- PostgreSQL.
- A C compiler and `make` for the bundled TPC-H generator.
- A TPC-H database loaded with data and analyzed statistics.

## Install

From the repository root:

```bash
npm install
```

## Configuration

Create `server/.env` with PostgreSQL connection settings:

```bash
DB_HOST=localhost
DB_NAME=TPC-H
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
PORT=5000
```

## PostgreSQL Connection Checklist

- Confirm PostgreSQL is running locally and accepting TCP connections on `DB_PORT`.
- Verify `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_PORT` match the actual database instance.
- Make sure the `DB_USER` account exists and has access to the `DB_NAME` database.
- If you are using a password-authenticated role like `postgres`, confirm the password is correct and the `pg_hba.conf` rule allows the connection method.
- Load `server/.env` before starting the server so the pool picks up the credentials.
- Re-run a simple query against `/generate` after changing credentials to confirm the optimizer path can connect.

## Run

- Start both packages: `npm run dev`
- Start only the server: `npm run dev:server`
- Start only the frontend: `npm run start:frontend`

## Database Bootstrap

1. Create the `TPC-H` database.
2. Load `db/dss.ddl`.
3. Run `npm run generate:tpch-data` to populate `db/data/`.
4. Load the data with `db/load_tpch.sql`.
5. Apply constraints with `db/dss.ri`.
6. Run `ANALYZE` so `pg_stats` is populated.

## Common Failure Modes

- Missing or incorrect PostgreSQL environment variables.
- Postgres not running.
- TPC-H tables not loaded.
- `ANALYZE` not run, which breaks histogram and selectivity logic.
- Password authentication failures such as `28P01`, which usually mean the user/password pair or `pg_hba.conf` rule is wrong.
