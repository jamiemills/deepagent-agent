import assert from "node:assert/strict";
import { test } from "vitest";

import { createTemporalClient } from "../src/temporal/client.js";

test("createTemporalClient wires address and namespace into Temporal client construction", async () => {
  const calls: Array<{ address: string }> = [];
  const config = {
    temporalAddress: "temporal.example:7233",
    temporalNamespace: "research",
  } as Parameters<typeof createTemporalClient>[0];

  class FakeClient {
    readonly options: unknown;

    constructor(options: unknown) {
      this.options = options;
    }
  }

  const client = await createTemporalClient(config, {
    connect: async (options) => {
      const address = options?.address;
      assert.equal(typeof address, "string");
      if (!address) {
        throw new Error("expected Temporal connection address");
      }
      calls.push({ address });
      return { connection: true } as never;
    },
    ClientCtor: FakeClient as never,
  });

  assert.equal(calls[0]?.address, "temporal.example:7233");
  assert.deepEqual((client as unknown as FakeClient).options, {
    connection: { connection: true },
    namespace: "research",
  });
});
