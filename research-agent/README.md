# Research Agent

`research-agent` is a Deep Agents JavaScript research system scaffold that has been pushed toward a production-style internal tool. It is Bun-based, Brave-backed for web discovery, uses Vertex by default for model execution, and now also supports OpenAI and Anthropic models through env configuration. It supports both direct local runs and hosted background execution.

This project is meant to be useful in two modes:

- a direct local CLI for one-off operator runs
- a hosted Fastify API plus Temporal worker setup for durable background jobs

## What It Does

At a high level, a run looks like this:

1. accept a research prompt
2. classify freshness sensitivity
3. run a Deep Agents workflow with Brave search plus URL fetch/extract tools
4. collect notes and output files in a per-run workspace
5. generate canonical artifacts and provenance
6. persist run metadata, freshness verdicts, and artifact pointers

The current implementation writes:

- run metadata to `.data/metadata/<run-id>.json`
- working files to `.data/workspaces/<run-id>/`
- canonical artifacts to `.data/artifacts/<run-id>/`

Canonical artifacts include:

- `report.md`
- `provenance.json`
- `summary.json`
- copied `notes/` workspace files
- copied `out/` workspace files such as `out/final-report.md` and `out/claim-ledger.json`

## Architecture

The codebase is organized into a few clear layers:

- `src/agent.ts`
  - Deep Agents configuration
  - model construction
  - research instructions
  - subagent setup
- `src/core/`
  - run lifecycle
  - freshness classification and evaluation
  - provenance generation
  - report decoration and artifact finalization
- `src/tools/`
  - `brave_search` for discovery
  - `fetch_url` for reading discovered pages
- `src/storage/`
  - file-backed metadata and artifact stores
- `src/service/`
  - Fastify API construction and startup
- `src/temporal/`
  - Temporal workflow, client, activities, and worker wiring
- `src/cli.ts`
  - operator-facing local and hosted commands

The runtime is currently file-backed. It is suitable for local use and internal experimentation, but it is not yet a fully managed SaaS architecture.

## Current Behavior

The current scaffold has these notable behaviors:

- `deepagents` remains the main research harness
- Brave Search is the discovery layer
- `fetch_url` reads actual pages after discovery so the agent does not rely only on search snippets
- prompts are classified as `evergreen` or `time_sensitive`
- time-sensitive prompts are evaluated against captured source ages and dates
- the final report is decorated with run metadata and freshness notes
- runs can be marked for review when freshness fails or support is weak

## Prerequisites

You need:

- Bun `1.3+`
- a valid `BRAVE_SEARCH_API_KEY`
- one model provider configuration: Vertex, OpenAI, or Anthropic
- Temporal only if you want hosted durable execution

For `RESEARCH_AGENT_MODEL_PROVIDER=vertex`, the current setup assumes one of:

- `GOOGLE_APPLICATION_CREDENTIALS`
- Application Default Credentials
- other valid Google Cloud auth available to `@langchain/google`

For `RESEARCH_AGENT_MODEL_PROVIDER=openai`, set:

- `OPENAI_API_KEY`
- `OPENAI_ACCESS_TOKEN`

For `RESEARCH_AGENT_MODEL_PROVIDER=anthropic`, set:

- `ANTHROPIC_API_KEY`

## Installation

From this directory:

```bash
cd /Users/jamie.mills/c9h/code/deepagent-agent/research-agent
bun install
```

Useful validation commands:

```bash
bun run lint
bun run lint:complexity
bun run typecheck
bun run test
bun run format
```

## Environment Configuration

Copy `.env.example` if you want an app-local env file:

```bash
cp .env.example .env
```

The app loads environment variables in this order:

1. `RESEARCH_AGENT_ENV_FILE` if set
2. repo-root `.env`
3. `research-agent/.env`

In your current setup, the repo-root `.env` is typically the active one.

Important variables:

- `BRAVE_SEARCH_API_KEY`
- `RESEARCH_AGENT_MODEL_PROVIDER`
- `RESEARCH_AGENT_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_ACCESS_TOKEN`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_TASK_QUEUE`
- `RESEARCH_API_BASE_URL`
- `PORT`
- `DATA_DIR`

Default values:

```text
RESEARCH_AGENT_MODEL_PROVIDER=vertex
RESEARCH_AGENT_MODEL=gemini-3.1-pro-preview
PORT=3001
RESEARCH_API_BASE_URL=http://127.0.0.1:3001
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=research-agent
DATA_DIR=.data
```

Provider examples:

```text
# Vertex default
RESEARCH_AGENT_MODEL_PROVIDER=vertex
RESEARCH_AGENT_MODEL=gemini-3.1-pro-preview

# OpenAI
RESEARCH_AGENT_MODEL_PROVIDER=openai
RESEARCH_AGENT_MODEL=gpt-4.1
OPENAI_API_KEY=your-openai-key

# OpenAI OAuth / OIDC access token
RESEARCH_AGENT_MODEL_PROVIDER=openai
RESEARCH_AGENT_MODEL=gpt-4.1
OPENAI_ACCESS_TOKEN=your-openai-access-token

# Anthropic
RESEARCH_AGENT_MODEL_PROVIDER=anthropic
RESEARCH_AGENT_MODEL=claude-3-7-sonnet-latest
ANTHROPIC_API_KEY=your-anthropic-key
```

The runtime selects the chat model from `RESEARCH_AGENT_MODEL_PROVIDER`. For OpenAI, either `OPENAI_API_KEY` or `OPENAI_ACCESS_TOKEN` is accepted. Vertex remains the default so existing `.env` files keep working.

## How To Run It

There are two execution modes: local and hosted.

### Local Mode

This is the simplest path. It runs the research job directly in the current process, without the Fastify API and without Temporal.

Shortcut:

```bash
bun run research -- "Research the current state of the UK small modular reactor market."
```

Equivalent explicit CLI command:

```bash
bun run cli -- local "Research the UK small modular reactor market and write a report."
```

Both commands do the same thing:

- create a local run record
- execute the Deep Agents workflow in-process
- write artifacts under `.data/artifacts/<run-id>/`
- print the final run record JSON to stdout

Use local mode when you want:

- one-off interactive runs
- the quickest end-to-end test path
- no API server
- no Temporal infrastructure

### Hosted Mode

Hosted mode is for durable background jobs.

Start the API server:

```bash
bun run service
```

Start the Temporal worker in another terminal:

```bash
bun run worker
```

Then submit jobs through the CLI or the HTTP API:

```bash
bun run cli -- submit "Research the latest Deep Agents JavaScript production patterns."
```

Use hosted mode when you want:

- background execution
- status polling
- cancellation
- explicit review flow
- service-style integration points

## CLI Command Reference

Run a local research job:

```bash
bun run cli -- local "your prompt"
```

Submit a hosted research job:

```bash
bun run cli -- submit "your prompt"
```

Check hosted job status:

```bash
bun run cli -- status <run-id>
```

Fetch an artifact:

```bash
bun run cli -- artifact <run-id> report.md
```

Approve, reject, or mark pending review:

```bash
bun run cli -- review <run-id> approved "Reviewed and cleared for use."
bun run cli -- review <run-id> rejected "Needs better sourcing."
bun run cli -- review <run-id> pending "Waiting on human review."
```

Cancel a hosted job:

```bash
bun run cli -- cancel <run-id>
```

## API Reference

The hosted server currently exposes:

- `POST /research-jobs`
- `GET /research-jobs/:id`
- `POST /research-jobs/:id/cancel`
- `POST /research-jobs/:id/review`
- `GET /research-jobs/:id/artifacts/*`

Typical API lifecycle:

1. `POST /research-jobs`
2. `GET /research-jobs/:id` until complete
3. `GET /research-jobs/:id/artifacts/report.md`

## Run Outputs and Data Layout

For a run ID like `abc123`, the filesystem layout looks like this:

- `.data/metadata/abc123.json`
- `.data/workspaces/abc123/`
- `.data/artifacts/abc123/report.md`
- `.data/artifacts/abc123/provenance.json`
- `.data/artifacts/abc123/summary.json`
- `.data/artifacts/abc123/out/final-report.md`
- `.data/artifacts/abc123/out/claim-ledger.json`

The workspace is where the agent does intermediate work. The artifact directory is the canonical persisted output.

## Freshness and Provenance

The scaffold currently classifies prompts into:

- `evergreen`
- `time_sensitive`

For time-sensitive prompts, it evaluates captured evidence and emits one of:

- `passed`
- `warning`
- `failed`

Freshness results are persisted into:

- run metadata
- `summary.json`
- `provenance.json`
- the top section of `report.md`

The provenance manifest records:

- run ID
- prompt
- freshness assessment
- source inventory
- claim ledger

## Developer Workflow

This project is Bun-only.

Use:

- `bun install`
- `bun run ...`
- `bunx ...`

Do not regenerate `package-lock.json`; `bun.lock` is the only lockfile.

The pre-commit hook runs:

- `bunx biome check .`
- `bun run lint:complexity`
- `bun run typecheck`
- `bun run test`

When `bun install` runs inside a Git repo, `prepare` configures `core.hooksPath` to `.githooks`.

## Testing

Normal suite:

```bash
bun run test
```

Live integration tests are opt-in and require working credentials and network access:

```bash
RUN_LIVE_BRAVE_TESTS=1 bun run test
RUN_DEEPAGENT_SMOKE=1 bun run test
RUN_LIVE_CLI_LOCAL_TEST=1 bun run test
```

The live tests cover:

- direct Brave API connectivity
- a real Deep Agents smoke run
- a real local CLI run

## Project Layout

- `src/agent.ts`: Deep Agents configuration and subagents
- `src/core/`: run orchestration, provenance, freshness, reports, schemas, types
- `src/tools/`: Brave search and URL fetch/extract tools
- `src/storage/`: file-backed metadata and artifact stores
- `src/service/server.ts`: Fastify API
- `src/service/start.ts`: service startup entrypoint
- `src/temporal/`: workflow, client, activities, and worker
- `src/cli.ts`: operator CLI
- `skills/research-report/`: report-writing skill
- `AGENTS.md`: always-loaded memory

## Troubleshooting

If local runs fail immediately:

- verify `BRAVE_SEARCH_API_KEY`
- verify the credentials for the selected `RESEARCH_AGENT_MODEL_PROVIDER`
- verify the loaded env file is the one you expect

If hosted mode fails:

- make sure the Fastify service is running
- make sure the Temporal worker is running
- make sure `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_TASK_QUEUE` match between service and worker

If the wrong env file is being used:

- set `RESEARCH_AGENT_ENV_FILE=/absolute/path/to/.env`

If live tests fail:

- confirm network access is available
- confirm the required env variables are present in the loaded `.env`

## Limitations

This is a serious scaffold, not a finished SaaS product.

Current limitations:

- storage is file-backed, not relational/object-store-backed
- hosted runs still use local filesystem workspaces rather than a managed sandbox backend
- the fetch tool is intentionally basic and does not deeply parse PDFs or JS-heavy pages
- LangSmith tracing is environment-driven rather than wrapped in a custom observability layer here
- the API and persistence model are still internal-tool shaped rather than hardened public-product contracts
