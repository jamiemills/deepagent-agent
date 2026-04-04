import {
  REQUIRED_SEMGREP_RULES,
  REQUIRED_VERIFY_SNIPPETS,
  type StagedEntry,
} from "./diff-policy-shared.js";

function ensureRequiredRulesExist(
  readStagedFile: (path: string) => string | null,
) {
  return REQUIRED_SEMGREP_RULES.filter((path) => !readStagedFile(path));
}

function parseJsonFile(
  path: string,
  readStagedFile: (path: string) => string | null,
): unknown {
  const raw = readStagedFile(path);
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const packageJson = parseJsonFile("package.json", readStagedFile) as {
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

  return ["bun run policy:diff", "bun run verify", "bun run lint:typed"]
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const biomeJson = parseJsonFile("biome.json", readStagedFile) as {
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const eslintConfig = readStagedFile("eslint.complexity.config.mjs");
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const typedConfig = readStagedFile("eslint.typed.config.mjs");
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const diffPolicyShared = readStagedFile("src/diff-policy-shared.ts");
  if (!diffPolicyShared) {
    return ["src/diff-policy-shared.ts is missing from the staged tree."];
  }

  const issues: string[] = [];
  for (const snippet of [
    "export const MAX_CHANGED_LINES = 150;",
    "export const MAX_CHANGED_FILES = 5;",
    '"scripts/check-diff-policies.mjs"',
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const tsconfigJson = parseJsonFile("tsconfig.json", readStagedFile) as {
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
  readStagedFile: (path: string) => string | null,
): string[] {
  const prePush = readStagedFile(".githooks/pre-push");
  if (!prePush) {
    return [".githooks/pre-push is missing from the staged tree."];
  }

  return ["bun run agent-policy"]
    .filter((snippet) => !prePush.includes(snippet))
    .map((snippet) => `pre-push hook must include "${snippet}".`);
}

function getWorkflowWeakeningIssues(
  readStagedFile: (path: string) => string | null,
): string[] {
  const workflow = readStagedFile(".github/workflows/agent-policy.yml");
  if (!workflow) {
    return [
      ".github/workflows/agent-policy.yml is missing from the staged tree.",
    ];
  }

  return [
    "name: agent-policy",
    "bun run agent-policy",
    "pull_request:",
    "push:",
  ]
    .filter((snippet) => !workflow.includes(snippet))
    .map(
      (snippet) =>
        `.github/workflows/agent-policy.yml must include "${snippet}".`,
    );
}

function getPreCommitWeakeningIssues(
  readStagedFile: (path: string) => string | null,
): string[] {
  const preCommit = readStagedFile(".githooks/pre-commit");
  if (!preCommit) {
    return [".githooks/pre-commit is missing from the staged tree."];
  }

  return ["bun run check:fast"]
    .filter((snippet) => !preCommit.includes(snippet))
    .map((snippet) => `pre-commit hook must include "${snippet}".`);
}

export function collectConfigWeakeningIssues(args: {
  stagedEntries: StagedEntry[];
  readStagedFile: (path: string) => string | null;
}) {
  const ruleDeletions = args.stagedEntries
    .filter(
      (entry) =>
        entry.status.startsWith("D") && entry.path.startsWith("semgrep/rules/"),
    )
    .map((entry) => entry.path);
  const missingRequiredRules = ensureRequiredRulesExist(args.readStagedFile);
  const issues = [
    ...getPackageWeakeningIssues(args.readStagedFile),
    ...getBiomeWeakeningIssues(args.readStagedFile),
    ...getEslintWeakeningIssues(args.readStagedFile),
    ...getTypedEslintWeakeningIssues(args.readStagedFile),
    ...getDiffPolicyWeakeningIssues(args.readStagedFile),
    ...getTsconfigWeakeningIssues(args.readStagedFile),
    ...getPreCommitWeakeningIssues(args.readStagedFile),
    ...getPrePushWeakeningIssues(args.readStagedFile),
    ...getWorkflowWeakeningIssues(args.readStagedFile),
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
