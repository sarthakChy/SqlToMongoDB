#!/bin/sh
set -eu

data_dir=/data
for csv in part.csv region.csv nation.csv supplier.csv customer.csv partsupp.csv orders.csv lineitem.csv; do
	if [ ! -f "$data_dir/$csv" ]; then
		echo "Missing required TPC-H CSV: $data_dir/$csv. Run 'npm run generate:tpch-data' before starting the database container." >&2
		exit 1
	fi
done

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
