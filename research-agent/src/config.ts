import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const researchAgentRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(researchAgentRoot, "..");

const envCandidates = [
  process.env["RESEARCH_AGENT_ENV_FILE"],
  path.join(os.homedir(), "code", "deepagent-agent", ".env"),
  path.join(repoRoot, ".env"),
  path.join(researchAgentRoot, ".env"),
].filter((value): value is string => Boolean(value));

let loadedEnvPath: string | null = null;

for (const candidate of envCandidates) {
  if (!fs.existsSync(candidate)) {
    continue;
  }

  dotenv.config({
    path: candidate,
    override: false,
  });
  loadedEnvPath = candidate;
  break;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RESEARCH_API_BASE_URL: z.string().url().default("http://127.0.0.1:3001"),
  DATA_DIR: z.string().default(".data"),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("research-agent"),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  RESEARCH_AGENT_MODEL: z.string().default("gemini-3.1-pro-preview"),
  LANGSMITH_TRACING: z.string().optional(),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function getLoadedEnvPath(): string | null {
  return loadedEnvPath;
}

export function loadConfig() {
  const parsed = envSchema.parse(process.env);

  return {
    port: parsed.PORT,
    apiBaseUrl: parsed.RESEARCH_API_BASE_URL,
    dataDir: path.resolve(process.cwd(), parsed.DATA_DIR),
    temporalAddress: parsed.TEMPORAL_ADDRESS,
    temporalNamespace: parsed.TEMPORAL_NAMESPACE,
    temporalTaskQueue: parsed.TEMPORAL_TASK_QUEUE,
    braveSearchApiKey: parsed.BRAVE_SEARCH_API_KEY,
    researchAgentModel: parsed.RESEARCH_AGENT_MODEL,
    langsmithTracing: parsed.LANGSMITH_TRACING,
    langsmithApiKey: parsed.LANGSMITH_API_KEY,
    langsmithProject: parsed.LANGSMITH_PROJECT,
    googleCloudProject: parsed.GOOGLE_CLOUD_PROJECT,
    googleCloudLocation: parsed.GOOGLE_CLOUD_LOCATION,
    googleApplicationCredentials: parsed.GOOGLE_APPLICATION_CREDENTIALS,
  };
}
