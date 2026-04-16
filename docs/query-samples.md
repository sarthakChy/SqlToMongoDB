# Query Samples

Use these queries in the web UI to test the current SQL-to-Mongo conversion path. They are ordered from simplest to more complex.

## Quick checks

### 1. Simple limit

```sql
SELECT * FROM lineitem LIMIT 1;
```

### 2. Comparison filter

```sql
SELECT * FROM lineitem WHERE l_extendedprice < 33000;
```

### 3. BETWEEN filter

```sql
SELECT * FROM lineitem WHERE l_shipdate BETWEEN DATE '1995-01-01' AND DATE '1995-02-01';
```

### 4. IN filter

```sql
SELECT * FROM lineitem WHERE l_shipmode IN ('AIR', 'RAIL');
```

### 5. NOT IN filter

```sql
SELECT * FROM lineitem WHERE l_shipmode NOT IN ('AIR', 'RAIL');
```

### 6. IS NULL filter

```sql
SELECT * FROM lineitem WHERE l_comment IS NULL;
```

### 7. NOT predicate

```sql
SELECT * FROM lineitem WHERE NOT (l_quantity > 10);
```

## Query shapes with joins and aggregates

### 8. Simple join + filter

```sql
SELECT c_custkey, c_name, c_mktsegment
FROM customer, orders
WHERE c_custkey = o_custkey
  AND c_mktsegment = 'BUILDING'
  AND o_totalprice < 50000;
```

### 9. Join + group + aggregate

```sql
SELECT
  l_orderkey,
  SUM(l_extendedprice * (1 - l_discount)) AS revenue,
  o_orderdate,
  o_shippriority
FROM
  customer,
  orders,
  lineitem
WHERE
  c_mktsegment = 'BUILDING'
  AND c_custkey = o_custkey
  AND l_orderkey = o_orderkey
  AND o_totalprice < 50000
  AND l_extendedprice > 1200
GROUP BY
  l_orderkey,
  o_orderdate,
  o_shippriority
ORDER BY
  revenue DESC,
  o_orderdate;
```

### 10. Simple CTE

```sql
WITH t AS (
  SELECT *
  FROM lineitem
)
SELECT *
FROM t;
```

## Supported notes

- These samples are meant for the conversion path first.
- The optimizer also runs now, but it still depends on the local PostgreSQL TPC-H data being present and readable.
- Window functions are not supported yet.
- More complex nested queries and advanced set operations are still outside the current conversion scope.
