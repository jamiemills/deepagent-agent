import Fastify from "fastify";

import { createRunRecord } from "../core/research-runner.js";
import {
  researchJobRequestSchema,
  reviewRequestSchema,
} from "../core/schemas.js";
import type { ResearchJobRequest, ReviewStatus } from "../core/types.js";
import type { ArtifactStore, MetadataStore } from "../storage/interfaces.js";

export interface TemporalClientLike {
  workflow: {
    start(
      workflow: unknown,
      options: {
        workflowId: string;
        taskQueue: string;
        args: Array<{
          runId: string;
          request: ResearchJobRequest;
        }>;
      },
    ): Promise<unknown>;
    getHandle(workflowId: string): {
      cancel(): Promise<unknown>;
    };
  };
}

export async function buildServer(args: {
  metadataStore: MetadataStore;
  artifactStore: ArtifactStore;
  temporalClient: TemporalClientLike;
  taskQueue: string;
  workflow: unknown;
}) {
  const app = Fastify({
    logger: true,
  });

  app.post("/research-jobs", async (request, reply) => {
    const payload = researchJobRequestSchema.parse(request.body);
    const queued = await createRunRecord({
      request: payload satisfies ResearchJobRequest,
      executionMode: "hosted",
      metadataStore: args.metadataStore,
    });

    await args.temporalClient.workflow.start(args.workflow, {
      workflowId: queued.id,
      taskQueue: args.taskQueue,
      args: [
        {
          runId: queued.id,
          request: payload,
        },
      ],
    });

    return reply.code(202).send(queued);
  });

  app.get("/research-jobs/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const record = await args.metadataStore.getRun(params.id);
    if (!record) {
      return reply.code(404).send({ error: "Run not found." });
    }
    return record;
  });

  app.post("/research-jobs/:id/cancel", async (request, reply) => {
    const params = request.params as { id: string };
    const handle = args.temporalClient.workflow.getHandle(params.id);

    await handle.cancel();
    const updated = await args.metadataStore.updateRun(params.id, {
      status: "cancelled",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return reply.send(updated);
  });

  app.post("/research-jobs/:id/review", async (request, reply) => {
    const params = request.params as { id: string };
    const payload = reviewRequestSchema.parse(request.body);
    const reviewStatus = payload.decision as ReviewStatus;
    let status: "completed" | "awaiting_review" | undefined;
    if (reviewStatus === "approved") {
      status = "completed";
    } else if (reviewStatus === "rejected" || reviewStatus === "pending") {
      status = "awaiting_review";
    }
    const updated = await args.metadataStore.updateRun(params.id, {
      reviewStatus,
      updatedAt: new Date().toISOString(),
      ...(status ? { status } : {}),
      ...(payload.notes ? { reviewNotes: payload.notes } : {}),
    });

    return reply.send(updated);
  });

  app.get("/research-jobs/:id/artifacts/*", async (request, reply) => {
    const params = request.params as { id: string; "*": string };
    const artifactName = params["*"];

    try {
      const buffer = await args.artifactStore.readArtifact(
        params.id,
        artifactName,
      );
      if (artifactName.endsWith(".json")) {
        reply.type("application/json");
      } else if (artifactName.endsWith(".md")) {
        reply.type("text/markdown; charset=utf-8");
      } else {
        reply.type("application/octet-stream");
      }
      return reply.send(buffer);
    } catch {
      return reply.code(404).send({ error: "Artifact not found." });
    }
  });

  return app;
}
