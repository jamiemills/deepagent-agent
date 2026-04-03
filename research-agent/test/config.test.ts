import assert from "node:assert/strict";
import { test } from "vitest";

import { getLoadedEnvPath, loadConfig } from "../src/config.js";

test("config exposes the loaded env path and required defaults", () => {
  const config = loadConfig();

  const loadedEnvPath = getLoadedEnvPath();
  assert.equal(
    loadedEnvPath === null || typeof loadedEnvPath === "string",
    true,
  );
  assert.equal(typeof config.port, "number");
  assert.equal(typeof config.researchAgentModel, "string");
});
