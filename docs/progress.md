# Progress Log

## 2026-04-16

- Evaluated the repository structure and confirmed it is an npm workspaces monorepo with `frontend` and `server` packages.
- Confirmed the current frontend test is the default CRA scaffold test and does not match the app.
- Confirmed the backend has no test suite yet.
- Documented the current architecture, SQL-to-Mongo support boundaries, testing priorities, and setup steps in `docs/`.
- Resolved the frontend toolchain mismatch by upgrading `react-scripts` and pinning the hoisted root Babel/AJV versions.
- Verified `npm run build --workspace sql-query-optimizer-server` succeeds.
- Verified `npm test --workspace sql-query-optimizer-frontend -- --watchAll=false` succeeds.
- Verified `npm run build --workspace sql-query-optimizer-frontend` succeeds.
- Added a testable server app factory and backend tests for `/generate`, `sqlToMongo`, and optimizer helpers.
- Expanded SQL-to-Mongo coverage for wildcard projection, `COUNT(*)`, `IN`/`NOT IN`, `IS NULL`/`IS NOT NULL`, `BETWEEN`, and function-form `NOT`.
- Verified `npm test --workspace sql-query-optimizer-server` succeeds.
- Decoupled conversion output from optimizer failures so `sql_to_mongo` is still returned when PostgreSQL auth fails.
- Added support for simple single-CTE queries, basic `UNION`, and explicit rejection of window functions.
- Ran 10 live `/generate` smoke queries and recorded the conversion results in `docs/conversion-smoke-results.md`.
- Current conversion scope is now usable for the project’s TPC-H-style sample queries, but not for broad SQL coverage.
- Remaining conversion work: general nested queries, richer CTE chains, more `UNION` variants, and broader unsupported predicate/expression handling.
- PostgreSQL still needs a valid connection configuration; current manual runs fail with `28P01` password authentication for user `postgres`.
- Next: finish the Postgres connection setup, then expand the remaining query shapes only after the conversion baseline is stable.
- Local PostgreSQL access on this machine works over the Unix socket as the OS user `sarthak`, so the server `.env` was updated to use `/var/run/postgresql` with peer-auth style local access.
- Created the `TPC-H` database locally and loaded the empty TPC-H schema from `db/dss.ddl`.
- Verified `POST /generate` succeeds against the running API with the new PostgreSQL connection and returns both optimizer data and `sql_to_mongo`.
