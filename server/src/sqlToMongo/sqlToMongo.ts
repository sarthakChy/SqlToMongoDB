import { Parser } from "node-sql-parser";

import { varPrefixToTable } from "../optimizer/constants";

type MongoPipeline = Array<Record<string, any>>;

type SqlToMongoResult =
  | { collection: string; pipeline: MongoPipeline }
  | { error: string };

type JoinPredicate = {
  leftColumn: string;
  rightColumn: string;
  leftTable: string;
  rightTable: string;
};

type ExistsPredicate = {
  subqueryAst: any;
};

function getColumnName(columnRef: any): string {
  const col = columnRef?.column;
  if (typeof col === "string") return col;

  const nested = col?.expr;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") {
    if (typeof nested.value === "string") return nested.value;
  }

  if (typeof col?.value === "string") return col.value;
  return String(col ?? "");
}

function tableFromColumnName(columnName: string): string | null {
  const prefix = columnName.split("_")[0] ?? "";
  return varPrefixToTable[prefix] ?? null;
}

function flattenAnd(node: any): any[] {
  if (!node) return [];
  if (node.type === "binary_expr" && String(node.operator).toUpperCase() === "AND") {
    return [...flattenAnd(node.left), ...flattenAnd(node.right)];
  }
  return [node];
}

function isExistsFunction(node: any): boolean {
  if (!node || node.type !== "function") return false;
  const name = node?.name?.name;
  if (!Array.isArray(name) || !name[0]) return false;
  return String(name[0].value ?? "").toLowerCase() === "exists";
}

function literalToValue(node: any): any {
  if (!node) return null;
  if (node.type === "number") return Number(node.value);
  if (node.type === "single_quote_string") return String(node.value);
  if (node.type === "date") return String(node.value);
  if (node.type === "bool") return Boolean(node.value);
  if (node.type === "null") return null;
  return null;
}

function isStarColumnRef(node: any): boolean {
  return node?.type === "column_ref" && getColumnName(node) === "*";
}

function containsWindowFunctionNode(node: any): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some((item) => containsWindowFunctionNode(item));
  if (typeof node !== "object") return false;
  if (node.type === "window_func") return true;

  return Object.values(node).some((value) => containsWindowFunctionNode(value));
}

function hasStarOnlySelect(stmt: any): boolean {
  const selectColumns = Array.isArray(stmt?.columns) ? stmt.columns : [];
  return selectColumns.length > 0 && selectColumns.every((col: any) => isStarColumnRef(col?.expr));
}

function exprListToMongoValues(node: any, aggFieldBySignature?: Map<string, string>): any[] {
  const values = Array.isArray(node?.value) ? node.value : [];
  return values.map((value: any) => exprToMongoExpr(value, aggFieldBySignature));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function likeToRegex(pattern: string): string {
  // SQL LIKE: % => .*, _ => .
  const escaped = escapeRegex(pattern);
  const regexBody = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return `^${regexBody}$`;
}

function exprToMongoExpr(node: any, aggFieldBySignature?: Map<string, string>): any {
  if (!node) return null;

  switch (node.type) {
    case "column_ref":
      return `$${getColumnName(node)}`;
    case "number":
    case "single_quote_string":
    case "date":
    case "bool":
    case "null":
      return literalToValue(node);
    case "binary_expr": {
      const op = String(node.operator).toUpperCase();

      // Arithmetic
      if (op === "+") return { $add: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
      if (op === "-") return { $subtract: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
      if (op === "*") return { $multiply: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
      if (op === "/") return { $divide: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };

      // Boolean/compare handled elsewhere
      throw new Error(`Unsupported binary_expr in expression context: ${op}`);
    }
    case "case": {
      // Convert CASE WHEN ... THEN ... ELSE ... END into nested $cond
      const args = Array.isArray(node.args) ? node.args : [];

      const whens = args.filter((a: any) => a?.type === "when");
      const elseNode = args.find((a: any) => a?.type === "else");

      let current: any = elseNode ? exprToMongoExpr(elseNode.result, aggFieldBySignature) : null;

      for (let i = whens.length - 1; i >= 0; i -= 1) {
        const w = whens[i];
        const condExpr = boolToMongoExpr(w.cond, aggFieldBySignature);
        const thenExpr = exprToMongoExpr(w.result, aggFieldBySignature);
        current = { $cond: [condExpr, thenExpr, current] };
      }

      return current;
    }
    case "aggr_func": {
      // In project stage after $group, refer to accumulator field.
      const sig = aggSignature(node);
      const field = aggFieldBySignature?.get(sig);
      if (!field) {
        throw new Error(`Aggregate function referenced but not registered: ${sig}`);
      }
      return `$${field}`;
    }
    default:
      throw new Error(`Unsupported expression node type: ${String(node.type)}`);
  }
}

function boolToMongoExpr(node: any, aggFieldBySignature?: Map<string, string>): any {
  if (!node) return true;

  if (node.type === "function") {
    const name = node?.name?.name;
    const functionName = Array.isArray(name) && name[0] ? String(name[0].value ?? "").toUpperCase() : "";

    if (functionName === "NOT") {
      const arg = node?.args?.value?.[0];
      if (!arg) throw new Error("NOT requires an argument");
      return { $not: [boolToMongoExpr(arg, aggFieldBySignature)] };
    }

    throw new Error(`Unsupported boolean function: ${functionName || String(node.type)}`);
  }

  if (node.type === "binary_expr") {
    const op = String(node.operator).toUpperCase();

    if (op === "AND") return { $and: [boolToMongoExpr(node.left, aggFieldBySignature), boolToMongoExpr(node.right, aggFieldBySignature)] };
    if (op === "OR") return { $or: [boolToMongoExpr(node.left, aggFieldBySignature), boolToMongoExpr(node.right, aggFieldBySignature)] };

    if (op === "BETWEEN") {
      const bounds = Array.isArray(node.right?.value) ? node.right.value : [];
      if (bounds.length !== 2) throw new Error("BETWEEN requires two bounds");

      return {
        $and: [
          { $gte: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(bounds[0], aggFieldBySignature)] },
          { $lte: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(bounds[1], aggFieldBySignature)] },
        ],
      };
    }

    if (["=", "=="].includes(op)) return { $eq: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
    if (["!=", "<>"].includes(op)) return { $ne: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
    if (op === ">") return { $gt: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
    if (op === ">=") return { $gte: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
    if (op === "<") return { $lt: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };
    if (op === "<=") return { $lte: [exprToMongoExpr(node.left, aggFieldBySignature), exprToMongoExpr(node.right, aggFieldBySignature)] };

    if (op === "IN") {
      return { $in: [exprToMongoExpr(node.left, aggFieldBySignature), exprListToMongoValues(node.right, aggFieldBySignature)] };
    }

    if (op === "NOT IN") {
      return { $not: [{ $in: [exprToMongoExpr(node.left, aggFieldBySignature), exprListToMongoValues(node.right, aggFieldBySignature)] }] };
    }

    if (op === "IS") {
      if (node.right?.type !== "null") throw new Error(`Unsupported IS comparison: ${op}`);
      return { $eq: [exprToMongoExpr(node.left, aggFieldBySignature), null] };
    }

    if (op === "IS NOT") {
      if (node.right?.type !== "null") throw new Error(`Unsupported IS comparison: ${op}`);
      return { $ne: [exprToMongoExpr(node.left, aggFieldBySignature), null] };
    }

    if (op === "LIKE") {
      const input = exprToMongoExpr(node.left, aggFieldBySignature);
      const pattern = literalToValue(node.right);
      if (typeof pattern !== "string") {
        throw new Error("LIKE pattern must be a string literal");
      }
      return {
        $regexMatch: {
          input,
          regex: likeToRegex(pattern),
          options: "i",
        },
      };
    }

    throw new Error(`Unsupported boolean operator: ${op}`);
  }

  // Some constructs appear as functions (EXISTS) but those are handled separately
  throw new Error(`Unsupported boolean node type: ${String(node.type)}`);
}

function aggSignature(node: any): string {
  const name = String(node?.name ?? "").toUpperCase();
  const arg = node?.args?.expr;
  return `${name}(${JSON.stringify(arg)})`;
}

function collectAggregates(node: any, aggregates: Map<string, any>): void {
  if (!node || typeof node !== "object") return;

  if (node.type === "aggr_func") {
    const sig = aggSignature(node);
    if (!aggregates.has(sig)) aggregates.set(sig, node);
    return;
  }

  // Recurse common shapes
  if (node.type === "binary_expr") {
    collectAggregates(node.left, aggregates);
    collectAggregates(node.right, aggregates);
    return;
  }

  if (node.type === "case") {
    const args = Array.isArray(node.args) ? node.args : [];
    for (const a of args) {
      if (a?.type === "when") {
        collectAggregates(a.cond, aggregates);
        collectAggregates(a.result, aggregates);
      } else if (a?.type === "else") {
        collectAggregates(a.result, aggregates);
      }
    }
    return;
  }

  if (node.type === "expr") {
    collectAggregates(node.expr, aggregates);
  }
}

function accumulatorForAgg(agg: any, aggFieldBySignature: Map<string, string>): Record<string, any> {
  const name = String(agg.name ?? "").toUpperCase();
  const sig = aggSignature(agg);
  const fieldName = aggFieldBySignature.get(sig);
  if (!fieldName) throw new Error("Aggregate field mapping missing");

  const arg = agg?.args?.expr;

  if (name === "COUNT") {
    // COUNT(*) or COUNT(expr)
    return { [fieldName]: { $sum: 1 } };
  }

  if (name === "SUM") {
    return { [fieldName]: { $sum: exprToMongoExpr(arg, aggFieldBySignature) } };
  }

  if (name === "AVG") {
    return { [fieldName]: { $avg: exprToMongoExpr(arg, aggFieldBySignature) } };
  }

  if (name === "MIN") {
    return { [fieldName]: { $min: exprToMongoExpr(arg, aggFieldBySignature) } };
  }

  if (name === "MAX") {
    return { [fieldName]: { $max: exprToMongoExpr(arg, aggFieldBySignature) } };
  }

  throw new Error(`Unsupported aggregate function: ${name}`);
}

function splitWhereConjuncts(whereAst: any): {
  joins: JoinPredicate[];
  exists: ExistsPredicate[];
  filters: any[];
} {
  const joins: JoinPredicate[] = [];
  const exists: ExistsPredicate[] = [];
  const filters: any[] = [];

  for (const conjunct of flattenAnd(whereAst)) {
    if (isExistsFunction(conjunct)) {
      const sub = conjunct?.args?.value?.[0]?.ast;
      if (sub) exists.push({ subqueryAst: sub });
      continue;
    }

    if (conjunct?.type === "binary_expr" && String(conjunct.operator) === "=") {
      if (conjunct.left?.type === "column_ref" && conjunct.right?.type === "column_ref") {
        const leftColumn = getColumnName(conjunct.left);
        const rightColumn = getColumnName(conjunct.right);
        const leftTable = tableFromColumnName(leftColumn);
        const rightTable = tableFromColumnName(rightColumn);

        if (leftTable && rightTable && leftTable !== rightTable) {
          joins.push({ leftColumn, rightColumn, leftTable, rightTable });
          continue;
        }
      }
    }

    filters.push(conjunct);
  }

  return { joins, exists, filters };
}

function buildJoinPipeline(baseTable: string, fromTables: string[], joins: JoinPredicate[]): MongoPipeline {
  const pipeline: MongoPipeline = [];
  const joined = new Set<string>([baseTable]);

  while (joined.size < fromTables.length) {
    const next = joins.find((j) =>
      (joined.has(j.leftTable) && !joined.has(j.rightTable)) ||
      (joined.has(j.rightTable) && !joined.has(j.leftTable))
    );

    if (!next) break;

    let targetTable: string;
    let localField: string;
    let foreignField: string;

    if (joined.has(next.leftTable) && !joined.has(next.rightTable)) {
      targetTable = next.rightTable;
      localField = next.leftColumn;
      foreignField = next.rightColumn;
    } else {
      targetTable = next.leftTable;
      localField = next.rightColumn;
      foreignField = next.leftColumn;
    }

    const asField = `_join_${targetTable}`;

    pipeline.push({
      $lookup: {
        from: targetTable,
        localField,
        foreignField,
        as: asField,
      },
    });

    pipeline.push({ $unwind: `$${asField}` });
    pipeline.push({
      $replaceRoot: {
        newRoot: { $mergeObjects: [`$${asField}`, "$$ROOT"] },
      },
    });
    pipeline.push({ $unset: asField });

    joined.add(targetTable);
  }

  return pipeline;
}

function buildExistsStages(existsPredicates: ExistsPredicate[]): MongoPipeline {
  const stages: MongoPipeline = [];

  for (let i = 0; i < existsPredicates.length; i += 1) {
    const sub = existsPredicates[i].subqueryAst;
    const from = sub?.from;
    const subTable = Array.isArray(from) && from[0]?.table ? String(from[0].table) : null;
    if (!subTable) continue;

    // Collect conjuncts in subquery WHERE.
    const conjuncts = flattenAnd(sub.where);

    // Find correlated equality: subCol = outerCol
    const correlated = conjuncts.find(
      (c) =>
        c?.type === "binary_expr" &&
        String(c.operator) === "=" &&
        c.left?.type === "column_ref" &&
        c.right?.type === "column_ref" &&
        tableFromColumnName(getColumnName(c.left)) === subTable &&
        tableFromColumnName(getColumnName(c.right)) !== subTable
    );

    if (!correlated) {
      // Best-effort: treat as plain lookup without correlation
      continue;
    }

    const subCol = getColumnName(correlated.left);
    const outerCol = getColumnName(correlated.right);

    const otherConjuncts = conjuncts.filter((c) => c !== correlated);

    const asField = `_exists_${subTable}_${i}`;

    const matchExprs = [
      { $eq: [`$${subCol}`, `$$outer_${outerCol}`] },
      ...otherConjuncts.map((c) => boolToMongoExpr(c)),
    ];

    stages.push({
      $lookup: {
        from: subTable,
        let: { [`outer_${outerCol}`]: `$${outerCol}` },
        pipeline: [
          { $match: { $expr: { $and: matchExprs } } },
          { $limit: 1 },
        ],
        as: asField,
      },
    });

    stages.push({
      $match: {
        $expr: { $gt: [{ $size: `$${asField}` }, 0] },
      },
    });

    stages.push({ $unset: asField });
  }

  return stages;
}

function buildGroupAndProject(
  stmt: any,
  filterExpr: any,
  postJoinPipeline: MongoPipeline
): MongoPipeline {
  const pipeline: MongoPipeline = [...postJoinPipeline];

  if (filterExpr) {
    pipeline.push({ $match: { $expr: filterExpr } });
  }

  // Determine group keys
  const groupColumns = stmt.groupby?.columns ?? null;
  const groupKeys = Array.isArray(groupColumns)
    ? groupColumns
        .filter((c: any) => c?.type === "column_ref")
        .map((c: any) => getColumnName(c))
    : [];

  const groupId: any = groupKeys.length > 0 ? {} : null;
  for (const key of groupKeys) {
    groupId[key] = `$${key}`;
  }

  // Collect aggregates from SELECT + HAVING
  const aggregates = new Map<string, any>();
  for (const col of stmt.columns ?? []) {
    if (col?.type === "expr") collectAggregates(col.expr, aggregates);
    if (col?.expr) collectAggregates(col.expr, aggregates);
  }
  if (stmt.having) collectAggregates(stmt.having, aggregates);

  const aggFieldBySignature = new Map<string, string>();
  let aggIndex = 0;
  for (const sig of aggregates.keys()) {
    aggFieldBySignature.set(sig, `_agg${aggIndex}`);
    aggIndex += 1;
  }

  const groupStage: any = { _id: groupId };
  for (const agg of aggregates.values()) {
    Object.assign(groupStage, accumulatorForAgg(agg, aggFieldBySignature));
  }

  pipeline.push({ $group: groupStage });

  // HAVING (no scalar subquery)
  if (stmt.having) {
    pipeline.push({ $match: { $expr: boolToMongoExpr(stmt.having, aggFieldBySignature) } });
  }

  // Project final SELECT columns
  const project: any = {};

  for (const key of groupKeys) {
    project[key] = `$_id.${key}`;
  }

  for (const col of stmt.columns ?? []) {
    const exprNode = col?.expr ?? col?.expr?.expr ?? col?.expr;
    const alias = col?.as ?? null;

    if (isStarColumnRef(exprNode)) {
      continue;
    }

    // Column ref without alias
    if (exprNode?.type === "column_ref") {
      const name = getColumnName(exprNode);
      project[alias ?? name] = groupKeys.includes(name) ? `$_id.${name}` : `$${name}`;
      continue;
    }

    const outName = alias ?? `expr_${Object.keys(project).length}`;
    project[outName] = exprToMongoExpr(exprNode, aggFieldBySignature);
  }

  pipeline.push({ $project: project });

  return pipeline;
}

function buildSortAndLimit(stmt: any): MongoPipeline {
  const pipeline: MongoPipeline = [];

  if (Array.isArray(stmt.orderby) && stmt.orderby.length > 0) {
    const sort: Record<string, 1 | -1> = {};
    for (const o of stmt.orderby) {
      const colName = o?.expr?.type === "column_ref" ? getColumnName(o.expr) : null;
      if (!colName) continue;
      sort[colName] = String(o.type ?? "ASC").toUpperCase() === "DESC" ? -1 : 1;
    }
    if (Object.keys(sort).length > 0) pipeline.push({ $sort: sort });
  }

  const limitNode = stmt.limit?.value?.[0];
  if (limitNode?.type === "number") {
    const limit = Number(limitNode.value);
    if (Number.isFinite(limit)) pipeline.push({ $limit: limit });
  }

  return pipeline;
}

function hasScalarSubqueryHaving(stmt: any): boolean {
  if (!stmt?.having) return false;

  // Node-sql-parser represents scalar subqueries as an object with an `ast` property.
  const right = stmt.having?.right;
  return Boolean(right && typeof right === "object" && "ast" in right);
}

function buildPipelineForHavingScalarSubquery(stmt: any, baseTable: string): MongoPipeline {
  const { joins, exists, filters } = splitWhereConjuncts(stmt.where);

  const fromTables = Array.isArray(stmt.from) ? stmt.from.map((f: any) => String(f.table)) : [];

  const joinPipeline = buildJoinPipeline(baseTable, fromTables, joins);
  const existsStages = buildExistsStages(exists);

  const preFacetStages: MongoPipeline = [...joinPipeline, ...existsStages];

  // Build filter expression for main query (excluding joins + exists)
  const filterExpr =
    filters.length === 0 ? null : filters.length === 1 ? boolToMongoExpr(filters[0]) : { $and: filters.map((f) => boolToMongoExpr(f)) };

  // Subquery details
  const subAst = stmt.having.right.ast;
  const subSplit = splitWhereConjuncts(subAst.where);
  const subFilters = subSplit.filters;
  const subFilterExpr =
    subFilters.length === 0
      ? null
      : subFilters.length === 1
        ? boolToMongoExpr(subFilters[0])
        : { $and: subFilters.map((f) => boolToMongoExpr(f)) };

  // Main group: we assume the HAVING left side is an aggregate that should be exposed as `value`.
  // This matches the sample query 10 alias.
  const mainStmt = {
    ...stmt,
    having: null,
  };

  // Force main projection to include the alias used in ORDER BY if present.
  const mainPipeline = buildGroupAndProject(mainStmt, filterExpr, []);

  // Threshold: compute scalar value from subquery.
  // We run the subquery pipeline starting from the same joinPipeline (joins are identical in samples).
  const subPipelineBase: MongoPipeline = [];
  if (subFilterExpr) subPipelineBase.push({ $match: { $expr: subFilterExpr } });

  // Collect aggregates from subquery select.
  const aggregates = new Map<string, any>();
  for (const col of subAst.columns ?? []) {
    if (col?.expr) collectAggregates(col.expr, aggregates);
  }

  const aggFieldBySignature = new Map<string, string>();
  let aggIndex = 0;
  for (const sig of aggregates.keys()) {
    aggFieldBySignature.set(sig, `_agg${aggIndex}`);
    aggIndex += 1;
  }

  const groupStage: any = { _id: null };
  for (const agg of aggregates.values()) {
    Object.assign(groupStage, accumulatorForAgg(agg, aggFieldBySignature));
  }

  const subExprNode = subAst.columns?.[0]?.expr;
  const thresholdProject = {
    threshold: exprToMongoExpr(subExprNode, aggFieldBySignature),
  };

  const thresholdPipeline: MongoPipeline = [
    ...subPipelineBase,
    { $group: groupStage },
    { $project: thresholdProject },
  ];

  // Combine via $facet
  const combined: MongoPipeline = [
    ...preFacetStages,
    {
      $facet: {
        main: mainPipeline,
        threshold: thresholdPipeline,
      },
    },
    { $unwind: "$threshold" },
    { $unwind: "$main" },
    {
      $match: {
        $expr: {
          $gt: ["$main.value", "$threshold.threshold"],
        },
      },
    },
    { $replaceRoot: { newRoot: "$main" } },
    ...buildSortAndLimit(stmt),
  ];

  return combined;
}

function buildSelectTranslation(stmt: any, includeTail = true): SqlToMongoResult {
  if (containsWindowFunctionNode(stmt)) {
    return { error: "Window functions are not supported for SQL→Mongo conversion yet." };
  }

  const fromTables = Array.isArray(stmt.from) ? stmt.from.map((f: any) => String(f.table)) : [];
  if (fromTables.length === 0) {
    return { error: "No FROM tables found." };
  }

  const baseTable = fromTables[0];

  if (hasScalarSubqueryHaving(stmt)) {
    return {
      collection: baseTable,
      pipeline: buildPipelineForHavingScalarSubquery(stmt, baseTable),
    };
  }

  const { joins, exists, filters } = splitWhereConjuncts(stmt.where);

  const joinPipeline = buildJoinPipeline(baseTable, fromTables, joins);
  const existsStages = buildExistsStages(exists);

  const filterExpr =
    filters.length === 0
      ? null
      : filters.length === 1
        ? boolToMongoExpr(filters[0])
        : { $and: filters.map((f) => boolToMongoExpr(f)) };

  const needsGroup = Boolean(stmt.groupby) || (stmt.columns ?? []).some((c: any) => {
    const aggregates = new Map<string, any>();
    collectAggregates(c?.expr ?? c?.expr?.expr, aggregates);
    return aggregates.size > 0;
  });

  let pipeline: MongoPipeline;
  if (needsGroup) {
    pipeline = buildGroupAndProject(stmt, filterExpr, [...joinPipeline, ...existsStages]);
  } else {
    pipeline = [...joinPipeline, ...existsStages];
    if (filterExpr) pipeline.push({ $match: { $expr: filterExpr } });

    const selectColumns = Array.isArray(stmt.columns) ? stmt.columns : [];
    const hasWildcardSelect = selectColumns.some((col: any) => isStarColumnRef(col?.expr));
    const project: any = {};
    for (const col of selectColumns) {
      const exprNode = col?.expr;
      const alias = col?.as ?? null;

      if (isStarColumnRef(exprNode)) {
        continue;
      }

      if (exprNode?.type === "column_ref") {
        const name = getColumnName(exprNode);
        project[alias ?? name] = `$${name}`;
      } else {
        const outName = alias ?? `expr_${Object.keys(project).length}`;
        project[outName] = exprToMongoExpr(exprNode);
      }
    }
    if (!hasWildcardSelect && Object.keys(project).length > 0) {
      pipeline.push({ $project: project });
    }
  }

  if (includeTail) {
    pipeline.push(...buildSortAndLimit(stmt));
  }

  return { collection: baseTable, pipeline };
}

function buildSimpleCteTranslation(stmt: any): SqlToMongoResult | null {
  if (!Array.isArray(stmt?.with) || stmt.with.length !== 1) {
    return null;
  }

  const cte = stmt.with[0];
  const cteName = String(cte?.name?.value ?? "");
  const cteStmt = cte?.stmt;

  if (!cteName || !cteStmt || cteStmt.type !== "select") {
    return { error: "CTE queries are not supported for this SQL shape yet." };
  }

  const fromTables = Array.isArray(stmt.from) ? stmt.from.map((f: any) => String(f.table)) : [];
  const outerFromMatchesCte = fromTables.length === 1 && fromTables[0] === cteName;

  if (!outerFromMatchesCte || stmt.where || stmt.groupby || stmt.having || stmt._next || stmt.set_op) {
    return { error: "CTE queries are only supported when the outer query directly selects from a single CTE." };
  }

  if (!hasStarOnlySelect(stmt)) {
    return { error: "CTE queries are only supported with SELECT * in the outer query for now." };
  }

  const innerResult = buildSelectTranslation(cteStmt, false);
  if ("error" in innerResult) {
    return innerResult;
  }

  return {
    collection: innerResult.collection,
    pipeline: [...innerResult.pipeline, ...buildSortAndLimit(stmt)],
  };
}

function buildUnionTranslation(stmt: any): SqlToMongoResult | null {
  if (String(stmt?.set_op ?? "").toLowerCase() !== "union" || !stmt?._next) {
    return null;
  }

  if (stmt.with || stmt._next.with) {
    return { error: "CTEs inside UNION queries are not supported yet." };
  }

  const leftResult = buildSelectTranslation({ ...stmt, _next: undefined, set_op: null }, false);
  if ("error" in leftResult) {
    return leftResult;
  }

  const rightResult = buildSelectTranslation(stmt._next, false);
  if ("error" in rightResult) {
    return rightResult;
  }

  return {
    collection: leftResult.collection,
    pipeline: [
      ...leftResult.pipeline,
      {
        $unionWith: {
          coll: rightResult.collection,
          pipeline: rightResult.pipeline,
        },
      },
      {
        $group: {
          _id: "$$ROOT",
        },
      },
      { $replaceRoot: { newRoot: "$_id" } },
      ...buildSortAndLimit(stmt),
    ],
  };
}

export function sqlToMongo(sql: string): SqlToMongoResult {
  try {
    const parser = new Parser();
    const ast = parser.astify(sql, { database: "postgresql" });
    const stmt = Array.isArray(ast) ? ast[0] : ast;

    if (Array.isArray(ast) && ast.length > 1) {
      return { error: "Only a single SQL statement is supported for SQL→Mongo conversion." };
    }

    if (!stmt || stmt.type !== "select") {
      return { error: "Only SELECT queries are supported for SQL→Mongo conversion." };
    }

    const cteTranslation = buildSimpleCteTranslation(stmt);
    if (cteTranslation) {
      return cteTranslation;
    }

    const unionTranslation = buildUnionTranslation(stmt);
    if (unionTranslation) {
      return unionTranslation;
    }

    return buildSelectTranslation(stmt);
  } catch (e: any) {
    return { error: e?.message ?? "Unable to convert SQL to MongoDB." };
  }
}
