# Architecture

## Overview

This repository is a two-package npm workspace:

- `frontend` is a React client that collects a SQL query and predicate choices, then renders the optimizer output.
- `server` is an Express + TypeScript API that parses SQL, translates it to Mongo pipeline JSON, explains the query plan, estimates cost, and generates alternate plans for comparison.

The app is centered on the `POST /generate` endpoint in the server. The frontend sends the SQL query and selected predicates to that endpoint, then displays the returned plan data and the SQL-to-Mongo conversion result.

## Request Flow

1. The user enters a query in the frontend.
2. The frontend POSTs `{ query, predicates }` to `/generate`.
3. The server normalizes SQL, converts it to Mongo pipeline JSON, and attempts to fetch the PostgreSQL execution plan.
4. If predicate selectivity data is available, the server generates alternate plans and chooses the best one.
5. The frontend renders the returned plan graph, explanation, best plan id, and SQL-to-Mongo output.

## Important Boundaries

- SQL-to-Mongo is export-only. There is no MongoDB execution path in the current code.
- Optimizer behavior depends on live PostgreSQL access and populated statistics.
- The current predicate exploration path is limited to the TPC-H-oriented predicate list in the frontend.

## Main Entry Points

- Root scripts: [package.json](../package.json)
- Frontend bootstrap: [frontend/src/index.js](../frontend/src/index.js)
- Frontend app shell: [frontend/src/components/App/App.js](../frontend/src/components/App/App.js)
- Server bootstrap and API: [server/src/index.ts](../server/src/index.ts)
- SQL-to-Mongo translator: [server/src/sqlToMongo/sqlToMongo.ts](../server/src/sqlToMongo/sqlToMongo.ts)
