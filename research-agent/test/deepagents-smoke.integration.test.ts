import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildResearchAgent } from "../src/agent.js";
import { SourceTracker } from "../src/core/source-tracker.js";

const liveModel =
  process.env["RESEARCH_AGENT_MODEL"] ?? "gemini-3.1-pro-preview";
const runSmoke =
  process.env["RUN_DEEPAGENT_SMOKE"] === "1" &&
  Boolean(
    process.env["GOOGLE_API_KEY"] ||
      process.env["GOOGLE_APPLICATION_CREDENTIALS"] ||
      process.env["GOOGLE_CLOUD_PROJECT"],
  );

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "research-agent-smoke-"));
  try {
    await fs.mkdir(path.join(dir, "notes"), { recursive: true });
    await fs.mkdir(path.join(dir, "out"), { recursive: true });
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

(runSmoke ? test : test.skip)(
  "Deep Agents smoke run can invoke the real agent graph with installed deps and model credentials",
  async () => {
    await withTempDir(async (dir) => {
      const tracker = new SourceTracker();
      const agent = await buildResearchAgent({
        workspaceRoot: dir,
        sourceTracker: tracker,
        model: liveModel,
      });

      const result = await agent.invoke(
        {
          messages: [
            {
              role: "user",
              content:
                "Write a minimal markdown file to /out/final-report.md that says 'smoke test ok', and write an empty JSON array to /out/claim-ledger.json. Do not browse the web.",
            },
          ],
        },
        {
          recursionLimit: 40,
        },
      );

      assert.ok(Array.isArray(result.messages));
      const report = await fs.readFile(
        path.join(dir, "out", "final-report.md"),
        "utf8",
      );
      assert.match(report.toLowerCase(), /smoke test ok/);
    });
  },
  120_000,
);
