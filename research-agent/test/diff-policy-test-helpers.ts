export const validPackageJson = JSON.stringify({
  scripts: {
    "agent-policy": "bun scripts/run-agent-policy.mjs",
    "check:fast":
      "printf 'Running Biome checks...\\n' && bunx biome check . && printf 'Running staged policy gate...\\n' && bun run policy:diff && printf 'Running ESLint complexity gate...\\n' && bun run lint:complexity",
    "lint:complexity":
      'bunx eslint --config eslint.complexity.config.mjs "src/**/*.ts" "test/**/*.ts"',
    "lint:typed":
      'bunx eslint --config eslint.typed.config.mjs "src/**/*.ts" "test/**/*.ts"',
    "lint:semgrep":
      "semgrep scan --quiet --config semgrep/rules src test biome.json eslint.complexity.config.mjs package.json tsconfig.json .githooks",
    typecheck: "bunx tsc -p tsconfig.json",
    test: "bun x --bun vitest run",
    verify: "bun scripts/run-verify.mjs",
  },
});

export const validBiomeJson = JSON.stringify({
  files: { ignore: ["node_modules", ".data", "coverage", "semgrep/rules"] },
  linter: {
    rules: {
      complexity: { all: false },
      style: { noNonNullAssertion: "error" },
      suspicious: { noExplicitAny: "error" },
    },
  },
});

export const validEslintConfig = `
{
  files: ["test/**/*.ts"],
rules: {
  complexity: ["error", 10],
  "max-lines": ["error", { max: 400 }],
  "max-lines-per-function": ["error", { max: 50 }],
  "sonarjs/cognitive-complexity": ["error", 15],
}
}
`;

export const validTypedEslintConfig = `
...tseslint.configs.recommendedTypeChecked
projectService: true
"@typescript-eslint/no-explicit-any": "off"
"@typescript-eslint/no-non-null-assertion": "off"
`;

export const validPreCommit = `
printf 'Running fast local gate...\\n'
bun run check:fast
`;

export const validPrePush = `
printf 'Running full agent policy gate...\\n'
bun run agent-policy
`;

export const validWorkflow = `
name: agent-policy
pull_request:
permissions:
  contents: read
fetch-depth: 0
bun run agent-policy
DIFF_POLICY_MODE: range
DIFF_POLICY_BASE_REF:
DIFF_POLICY_HEAD_REF:
`;

export const validTsconfig = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
  },
  include: ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
});

export const validDiffPolicyShared = `
export const MAX_CHANGED_LINES = 150;
export const MAX_CHANGED_FILES = 5;
export const PROTECTED_PATHS = [
  ".github/workflows/agent-policy.yml",
  "eslint.typed.config.mjs",
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
];
export const REQUIRED_SEMGREP_RULES = [
  "semgrep/rules/no-as-any.yml",
];
`;

export function withGitShow(
  map: Record<string, string | null>,
  run: () => void,
) {
  const original = process.env["CODEX_TEST_GIT_SHOW_MAP"];
  process.env["CODEX_TEST_GIT_SHOW_MAP"] = JSON.stringify(map);
  try {
    run();
  } finally {
    if (original === undefined) {
      process.env["CODEX_TEST_GIT_SHOW_MAP"] = undefined;
    } else {
      process.env["CODEX_TEST_GIT_SHOW_MAP"] = original;
    }
  }
}

export function withGitHead(
  map: Record<string, string | null>,
  run: () => void,
) {
  const original = process.env["CODEX_TEST_GIT_HEAD_MAP"];
  process.env["CODEX_TEST_GIT_HEAD_MAP"] = JSON.stringify(map);
  try {
    run();
  } finally {
    if (original === undefined) {
      process.env["CODEX_TEST_GIT_HEAD_MAP"] = undefined;
    } else {
      process.env["CODEX_TEST_GIT_HEAD_MAP"] = original;
    }
  }
}

export function withGitBase(
  map: Record<string, string | null>,
  run: () => void,
) {
  const original = process.env["CODEX_TEST_GIT_BASE_MAP"];
  process.env["CODEX_TEST_GIT_BASE_MAP"] = JSON.stringify(map);
  try {
    run();
  } finally {
    if (original === undefined) {
      process.env["CODEX_TEST_GIT_BASE_MAP"] = undefined;
    } else {
      process.env["CODEX_TEST_GIT_BASE_MAP"] = original;
    }
  }
}

export function withGitDiffOutputs(args: {
  nameStatus: string;
  numstat: string;
  run: () => void;
}) {
  const originalNameStatus = process.env["CODEX_TEST_GIT_DIFF_NAME_STATUS"];
  const originalNumstat = process.env["CODEX_TEST_GIT_DIFF_NUMSTAT"];
  process.env["CODEX_TEST_GIT_DIFF_NAME_STATUS"] = args.nameStatus;
  process.env["CODEX_TEST_GIT_DIFF_NUMSTAT"] = args.numstat;

  try {
    args.run();
  } finally {
    if (originalNameStatus === undefined) {
      process.env["CODEX_TEST_GIT_DIFF_NAME_STATUS"] = undefined;
    } else {
      process.env["CODEX_TEST_GIT_DIFF_NAME_STATUS"] = originalNameStatus;
    }

    if (originalNumstat === undefined) {
      process.env["CODEX_TEST_GIT_DIFF_NUMSTAT"] = undefined;
    } else {
      process.env["CODEX_TEST_GIT_DIFF_NUMSTAT"] = originalNumstat;
    }
  }
}

export function makeValidGitShowMap(overrides?: Record<string, string | null>) {
  return {
    ".github/workflows/agent-policy.yml": validWorkflow,
    "package.json": validPackageJson,
    "biome.json": validBiomeJson,
    "tsconfig.json": validTsconfig,
    "eslint.typed.config.mjs": validTypedEslintConfig,
    "eslint.complexity.config.mjs": validEslintConfig,
    "src/diff-policy-shared.ts": validDiffPolicyShared,
    "scripts/run-agent-policy.mjs": "runStepSequence({ steps: [] });",
    "scripts/run-step-sequence.mjs": "export function runStepSequence() {}",
    "scripts/run-verify.mjs": "runStepSequence({ steps: [] });",
    ".githooks/pre-commit": validPreCommit,
    ".githooks/pre-push": validPrePush,
    "semgrep/rules/no-as-any.yml": "rules: []",
    "semgrep/rules/no-config-weakening.yml": "rules: []",
    "semgrep/rules/no-domain-to-infra-imports.yml": "rules: []",
    "semgrep/rules/no-monkeypatching.yml": "rules: []",
    "semgrep/rules/no-storage-to-adapter-imports.yml": "rules: []",
    "semgrep/rules/no-suppression-comments.yml": "rules: []",
    "semgrep/rules/no-temporal-to-service-imports.yml": "rules: []",
    "semgrep/rules/no-tools-to-adapter-imports.yml": "rules: []",
    "semgrep/rules/require-boundary-validation.yml": "rules: []",
    ...overrides,
  };
}

export function makeRepoRootGitShowMap() {
  const validMap = makeValidGitShowMap();
  return makeValidGitShowMap({
    "research-agent/package.json": validMap["package.json"],
    "research-agent/biome.json": validMap["biome.json"],
    "research-agent/tsconfig.json": validMap["tsconfig.json"],
    "research-agent/eslint.typed.config.mjs":
      validMap["eslint.typed.config.mjs"],
    "research-agent/eslint.complexity.config.mjs":
      validMap["eslint.complexity.config.mjs"],
    "research-agent/src/diff-policy-shared.ts":
      validMap["src/diff-policy-shared.ts"],
    "research-agent/scripts/run-agent-policy.mjs":
      validMap["scripts/run-agent-policy.mjs"],
    "research-agent/scripts/run-step-sequence.mjs":
      validMap["scripts/run-step-sequence.mjs"],
    "research-agent/scripts/run-verify.mjs": validMap["scripts/run-verify.mjs"],
    "research-agent/.githooks/pre-commit": validMap[".githooks/pre-commit"],
    "research-agent/.githooks/pre-push": validMap[".githooks/pre-push"],
    "research-agent/semgrep/rules/no-as-any.yml":
      validMap["semgrep/rules/no-as-any.yml"],
    "research-agent/semgrep/rules/no-config-weakening.yml":
      validMap["semgrep/rules/no-config-weakening.yml"],
    "research-agent/semgrep/rules/no-domain-to-infra-imports.yml":
      validMap["semgrep/rules/no-domain-to-infra-imports.yml"],
    "research-agent/semgrep/rules/no-monkeypatching.yml":
      validMap["semgrep/rules/no-monkeypatching.yml"],
    "research-agent/semgrep/rules/no-storage-to-adapter-imports.yml":
      validMap["semgrep/rules/no-storage-to-adapter-imports.yml"],
    "research-agent/semgrep/rules/no-suppression-comments.yml":
      validMap["semgrep/rules/no-suppression-comments.yml"],
    "research-agent/semgrep/rules/no-temporal-to-service-imports.yml":
      validMap["semgrep/rules/no-temporal-to-service-imports.yml"],
    "research-agent/semgrep/rules/no-tools-to-adapter-imports.yml":
      validMap["semgrep/rules/no-tools-to-adapter-imports.yml"],
    "research-agent/semgrep/rules/require-boundary-validation.yml":
      validMap["semgrep/rules/require-boundary-validation.yml"],
  });
}
