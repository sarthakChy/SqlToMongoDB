#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
generator_dir="$repo_root/db/tpch-dbgen"
data_dir="$repo_root/db/data"
scale_factor="${1:-1}"

mkdir -p "$data_dir"

make -C "$generator_dir" dbgen

rm -f "$data_dir"/*.csv "$data_dir"/*.tbl

DSS_PATH="$data_dir" "$generator_dir/dbgen" -f -s "$scale_factor"

node "$repo_root/db/clean-tpch.js" "$data_dir"

find "$data_dir" -name '*.tbl' -delete