# deepagent-agent

`deepagent-agent` is a small repository centered on a single Bun-based application, [`research-agent`](./research-agent), plus supporting reference documentation.

The repository is not a generic "deep agents" framework implementation. Its primary purpose is to host a concrete Deep Agents research workflow with:

- local CLI execution
- hosted API execution
- Temporal-backed background jobs
- file-backed run metadata and artifacts
- multiple model providers
- enforced repository quality gates

## Repository Contents

At the top level, the repository currently contains:

- [`research-agent/`](./research-agent)
  - the application code, tests, hooks, and quality policy rules
- [`deepagents.md`](./deepagents.md)
  - an extensive source-backed set of notes about the JavaScript Deep Agents ecosystem
- [`README.md`](./README.md)
  - this repo-level summary

If you are trying to run or modify the actual application, almost all of the important code is under `research-agent/`.

## What `research-agent` Does

`research-agent` is a source-driven research system built on top of Deep Agents, LangChain, and LangGraph-adjacent tooling.

A run typically does the following:

1. accepts a research prompt
2. classifies freshness sensitivity
3. runs a research workflow using web discovery and page fetching tools
4. writes working files into a per-run workspace
5. generates canonical report and provenance artifacts
6. persists metadata for later status checks, artifact retrieval, cancellation, and review

The system supports two modes:

- local mode
  - runs the research job directly in-process from the CLI
- hosted mode
  - submits the job through a Fastify API and executes it with a Temporal worker

## High-Level Architecture

The `research-agent` package is organized into a few distinct layers:

- `src/agent.ts`
  - Deep Agents wiring, instructions, tools, and model selection
- `src/core/`
  - run lifecycle, schemas, provenance, reporting, freshness logic, and run records
- `src/tools/`
  - external discovery and retrieval tools such as Brave search and URL fetching
- `src/storage/`
  - file-backed metadata and artifact storage
- `src/service/`
  - Fastify server construction and startup
- `src/temporal/`
  - workflow, activities, client, and worker wiring
- `src/config.ts`
  - environment loading and provider-specific configuration validation
- `src/diff-policy*.ts`
  - diff-aware policy gate logic used by hooks and CI
- `test/`
  - unit, integration, provider-specific, and policy-gate tests
- `semgrep/rules/`
  - repo-specific Semgrep rules and fixtures

## Supported Model Providers

`research-agent` supports these providers through environment configuration:

- `vertex`
  - Google Vertex AI / Gemini models
- `openai`
  - standard OpenAI API via `api.openai.com`
- `openai-codex`
  - ChatGPT/Codex OAuth-backed requests via `chatgpt.com/backend-api/codex`
- `anthropic`
  - Anthropic API models

Provider selection is controlled by `RESEARCH_AGENT_MODEL_PROVIDER`.

The package also supports provider-specific model env vars so different providers can use different model families without command-line overrides:

- `RESEARCH_AGENT_MODEL_VERTEX`
- `RESEARCH_AGENT_MODEL_OPENAI`
- `RESEARCH_AGENT_MODEL_OPENAI_CODEX`
- `RESEARCH_AGENT_MODEL_ANTHROPIC`

If a provider-specific model variable is absent, the shared `RESEARCH_AGENT_MODEL` value is used.

## Runtime Entry Points

The main `research-agent` scripts are:

```bash
cd research-agent
bun install
```

Local one-off run:

```bash
bun run research -- "Research prompt here"
```

Explicit CLI usage:

```bash
bun run cli -- local "Research prompt here"
bun run cli -- submit "Research prompt here"
bun run cli -- status <run-id>
bun run cli -- cancel <run-id>
bun run cli -- review <run-id> <approved|rejected|pending> [notes]
bun run cli -- artifact <run-id> <artifact-name>
```

Hosted API:

```bash
bun run service
```

Temporal worker:

```bash
bun run worker
```

## Environment Configuration

The package ships with [`research-agent/.env.example`](./research-agent/.env.example).

The most important variables are:

- `BRAVE_SEARCH_API_KEY`
- `RESEARCH_AGENT_MODEL_PROVIDER`
- `RESEARCH_AGENT_MODEL`
- provider-specific model variables
- provider credentials such as:
  - `OPENAI_API_KEY`
  - `OPENAI_CODEX_ACCESS_TOKEN`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_APPLICATION_CREDENTIALS`
  - `GOOGLE_CLOUD_PROJECT`

The config loader can read environment values from:

1. `RESEARCH_AGENT_ENV_FILE` if set
2. the repo-root `.env`
3. `research-agent/.env`

## Data and Artifacts

The application is file-backed by default.

Typical runtime output goes under `.data/` and includes:

- run metadata
- workspaces for in-progress execution
- canonical artifacts such as reports and provenance

The package README in [`research-agent/README.md`](./research-agent/README.md) documents the exact artifact layout in more detail.

## Quality Gates and Repo Policy

This repository enforces a stricter-than-default local quality model inside `research-agent`.

Analyzer intent is intentionally split:

- `Biome`
  - formatting and general hygiene
- `ESLint + SonarJS`
  - complexity and size budgets
- `Semgrep`
  - architecture and policy rules
- `tsc`
  - type correctness
- `Vitest`
  - runtime behavior

Key commands:

```bash
cd research-agent
bun run check:fast
bun run verify
bun run agent-policy
bun run test
bun run lint:semgrep
bun run lint:complexity
bun run lint:typed
bun run typecheck
```

Hook and CI behavior:

- `pre-commit` runs the fast local gate
- `pre-push` runs the full `agent-policy` gate
- GitHub Actions runs the `agent-policy` workflow

## Policy Enforcement

The repository includes a diff-aware policy gate and Semgrep rule pack to protect against common degradation patterns.

Examples of enforced policy areas include:

- no monkeypatching or prototype mutation
- no inline suppression comments
- no config weakening
- architecture boundary checks
- boundary validation requirements
- large diff limits
- exception-manifest validation

These rules live under:

- [`research-agent/semgrep/rules/`](./research-agent/semgrep/rules)
- [`research-agent/src/diff-policy.ts`](./research-agent/src/diff-policy.ts)
- related `diff-policy-*` modules

## Testing

The `research-agent` package has:

- broad unit coverage
- integration-style tests for CLI, storage, service, and Temporal wiring
- provider-specific test suites for Vertex, OpenAI, OpenAI Codex, and Anthropic
- Semgrep rule tests
- diff-policy tests

Provider-specific test entrypoints include:

```bash
cd research-agent
bun run test:provider:vertex
bun run test:provider:openai
bun run test:provider:openai-codex
bun run test:provider:anthropic
```

## Additional Documentation

Use these files depending on what you need:

- [`research-agent/README.md`](./research-agent/README.md)
  - package-level setup, env vars, execution modes, and commands
- [`deepagents.md`](./deepagents.md)
  - a long-form technical summary of the JavaScript Deep Agents docs and related references
- [`research-agent/AGENTS.md`](./research-agent/AGENTS.md)
  - the agent memory/instruction file used by the research workflow

## Current State

As of the current repo state, this repository is best understood as:

- one production-style internal research agent package
- one supporting Deep Agents reference document
- one set of repo-local policy and quality gates that keep changes constrained and reviewable

If you want to start with the application itself, go straight to [`research-agent/README.md`](./research-agent/README.md).
