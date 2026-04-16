#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\i /docker-entrypoint-initdb.d/sql/dss.ddl
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
COPY part FROM '/data/part.csv' WITH (FORMAT csv, DELIMITER '|');
COPY region FROM '/data/region.csv' WITH (FORMAT csv, DELIMITER '|');
COPY nation FROM '/data/nation.csv' WITH (FORMAT csv, DELIMITER '|');
COPY supplier FROM '/data/supplier.csv' WITH (FORMAT csv, DELIMITER '|');
COPY customer FROM '/data/customer.csv' WITH (FORMAT csv, DELIMITER '|');
COPY partsupp FROM '/data/partsupp.csv' WITH (FORMAT csv, DELIMITER '|');
COPY orders FROM '/data/orders.csv' WITH (FORMAT csv, DELIMITER '|');
COPY lineitem FROM '/data/lineitem.csv' WITH (FORMAT csv, DELIMITER '|');
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\i /docker-entrypoint-initdb.d/sql/dss.ri
ANALYZE;
SQL
