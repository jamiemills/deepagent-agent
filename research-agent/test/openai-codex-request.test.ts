import assert from "node:assert/strict";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { test } from "vitest";

import {
  createOpenAICodexRequest,
  extractOpenAICodexInstructions,
} from "../src/openai-codex-request.js";

test("extractOpenAICodexInstructions promotes system messages into top-level instructions", () => {
  const result = extractOpenAICodexInstructions([
    new SystemMessage("System A"),
    new HumanMessage("User prompt"),
    new SystemMessage("System B"),
  ]);

  assert.equal(result.instructions, "System A\n\nSystem B");
  assert.equal(result.inputMessages.length, 1);
  assert.equal(result.inputMessages[0]?.content, "User prompt");
});

test("createOpenAICodexRequest strips system messages and forces Codex-required fields", () => {
  const request = createOpenAICodexRequest({
    messages: [
      new SystemMessage("You are a precise assistant."),
      new HumanMessage("Reply with exactly ok"),
    ],
    model: "gpt-5.2",
    zdrEnabled: false,
    invocationParams: {
      model: "gpt-5.2",
      temperature: 0,
      stream: false,
    },
  });

  assert.equal(request.instructions, "You are a precise assistant.");
  assert.equal(request.store, false);
  assert.equal(request.stream, true);
  assert.deepEqual(request.input, [
    {
      type: "message",
      role: "user",
      content: "Reply with exactly ok",
    },
  ]);
});

test("createOpenAICodexRequest falls back to default instructions when no system message is present", () => {
  const request = createOpenAICodexRequest({
    messages: [new HumanMessage("Reply with exactly ok")],
    model: "gpt-5.2",
    zdrEnabled: false,
    invocationParams: {
      model: "gpt-5.2",
      stream: false,
    },
  });

  assert.equal(request.instructions, "You are Codex.");
  assert.equal(request.stream, true);
  assert.equal(request.store, false);
});
