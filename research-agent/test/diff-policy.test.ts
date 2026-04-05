import { expect, test } from "vitest";

import {
  MAX_CHANGED_LINES,
  evaluateDiffPolicies,
  parsePolicyManifest,
} from "../src/diff-policy.js";
import {
  makeRepoRootGitShowMap,
  makeValidGitShowMap,
  withGitHead,
  withGitShow,
} from "./diff-policy-test-helpers.js";

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
  withGitShow(makeRepoRootGitShowMap(), () => {
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
  });
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
