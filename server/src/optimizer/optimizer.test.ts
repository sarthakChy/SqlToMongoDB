import { strict as assert } from "node:assert";
import { test } from "node:test";

import { pool } from "../db/pool";
import { calculateEstimatedCostPerRow } from "./cost";
import { generatePlans } from "./generator";
import { getBestPlanId } from "./bestPlan";
import { getSelectivities } from "./selectivity";

test("calculateEstimatedCostPerRow uses plan totals", () => {
  const value = calculateEstimatedCostPerRow({
    Plan: {
      "Startup Cost": 10,
      "Total Cost": 30,
      "Plan Rows": 10,
    },
  });

  assert.equal(value, 4);
});

test("getBestPlanId prefers lower-cost distinct plans", () => {
  const best = getBestPlanId({
    0: { estimated_cost_per_row: 10, explanation: ["Seq Scan"] },
    1: { estimated_cost_per_row: 5, explanation: ["Index Scan"] },
    2: { estimated_cost_per_row: 1, explanation: ["Seq Scan"] },
  });

  assert.equal(best, 1);
});

test("generatePlans rewrites predicate values across histogram bounds", () => {
  const plans = generatePlans(
    [
      {
        relation: "lineitem",
        attribute: "l_shipdate",
        datatype: "date",
        conditions: {
          ">=": {
            queried_selectivity: 0.5,
            histogram_bounds: {
              "0.2": "1994-01-01",
              "0.5": "1995-01-01",
              "0.8": "1996-01-01",
            },
          },
        },
      },
    ],
    "SELECT * FROM lineitem WHERE l_shipdate >= DATE '1995-01-01'"
  );

  assert.equal(plans.length, 3);
  assert.ok(plans.some(([sql]) => sql.includes("1994-01-01")));
  assert.ok(plans.some(([sql]) => sql.includes("1996-01-01")));
});

test("getSelectivities filters supported range predicates", async () => {
  const originalQuery = pool.query;

  (pool as any).query = async (text: string) => {
    if (text.includes("information_schema.columns")) {
      return { rows: [{ data_type: "date" }] };
    }

    if (text.includes("pg_stats")) {
      return { rows: [{ histogram_bounds: ["1995-01-01", "1995-02-01", "1995-03-01"] }] };
    }

    throw new Error(`Unexpected query: ${text}`);
  };

  try {
    const results = await getSelectivities(
      "SELECT * FROM lineitem WHERE l_shipdate BETWEEN DATE '1995-01-01' AND DATE '1995-02-01'",
      ["l_shipdate"]
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].attribute, "l_shipdate");
    assert.deepEqual(Object.keys(results[0].conditions).sort(), ["<=", ">="]);
  } finally {
    (pool as any).query = originalQuery;
  }
});
