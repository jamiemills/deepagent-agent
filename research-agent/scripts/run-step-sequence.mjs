#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { EOL } from "node:os";

function getSummaryPath() {
  const path = process.env["GITHUB_STEP_SUMMARY"];
  return typeof path === "string" && path.length > 0 ? path : null;
}

function appendSummary(lines) {
  const summaryPath = getSummaryPath();
  if (!summaryPath) {
    return;
  }

  appendFileSync(summaryPath, `${lines.join(EOL)}${EOL}${EOL}`, "utf8");
}

function printHeader(label) {
  process.stdout.write(`${label}${EOL}`);
}

function printStepHeading(label) {
  process.stdout.write(`==> ${label}${EOL}`);
}

function runScript(script) {
  return spawnSync(process.execPath, ["run", script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function emitOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function formatStatusEmoji(status) {
  return status === "passed" ? "✅" : "❌";
}

export function runStepSequence({ title, steps }) {
  printHeader(title);
  const results = [];

  for (const step of steps) {
    printStepHeading(step.label);
    const result = runScript(step.script);
    emitOutput(result);

    const status = result.status === 0 ? "passed" : "failed";
    results.push({
      label: step.label,
      script: step.script,
      status,
      code: result.status ?? 1,
    });

    if (status === "failed") {
      appendSummary([
        `## ${title}`,
        "",
        ...results.map(
          (entry) =>
            `- ${formatStatusEmoji(entry.status)} \`${entry.script}\` (${entry.label})`,
        ),
        "",
        `Failure: \`${step.script}\``,
      ]);
      process.exit(result.status ?? 1);
    }
  }

  appendSummary([
    `## ${title}`,
    "",
    ...results.map(
      (entry) =>
        `- ${formatStatusEmoji(entry.status)} \`${entry.script}\` (${entry.label})`,
    ),
  ]);
}
