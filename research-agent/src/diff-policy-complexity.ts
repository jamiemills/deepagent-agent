import tsParser from "@typescript-eslint/parser";

type AstNode = {
  type: string;
  loc?: {
    start: { line: number };
    end: { line: number };
  };
};

type ComplexitySnapshot = {
  fileLoc: number;
  maxFunctionLoc: number;
  maxCyclomatic: number;
  maxCognitive: number;
};

type FunctionMetrics = {
  loc: number;
  cyclomatic: number;
  cognitive: number;
};

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

const COMPLEXITY_TYPES = new Set([
  "CatchClause",
  "ConditionalExpression",
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "IfStatement",
  "WhileStatement",
]);

export type ComplexityRegression = {
  path: string;
  before: ComplexitySnapshot;
  after: ComplexitySnapshot;
  changedMetrics: string[];
};

export function computeTypeScriptMetrics(
  source: string,
): ComplexitySnapshot | null {
  try {
    const ast = tsParser.parse(source, {
      ecmaVersion: "latest",
      loc: true,
      sourceType: "module",
    }) as unknown as AstNode;

    const functionMetrics = collectFunctionMetrics(ast, source);
    return {
      fileLoc: countRelevantLines(source),
      maxFunctionLoc: getMaxMetric(functionMetrics, "loc"),
      maxCyclomatic: getMaxMetric(functionMetrics, "cyclomatic"),
      maxCognitive: getMaxMetric(functionMetrics, "cognitive"),
    };
  } catch {
    return null;
  }
}

export function findComplexityRegression(args: {
  path: string;
  beforeSource: string | null;
  afterSource: string | null;
}): ComplexityRegression | null {
  if (!args.beforeSource || !args.afterSource) {
    return null;
  }

  const before = computeTypeScriptMetrics(args.beforeSource);
  const after = computeTypeScriptMetrics(args.afterSource);
  if (!before || !after) {
    return null;
  }

  const changedMetrics = getChangedMetrics(before, after);
  if (changedMetrics.length === 0) {
    return null;
  }

  return {
    path: args.path,
    before,
    after,
    changedMetrics,
  };
}

function getChangedMetrics(
  before: ComplexitySnapshot,
  after: ComplexitySnapshot,
): string[] {
  const comparisons: [keyof ComplexitySnapshot, string][] = [
    ["fileLoc", "file LOC"],
    ["maxFunctionLoc", "function LOC"],
    ["maxCyclomatic", "cyclomatic complexity"],
    ["maxCognitive", "cognitive complexity"],
  ];

  return comparisons
    .filter(([key]) => after[key] > before[key])
    .map(([, label]) => label);
}

function getMaxMetric(
  functionMetrics: FunctionMetrics[],
  key: keyof FunctionMetrics,
): number {
  return functionMetrics.reduce(
    (max, metrics) => Math.max(max, metrics[key]),
    0,
  );
}

function collectFunctionMetrics(
  node: AstNode,
  source: string,
): FunctionMetrics[] {
  const metrics: FunctionMetrics[] = [];
  visitFunctions(node, source, metrics);
  return metrics;
}

function visitFunctions(
  node: unknown,
  source: string,
  metrics: FunctionMetrics[],
): void {
  if (!isNode(node)) {
    return;
  }

  if (FUNCTION_TYPES.has(node.type)) {
    metrics.push(measureFunctionNode(node, source));
  }

  for (const child of getChildNodes(node)) {
    visitFunctions(child, source, metrics);
  }
}

function measureFunctionNode(node: AstNode, source: string): FunctionMetrics {
  return {
    loc: getNodeLoc(node, source),
    cyclomatic: 1 + countCyclomatic(node),
    cognitive: countCognitive(node, 0),
  };
}

function countCyclomatic(node: unknown): number {
  if (!isNode(node)) {
    return 0;
  }

  const nodeContribution = getCyclomaticContribution(node);
  return (
    nodeContribution +
    getChildNodes(node)
      .filter((child) => !isNestedFunction(node, child))
      .reduce((sum, child) => sum + countCyclomatic(child), 0)
  );
}

function countCognitive(node: unknown, nesting: number): number {
  if (!isNode(node)) {
    return 0;
  }

  const nodeContribution = getCognitiveContribution(node, nesting);
  const childNesting = COMPLEXITY_TYPES.has(node.type) ? nesting + 1 : nesting;
  return (
    nodeContribution +
    getChildNodes(node)
      .filter((child) => !isNestedFunction(node, child))
      .reduce((sum, child) => sum + countCognitive(child, childNesting), 0)
  );
}

function getCyclomaticContribution(node: AstNode): number {
  if (node.type === "SwitchCase") {
    return hasSwitchCaseTest(node) ? 1 : 0;
  }

  if (node.type === "LogicalExpression") {
    return isComplexLogicalOperator(node) ? 1 : 0;
  }

  return COMPLEXITY_TYPES.has(node.type) ? 1 : 0;
}

function getCognitiveContribution(node: AstNode, nesting: number): number {
  if (node.type === "SwitchCase") {
    return hasSwitchCaseTest(node) ? 1 + nesting : 0;
  }

  if (node.type === "LogicalExpression") {
    return isComplexLogicalOperator(node) ? 1 : 0;
  }

  return COMPLEXITY_TYPES.has(node.type) ? 1 + nesting : 0;
}

function getNodeLoc(node: AstNode, source: string): number {
  if (!node.loc) {
    return 0;
  }

  const lines = source
    .split("\n")
    .slice(node.loc.start.line - 1, node.loc.end.line);
  return countRelevantLines(lines.join("\n"));
}

function countRelevantLines(source: string): number {
  const lines = source.split("\n");
  let inBlockComment = false;
  let count = 0;

  for (const line of lines) {
    const normalized = normalizeCodeLine(line, inBlockComment);
    inBlockComment = normalized.inBlockComment;
    if (normalized.content.trim()) {
      count += 1;
    }
  }

  return count;
}

function normalizeCodeLine(
  line: string,
  inBlockComment: boolean,
): { content: string; inBlockComment: boolean } {
  let content = line;
  let insideBlockComment = inBlockComment;

  while (true) {
    if (insideBlockComment) {
      const endIndex = content.indexOf("*/");
      if (endIndex === -1) {
        return { content: "", inBlockComment: true };
      }
      content = content.slice(endIndex + 2);
      insideBlockComment = false;
      continue;
    }

    const lineCommentIndex = content.indexOf("//");
    const blockCommentIndex = content.indexOf("/*");

    if (lineCommentIndex === -1 && blockCommentIndex === -1) {
      return { content, inBlockComment: insideBlockComment };
    }

    if (
      lineCommentIndex !== -1 &&
      (blockCommentIndex === -1 || lineCommentIndex < blockCommentIndex)
    ) {
      return {
        content: content.slice(0, lineCommentIndex),
        inBlockComment: insideBlockComment,
      };
    }

    content =
      content.slice(0, blockCommentIndex) + content.slice(blockCommentIndex);
    const afterBlock = content.slice(blockCommentIndex + 2);
    const blockEndIndex = afterBlock.indexOf("*/");
    if (blockEndIndex === -1) {
      return {
        content: content.slice(0, blockCommentIndex),
        inBlockComment: true,
      };
    }
    content =
      content.slice(0, blockCommentIndex) + afterBlock.slice(blockEndIndex + 2);
  }
}

function isNode(value: unknown): value is AstNode {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      typeof (value as { type?: unknown }).type === "string",
  );
}

function getChildNodes(node: unknown): AstNode[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  return Object.values(node).flatMap((value) => {
    if (Array.isArray(value)) {
      return value.filter(isNode);
    }
    return isNode(value) ? [value] : [];
  });
}

function isNestedFunction(parent: AstNode, child: AstNode): boolean {
  return parent !== child && FUNCTION_TYPES.has(child.type);
}

function hasSwitchCaseTest(node: AstNode): boolean {
  return Boolean((node as { test?: unknown }).test);
}

function isComplexLogicalOperator(node: AstNode): boolean {
  return ["&&", "??", "||"].includes(
    (node as { operator?: string }).operator ?? "",
  );
}
