# Conversion Smoke Results

This file records 10 representative SQL queries that were sent to `POST /generate` to verify the SQL-to-Mongo conversion path.

The optimizer/database path is still failing in this environment with PostgreSQL authentication error `28P01`, but the endpoint still returns `sql_to_mongo` in the response. These results are therefore useful for conversion-only validation.

## What the converter handles now

- Simple selects with `LIMIT`
- Comparison filters such as `<`, `>`, `<=`, `>=`, `=`, and `!=`
- `BETWEEN`
- `IN` and `NOT IN`
- `IS NULL` and `IS NOT NULL`
- `NOT (...)`
- Join chains over the TPC-H schema
- Grouping and aggregate projections
- A simple single-CTE shape where the outer query directly selects from one CTE
- Basic `UNION` queries

Window functions are explicitly rejected for conversion.

## Smoke Set

### 1. Simple limit

Query:

```sql
SELECT * FROM lineitem LIMIT 1
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: `[{ "$limit": 1 }]`

### 2. Comparison filter

Query:

```sql
SELECT * FROM lineitem WHERE l_extendedprice < 33000
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: one `$match` stage with `$lt`

### 3. BETWEEN filter

Query:

```sql
SELECT * FROM lineitem WHERE l_shipdate BETWEEN DATE '1995-01-01' AND DATE '1995-02-01'
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: one `$match` stage with `$and` containing `$gte` and `$lte`

### 4. IN filter

Query:

```sql
SELECT * FROM lineitem WHERE l_shipmode IN ('AIR', 'RAIL')
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: one `$match` stage with `$in`

### 5. NOT IN filter

Query:

```sql
SELECT * FROM lineitem WHERE l_shipmode NOT IN ('AIR', 'RAIL')
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: one `$match` stage with `$not` wrapping `$in`

### 6. IS NULL filter

Query:

```sql
SELECT * FROM lineitem WHERE l_comment IS NULL
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: one `$match` stage with `$eq: null`

### 7. NOT predicate

Query:

```sql
SELECT * FROM lineitem WHERE NOT (l_quantity > 10)
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: one `$match` stage with `$not` wrapping `$gt`

### 8. Join, group, and aggregate

Query:

```sql
select
  l_orderkey,
  sum(l_extendedprice * (1 - l_discount)) as revenue,
  o_orderdate,
  o_shippriority
from
  customer,
  orders,
  lineitem
where
  c_mktsegment = 'BUILDING'
  and c_custkey = o_custkey
  and l_orderkey = o_orderkey
  and o_totalprice < 50000
  and l_extendedprice > 1200
group by
  l_orderkey,
  o_orderdate,
  o_shippriority
order by
  revenue desc,
  o_orderdate
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `customer`
- `sql_to_mongo.pipeline`: join stages, filter stage, group stage, project stage, sort stage

### 9. Simple CTE

Query:

```sql
WITH t AS (SELECT * FROM lineitem) SELECT * FROM t
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: empty pipeline

### 10. UNION query

Query:

```sql
SELECT * FROM lineitem UNION SELECT * FROM lineitem
```

Result summary:

- Endpoint status: `Error in /generate - password authentication failed for user "postgres" (code 28P01)`
- `sql_to_mongo.collection`: `lineitem`
- `sql_to_mongo.pipeline`: `$unionWith` followed by deduplication stages

## Notes

- All 10 requests reached the endpoint successfully.
- All 10 responses contained `sql_to_mongo` even though the optimizer/database path returned PostgreSQL auth error `28P01`.
- These are conversion smoke results, not optimizer validation results.
