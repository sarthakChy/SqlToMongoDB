import { strict as assert } from "node:assert";
import { test } from "node:test";

import { sqlToMongo } from "./sqlToMongo";

test("translates wildcard selects with BETWEEN filters", () => {
  const result = sqlToMongo(
    "SELECT * FROM lineitem WHERE l_shipdate BETWEEN DATE '1995-01-01' AND DATE '1995-02-01'"
  );

  assert.equal("error" in result, false);
  if ("error" in result) throw new Error(result.error);

  assert.equal(result.collection, "lineitem");
  assert.equal(result.pipeline.length, 2);

  const matchStage = result.pipeline[0] as any;
  const unsetStage = result.pipeline[1] as any;
  assert.ok(matchStage.$match);
  assert.equal(Array.isArray(matchStage.$match.$expr.$and), true);
  assert.equal(matchStage.$match.$expr.$and.length, 2);
  assert.equal(unsetStage.$unset, "_id");
});

test("preserves computed projections alongside wildcard selects", () => {
  const result = sqlToMongo("SELECT *, l_quantity + 1 AS qty_plus_one FROM lineitem");

  assert.equal("error" in result, false);
  if ("error" in result) throw new Error(result.error);

  assert.equal(result.collection, "lineitem");
  assert.equal(result.pipeline.length, 2);

  const addFieldsStage = result.pipeline[0] as any;
  const unsetStage = result.pipeline[1] as any;

  assert.ok(addFieldsStage.$addFields);
  assert.deepEqual(addFieldsStage.$addFields.qty_plus_one, {
    $add: ["$l_quantity", 1],
  });
  assert.equal(unsetStage.$unset, "_id");
});

test("translates COUNT(*) and GROUP BY projections", () => {
  const result = sqlToMongo("SELECT l_shipmode, COUNT(*) AS total FROM lineitem GROUP BY l_shipmode");

  assert.equal("error" in result, false);
  if ("error" in result) throw new Error(result.error);

  assert.equal(result.collection, "lineitem");
  assert.equal(result.pipeline.length, 3);

  const groupStage = result.pipeline[0] as any;
  const projectStage = result.pipeline[1] as any;
  const unsetStage = result.pipeline[2] as any;

  assert.deepEqual(groupStage.$group._id, { l_shipmode: "$l_shipmode" });
  assert.equal(groupStage.$group._agg0.$sum, 1);
  assert.equal(projectStage.$project.l_shipmode, "$_id.l_shipmode");
  assert.equal(projectStage.$project.total, "$_agg0");
  assert.equal(unsetStage.$unset, "_id");
});

test("translates IN, NOT IN, IS NULL, and NOT predicates", () => {
  const inResult = sqlToMongo("SELECT * FROM lineitem WHERE l_shipmode IN ('AIR', 'RAIL')");
  assert.equal("error" in inResult, false);
  if ("error" in inResult) throw new Error(inResult.error);
  assert.deepEqual((inResult.pipeline[0] as any).$match.$expr.$in[1], ["AIR", "RAIL"]);
  assert.equal((inResult.pipeline[1] as any).$unset, "_id");

  const notInResult = sqlToMongo("SELECT * FROM lineitem WHERE l_shipmode NOT IN ('AIR', 'RAIL')");
  assert.equal("error" in notInResult, false);
  if ("error" in notInResult) throw new Error(notInResult.error);
  assert.deepEqual((notInResult.pipeline[0] as any).$match.$expr.$not[0].$in[1], ["AIR", "RAIL"]);
  assert.equal((notInResult.pipeline[1] as any).$unset, "_id");

  const isNullResult = sqlToMongo("SELECT * FROM lineitem WHERE l_comment IS NULL");
  assert.equal("error" in isNullResult, false);
  if ("error" in isNullResult) throw new Error(isNullResult.error);
  assert.deepEqual((isNullResult.pipeline[0] as any).$match.$expr.$eq[1], null);
  assert.equal((isNullResult.pipeline[1] as any).$unset, "_id");

  const notResult = sqlToMongo("SELECT * FROM lineitem WHERE NOT (l_quantity > 10)");
  assert.equal("error" in notResult, false);
  if ("error" in notResult) throw new Error(notResult.error);
  assert.equal((notResult.pipeline[0] as any).$match.$expr.$not[0].$gt[1], 10);
  assert.equal((notResult.pipeline[1] as any).$unset, "_id");
});

test("translates a simple single-CTE query", () => {
  const result = sqlToMongo("WITH t AS (SELECT * FROM lineitem) SELECT * FROM t");

  assert.equal("error" in result, false);
  if ("error" in result) throw new Error(result.error);

  assert.equal(result.collection, "lineitem");
  assert.deepEqual(result.pipeline, [{ $unset: "_id" }]);
});

test("translates UNION queries with deduplication", () => {
  const result = sqlToMongo("SELECT * FROM lineitem UNION SELECT * FROM lineitem");

  assert.equal("error" in result, false);
  if ("error" in result) throw new Error(result.error);

  assert.equal(result.collection, "lineitem");
  assert.equal(result.pipeline.length, 4);
  assert.equal((result.pipeline[0] as any).$unset, "_id");
  assert.deepEqual((result.pipeline[1] as any).$unionWith, { coll: "lineitem", pipeline: [{ $unset: "_id" }] });
});

test("rejects window functions explicitly", () => {
  const result = sqlToMongo("SELECT l_quantity, ROW_NUMBER() OVER (ORDER BY l_quantity) FROM lineitem");

  assert.equal("error" in result, true);
  if (!("error" in result)) throw new Error("expected error result");
  assert.match(result.error, /window functions are not supported/i);
});
