# SQL to Mongo Support

## Supported at a High Level

The translator is designed around `SELECT` queries over the TPC-H schema and can produce a Mongo pipeline JSON representation for supported query shapes.

## Known Supported Areas

- Basic `SELECT` queries with a `FROM` clause.
- Common comparison predicates such as equality and range filters.
- Some boolean combinations like `AND` and `OR`.
- A limited set of expressions, including arithmetic and some aggregate-aware rewrites.
- Special-case handling for a few query patterns used by the project.
- Simple single-CTE queries where the outer query directly selects from one CTE.
- Basic `UNION` queries with compatible branches.

## Partial or Limited Support

- Join handling is schema-aware and assumes the TPC-H naming conventions used by this project.
- Predicate handling is constrained by the optimizer and histogram code, so only some predicate shapes are practical for plan comparison.
- `LIKE` support exists, but it is still subject to the translator’s expression constraints.
- Window functions are explicitly rejected for conversion.

## Out of Scope or Not Yet Implemented

- MongoDB execution.
- General nested query support, including derived tables and nested `SELECT` blocks in `FROM` or predicate positions.
- Multi-CTE chains and CTE references beyond a single outer query selecting directly from one CTE.
- `UNION ALL`, `INTERSECT`, and `EXCEPT` variants.
- Window functions such as `ROW_NUMBER()`, `RANK()`, and `DENSE_RANK()`.
- Correlated subqueries beyond the narrow patterns currently handled.
- Broader expression coverage, including more complex boolean rewrites and dialect-specific constructs.
- Full `NOT`, `IN`, and `IS NULL` coverage.
- Broad schema-independent translation.

## Practical Implication

The current output is best treated as a conversion artifact for comparison and visualization, not as a complete SQL dialect bridge.
