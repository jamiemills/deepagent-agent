#!/usr/bin/env bun

import { runStepSequence } from "./run-step-sequence.mjs";

runStepSequence({
  title: "Agent Policy",
  steps: [
    { label: "Diff policy", script: "policy:diff" },
    { label: "Deterministic verification", script: "verify" },
    { label: "Typed linting", script: "lint:typed" },
  ],
});
