import { strict as assert } from "node:assert";
import http from "node:http";
import { test } from "node:test";

import { createApp } from "./app";

async function withServer(app: ReturnType<typeof createApp>, run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine test server port");
    }

    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

test("/generate rejects malformed JSON", async () => {
  const app = createApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"query":',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "Invalid JSON body", error: true });
  });
});

test("/generate returns an error for empty queries", async () => {
  const app = createApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "   ", predicates: [] }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "Error generating output. Please input an SQL query.",
      error: true,
    });
  });
});

test("/generate returns optimizer data with injected dependencies", async () => {
  const normalizeSqlCalls: string[] = [];
  const explainCalls: string[] = [];
  const selectivityCalls: Array<{ sql: string; predicates: string[] }> = [];
  const generatePlanCalls: Array<string> = [];

  const app = createApp({
    normalizeSql: (sql) => {
      normalizeSqlCalls.push(sql);
      return sql.trim();
    },
    sqlToMongo: (sql) => ({ collection: "lineitem", pipeline: [{ $match: { $expr: { $eq: ["$l_shipmode", "AIR"] } } }] }),
    explainQuery: async (sql) => {
      explainCalls.push(sql);
      return {
        Plan: {
          "Node Type": "Seq Scan",
          "Startup Cost": 1,
          "Total Cost": 3,
          "Plan Rows": 2,
          "Relation Name": "lineitem",
        },
      };
    },
    visualizeExplainQuery: () => ({
      graph: { directed: true, multigraph: false, graph: {}, nodes: [], links: [] },
      explanation: ["Seq Scan lineitem as T1"],
    }),
    calculateEstimatedCostPerRow: () => 2,
    getSelectivities: async (sql, predicates) => {
      selectivityCalls.push({ sql, predicates });
      return [
        {
          relation: "lineitem",
          attribute: "l_shipdate",
          datatype: "date",
          conditions: {
            ">=": {
              queried_selectivity: 0.4,
              histogram_bounds: {
                "0.4": "1995-01-01",
              },
            },
          },
        },
      ];
    },
    generatePlans: (histograms, originalSql) => {
      generatePlanCalls.push(originalSql);
      return [
        [
          originalSql.replace("1995-01-01", "1995-02-01"),
          [
            {
              attribute: "l_shipdate",
              operator: ">=",
              queried_value: "1995-01-01",
              new_value: "1995-02-01",
              queried_selectivity: 0.4,
              new_selectivity: 0.5,
            },
          ],
        ],
      ];
    },
    getBestPlanId: () => 1,
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "  SELECT * FROM lineitem WHERE l_shipdate >= DATE '1995-01-01'  ",
        predicates: ["l_shipdate"],
      }),
    });

    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.error, false);
    assert.equal(body.best_plan_id, 1);
    assert.deepEqual(body.sql_to_mongo, {
      collection: "lineitem",
      pipeline: [{ $match: { $expr: { $eq: ["$l_shipmode", "AIR"] } } }],
    });
    assert.equal(Object.keys(body.data).length, 2);
    assert.equal(body.data[0].estimated_cost_per_row, 2);
    assert.equal(body.data[1].estimated_cost_per_row, 2);
  });

  assert.equal(normalizeSqlCalls.length, 1);
  assert.equal(explainCalls.length, 2);
  assert.equal(selectivityCalls.length, 1);
  assert.equal(selectivityCalls[0].predicates[0], "l_shipdate");
  assert.equal(generatePlanCalls.length, 1);
});

test("/generate preserves sql_to_mongo when optimizer dependencies fail", async () => {
  const app = createApp({
    normalizeSql: (sql) => sql.trim(),
    sqlToMongo: () => ({ collection: "lineitem", pipeline: [{ $match: { $expr: { $eq: ["$l_shipmode", "AIR"] } } }] }),
    explainQuery: async () => {
      throw new Error("postgres unavailable");
    },
    visualizeExplainQuery: () => {
      throw new Error("should not be called after failure");
    },
    calculateEstimatedCostPerRow: () => 0,
    getSelectivities: async () => [],
    generatePlans: () => [],
    getBestPlanId: () => 0,
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "SELECT * FROM lineitem", predicates: [] }),
    });

    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.error, true);
    assert.deepEqual(body.sql_to_mongo, {
      collection: "lineitem",
      pipeline: [{ $match: { $expr: { $eq: ["$l_shipmode", "AIR"] } } }],
    });
    assert.match(body.status, /Error in \/generate/);
  });
});
