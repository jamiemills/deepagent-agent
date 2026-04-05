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

  registerRoutes(app, args);

  return app;
}

function registerRoutes(
  app: Awaited<ReturnType<typeof Fastify>>,
  args: {
    metadataStore: MetadataStore;
    artifactStore: ArtifactStore;
    temporalClient: TemporalClientLike;
    taskQueue: string;
    workflow: unknown;
  },
) {
  app.post("/research-jobs", createJobHandler(args));
  app.get("/research-jobs/:id", getJobHandler(args));
  app.post("/research-jobs/:id/cancel", cancelJobHandler(args));
  app.post("/research-jobs/:id/review", reviewJobHandler(args));
  app.get("/research-jobs/:id/artifacts/*", getArtifactHandler(args));
}

function createJobHandler(args: {
  metadataStore: MetadataStore;
  temporalClient: TemporalClientLike;
  taskQueue: string;
  workflow: unknown;
}) {
  return async function createJob(
    request: { body: unknown },
    reply: { code(status: number): { send(payload: unknown): unknown } },
  ) {
    const payload = researchJobRequestSchema.parse(request.body);
    const queued = await createRunRecord({
      request: payload satisfies ResearchJobRequest,
      executionMode: "hosted",
      metadataStore: args.metadataStore,
    });

    await args.temporalClient.workflow.start(args.workflow, {
      workflowId: queued.id,
      taskQueue: args.taskQueue,
      args: [{ runId: queued.id, request: payload }],
    });

    return reply.code(202).send(queued);
  };
}

function getJobHandler(args: { metadataStore: MetadataStore }) {
  return async function getJob(
    request: { params: { id: string } },
    reply: { code(status: number): { send(payload: unknown): unknown } },
  ) {
    const record = await args.metadataStore.getRun(request.params.id);
    if (!record) {
      return reply.code(404).send({ error: "Run not found." });
    }
    return record;
  };
}

function cancelJobHandler(args: {
  metadataStore: MetadataStore;
  temporalClient: TemporalClientLike;
}) {
  return async function cancelJob(
    request: { params: { id: string } },
    reply: { send(payload: unknown): unknown },
  ) {
    const handle = args.temporalClient.workflow.getHandle(request.params.id);

    await handle.cancel();
    const updated = await args.metadataStore.updateRun(request.params.id, {
      status: "cancelled",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return reply.send(updated);
  };
}

function resolveReviewedStatus(reviewStatus: ReviewStatus) {
  if (reviewStatus === "approved") {
    return "completed";
  }

  if (reviewStatus === "rejected" || reviewStatus === "pending") {
    return "awaiting_review";
  }

  return undefined;
}

function reviewJobHandler(args: { metadataStore: MetadataStore }) {
  return async function reviewJob(
    request: { params: { id: string }; body: unknown },
    reply: { send(payload: unknown): unknown },
  ) {
    const payload = reviewRequestSchema.parse(request.body);
    const reviewStatus = payload.decision as ReviewStatus;
    const status = resolveReviewedStatus(reviewStatus);
    const updated = await args.metadataStore.updateRun(request.params.id, {
      reviewStatus,
      updatedAt: new Date().toISOString(),
      ...(status ? { status } : {}),
      ...(payload.notes ? { reviewNotes: payload.notes } : {}),
    });

    return reply.send(updated);
  };
}

function getContentType(artifactName: string) {
  if (artifactName.endsWith(".json")) {
    return "application/json";
  }

  if (artifactName.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }

  return "application/octet-stream";
}

function getArtifactHandler(args: {
  artifactStore: ArtifactStore;
}) {
  return async function getArtifact(
    request: { params: { id: string; "*": string } },
    reply: {
      type(contentType: string): void;
      send(payload: unknown): unknown;
      code(status: number): { send(payload: unknown): unknown };
    },
  ) {
    try {
      const buffer = await args.artifactStore.readArtifact(
        request.params.id,
        request.params["*"],
      );
      reply.type(getContentType(request.params["*"]));
      return reply.send(buffer);
    } catch {
      return reply.code(404).send({ error: "Artifact not found." });
    }
  };
}
