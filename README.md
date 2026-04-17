# SQL Query Optimizer

SQL Query Optimizer is a web app that takes TPC-H-style SQL, converts it to a MongoDB aggregation pipeline, and compares PostgreSQL execution plans. The frontend lets you paste a query, inspect the generated MongoDB translation, and review query-plan explanations and graphs from the optimizer backend.


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
- GCC or Clang
- `make`
- TPC-H schema and data loaded into PostgreSQL

The project has been validated on Linux with a local PostgreSQL server reachable over the Unix socket.


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

4. Generate the TPC-H CSV files into `db/data/`.

The repository vendors the TPC-H generator source under `db/tpch-dbgen/`

```bash
npm run generate:tpch-data
```

Once `db/data/` contains the required CSV files, bootstrap the database with:

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

The normal setup path is to regenerate the CSVs locally with the vendored TPC-H generator.

Typical flow:

1. Make sure a C compiler and `make` are installed.
2. Run `npm run generate:tpch-data` to generate the SF1 `.tbl` files and convert them to CSVs in `db/data/`.
3. Run the load commands from the quick start section.

## Docker Setup

The repository includes everything needed to regenerate the TPC-H CSVs locally. Use the bundled generator script to populate `db/data/` before starting Docker or running the load scripts. If any required CSV is missing, the database container fails fast during initialization.

You can run the entire stack with Docker as well. This brings up:

- PostgreSQL with the TPC-H schema loaded automatically after you generate the CSV files in `db/data/`
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