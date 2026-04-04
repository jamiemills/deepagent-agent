import path from "node:path";
import { fileURLToPath } from "node:url";

import { FilesystemBackend, createDeepAgent } from "deepagents";

import type { SourceTracker } from "./core/source-tracker.js";
import { createResearchModel } from "./model-provider.js";
import { createBraveSearchTool } from "./tools/brave-search.js";
import { createFetchUrlTool } from "./tools/fetch-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const memoryPath = path.join(appRoot, "AGENTS.md");
const skillsPath = path.join(appRoot, "skills");

const researchInstructions = `
You are a production research agent. Your job is to investigate a topic, gather credible evidence, cross-check claims, and produce a report that is safe to operationalize.

Operating rules:

- Use \`write_todos\` for any task that is more than trivially small.
- Use \`brave_search\` for discovery and \`fetch_url\` to inspect the actual page content before relying on it.
- Prefer primary and official sources whenever possible.
- Verify important claims across multiple independent sources before treating them as settled.
- If the prompt is time-sensitive, prefer recent dated sources and say explicitly when freshness is weak.
- Write substantial working notes into \`/notes/\`.
- Write the final report to \`/out/final-report.md\`.
- Write a JSON claim ledger to \`/out/claim-ledger.json\` with objects shaped like { "claim": string, "sourceUrls": string[], "confidence": "high"|"medium"|"low", "notes": string }.
- Include explicit dates and source citations in the report.
- Separate verified facts, interpretations, caveats, and open questions.

Delegation:

- Use \`source-researcher\` for source discovery on a subtopic.
- Use \`fact-checker\` to challenge important claims before finalizing the report.
`;

export async function buildResearchAgent(args: {
  workspaceRoot: string;
  sourceTracker: SourceTracker;
  model: string;
  modelProvider: "vertex" | "openai" | "openai-codex" | "anthropic";
  openAiApiKey: string | undefined;
  openAiCodexAccessToken: string | undefined;
  openAiCodexRefreshToken: string | undefined;
  openAiCodexExpiresAt: number | undefined;
  openAiCodexAccountId: string | undefined;
  anthropicApiKey: string | undefined;
}) {
  const backend = new FilesystemBackend({
    rootDir: args.workspaceRoot,
    virtualMode: true,
  });

  const braveSearchTool = createBraveSearchTool(args.sourceTracker);
  const fetchUrlTool = createFetchUrlTool(args.sourceTracker);
  const agentTools = [braveSearchTool, fetchUrlTool] as never;
  const model = await createResearchModel({
    researchAgentModelProvider: args.modelProvider,
    researchAgentModel: args.model,
    openAiApiKey: args.openAiApiKey,
    openAiCodexAccessToken: args.openAiCodexAccessToken,
    openAiCodexRefreshToken: args.openAiCodexRefreshToken,
    openAiCodexExpiresAt: args.openAiCodexExpiresAt,
    openAiCodexAccountId: args.openAiCodexAccountId,
    anthropicApiKey: args.anthropicApiKey,
  });

  return createDeepAgent({
    model,
    systemPrompt: researchInstructions,
    tools: agentTools,
    backend,
    memory: [memoryPath],
    skills: [skillsPath],
    subagents: [
      {
        name: "source-researcher",
        description:
          "Searches a focused subtopic and returns the strongest candidate sources, notable claims, and evidence gaps.",
        systemPrompt: `
You are a specialist source researcher.

- Use brave_search aggressively but selectively.
- Use fetch_url on promising URLs before recommending them.
- Prioritize primary, official, and recent sources.
- Return concise source-dense findings and unresolved questions.
`,
        tools: agentTools,
      },
      {
        name: "fact-checker",
        description:
          "Cross-checks important claims, identifies conflicting evidence, and highlights uncertainty or stale support.",
        systemPrompt: `
You are a rigorous fact-checker.

- Validate claims using multiple independent sources.
- Use fetch_url to inspect cited pages before accepting them.
- Flag conflicts, stale evidence, and unsupported assertions.
- Return a compact verification memo rather than a full report.
`,
        tools: agentTools,
      },
    ],
  });
}
