#!/usr/bin/env bun

import { runStepSequence } from "./run-step-sequence.mjs";

runStepSequence({
  title: "Verify",
  steps: [
    { label: "Biome hygiene", script: "lint" },
    { label: "TypeScript typecheck", script: "typecheck" },
    { label: "Complexity budgets", script: "lint:complexity" },
    { label: "Semgrep policy rules", script: "lint:semgrep" },
    { label: "Vitest suite", script: "test" },
  ],
});
