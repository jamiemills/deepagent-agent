import { findComplexityRegression } from "./diff-policy-complexity.js";
import { collectConfigWeakeningIssues } from "./diff-policy-config.js";
import {
  type DiffStat,
  MAX_CHANGED_FILES,
  MAX_CHANGED_LINES,
  type PolicyViolation,
  type StagedEntry,
  touchesProtectedPath,
} from "./diff-policy-shared.js";

function buildLargeDiffViolation(
  diffStats: DiffStat[],
  stagedFiles: string[],
): PolicyViolation | null {
  const totalChangedLines = diffStats.reduce(
    (sum, entry) => sum + entry.added + entry.deleted,
    0,
  );
  if (
    totalChangedLines <= MAX_CHANGED_LINES &&
    stagedFiles.length <= MAX_CHANGED_FILES
  ) {
    return null;
  }

  return {
    policy: "large-diff",
    paths: stagedFiles,
    message: `Staged diff is too large: ${totalChangedLines} changed lines across ${stagedFiles.length} files. Limit is ${MAX_CHANGED_LINES} lines and ${MAX_CHANGED_FILES} files.`,
  };
}

function buildEnforcementChangeViolation(
  protectedFiles: string[],
): PolicyViolation | null {
  if (protectedFiles.length === 0) {
    return null;
  }

  return {
    policy: "enforcement-change",
    paths: protectedFiles,
    message: `Staged changes touch enforcement files: ${protectedFiles.join(", ")}.`,
  };
}

function buildConfigWeakeningViolation(args: {
  protectedFiles: string[];
  stagedEntries: StagedEntry[];
  readCurrentFile: (path: string) => string | null;
}): PolicyViolation | null {
  const { issues, ruleDeletions, missingRequiredRules } =
    collectConfigWeakeningIssues({
      stagedEntries: args.stagedEntries,
      readCurrentFile: args.readCurrentFile,
    });

  if (issues.length === 0) {
    return null;
  }

  return {
    policy: "config-weakening",
    paths: Array.from(
      new Set([
        ...args.protectedFiles,
        ...ruleDeletions,
        ...missingRequiredRules,
        "package.json",
        "biome.json",
        "tsconfig.json",
        "eslint.typed.config.mjs",
        "eslint.complexity.config.mjs",
        "lefthook.yml",
        ".github/workflows/agent-policy.yml",
        "scripts/check-diff-policies.mjs",
        "scripts/install-hooks.mjs",
        "scripts/run-agent-policy.mjs",
        "scripts/run-step-sequence.mjs",
        "scripts/run-verify.mjs",
        "src/diff-policy-complexity.ts",
        "src/diff-policy-config.ts",
        "src/diff-policy-shared.ts",
      ]),
    ),
    message: issues.join("\n"),
  };
}

function buildComplexityRegressionViolation(args: {
  stagedEntries: StagedEntry[];
  readCurrentFile: (path: string) => string | null;
  readPreviousFile: (path: string) => string | null;
}): PolicyViolation | null {
  const regressions = args.stagedEntries
    .filter((entry) => isTrackedTypeScriptChange(entry))
    .map((entry) =>
      findComplexityRegression({
        path: entry.path,
        beforeSource: args.readPreviousFile(entry.path),
        afterSource: args.readCurrentFile(entry.path),
      }),
    )
    .filter(
      (
        regression,
      ): regression is NonNullable<
        ReturnType<typeof findComplexityRegression>
      > => regression !== null,
    );

  if (regressions.length === 0) {
    return null;
  }

  return {
    policy: "complexity-regression",
    paths: regressions.map((regression) => regression.path),
    message: regressions
      .map((regression) => {
        const changedMetrics = regression.changedMetrics.join(", ");
        return `${regression.path} increases ${changedMetrics}.`;
      })
      .join("\n"),
  };
}

function isTrackedTypeScriptChange(entry: StagedEntry): boolean {
  return (
    ["A", "C", "M", "R"].some((status) => entry.status.startsWith(status)) &&
    entry.path.startsWith("src/") &&
    entry.path.endsWith(".ts")
  );
}

export function collectPolicyViolations(args: {
  stagedEntries: StagedEntry[];
  diffStats: DiffStat[];
  readCurrentFile: (path: string) => string | null;
  readPreviousFile: (path: string) => string | null;
}): PolicyViolation[] {
  const stagedFiles = args.stagedEntries.map((entry) => entry.path);
  const protectedFiles = stagedFiles.filter(touchesProtectedPath);
  const violations = [
    buildLargeDiffViolation(args.diffStats, stagedFiles),
    buildEnforcementChangeViolation(protectedFiles),
    buildConfigWeakeningViolation({
      protectedFiles,
      stagedEntries: args.stagedEntries,
      readCurrentFile: args.readCurrentFile,
    }),
    buildComplexityRegressionViolation({
      stagedEntries: args.stagedEntries,
      readCurrentFile: args.readCurrentFile,
      readPreviousFile: args.readPreviousFile,
    }),
  ];

  return violations.filter((violation): violation is PolicyViolation =>
    Boolean(violation),
  );
}
