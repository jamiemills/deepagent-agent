import path from "node:path";
import { fileURLToPath } from "node:url";

import { NativeConnection, Worker } from "@temporalio/worker";
import { Effect } from "effect";

import { loadConfig } from "../config.js";
import { createActivities } from "./activities.js";

export async function createTemporalWorker(deps?: {
  config?: ReturnType<typeof loadConfig>;
  activities?: ReturnType<typeof createActivities>;
  connect?: typeof NativeConnection.connect;
  createWorker?: typeof Worker.create;
}) {
  const config = deps?.config ?? loadConfig();
  const activities = deps?.activities ?? createActivities();
  const connect = deps?.connect ?? NativeConnection.connect;
  const createWorker = deps?.createWorker ?? Worker.create;

  const connection = await connect({
    address: config.temporalAddress,
  });

  const worker = await createWorker({
    connection,
    taskQueue: config.temporalTaskQueue,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities,
  });

  return worker;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const selfPath = fileURLToPath(import.meta.url);

if (entryPath === selfPath) {
  await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const worker = await createTemporalWorker();
        await worker.run();
      },
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
    }),
  );
}
