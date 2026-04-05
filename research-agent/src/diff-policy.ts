import { execFileSync } from "node:child_process";

import { collectPolicyViolations } from "./diff-policy-enforcement.js";
import {
  getUncoveredViolations,
  parsePolicyManifest as parsePolicyManifestImpl,
  validatePolicyManifest,
} from "./diff-policy-manifest.js";
import {
  type DiffStat,
  POLICY_EXCEPTION_MANIFEST,
  MAX_CHANGED_LINES as SHARED_MAX_CHANGED_LINES,
  type StagedEntry,
  parseNameStatus,
  parseNumstat,
} from "./diff-policy-shared.js";

export const MAX_CHANGED_LINES = SHARED_MAX_CHANGED_LINES;
const RESEARCH_AGENT_PREFIX = "research-agent/";

export function parsePolicyManifest(raw: string | null) {
  return parsePolicyManifestImpl(raw);
}

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function tryRunGit(args: string[]): string | null {
  try {
    return runGit(args);
  } catch {
    return null;
  }
}

function getTestGitShowMap(): Record<string, string | null> | null {
  const raw = process.env["CODEX_TEST_GIT_SHOW_MAP"];
  return raw ? (JSON.parse(raw) as Record<string, string | null>) : null;
}

function getTestGitHeadMap(): Record<string, string | null> | null {
  const raw = process.env["CODEX_TEST_GIT_HEAD_MAP"];
  return raw ? (JSON.parse(raw) as Record<string, string | null>) : null;
}

function normalizePolicyPath(path: string): string {
  return path.startsWith(RESEARCH_AGENT_PREFIX)
    ? path.slice(RESEARCH_AGENT_PREFIX.length)
    : path;
}

function resolveRepoPath(path: string): string {
  if (path.startsWith(".github/") || path.startsWith(RESEARCH_AGENT_PREFIX)) {
    return path;
  }

  return `${RESEARCH_AGENT_PREFIX}${path}`;
}

function readStagedFile(path: string): string | null {
  const testMap = getTestGitShowMap();
  if (testMap) {
    return testMap[path] ?? testMap[resolveRepoPath(path)] ?? null;
  }

  return tryRunGit(["show", `:${resolveRepoPath(path)}`]);
}

function readHeadFile(path: string): string | null {
  const testMap = getTestGitHeadMap();
  if (testMap) {
    return testMap[path] ?? testMap[resolveRepoPath(path)] ?? null;
  }

  return tryRunGit(["show", `HEAD:${resolveRepoPath(path)}`]);
}

function getStagedEntries(): StagedEntry[] {
  return parseNameStatus(
    runGit(["diff", "--cached", "--name-status", "--diff-filter=ACMRD"]),
  ).map((entry) => ({
    ...entry,
    path: normalizePolicyPath(entry.path),
  }));
}

function getDiffStats(): DiffStat[] {
  return parseNumstat(
    runGit(["diff", "--cached", "--numstat", "--diff-filter=ACMRD"]),
  ).map((entry) => ({
    ...entry,
    path: normalizePolicyPath(entry.path),
  }));
}

function formatFailureReport(args: {
  violations: Array<{ policy: string; message: string }>;
  manifestIssues: string[];
}) {
  const lines = ["Diff policy gate failed.", ""];

  for (const violation of args.violations) {
    lines.push(`[${violation.policy}] ${violation.message}`);
  }

  for (const issue of args.manifestIssues) {
    lines.push(`[exception-manifest] ${issue}`);
  }

  lines.push(
    "",
    `Add or update ${POLICY_EXCEPTION_MANIFEST} with temporary, path-scoped exceptions when a policy override is intentional.`,
  );

  return lines.join("\n");
}

export function evaluateDiffPolicies(args: {
  stagedEntries: StagedEntry[];
  diffStats: DiffStat[];
  manifestRaw: string | null;
  today?: Date;
}) {
  const stagedFiles = args.stagedEntries.map((entry) => entry.path);
  const rawViolations = collectPolicyViolations({
    stagedEntries: args.stagedEntries,
    diffStats: args.diffStats,
    readStagedFile,
    readHeadFile,
  });
  const manifest = parsePolicyManifest(args.manifestRaw);
  const violations = getUncoveredViolations({
    manifest,
    violations: rawViolations,
  });
  const manifestIssues = validatePolicyManifest({
    manifest,
    stagedFiles,
    violations: rawViolations,
    today: args.today,
  });

  return { violations, manifestIssues };
}

export function main() {
  const stagedEntries = getStagedEntries();
  if (stagedEntries.length === 0) {
    return;
  }

  const { violations, manifestIssues } = evaluateDiffPolicies({
    stagedEntries,
    diffStats: getDiffStats(),
    manifestRaw: readStagedFile(POLICY_EXCEPTION_MANIFEST),
  });

  if (violations.length === 0 && manifestIssues.length === 0) {
    return;
  }

  console.error(formatFailureReport({ violations, manifestIssues }));
  process.exit(1);
}
