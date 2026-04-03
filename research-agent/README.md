# Research Agent

This is a Deep Agents JavaScript research agent scaffold evolved toward a production-grade internal system.

It supports two execution modes:

- local operator runs through the CLI
- hosted durable runs through a Fastify API plus Temporal workers

## Architecture

The codebase is split into:

- shared agent/runtime core
- a hardened Brave Search client
- a fetch/extract tool for reading discovered URLs
- provenance and freshness evaluation
- file-backed metadata and artifact stores for the current implementation
- a hosted API for job submission and retrieval
- Temporal workflows and workers for durable execution

## Current production-oriented behavior

- `deepagents` remains the research harness
- Brave Search is the discovery tool
- `fetch_url` reads actual pages after discovery
- each run gets an isolated workspace under `.data/workspaces/<run-id>/`
- canonical artifacts are written to `.data/artifacts/<run-id>/`
- run metadata is stored in `.data/metadata/<run-id>.json`
- time-sensitive prompts are freshness-classified and checked against captured source dates/ages
- each run emits:
  - `report.md`
  - `provenance.json`
  - `summary.json`
  - copied `notes/` and `out/` artifacts from the agent workspace

## Prerequisites

- Node.js 20+
- a Brave Search API key in `.env`
- Vertex AI credentials for Gemini
- Temporal if you want hosted durable execution

## Install

```bash
npm install
```

Useful validation commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run format
```

This project uses Biome for linting and formatting. When installed inside a Git repository, `npm install` runs the `prepare` script and configures `core.hooksPath` to [`.githooks`](/Users/jamie.mills/c9h/code/deepagent-agent/research-agent/.githooks), so the pre-commit hook runs `biome check` and `npm run typecheck`.

## Configure

Copy `.env.example` to `.env`.

By default the code loads `.env` from the repository root first, then falls back to `research-agent/.env`. You can override that with `RESEARCH_AGENT_ENV_FILE=/absolute/path/to/.env`.

Important variables:

- `BRAVE_SEARCH_API_KEY`
- `RESEARCH_AGENT_MODEL`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GOOGLE_APPLICATION_CREDENTIALS` for a local service-account file, or Application Default Credentials
- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_TASK_QUEUE`
- `RESEARCH_API_BASE_URL`

Default model:

```text
gemini-3.1-pro-preview
```

The app constructs a Vertex AI-backed `ChatGoogle` model explicitly with `platformType: "gcp"`, so this scaffold is now Gemini-on-Vertex-first rather than provider-agnostic by default.

## Local run

Run a local research job directly:

```bash
npm run research -- "Research the current state of the UK small modular reactor market."
```

Or explicitly:

```bash
npm run cli -- local "Research the UK small modular reactor market and write a report."
```

The CLI prints a run record as JSON. Canonical artifacts are written under `.data/artifacts/<run-id>/`.

## Hosted mode

Start the API server:

```bash
npm run service
```

Start the Temporal worker in another terminal:

```bash
npm run worker
```

Submit a hosted research job:

```bash
npm run cli -- submit "Research the latest Deep Agents JavaScript production patterns."
```

Check status:

```bash
npm run cli -- status <run-id>
```

Fetch the final report:

```bash
npm run cli -- artifact <run-id> report.md
```

Review a run:

```bash
npm run cli -- review <run-id> approved "Reviewed and cleared for use."
```

Cancel a hosted run:

```bash
npm run cli -- cancel <run-id>
```

## API surface

The hosted server currently exposes:

- `POST /research-jobs`
- `GET /research-jobs/:id`
- `POST /research-jobs/:id/cancel`
- `POST /research-jobs/:id/review`
- `GET /research-jobs/:id/artifacts/*`

## Freshness and provenance

The current implementation classifies prompts into:

- `evergreen`
- `time_sensitive`

For time-sensitive prompts it evaluates captured source dates and age strings to produce:

- `passed`
- `warning`
- `failed`

These results are persisted into:

- run metadata
- `summary.json`
- `provenance.json`
- the top section of `report.md`

## Project layout

- `src/agent.ts`: Deep Agents configuration
- `src/core/`: run model, provenance, freshness, and execution pipeline
- `src/tools/`: Brave Search and URL fetch/extract tools
- `src/storage/`: metadata and artifact store interfaces plus file-backed implementations
- `src/service/server.ts`: hosted API
- `src/temporal/`: workflow, client, activities, and worker
- `src/cli.ts`: local and hosted operator CLI
- `skills/research-report/`: research workflow skill
- `AGENTS.md`: always-loaded research memory

## Limitations

This is a serious scaffold, not a finished SaaS product.

Current limitations:

- storage is file-backed rather than relational/object-store-backed
- hosted runs still use local filesystem workspaces rather than a remote sandbox backend
- the fetch tool is basic and does not deeply parse PDFs or complex JS-rendered pages
- LangSmith tracing is environment-driven rather than wrapped in custom observability code here
- live integration tests are opt-in:
  - `RUN_LIVE_BRAVE_TESTS=1 npm run test`
  - `RUN_DEEPAGENT_SMOKE=1 npm run test`
