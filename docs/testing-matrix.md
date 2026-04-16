# Testing Matrix

## Current State

The repository currently has one stale frontend scaffold test and no meaningful backend or optimizer coverage.

## Recommended Coverage

### Frontend

- Render the main app shell.
- Verify query submission wiring in the input form.
- Verify the result panel renders success and error states.
- Verify the SQL-to-Mongo JSON display path.

### Server API

- Validate `POST /generate` with an empty query.
- Validate malformed JSON handling.
- Validate PostgreSQL connection failure handling.
- Validate the happy path when optimizer dependencies are available.

### SQL-to-Mongo Translator

- Basic `SELECT ... FROM ...` translation.
- Comparison and boolean predicate translation.
- Aggregate and expression handling.
- Unsupported syntax rejection.

### Optimizer

- Selectivity extraction for supported predicates.
- Histogram-based selectivity mapping.
- Alternate plan generation.
- Best-plan selection.

### Integration

- End-to-end `/generate` coverage with a test database.
- Smoke test for a representative TPC-H query.

## Priority Order

1. Server unit tests for error handling and translation.
2. Translator and optimizer unit tests.
3. Frontend component tests.
4. PostgreSQL-backed integration tests.
