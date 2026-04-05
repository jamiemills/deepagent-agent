import {
  REQUIRED_SEMGREP_RULES,
  REQUIRED_VERIFY_SNIPPETS,
  type StagedEntry,
} from "./diff-policy-shared.js";

function ensureRequiredRulesExist(
  readCurrentFile: (path: string) => string | null,
) {
  return REQUIRED_SEMGREP_RULES.filter((path) => !readCurrentFile(path));
}

function parseJsonFile(
  path: string,
  readCurrentFile: (path: string) => string | null,
): unknown {
  const raw = readCurrentFile(path);
  return raw ? (JSON.parse(raw) as unknown) : null;
}

function getMissingScriptIssues(scripts: Record<string, string>): string[] {
  const issues: string[] = [];
  for (const name of [
    "agent-policy",
    "check:fast",
    "lint:complexity",
    "lint:typed",
    "lint:semgrep",
    "typecheck",
    "test",
    "verify",
  ]) {
    if (typeof scripts[name] !== "string" || !scripts[name].trim()) {
      issues.push(`package.json must define a non-empty "${name}" script.`);
    }
  }
  return issues;
}

function getVerifyScriptIssues(verify: string | undefined): string[] {
  if (typeof verify !== "string") {
    return [];
  }

  const issues: string[] = [];
  let lastIndex = -1;
  for (const snippet of REQUIRED_VERIFY_SNIPPETS) {
    const nextIndex = verify.indexOf(snippet);
    if (nextIndex === -1) {
      issues.push(`verify script must include "${snippet}".`);
      continue;
    }
    if (nextIndex < lastIndex) {
      issues.push(
        `verify script must keep analyzer order: ${REQUIRED_VERIFY_SNIPPETS.join(
          " -> ",
        )}.`,
      );
      break;
    }
    lastIndex = nextIndex;
  }

  return issues;
}

function getLintSemgrepIssues(lintSemgrep: string | undefined): string[] {
  if (typeof lintSemgrep !== "string") {
    return [];
  }

  return ["semgrep scan", "semgrep/rules", "biome.json", ".githooks"]
    .filter((snippet) => !lintSemgrep.includes(snippet))
    .map((snippet) => `lint:semgrep must include "${snippet}".`);
}

function getPackageWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const packageJson = parseJsonFile("package.json", readCurrentFile) as {
    scripts?: Record<string, string>;
  } | null;
  if (!packageJson) {
    return ["package.json is missing from the staged tree."];
  }

  const scripts = packageJson.scripts ?? {};
  return [
    ...getMissingScriptIssues(scripts),
    ...getAgentPolicyScriptIssues(scripts["agent-policy"]),
    ...getFastLaneIssues(scripts["check:fast"]),
    ...getTypedLintIssues(scripts["lint:typed"]),
    ...getVerifyScriptIssues(scripts["verify"]),
    ...getLintSemgrepIssues(scripts["lint:semgrep"]),
  ];
}

function getAgentPolicyScriptIssues(agentPolicy: string | undefined): string[] {
  if (typeof agentPolicy !== "string") {
    return [];
  }

  return ["bun scripts/run-agent-policy.mjs"]
    .filter((snippet) => !agentPolicy.includes(snippet))
    .map((snippet) => `agent-policy must include "${snippet}".`);
}

function getFastLaneIssues(checkFast: string | undefined): string[] {
  if (typeof checkFast !== "string") {
    return [];
  }

  return [
    "bunx biome check .",
    "bun run policy:diff",
    "bun run lint:complexity",
  ]
    .filter((snippet) => !checkFast.includes(snippet))
    .map((snippet) => `check:fast must include "${snippet}".`);
}

function getTypedLintIssues(lintTyped: string | undefined): string[] {
  if (typeof lintTyped !== "string") {
    return [];
  }

  return ["eslint.typed.config.mjs", '"src/**/*.ts"', '"test/**/*.ts"']
    .filter((snippet) => !lintTyped.includes(snippet))
    .map((snippet) => `lint:typed must include "${snippet}".`);
}

function getBiomeWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const biomeJson = parseJsonFile("biome.json", readCurrentFile) as {
    files?: { ignore?: string[] };
    linter?: {
      rules?: {
        complexity?: { all?: boolean };
        style?: { noNonNullAssertion?: string };
        suspicious?: { noExplicitAny?: string };
      };
    };
  } | null;
  if (!biomeJson) {
    return ["biome.json is missing from the staged tree."];
  }

  return [
    getBiomeIgnoreIssue(biomeJson),
    getBiomeComplexityIssue(biomeJson),
    getBiomeExplicitAnyIssue(biomeJson),
    getBiomeNonNullAssertionIssue(biomeJson),
  ].filter((issue): issue is string => issue !== null);
}

function getBiomeIgnoreIssue(biomeJson: {
  files?: { ignore?: string[] };
}) {
  return (biomeJson.files?.ignore ?? []).includes("semgrep/rules")
    ? null
    : 'biome.json must ignore "semgrep/rules".';
}

function getBiomeComplexityIssue(biomeJson: {
  linter?: { rules?: { complexity?: { all?: boolean } } };
}) {
  return biomeJson.linter?.rules?.complexity?.all === false
    ? null
    : "biome.json must leave the complexity rule group disabled.";
}

function getBiomeExplicitAnyIssue(biomeJson: {
  linter?: { rules?: { suspicious?: { noExplicitAny?: string } } };
}) {
  return biomeJson.linter?.rules?.suspicious?.noExplicitAny === "error"
    ? null
    : 'biome.json must keep suspicious.noExplicitAny set to "error".';
}

function getBiomeNonNullAssertionIssue(biomeJson: {
  linter?: { rules?: { style?: { noNonNullAssertion?: string } } };
}) {
  return biomeJson.linter?.rules?.style?.noNonNullAssertion === "error"
    ? null
    : 'biome.json must keep style.noNonNullAssertion set to "error".';
}

function getEslintWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const eslintConfig = readCurrentFile("eslint.complexity.config.mjs");
  if (!eslintConfig) {
    return ["eslint.complexity.config.mjs is missing from the staged tree."];
  }

  const issues: string[] = [];
  for (const snippet of [
    'complexity: ["error", 10]',
    '"max-lines"',
    "max: 400",
    '"max-lines-per-function"',
    "max: 50",
    '"sonarjs/cognitive-complexity": ["error", 15]',
  ]) {
    if (!eslintConfig.includes(snippet)) {
      issues.push(`eslint.complexity.config.mjs must include "${snippet}".`);
    }
  }
  if (!eslintConfig.includes('files: ["test/**/*.ts"]')) {
    issues.push(
      "eslint.complexity.config.mjs must define a test/**/*.ts block.",
    );
  }
  if (eslintConfig.includes("vitest.config.ts")) {
    issues.push(
      "eslint.complexity.config.mjs must not include vitest.config.ts in the complexity scope.",
    );
  }
  return issues;
}

function getTypedEslintWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const typedConfig = readCurrentFile("eslint.typed.config.mjs");
  if (!typedConfig) {
    return ["eslint.typed.config.mjs is missing from the staged tree."];
  }

  return [
    "recommendedTypeChecked",
    "projectService: true",
    '"@typescript-eslint/no-explicit-any": "off"',
    '"@typescript-eslint/no-non-null-assertion": "off"',
  ]
    .filter((snippet) => !typedConfig.includes(snippet))
    .map((snippet) => `eslint.typed.config.mjs must include "${snippet}".`);
}

function getDiffPolicyWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const diffPolicyShared = readCurrentFile("src/diff-policy-shared.ts");
  if (!diffPolicyShared) {
    return ["src/diff-policy-shared.ts is missing from the staged tree."];
  }

  const issues: string[] = [];
  for (const snippet of [
    "export const MAX_CHANGED_LINES = 150;",
    "export const MAX_CHANGED_FILES = 5;",
    '"scripts/check-diff-policies.mjs"',
    '"scripts/run-agent-policy.mjs"',
    '"scripts/run-step-sequence.mjs"',
    '"scripts/run-verify.mjs"',
    '"src/diff-policy.ts"',
    '"src/diff-policy-complexity.ts"',
    '"src/diff-policy-config.ts"',
    '"src/diff-policy-enforcement.ts"',
    '"src/diff-policy-manifest.ts"',
    '"src/diff-policy-shared.ts"',
    '"semgrep/rules/no-as-any.yml"',
  ]) {
    if (!diffPolicyShared.includes(snippet)) {
      issues.push(`src/diff-policy-shared.ts must include "${snippet}".`);
    }
  }

  return issues;
}

function getTsconfigWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const tsconfigJson = parseJsonFile("tsconfig.json", readCurrentFile) as {
    compilerOptions?: { skipLibCheck?: boolean };
  } | null;
  if (!tsconfigJson) {
    return ["tsconfig.json is missing from the staged tree."];
  }

  return tsconfigJson.compilerOptions?.skipLibCheck === true
    ? ['tsconfig.json must not enable "skipLibCheck".']
    : [];
}

function getPrePushWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const prePush = readCurrentFile(".githooks/pre-push");
  if (!prePush) {
    return [".githooks/pre-push is missing from the staged tree."];
  }

  return ["bun run agent-policy"]
    .filter((snippet) => !prePush.includes(snippet))
    .map((snippet) => `pre-push hook must include "${snippet}".`);
}

function getWorkflowWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const workflow = readCurrentFile(".github/workflows/agent-policy.yml");
  if (!workflow) {
    return [
      ".github/workflows/agent-policy.yml is missing from the staged tree.",
    ];
  }

  const issues = [
    "name: agent-policy",
    "fetch-depth: 0",
    "permissions:",
    "contents: read",
    "bun run agent-policy",
    "pull_request:",
    "DIFF_POLICY_MODE: range",
    "DIFF_POLICY_BASE_REF:",
    "DIFF_POLICY_HEAD_REF:",
  ]
    .filter((snippet) => !workflow.includes(snippet))
    .map(
      (snippet) =>
        `.github/workflows/agent-policy.yml must include "${snippet}".`,
    );

  if (workflow.includes("push:")) {
    issues.push(
      ".github/workflows/agent-policy.yml must not trigger the required gate on push.",
    );
  }

  return issues;
}

function getPreCommitWeakeningIssues(
  readCurrentFile: (path: string) => string | null,
): string[] {
  const preCommit = readCurrentFile(".githooks/pre-commit");
  if (!preCommit) {
    return [".githooks/pre-commit is missing from the staged tree."];
  }

  return ["bun run check:fast"]
    .filter((snippet) => !preCommit.includes(snippet))
    .map((snippet) => `pre-commit hook must include "${snippet}".`);
}

export function collectConfigWeakeningIssues(args: {
  stagedEntries: StagedEntry[];
  readCurrentFile: (path: string) => string | null;
}) {
  const ruleDeletions = args.stagedEntries
    .filter(
      (entry) =>
        entry.status.startsWith("D") && entry.path.startsWith("semgrep/rules/"),
    )
    .map((entry) => entry.path);
  const missingRequiredRules = ensureRequiredRulesExist(args.readCurrentFile);
  const issues = [
    ...getPackageWeakeningIssues(args.readCurrentFile),
    ...getBiomeWeakeningIssues(args.readCurrentFile),
    ...getEslintWeakeningIssues(args.readCurrentFile),
    ...getTypedEslintWeakeningIssues(args.readCurrentFile),
    ...getDiffPolicyWeakeningIssues(args.readCurrentFile),
    ...getTsconfigWeakeningIssues(args.readCurrentFile),
    ...getPreCommitWeakeningIssues(args.readCurrentFile),
    ...getPrePushWeakeningIssues(args.readCurrentFile),
    ...getWorkflowWeakeningIssues(args.readCurrentFile),
    ...ruleDeletions.map(
      (path) => `Deleting Semgrep rule file ${path} weakens enforcement.`,
    ),
    ...missingRequiredRules.map(
      (path) =>
        `Required Semgrep rule ${path} is missing from the staged tree.`,
    ),
  ];

  return { issues, ruleDeletions, missingRequiredRules };
}
