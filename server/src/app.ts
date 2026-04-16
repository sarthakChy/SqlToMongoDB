import express from "express";

import { explainQuery } from "./optimizer/explain";
import { visualizeExplainQuery } from "./optimizer/visualize";
import { calculateEstimatedCostPerRow } from "./optimizer/cost";
import { getSelectivities } from "./optimizer/selectivity";
import { generatePlans } from "./optimizer/generator";
import { getBestPlanId } from "./optimizer/bestPlan";
import { normalizeSql } from "./utils/sql";
import { sqlToMongo } from "./sqlToMongo/sqlToMongo";

type AppDependencies = {
  explainQuery: typeof explainQuery;
  visualizeExplainQuery: typeof visualizeExplainQuery;
  calculateEstimatedCostPerRow: typeof calculateEstimatedCostPerRow;
  getSelectivities: typeof getSelectivities;
  generatePlans: typeof generatePlans;
  getBestPlanId: typeof getBestPlanId;
  normalizeSql: typeof normalizeSql;
  sqlToMongo: typeof sqlToMongo;
};

const defaultDependencies: AppDependencies = {
  explainQuery,
  visualizeExplainQuery,
  calculateEstimatedCostPerRow,
  getSelectivities,
  generatePlans,
  getBestPlanId,
  normalizeSql,
  sqlToMongo,
};

export function createApp(overrides: Partial<AppDependencies> = {}): express.Express {
  const dependencies = { ...defaultDependencies, ...overrides };

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Return a JSON error shape for malformed JSON bodies (instead of an HTML stacktrace).
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ status: "Invalid JSON body", error: true });
      return;
    }
    next(err);
  });

  app.get("/", (_req, res) => {
    res.type("text").send(
      "SQL Query Optimizer API (Node). Use POST /generate with {query, predicates}."
    );
  });

  app.post("/generate", async (req, res) => {
    const sqlQuery = String(req.body?.query ?? "").trim();
    const predicates = Array.isArray(req.body?.predicates) ? req.body.predicates : [];

    if (!sqlQuery) {
      res.json({ status: "Error generating output. Please input an SQL query.", error: true });
      return;
    }

    const normalizedSql = dependencies.normalizeSql(sqlQuery);
    const sqlToMongoResult = dependencies.sqlToMongo(normalizedSql);

    try {
      const qepRoot = await dependencies.explainQuery(normalizedSql);
      const { graph, explanation } = dependencies.visualizeExplainQuery(qepRoot);

      const estimated_cost_per_row = dependencies.calculateEstimatedCostPerRow(qepRoot);

      const originalPredicateSelectivityData: Array<{
        attribute: string;
        operator: string;
        queried_value: number | string;
        new_value: null;
        queried_selectivity: number;
        new_selectivity: null;
      }> = [];

      const selectivities = await dependencies.getSelectivities(normalizedSql, predicates);
      for (const predicateData of selectivities) {
        for (const [operator, condition] of Object.entries(predicateData.conditions)) {
          const queriedSelectivity = condition.queried_selectivity;
          const queriedValue = condition.histogram_bounds[String(queriedSelectivity)];
          if (queriedValue === undefined) continue;

          originalPredicateSelectivityData.push({
            attribute: predicateData.attribute,
            operator,
            queried_value: queriedValue,
            new_value: null,
            queried_selectivity: queriedSelectivity,
            new_selectivity: null,
          });
        }
      }

      const allGeneratedPlans: Record<number, any> = {
        0: {
          qep: qepRoot,
          graph,
          explanation,
          predicate_selectivity_data: originalPredicateSelectivityData,
          estimated_cost_per_row,
        },
      };

      if (originalPredicateSelectivityData.length > 0) {
        const newPlans = dependencies.generatePlans(selectivities, normalizedSql);

        for (let i = 0; i < newPlans.length; i += 1) {
          const [newQuery, predicateSelectivityData] = newPlans[i];
          const altQep = await dependencies.explainQuery(newQuery);
          const altViz = dependencies.visualizeExplainQuery(altQep);

          allGeneratedPlans[i + 1] = {
            qep: altQep,
            graph: altViz.graph,
            explanation: altViz.explanation,
            predicate_selectivity_data: predicateSelectivityData,
            estimated_cost_per_row: dependencies.calculateEstimatedCostPerRow(altQep),
          };
        }
      }

      const bestPlanId = dependencies.getBestPlanId(allGeneratedPlans);

      res.json({
        data: allGeneratedPlans,
        best_plan_id: bestPlanId,
        status: "Successfully executed query.",
        error: false,
        sql_to_mongo: sqlToMongoResult,
      });
    } catch (e) {
      const anyErr = e as any;
      const code = typeof anyErr?.code === "string" ? anyErr.code : undefined;
      const name = e instanceof Error ? e.name : undefined;
      const rawMessage = e instanceof Error ? e.message : String(e);
      let message = rawMessage || name || "Unknown error";

      if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
        const host = process.env.DB_HOST ?? "localhost";
        const port = process.env.DB_PORT ?? "5432";
        message = `Cannot connect to PostgreSQL at ${host}:${port}. Is Postgres running and are DB_* env vars set?`;
      }

      // eslint-disable-next-line no-console
      console.error("/generate failed:", e);

      // Keep error shape consistent with the original frontend expectations.
      res.json({
        status: `Error in /generate - ${message}${code ? ` (code ${code})` : ""}`,
        error: true,
        sql_to_mongo: sqlToMongoResult,
      });
    }
  });

  return app;
}
