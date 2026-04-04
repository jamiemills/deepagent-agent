import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { buildResearchAgent } from "../src/agent.js";
import { loadConfig } from "../src/config.js";
import { SourceTracker } from "../src/core/source-tracker.js";

const config = (() => {
  try {
    return loadConfig();
  } catch {
    return null;
  }
})();
const liveModel = config?.researchAgentModel ?? "gemini-3.1-pro-preview";
const liveProvider = config?.researchAgentModelProvider ?? "vertex";
const runSmoke =
  process.env["RUN_DEEPAGENT_SMOKE"] === "1" &&
  Boolean(config) &&
  ((liveProvider === "openai" && Boolean(config?.openAiApiKey)) ||
    (liveProvider === "openai-codex" &&
      Boolean(config?.openAiCodexAccessToken)) ||
    (liveProvider === "anthropic" && Boolean(config?.anthropicApiKey)) ||
    (liveProvider === "vertex" &&
      Boolean(
        config?.googleApiKey ||
          config?.googleApplicationCredentials ||
          config?.googleCloudProject,
      )));

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
        modelProvider: liveProvider,
        openAiApiKey: config?.openAiApiKey,
        openAiCodexAccessToken: config?.openAiCodexAccessToken,
        openAiCodexRefreshToken: config?.openAiCodexRefreshToken,
        openAiCodexExpiresAt: config?.openAiCodexExpiresAt,
        openAiCodexAccountId: config?.openAiCodexAccountId,
        anthropicApiKey: config?.anthropicApiKey,
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
