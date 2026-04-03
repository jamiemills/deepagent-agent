import path from "node:path";

import { Effect } from "effect";

import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { FileArtifactStore } from "../storage/file-artifact-store.js";
import { FileMetadataStore } from "../storage/file-metadata-store.js";
import { createTemporalClient } from "../temporal/client.js";
import { researchJobWorkflow } from "../temporal/workflows.js";
import { buildServer } from "./server.js";

export async function createServiceApp(deps?: {
  config?: ReturnType<typeof loadConfig>;
  metadataStore?: FileMetadataStore;
  artifactStore?: FileArtifactStore;
  temporalClient?: Awaited<ReturnType<typeof createTemporalClient>>;
}) {
  const config = deps?.config ?? loadConfig();
  const metadataStore =
    deps?.metadataStore ??
    new FileMetadataStore(path.join(config.dataDir, "metadata"));
  const artifactStore =
    deps?.artifactStore ??
    new FileArtifactStore(path.join(config.dataDir, "artifacts"));
  const temporalClient =
    deps?.temporalClient ?? (await createTemporalClient(config));

  const app = await buildServer({
    metadataStore,
    artifactStore,
    temporalClient,
    taskQueue: config.temporalTaskQueue,
    workflow: researchJobWorkflow,
  });

  return { app, config };
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const selfPath = fileURLToPath(import.meta.url);

if (entryPath === selfPath) {
  await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const { app, config } = await createServiceApp();
        await app.listen({
          port: config.port,
          host: "0.0.0.0",
        });
      },
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
    }),
  );
}
