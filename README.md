# SQL Query Optimizer

SQL Query Optimizer is a web app that takes TPC-H-style SQL, converts it to a MongoDB aggregation pipeline, and compares PostgreSQL execution plans. The frontend lets you paste a query, inspect the generated MongoDB translation, and review query-plan explanations and graphs from the optimizer backend.

## Quick Start

1. Install dependencies with `npm install`.
2. Create `server/.env` for your PostgreSQL setup.
3. Verify the database connection with `psql`.
4. Start everything with `npm run dev`.

When the app is up, open the UI at http://localhost:3000 and the API at http://localhost:5000. For the full setup flow, use the detailed steps below.

This repository is structured as an npm workspaces monorepo:

- `frontend` - React UI for query input, plan comparison, and SQL-to-Mongo output
- `server` - Express + TypeScript API that runs SQL parsing, translation, and PostgreSQL EXPLAIN analysis
- `db` - PostgreSQL schema and loader scripts for the TPC-H dataset
- `docs` - setup notes, query samples, and conversion smoke results

## What the project does

- Converts supported SQL into MongoDB pipeline JSON
- Runs PostgreSQL EXPLAIN on the query and compares plan cost/per-row estimates
- Visualizes execution plans and plan explanations in the browser
- Uses the TPC-H benchmark schema and data as the project input set

## Current conversion scope

The SQL-to-Mongo converter currently supports:

- `SELECT ... FROM ...` queries
- Simple projections and `SELECT *`
- Comparison predicates such as `=`, `!=`, `<`, `<=`, `>`, `>=`
- `BETWEEN`
- `IN` and `NOT IN`
- `IS NULL` and `IS NOT NULL`
- `NOT (...)`
- Join chains across the TPC-H tables
- `GROUP BY` with aggregates such as `SUM`, `AVG`, `COUNT(*)`, `MIN`, and `MAX`
- Simple single-CTE queries where the outer query directly selects from one CTE
- Basic `UNION` queries

The following are still out of scope or only partially supported:

- General nested queries
- Multi-CTE chains
- `UNION ALL`, `INTERSECT`, and `EXCEPT`
- Window functions
- Broad schema-independent translation

See [docs/sql-to-mongo-support.md](docs/sql-to-mongo-support.md) for the detailed support matrix.

## Requirements

- Node.js 20+
- npm
- PostgreSQL 14+
- TPC-H schema and data loaded into PostgreSQL

The project has been validated on Linux with a local PostgreSQL server reachable over the Unix socket.

## Docker Setup

You can run the entire stack with Docker as well. This brings up:

- PostgreSQL with the TPC-H schema and data loaded automatically
- The backend API on port 5000
- The frontend UI on port 3000

Start it from the repository root:

```bash
docker-compose up --build
```

After the containers are healthy, open:

- UI: http://localhost:3001
- API: http://localhost:5001
- PostgreSQL: localhost:55432

The Docker setup uses the generated CSV files in `db/data/` and a PostgreSQL init script under `docker/postgres/init/`.

## Quick Start

1. Install dependencies from the repository root.

```bash
npm install
```

2. Create `server/.env`.

Use one of the following styles.

Password-auth example:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=TPC-H
DB_USER=postgres
DB_PASSWORD=postgres
PORT=5000
```

Linux local-socket example:

```bash
DB_HOST=/var/run/postgresql
DB_PORT=5432
DB_NAME=TPC-H
DB_USER=sarthak
DB_PASSWORD=
PORT=5000
```

3. Verify the PostgreSQL connection.

```bash
psql "host=localhost port=5432 dbname=TPC-H user=postgres password=postgres" -c "SELECT current_user, current_database();"
```

If your setup uses local peer authentication, replace the connection string with the role and host settings that match your machine.

4. Load the TPC-H schema and data.

This repository already includes the generated CSV data in `db/data/`. If you only need to bootstrap the database, run:

```bash
psql -d "TPC-H" -f db/dss.ddl
psql -d "TPC-H" -f db/load_tpch.sql
psql -d "TPC-H" -f db/dss.ri
psql -d "TPC-H" -c "ANALYZE;"
```

5. Start the app.

```bash
npm run dev
```

6. Open the UI.

- Frontend: http://localhost:3000
- API: http://localhost:5000

## Running individual parts

Start only the API server:

```bash
npm run dev:server
```

Start only the frontend:

```bash
npm run start:frontend
```

## Regenerating TPC-H data

If you want to rebuild the dataset from scratch, use the TPC-H `dbgen` bundle in the sibling `pg-tpch-dbgen` repository that was added for this workspace.

Typical flow:

1. Build `dbgen` inside that repo.
2. Run `./dbgen -s 1` to generate the SF1 `.tbl` files.
3. Convert the `.tbl` files to `.csv` by removing the trailing `|`.
4. Place the CSV files in `db/data/`.
5. Run the load commands from the quick start section.

## Example queries

Use the browser UI with the queries in [docs/query-samples.md](docs/query-samples.md). A few good starting points:

```sql
SELECT * FROM lineitem LIMIT 1;
```

```sql
SELECT * FROM lineitem WHERE l_extendedprice < 33000;
```

```sql
SELECT * FROM lineitem WHERE l_shipmode IN ('AIR', 'RAIL');
```

```sql
WITH t AS (
  SELECT *
  FROM lineitem
)
SELECT *
FROM t;
```

## Verification

You can confirm the app is running end to end with:

```bash
ss -ltn | grep ':3000\|:5000'
```

And by sending a smoke test request to the API:

```bash
node <<'NODE'
(async () => {
  const response = await fetch('http://localhost:5000/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'SELECT * FROM lineitem LIMIT 1', predicates: [] }),
  });
  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));
})();
NODE
```

## Troubleshooting

- If `psql` tries to connect to a database named after your OS user, pass an explicit `-d` or a full connection string.
- If `/generate` reports `28P01`, the PostgreSQL username/password or auth method is wrong.
- If the optimizer works but plans look incomplete, make sure `ANALYZE` has been run after loading the data.
- If the frontend fails to start, make sure you are using the current workspace dependencies and Node 20.

## Documentation

- [docs/setup-runbook.md](docs/setup-runbook.md)
- [docs/sql-to-mongo-support.md](docs/sql-to-mongo-support.md)
- [docs/testing-matrix.md](docs/testing-matrix.md)
- [docs/conversion-smoke-results.md](docs/conversion-smoke-results.md)
