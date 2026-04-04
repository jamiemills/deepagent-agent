import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import z from "zod/v3";

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

const optionalEnvString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value : undefined));

const optionalEnvNumber = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.coerce.number().optional());

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

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    RESEARCH_API_BASE_URL: z.string().url().default("http://127.0.0.1:3001"),
    DATA_DIR: z.string().default(".data"),
    TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
    TEMPORAL_NAMESPACE: z.string().default("default"),
    TEMPORAL_TASK_QUEUE: z.string().default("research-agent"),
    BRAVE_SEARCH_API_KEY: optionalEnvString,
    RESEARCH_AGENT_MODEL: z.string().default("gemini-3.1-pro-preview"),
    RESEARCH_AGENT_MODEL_PROVIDER: z
      .enum(["vertex", "openai", "openai-codex", "anthropic"])
      .default("vertex"),
    LANGSMITH_TRACING: optionalEnvString,
    LANGSMITH_API_KEY: optionalEnvString,
    LANGSMITH_PROJECT: optionalEnvString,
    GOOGLE_API_KEY: optionalEnvString,
    GOOGLE_CLOUD_PROJECT: optionalEnvString,
    GOOGLE_CLOUD_LOCATION: optionalEnvString,
    GOOGLE_APPLICATION_CREDENTIALS: optionalEnvString,
    OPENAI_API_KEY: optionalEnvString,
    OPENAI_ACCESS_TOKEN: optionalEnvString,
    OPENAI_CODEX_ACCESS_TOKEN: optionalEnvString,
    OPENAI_CODEX_REFRESH_TOKEN: optionalEnvString,
    OPENAI_CODEX_EXPIRES_AT: optionalEnvNumber,
    OPENAI_CODEX_ACCOUNT_ID: optionalEnvString,
    ANTHROPIC_API_KEY: optionalEnvString,
  })
  .superRefine((value, context) => {
    if (
      value.RESEARCH_AGENT_MODEL_PROVIDER === "openai" &&
      !value.OPENAI_API_KEY
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message:
          "OPENAI_API_KEY is required when RESEARCH_AGENT_MODEL_PROVIDER=openai",
      });
    }

    if (
      value.RESEARCH_AGENT_MODEL_PROVIDER === "openai-codex" &&
      !value.OPENAI_CODEX_ACCESS_TOKEN &&
      !value.OPENAI_ACCESS_TOKEN
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_CODEX_ACCESS_TOKEN"],
        message:
          "OPENAI_CODEX_ACCESS_TOKEN is required when RESEARCH_AGENT_MODEL_PROVIDER=openai-codex",
      });
    }

    if (
      value.RESEARCH_AGENT_MODEL_PROVIDER === "anthropic" &&
      !value.ANTHROPIC_API_KEY
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message:
          "ANTHROPIC_API_KEY is required when RESEARCH_AGENT_MODEL_PROVIDER=anthropic",
      });
    }
  });

export type AppConfig = ReturnType<typeof loadConfig>;

export function getLoadedEnvPath(): string | null {
  return loadedEnvPath;
}

export function loadConfig() {
  const parsed = envSchema.parse(process.env);
  const resolvedOpenAiCodexAccessToken =
    parsed.OPENAI_CODEX_ACCESS_TOKEN ?? parsed.OPENAI_ACCESS_TOKEN;

  return {
    port: parsed.PORT,
    apiBaseUrl: parsed.RESEARCH_API_BASE_URL,
    dataDir: path.resolve(process.cwd(), parsed.DATA_DIR),
    temporalAddress: parsed.TEMPORAL_ADDRESS,
    temporalNamespace: parsed.TEMPORAL_NAMESPACE,
    temporalTaskQueue: parsed.TEMPORAL_TASK_QUEUE,
    braveSearchApiKey: parsed.BRAVE_SEARCH_API_KEY,
    researchAgentModel: parsed.RESEARCH_AGENT_MODEL,
    researchAgentModelProvider: parsed.RESEARCH_AGENT_MODEL_PROVIDER,
    langsmithTracing: parsed.LANGSMITH_TRACING,
    langsmithApiKey: parsed.LANGSMITH_API_KEY,
    langsmithProject: parsed.LANGSMITH_PROJECT,
    googleApiKey: parsed.GOOGLE_API_KEY,
    googleCloudProject: parsed.GOOGLE_CLOUD_PROJECT,
    googleCloudLocation: parsed.GOOGLE_CLOUD_LOCATION,
    googleApplicationCredentials: parsed.GOOGLE_APPLICATION_CREDENTIALS,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiCodexAccessToken: resolvedOpenAiCodexAccessToken,
    openAiCodexRefreshToken: parsed.OPENAI_CODEX_REFRESH_TOKEN,
    openAiCodexExpiresAt: parsed.OPENAI_CODEX_EXPIRES_AT,
    openAiCodexAccountId: parsed.OPENAI_CODEX_ACCOUNT_ID,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
  };
}
