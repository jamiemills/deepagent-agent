import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { test } from "vitest";

import { runCliCommand, withTempDir } from "./integration-helpers.js";

const runLiveCliLocal =
  process.env["RUN_LIVE_CLI_LOCAL_TEST"] === "1" &&
  Boolean(
    process.env["OPENAI_API_KEY"] ||
      process.env["OPENAI_ACCESS_TOKEN"] ||
      process.env["ANTHROPIC_API_KEY"] ||
      process.env["GOOGLE_API_KEY"] ||
      process.env["GOOGLE_APPLICATION_CREDENTIALS"] ||
      process.env["GOOGLE_CLOUD_PROJECT"],
  );

(runLiveCliLocal ? test : test.skip)(
  "spawned CLI local mode can execute a real research run with live model credentials",
  async () => {
    await withTempDir(async (dir) => {
      const result = await runCliCommand(
        [
          "local",
          "Write a minimal markdown report to /out/final-report.md that says 'cli local smoke ok', write an empty JSON array to /out/claim-ledger.json, and do not browse the web.",
        ],
        {
          DATA_DIR: dir,
          RESEARCH_AGENT_MODEL:
            process.env["RESEARCH_AGENT_MODEL"] ?? "gemini-3.1-pro-preview",
        },
      );

      const record = JSON.parse(result.stdout) as {
        id: string;
        status: string;
        artifactPointers: { report?: string };
      };

      assert.equal(record.status, "completed");
      assert.ok(record.artifactPointers.report);

      const reportPath = path.join(dir, "artifacts", record.id, "report.md");
      const report = await fs.readFile(reportPath, "utf8");
      assert.match(report.toLowerCase(), /cli local smoke ok/);
    });
  },
  120_000,
);
