import path from "node:path";

import { Effect } from "effect";

import { ResearchApiClient } from "./api-client.js";
import { loadConfig } from "./config.js";
import { createRunRecord, executeResearchRun } from "./core/research-runner.js";
import { FileArtifactStore } from "./storage/file-artifact-store.js";
import { FileMetadataStore } from "./storage/file-metadata-store.js";

const CLI_COMMANDS = [
  "local",
  "submit",
  "status",
  "cancel",
  "review",
  "artifact",
] as const;

type CliCommand = (typeof CLI_COMMANDS)[number];

function usage(): never {
  console.error(`Usage:
  npm run cli -- local "your research prompt"
  npm run cli -- submit "your research prompt"
  npm run cli -- status <run-id>
  npm run cli -- cancel <run-id>
  npm run cli -- review <run-id> <approved|rejected|pending> [notes]
  npm run cli -- artifact <run-id> <artifact-name>
`);
  process.exit(1);
}

function printRun(record: {
  id: string;
  status: string;
  reviewStatus?: string | undefined;
  freshnessVerdict?: string | undefined;
  artifactPointers?: Record<string, unknown> | undefined;
  errorMessage?: string | undefined;
}) {
  console.log(JSON.stringify(record, null, 2));
}

const config = loadConfig();
const metadataStore = new FileMetadataStore(
  path.join(config.dataDir, "metadata"),
);
const artifactStore = new FileArtifactStore(
  path.join(config.dataDir, "artifacts"),
);
const apiClient = new ResearchApiClient(config.apiBaseUrl);

const [command, ...rest] = process.argv.slice(2);

if (!command) {
  usage();
}

if (!CLI_COMMANDS.includes(command as CliCommand)) {
  rest.unshift(command);
}

const normalizedCommand: CliCommand = CLI_COMMANDS.includes(
  command as CliCommand,
)
  ? (command as CliCommand)
  : "local";

function requirePrompt(parts: string[]): string {
  const prompt = parts.join(" ").trim();
  if (!prompt) {
    usage();
  }
  return prompt;
}

function requireRunId(value: string | undefined): string {
  if (!value) {
    usage();
  }
  return value;
}

function parseReviewArgs(parts: string[]) {
  const [runId, decision, ...notesParts] = parts;
  const validDecision =
    decision && ["approved", "rejected", "pending"].includes(decision)
      ? (decision as "approved" | "rejected" | "pending")
      : null;

  if (!(runId && validDecision)) {
    usage();
  }

  const notes = notesParts.join(" ").trim();
  return {
    runId,
    decision: validDecision,
    notes: notes || undefined,
  };
}

function requireArtifactArgs(parts: string[]) {
  const [runId, artifactName] = parts;
  if (!(runId && artifactName)) {
    usage();
  }
  return { runId, artifactName };
}

async function runLocal(parts: string[]) {
  const prompt = requirePrompt(parts);
  const queued = await createRunRecord({
    request: {
      prompt,
      requestedBy: process.env["USER"] ?? "local-operator",
    },
    executionMode: "local",
    metadataStore,
  });

  return executeResearchRun({
    runId: queued.id,
    request: { prompt, requestedBy: queued.requestedBy },
    executionMode: "local",
    metadataStore,
    artifactStore,
  });
}

async function runSubmit(parts: string[]) {
  const prompt = requirePrompt(parts);
  return apiClient.createJob({
    prompt,
    requestedBy: process.env["USER"] ?? "operator",
  });
}

async function runStatus(parts: string[]) {
  return apiClient.getJob(requireRunId(parts[0]));
}

async function runCancel(parts: string[]) {
  return apiClient.cancelJob(requireRunId(parts[0]));
}

async function runReview(parts: string[]) {
  const { runId, decision, notes } = parseReviewArgs(parts);
  return apiClient.reviewJob(runId, decision, notes);
}

async function runArtifact(parts: string[]) {
  const { runId, artifactName } = requireArtifactArgs(parts);
  return apiClient.getArtifact(runId, artifactName);
}

async function main() {
  switch (normalizedCommand) {
    case "local": {
      printRun(await runLocal(rest));
      break;
    }

    case "submit": {
      printRun(await runSubmit(rest));
      break;
    }

    case "status": {
      printRun(await runStatus(rest));
      break;
    }

    case "cancel": {
      printRun(await runCancel(rest));
      break;
    }

    case "review": {
      printRun(await runReview(rest));
      break;
    }

    case "artifact": {
      process.stdout.write(await runArtifact(rest));
      break;
    }

    default:
      usage();
  }
}

await Effect.runPromise(
  Effect.tryPromise({
    try: () => main(),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  }),
);
