import { expect, test } from "vitest";

import {
  MAX_CHANGED_LINES,
  evaluateDiffPolicies,
  parsePolicyManifest,
} from "../src/diff-policy.js";

const validPackageJson = JSON.stringify({
  scripts: {
    "agent-policy":
      "bun run policy:diff && bun run verify && bun run lint:typed",
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
    verify:
      "printf 'Running Biome checks...\\n' && bunx biome check . && printf 'Running typecheck...\\n' && bun run typecheck && printf 'Running ESLint complexity gate...\\n' && bun run lint:complexity && printf 'Running Semgrep rule pack...\\n' && bun run lint:semgrep && printf 'Running test suite...\\n' && bun run test",
  },
});

const validBiomeJson = JSON.stringify({
  files: { ignore: ["node_modules", ".data", "coverage", "semgrep/rules"] },
  linter: {
    rules: {
      complexity: { all: false },
      style: { noNonNullAssertion: "error" },
      suspicious: { noExplicitAny: "error" },
    },
  },
});

const validEslintConfig = `
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

const validTypedEslintConfig = `
...tseslint.configs.recommendedTypeChecked
projectService: true
"@typescript-eslint/no-explicit-any": "off"
"@typescript-eslint/no-non-null-assertion": "off"
`;

const validPreCommit = `
printf 'Running fast local gate...\\n'
bun run check:fast
`;

const validPrePush = `
printf 'Running full agent policy gate...\\n'
bun run agent-policy
`;

const validWorkflow = `
name: agent-policy
pull_request:
push:
- main
bun run agent-policy
`;

const validTsconfig = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
  },
  include: ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
});

const validDiffPolicyShared = `
export const MAX_CHANGED_LINES = 150;
export const MAX_CHANGED_FILES = 5;
export const PROTECTED_PATHS = [
  ".github/workflows/agent-policy.yml",
  "eslint.typed.config.mjs",
  ".githooks/pre-push",
  "scripts/check-diff-policies.mjs",
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

function withGitShow(map: Record<string, string | null>, run: () => void) {
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

function withGitHead(map: Record<string, string | null>, run: () => void) {
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

function makeValidGitShowMap(overrides?: Record<string, string | null>) {
  return {
    ".github/workflows/agent-policy.yml": validWorkflow,
    "package.json": validPackageJson,
    "biome.json": validBiomeJson,
    "tsconfig.json": validTsconfig,
    "eslint.typed.config.mjs": validTypedEslintConfig,
    "eslint.complexity.config.mjs": validEslintConfig,
    "src/diff-policy-shared.ts": validDiffPolicyShared,
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

test("accepts a small diff when enforcement files remain strong", () => {
  withGitShow(makeValidGitShowMap(), () => {
    const result = evaluateDiffPolicies({
      stagedEntries: [{ status: "M", path: "src/core/freshness.ts" }],
      diffStats: [{ path: "src/core/freshness.ts", added: 10, deleted: 4 }],
      manifestRaw: null,
      today: new Date("2026-04-04"),
    });

    expect(result.violations).toEqual([]);
    expect(result.manifestIssues).toEqual([]);
  });
});

test("normalizes repo-root staged paths for research-agent files", () => {
  withGitShow(
    makeValidGitShowMap({
      "research-agent/package.json": validPackageJson,
      "research-agent/biome.json": validBiomeJson,
      "research-agent/tsconfig.json": validTsconfig,
      "research-agent/eslint.typed.config.mjs": validTypedEslintConfig,
      "research-agent/eslint.complexity.config.mjs": validEslintConfig,
      "research-agent/src/diff-policy-shared.ts": validDiffPolicyShared,
      "research-agent/.githooks/pre-commit": validPreCommit,
      "research-agent/.githooks/pre-push": validPrePush,
      "research-agent/semgrep/rules/no-as-any.yml": "rules: []",
      "research-agent/semgrep/rules/no-config-weakening.yml": "rules: []",
      "research-agent/semgrep/rules/no-domain-to-infra-imports.yml":
        "rules: []",
      "research-agent/semgrep/rules/no-monkeypatching.yml": "rules: []",
      "research-agent/semgrep/rules/no-storage-to-adapter-imports.yml":
        "rules: []",
      "research-agent/semgrep/rules/no-suppression-comments.yml": "rules: []",
      "research-agent/semgrep/rules/no-temporal-to-service-imports.yml":
        "rules: []",
      "research-agent/semgrep/rules/no-tools-to-adapter-imports.yml":
        "rules: []",
      "research-agent/semgrep/rules/require-boundary-validation.yml":
        "rules: []",
    }),
    () => {
      const result = evaluateDiffPolicies({
        stagedEntries: [{ status: "M", path: "research-agent/package.json" }],
        diffStats: [
          { path: "research-agent/package.json", added: 1, deleted: 0 },
        ],
        manifestRaw: null,
        today: new Date("2026-04-04"),
      });

      expect(result.violations).toEqual([]);
      expect(result.manifestIssues).toEqual([]);
    },
  );
});

test("rejects a large diff without an exception", () => {
  withGitShow(makeValidGitShowMap(), () => {
    const result = evaluateDiffPolicies({
      stagedEntries: [{ status: "M", path: "src/core/research-runner.ts" }],
      diffStats: [
        {
          path: "src/core/research-runner.ts",
          added: MAX_CHANGED_LINES,
          deleted: 1,
        },
      ],
      manifestRaw: null,
      today: new Date("2026-04-04"),
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.policy).toBe("large-diff");
    expect(result.manifestIssues).toContain(
      'Policy "large-diff" requires an exception for: src/core/research-runner.ts.',
    );
  });
});

test("rejects config weakening when verify loses required checks", () => {
  withGitShow(
    makeValidGitShowMap({
      "package.json": JSON.stringify({
        scripts: {
          "lint:complexity": "bunx eslint",
          "lint:semgrep": "semgrep scan --quiet --config semgrep/rules src",
          typecheck: "bunx tsc -p tsconfig.json",
          test: "bun x --bun vitest run",
          verify: "bun run lint:complexity && bun run test",
        },
      }),
    }),
    () => {
      const result = evaluateDiffPolicies({
        stagedEntries: [{ status: "M", path: "package.json" }],
        diffStats: [{ path: "package.json", added: 3, deleted: 2 }],
        manifestRaw: null,
        today: new Date("2026-04-04"),
      });

      expect(
        result.violations.some(
          (violation: { policy: string }) =>
            violation.policy === "config-weakening",
        ),
      ).toBe(true);
    },
  );
});

test("requires enforcement-change exceptions for protected paths", () => {
  withGitShow(makeValidGitShowMap(), () => {
    const manifestRaw = JSON.stringify({
      version: 1,
      exceptions: [
        {
          id: "enforcement-change-1",
          policy: "enforcement-change",
          paths: ["package.json"],
          reason: "Intentional enforcement edit.",
          expiresOn: "2026-05-01",
        },
      ],
    });

    const result = evaluateDiffPolicies({
      stagedEntries: [{ status: "M", path: "package.json" }],
      diffStats: [{ path: "package.json", added: 2, deleted: 2 }],
      manifestRaw,
      today: new Date("2026-04-04"),
    });

    expect(result.manifestIssues).toEqual([]);
  });
});

test("rejects invalid or unused exceptions", () => {
  const manifest = parsePolicyManifest(
    JSON.stringify({
      version: 1,
      exceptions: [
        {
          id: "expired-large-diff",
          policy: "large-diff",
          paths: ["src/**"],
          reason: "Too old",
          expiresOn: "2026-01-01",
        },
      ],
    }),
  );

  expect(manifest.exceptions).toHaveLength(1);

  withGitShow(makeValidGitShowMap(), () => {
    const result = evaluateDiffPolicies({
      stagedEntries: [{ status: "M", path: "src/core/freshness.ts" }],
      diffStats: [{ path: "src/core/freshness.ts", added: 1, deleted: 1 }],
      manifestRaw: JSON.stringify(manifest),
      today: new Date("2026-04-04"),
    });

    expect(result.manifestIssues).toContain(
      'Exception "expired-large-diff" expired on 2026-01-01.',
    );
    expect(result.manifestIssues).toContain(
      'Exception "expired-large-diff" is unused for the current staged diff.',
    );
  });
});

test("rejects config weakening when tsconfig enables skipLibCheck", () => {
  withGitShow(
    makeValidGitShowMap({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { skipLibCheck: true },
      }),
    }),
    () => {
      const result = evaluateDiffPolicies({
        stagedEntries: [{ status: "M", path: "tsconfig.json" }],
        diffStats: [{ path: "tsconfig.json", added: 1, deleted: 1 }],
        manifestRaw: null,
        today: new Date("2026-04-04"),
      });

      expect(
        result.violations.some(
          (violation: { policy: string }) =>
            violation.policy === "config-weakening",
        ),
      ).toBe(true);
    },
  );
});

test("rejects staged complexity regression on touched TypeScript files", () => {
  withGitHead(
    {
      "src/core/freshness.ts": `
export function check(input: number) {
  if (input > 0) {
    return "ok";
  }
  return "no";
}
`,
    },
    () => {
      withGitShow(
        makeValidGitShowMap({
          "src/core/freshness.ts": `
export function check(input: number, fallback: boolean) {
  if (input > 0) {
    return "ok";
  }
  if (fallback) {
    return "fallback";
  }
  return "no";
}
`,
        }),
        () => {
          const result = evaluateDiffPolicies({
            stagedEntries: [{ status: "M", path: "src/core/freshness.ts" }],
            diffStats: [
              { path: "src/core/freshness.ts", added: 4, deleted: 1 },
            ],
            manifestRaw: null,
            today: new Date("2026-04-04"),
          });

          expect(
            result.violations.some(
              (violation: { policy: string }) =>
                violation.policy === "complexity-regression",
            ),
          ).toBe(true);
        },
      );
    },
  );
});
