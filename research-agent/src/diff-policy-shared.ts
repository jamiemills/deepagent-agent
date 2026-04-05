export const POLICY_EXCEPTION_MANIFEST = "policy-exceptions.json";
export const MAX_CHANGED_LINES = 150;
export const MAX_CHANGED_FILES = 5;
export const PROTECTED_PATHS = [
  ".github/workflows/agent-policy.yml",
  "biome.json",
  "eslint.typed.config.mjs",
  "eslint.complexity.config.mjs",
  "package.json",
  ".githooks/pre-commit",
  ".githooks/pre-push",
  "scripts/check-diff-policies.mjs",
  "scripts/run-agent-policy.mjs",
  "scripts/run-step-sequence.mjs",
  "scripts/run-verify.mjs",
  "src/diff-policy.ts",
  "src/diff-policy-complexity.ts",
  "src/diff-policy-config.ts",
  "src/diff-policy-enforcement.ts",
  "src/diff-policy-manifest.ts",
  "src/diff-policy-shared.ts",
  "semgrep/rules/**",
] as const;
export const REQUIRED_VERIFY_SNIPPETS = ["bun scripts/run-verify.mjs"] as const;
export const REQUIRED_SEMGREP_RULES = [
  "semgrep/rules/no-as-any.yml",
  "semgrep/rules/no-config-weakening.yml",
  "semgrep/rules/no-domain-to-infra-imports.yml",
  "semgrep/rules/no-monkeypatching.yml",
  "semgrep/rules/no-storage-to-adapter-imports.yml",
  "semgrep/rules/no-suppression-comments.yml",
  "semgrep/rules/no-temporal-to-service-imports.yml",
  "semgrep/rules/no-tools-to-adapter-imports.yml",
  "semgrep/rules/require-boundary-validation.yml",
] as const;
export const KNOWN_POLICIES = [
  "large-diff",
  "enforcement-change",
  "config-weakening",
  "complexity-regression",
] as const;

export type Policy = (typeof KNOWN_POLICIES)[number];

export type DiffStat = {
  path: string;
  added: number;
  deleted: number;
};

export type StagedEntry = {
  status: string;
  path: string;
};

export type PolicyViolation = {
  policy: Policy;
  paths: string[];
  message: string;
};

export type PolicyException = {
  id: string;
  policy: Policy;
  paths: string[];
  reason: string;
  expiresOn: string;
};

export type PolicyManifest = {
  version: number;
  exceptions: PolicyException[];
};

export function parseNumstat(text: string): DiffStat[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [addedText = "0", deletedText = "0", ...pathParts] =
        line.split("\t");
      return {
        path: pathParts.join("\t"),
        added: addedText === "-" ? 0 : Number.parseInt(addedText, 10),
        deleted: deletedText === "-" ? 0 : Number.parseInt(deletedText, 10),
      };
    })
    .filter((entry) => Boolean(entry.path));
}

export function parseNameStatus(text: string): StagedEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status = "", ...pathParts] = line.split("\t");
      return {
        status,
        path: pathParts.at(-1) ?? "",
      };
    })
    .filter((entry) => Boolean(entry.path));
}

export function matchPolicyPath(pattern: string, filePath: string): boolean {
  if (pattern === "*" || pattern === "**") {
    return true;
  }

  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }

  return filePath === pattern;
}

export function touchesProtectedPath(filePath: string): boolean {
  return PROTECTED_PATHS.some((pattern) => matchPolicyPath(pattern, filePath));
}
