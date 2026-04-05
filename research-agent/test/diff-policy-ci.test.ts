import { expect, test } from "vitest";

import {
  collectDiffPolicyInputs,
  evaluateDiffPolicies,
} from "../src/diff-policy.js";
import {
  makeValidGitShowMap,
  withGitBase,
  withGitDiffOutputs,
  withGitHead,
  withGitShow,
} from "./diff-policy-test-helpers.js";

function withRangeDiffFixture(run: () => void) {
  withGitBase(
    {
      "src/core/freshness.ts": `
export function check(input: number) {
  return input > 0 ? "ok" : "no";
}
`,
    },
    () => {
      withGitHead(
        {
          "src/core/freshness.ts": `
export function check(input: number, fallback: boolean) {
  if (input > 0) {
    return "ok";
  }
  return fallback ? "fallback" : "no";
}
`,
          "policy-exceptions.json": JSON.stringify({
            version: 1,
            exceptions: [],
          }),
        },
        () => {
          withGitDiffOutputs({
            nameStatus: "M\tsrc/core/freshness.ts",
            numstat: "4\t1\tsrc/core/freshness.ts",
            run,
          });
        },
      );
    },
  );
}

test("collects PR-range diff inputs against base and head refs", () => {
  withRangeDiffFixture(() => {
    const inputs = collectDiffPolicyInputs({
      mode: "range",
      baseRef: "base-sha",
      headRef: "head-sha",
    });

    expect(inputs.stagedEntries).toEqual([
      { status: "M", path: "src/core/freshness.ts" },
    ]);
    expect(inputs.diffStats).toEqual([
      { path: "src/core/freshness.ts", added: 4, deleted: 1 },
    ]);

    const result = evaluateDiffPolicies({
      ...inputs,
      today: new Date("2026-04-05"),
    });

    expect(
      result.violations.some(
        (violation: { policy: string }) =>
          violation.policy === "complexity-regression",
      ),
    ).toBe(true);
  });
});

test("does not require an exception for the manifest self-edit path", () => {
  withGitShow(makeValidGitShowMap(), () => {
    const manifestRaw = JSON.stringify({
      version: 1,
      exceptions: [
        {
          id: "large-readme-change",
          policy: "large-diff",
          paths: ["README.md"],
          reason: "Intentional documentation rewrite.",
          expiresOn: "2026-05-01",
        },
      ],
    });

    const result = evaluateDiffPolicies({
      stagedEntries: [
        { status: "M", path: "README.md" },
        { status: "M", path: "policy-exceptions.json" },
      ],
      diffStats: [
        { path: "README.md", added: 200, deleted: 10 },
        { path: "policy-exceptions.json", added: 8, deleted: 1 },
      ],
      manifestRaw,
      today: new Date("2026-04-05"),
    });

    expect(result.manifestIssues).toEqual([]);
  });
});
