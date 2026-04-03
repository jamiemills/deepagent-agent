# Deep Agents in JavaScript: Exhaustive Technical Notes

Last reviewed: 2026-04-03

This document is a JS-first, source-backed synthesis of the current Deep Agents documentation section on `docs.langchain.com` plus the `deepagentsjs` README. It is intended to answer two questions:

1. What Deep Agents is.
2. How it actually works in practice.

Scope notes:

- This document covers the current JavaScript Deep Agents docs section, including the frontend pattern pages, ACP page, CLI pages, and the production guide.
- The docs nav also includes a changelog link. That page is release-history-oriented rather than architecture-oriented, so this document treats it as version context rather than a primary behavior spec.
- It does not recursively summarize every external page linked from those docs, such as generic LangGraph persistence docs, provider-specific model docs, or Agent Auth docs.
- Where the README and docs disagree, this document prefers the current JS docs unless stated otherwise.

## Sources covered

Primary source pages:

- https://github.com/langchain-ai/deepagentsjs?tab=readme-ov-file
- https://docs.langchain.com/oss/javascript/deepagents/overview
- https://docs.langchain.com/oss/javascript/deepagents/quickstart
- https://docs.langchain.com/oss/javascript/deepagents/customization
- https://docs.langchain.com/oss/javascript/deepagents/harness
- https://docs.langchain.com/oss/javascript/deepagents/models
- https://docs.langchain.com/oss/javascript/deepagents/context-engineering
- https://docs.langchain.com/oss/javascript/deepagents/backends
- https://docs.langchain.com/oss/javascript/deepagents/subagents
- https://docs.langchain.com/oss/javascript/deepagents/async-subagents
- https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop
- https://docs.langchain.com/oss/javascript/deepagents/long-term-memory
- https://docs.langchain.com/oss/javascript/deepagents/skills
- https://docs.langchain.com/oss/javascript/deepagents/sandboxes
- https://docs.langchain.com/oss/javascript/deepagents/streaming
- https://docs.langchain.com/oss/javascript/deepagents/frontend/overview
- https://docs.langchain.com/oss/javascript/deepagents/frontend/subagent-streaming
- https://docs.langchain.com/oss/javascript/deepagents/frontend/todo-list
- https://docs.langchain.com/oss/javascript/deepagents/frontend/sandbox
- https://docs.langchain.com/oss/javascript/deepagents/acp
- https://docs.langchain.com/oss/javascript/deepagents/cli/overview
- https://docs.langchain.com/oss/javascript/deepagents/cli/providers
- https://docs.langchain.com/oss/javascript/deepagents/going-to-production
- https://docs.langchain.com/oss/javascript/deepagents/comparison

Related reference pages consulted:

- https://reference.langchain.com/javascript/deepagents
- https://reference.langchain.com/javascript/deepagents/sandboxes

## Executive summary

Deep Agents is an opinionated agent harness built on LangChain and LangGraph.

It is not a fundamentally different runtime from other tool-calling agents. The difference is that it packages the extra primitives that long-running agents usually need:

- planning via todos
- a virtual filesystem
- context compression
- subagents
- optional long-term memory
- optional human approvals
- optional sandboxed command execution

The Deep Agents design is straightforward:

- keep the basic tool-calling loop
- give the agent tools and defaults that support longer tasks
- treat files and subagents as first-class context-management primitives
- rely on LangGraph for durable execution, streaming, interrupts, and deployment integration

The shortest accurate description is:

Deep Agents is a LangGraph-based coordinator-worker harness for long-horizon tasks, where planning, files, delegation, and memory are part of the default operating model.

## What Deep Agents is

The official docs describe Deep Agents as the easiest way to build agents for complex, multi-step tasks. The docs and README consistently emphasize the same core value proposition:

- planning for multi-step work
- filesystems for context management
- subagents for context isolation
- long-term memory across threads
- pluggable backends for storage and execution environments

The README is also explicit about the design motivation: naive tool-calling agents are often "shallow". Deep Agents is a general-purpose attempt to capture the patterns used in systems like Claude Code, Deep Research, and Manus:

- planning tool
- subagents
- file access
- detailed prompting

That framing is accurate and useful. Deep Agents is not trying to replace LangGraph with a lower-level runtime. It is trying to package a practical set of higher-level defaults on top of LangChain and LangGraph.

## How it fits into the LangChain stack

The cleanest way to understand the stack is:

- LangChain: model/tool abstractions and middleware
- LangGraph: runtime, graph execution, state, checkpoints, interrupts, streaming
- Deep Agents: opinionated harness built on top of LangChain + LangGraph
- LangSmith: tracing, evaluation, deployment, observability, auth-related production features

That means:

- `createDeepAgent(...)` returns a LangGraph graph
- streaming is LangGraph streaming
- human-in-the-loop is LangGraph interrupts
- persistence and checkpointers are LangGraph concepts
- LangSmith is the operational layer around deployed graphs, not the core harness implementation itself

If someone says "Deep Agents by LangSmith", the more precise version is:

- Deep Agents is a LangChain/LangGraph library
- LangSmith is the tracing/evals/deployment platform that pairs with it especially well

## The core mental model

The harness really has five important primitives:

- `write_todos` for explicit planning
- a virtual filesystem for artifact storage and context offloading
- `task` for delegation to subagents
- memory via files and stores
- `execute` when the backend supports sandboxed or host shell execution

The easiest way to picture a deep agent is:

- the main agent is a coordinator
- the filesystem is the scratchpad and context overflow buffer
- subagents are disposable workers with isolated context
- the todo list is the explicit plan
- LangGraph is the runtime substrate under everything

This is why Deep Agents is called a harness rather than just an SDK helper. It is a pre-assembled operating model.

## What `createDeepAgent` gives you

From the customization docs, `createDeepAgent` centers around these configuration surfaces:

- `model`
- `tools`
- `systemPrompt`
- `middleware`
- `subagents`
- `backend`
- `interruptOn`
- `skills`
- `memory`
- `responseFormat`

The resulting graph includes the deep-agent harness behavior, not just a plain chat loop.

### Default capabilities

The harness docs describe these bundled capabilities:

- planning capabilities
- virtual filesystem access
- task delegation via subagents
- context and token management
- code execution when using sandbox backends
- human-in-the-loop when configured
- skills and memory as additional context layers

### Default built-in tools

Across the harness docs, overview, and backend docs, the important built-ins are:

- `write_todos`
- `ls`
- `read_file`
- `write_file`
- `edit_file`
- `glob`
- `grep`
- `task`
- `execute` when a sandbox-capable backend is present

The filesystem tool behavior is worth spelling out:

- `ls`: list directory entries plus metadata
- `read_file`: read file content with line numbers and optional slicing; supports images across all backends
- `write_file`: create new files
- `edit_file`: targeted string replacement with optional global replace
- `glob`: file pattern matching
- `grep`: text search
- `execute`: shell commands only when the backend exposes sandbox execution

Important nuance:

- planning is explicitly tied to `write_todos`
- the docs do not present a separate first-class `read_todos` tool page the way the old README examples sometimes imply
- todo state lives in agent state and is surfaced through runtime/streaming state

## Middleware architecture

Deep Agents is middleware-heavy by design.

The current JS customization docs explicitly list the default middleware categories available in deep agents:

- todo list support
- filesystem support
- subagent support
- summarization support
- Anthropic prompt caching support
- patching of interrupted/cancelled tool calls

The customization page also says that when you enable certain features, additional middleware is automatically included:

- `MemoryMiddleware` when `memory` is provided
- `SkillsMiddleware` when `skills` is provided
- human-in-the-loop middleware when `interruptOn` is provided

This matters because Deep Agents is not a monolith. The harness is mostly:

- a LangGraph graph
- a default prompt
- a built-in tool surface
- a backend abstraction
- a middleware stack

That is why the system remains composable: you can add more middleware, swap models, use custom tools, override subagents, or supply custom backends without discarding the whole harness.

## The execution model

### The main loop is still a tool-calling agent loop

Deep Agents does not replace the basic pattern of:

1. receive messages
2. choose actions
3. call tools
4. update state
5. continue until done

What changes is the agent's operating environment:

- it can plan explicitly instead of only implicitly
- it can write large artifacts to files instead of stuffing them into prompt history
- it can delegate work to fresh child contexts
- it can persist durable memory across conversations

### Planning is first-class but lightweight

Planning in Deep Agents is intentionally pragmatic. This is not a separate planner/executor architecture. Instead, the harness provides `write_todos` so the agent can maintain a structured task list with statuses:

- `pending`
- `in_progress`
- `completed`

Todo state is persisted in agent state, which means it can be streamed to UIs and survive normal durable execution behavior.

This is one of the key ways Deep Agents moves from "chat with tools" toward "agent with work tracking".

## Context engineering: the most important part of the system

The context-engineering docs are the most important docs in the section, because they explain what Deep Agents is actually doing to stay effective over long tasks.

The docs break context into five categories:

- input context
- runtime context
- context compression
- context isolation
- long-term memory

### Input context

Input context is what becomes part of the agent's prompt at startup. The docs say the final prompt is composed from:

- your custom system prompt
- the built-in harness prompt
- memory files
- skill data when skills are used
- tool prompts and tool descriptions
- middleware-supplied prompt additions
- HITL prompt additions when interrupts are configured

This means Deep Agents is always prompt-assembling from multiple layers. Your own system prompt is not the entire system prompt.

### Runtime context

Runtime context is separate from prompt context.

The docs are explicit:

- runtime context is per-run configuration
- it is not automatically inserted into the model prompt
- the model only sees it if some tool, middleware, or prompt assembly logic injects it

Runtime context is for values like:

- user IDs
- roles and preferences
- API keys
- database handles
- feature flags
- other tool/runtime configuration

The intended pattern is:

1. define `contextSchema`
2. pass `context` when invoking the graph
3. read `runtime.context` inside tools or middleware

The docs also say runtime context propagates to subagents, which is critical for production use. It lets child workers access environment-level configuration without duplicating that data into the prompt.

### Context compression

Deep Agents has two built-in compression mechanisms:

- offloading
- summarization

#### Offloading

The docs state that large tool inputs and results are stored in the filesystem and replaced with references.

Specific source-backed details:

- offloading uses a default threshold of 20,000 tokens
- large write/edit tool inputs can be truncated once the session context crosses 85% of the model window
- large tool results can be offloaded immediately and replaced with a file path plus a preview of the first 10 lines

This matters because the filesystem is not just a user-visible storage layer. It is part of the context-management algorithm.

#### Summarization

When offloading is no longer enough, Deep Agents summarizes old history.

The context docs specify:

- summarization triggers when context size crosses about 85% of `max_input_tokens`
- it keeps 10% of tokens as recent context
- if model profile data is unavailable, it falls back to a 170,000-token trigger with 6 recent messages preserved
- if a model call raises `ContextOverflowError`, Deep Agents immediately falls back to summarization and retries

The docs also specify the summarization outputs:

- an in-context LLM-generated summary replaces the older working history
- the complete original conversation is preserved to the filesystem as a canonical record

That last point is easy to miss and very important:

- active prompt history is compressed
- original history is not necessarily thrown away

### Context isolation

Subagents are the context-isolation mechanism.

The docs describe subagents as solving context bloat by quarantining detailed work. The parent gets only the result, not the whole chain of child tool calls.

This is one of the main design bets of Deep Agents:

- the main agent coordinates
- workers do noisy, output-heavy tasks
- only synthesized results flow back upward

## Backends: storage and execution environment

The backend system is one of Deep Agents' strongest design choices.

All filesystem tools operate through a pluggable backend. This lets one stable tool surface map onto:

- in-state scratch space
- local disk
- LangGraph stores
- sandboxes
- custom virtual filesystems
- route-based hybrids

The backend docs also note that `read_file` supports image files natively across all backends, returning multimodal content blocks for:

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`

### `StateBackend`

This is the default backend.

Behavior:

- stores files in LangGraph state
- persists across turns on the same thread via checkpoints
- disappears when the thread/conversation is gone

Best use cases:

- scratch work
- intermediate notes
- temporary artifacts
- automatic offloading targets

Important detail from the backend docs:

- the state backend is shared between the supervisor and synchronous subagents
- files a subagent writes remain available to the parent and other subagents afterward

### `FilesystemBackend`

This maps the virtual filesystem onto real local disk under a configured root directory.

Appropriate uses:

- local coding assistants
- CI/CD pipelines
- mounted persistent volumes

Inappropriate use:

- web servers and deployed multi-tenant APIs

The docs are very explicit about security:

- agents can read accessible files, including secrets
- permanent writes are possible
- network tools plus local files can create exfiltration risk
- `virtualMode: true` is strongly recommended
- `virtualMode: false` provides no meaningful security even if `rootDir` is set

This backend is a convenience for trusted environments, not a sandbox.

### `LocalShellBackend`

This is the most dangerous built-in backend.

Behavior:

- extends filesystem access with `execute`
- runs shell commands directly on the host
- no isolation
- commands can access any path on the system

The docs explicitly say:

- do not use it for production
- do not use it for untrusted input
- `virtualMode` does not protect you once shell execution exists

This backend is only for controlled local development or carefully managed CI.

### `StoreBackend`

This projects LangGraph store persistence into the filesystem interface.

This is the core long-term memory primitive.

Important details:

- omit explicit `store` when deploying on LangSmith Deployments because the platform provisions one
- namespace factories are the key safety mechanism for scoping who sees which data
- the docs say `namespace` will become required in `v1.9.0`
- the legacy default when no namespace is set uses assistant-level scope, which is unsafe for many multi-user cases

The docs give typical namespace patterns:

- per-user
- per-assistant
- per-thread
- composite scopes like `(user_id, thread_id)`

### `CompositeBackend`

This is the practical default for serious applications.

Behavior:

- route by path prefix
- preserve original path prefixes in listings and searches
- allow ephemeral + persistent storage in one unified namespace

Canonical example:

- default backend: `StateBackend`
- `/memories/`: `StoreBackend`

That gives you:

- ephemeral scratch space everywhere else
- cross-thread persistence only under memory paths

Important routing rules:

- longer prefixes win
- search/listing results preserve original routed prefixes

### Custom virtual filesystems

The backend docs explicitly support implementing your own `BackendProtocol`.

This is a deeper capability than "access local files". It lets you project remote systems into the file tools:

- S3-like object stores
- Postgres-backed document stores
- internal document repositories
- generated documentation spaces

The docs even give design guidance:

- paths should remain absolute like `/x/y.txt`
- implement `ls_info` and `glob_info` efficiently
- return user-readable error strings instead of raising for common lookup problems
- external backends should not return in-state `files_update` payloads

Required `BackendProtocol` methods include:

- `ls_info`
- `read`
- `grep_raw`
- `glob_info`
- `write`
- `edit`

This makes Deep Agents' filesystem tooling a generic context interface, not just a thin wrapper around POSIX.

## Memory

Deep Agents uses the filesystem as the substrate for memory. What changes is how long the files live.

### Short-term memory

With the default `StateBackend`, files persist only within the current thread.

This is ideal for:

- drafts
- temporary plans
- intermediate research
- working notes

### Long-term memory

The memory docs recommend using a `CompositeBackend` that routes `/memories/` to a `StoreBackend`.

That gives a clean split:

- ephemeral scratch files outside `/memories/`
- persistent memory inside `/memories/`

The docs explicitly frame long-term memory as suitable for:

- user preferences
- learned instructions
- project context
- research progress
- other cross-session knowledge

### Namespace scoping

The memory docs strongly emphasize namespace scoping.

Recommended patterns:

- per-user: personal preferences and instructions
- per-assistant: team-shared knowledge

The production guide reinforces this: in deployed agents, always set a namespace factory.

### Practical guidance

Memory should be used for context that is always relevant. If it is only sometimes relevant, it probably belongs in a skill instead.

## Skills

Skills solve a different problem from memory.

### What a skill is

A skill is a named folder with:

- a `SKILL.md`
- optional scripts
- optional reference documents
- optional templates or assets

The skills page also says that supporting files must be referenced from `SKILL.md` so the agent knows what they contain and when to use them.

### Progressive disclosure

This is the key skill mechanism.

The docs describe the flow as:

1. on startup, the agent reads each skill's frontmatter
2. on a user prompt, it matches the task against skill descriptions
3. if a skill looks relevant, it reads the full `SKILL.md`
4. then it uses the skill instructions and referenced assets as needed

This is why skills help with token pressure. Only metadata is loaded eagerly; the rest is loaded when relevant.

### What the agent sees

The skills page says the system prompt includes a "Skills System" section. The agent then follows a three-step process:

- match
- read
- execute

This is important because the model uses skill descriptions, not magic routing. Skill authoring quality matters.

### Source precedence

Skills have explicit precedence rules:

- later sources in the `skills` array win
- SDK code does not automatically scan CLI skill directories
- if you want CLI-style layering in SDK code, you must pass the relevant sources explicitly in order

### Skills vs memory

The docs make the distinction explicit:

- skills: on-demand capabilities discovered through progressive disclosure
- memory: persistent context always injected at startup

Use skills when:

- instructions are task-specific
- instructions are large
- you want reusable workflows or domain procedures

Use memory when:

- context is always relevant
- you want conventions or durable preferences

### Skills and subagents

Skill inheritance is asymmetric:

- the built-in general-purpose subagent inherits the main agent's skills
- custom subagents do not inherit main-agent skills unless explicitly configured
- skill state is isolated between parent and subagents

This is another deliberate context-isolation choice.

## Subagents

Subagents are not just "multi-agent support". In Deep Agents they are primarily a context-management primitive.

### Why they exist

The docs say subagents are useful for:

- multi-step tasks that would clutter parent context
- specialized domains needing different instructions or tools
- tasks requiring different model capabilities
- keeping the main agent focused on high-level coordination

They are not recommended for:

- simple single-step tasks
- flows where you need the parent to retain every intermediate detail

### Synchronous subagents

The normal `task` tool creates synchronous subagents.

Behavior:

- parent invokes `task`
- subagent runs with fresh context
- parent blocks until the child finishes
- child returns one final report

The harness docs also describe synchronous subagents as stateless from the parent's perspective. They do not stream multiple final back-and-forth messages into the parent graph as a dialogue; they produce a completed result.

### Dictionary-based subagents

The subagents docs define the key fields for a normal subagent:

- `name`
- `description`
- `systemPrompt`
- `tools`
- optional `model`
- optional `middleware`
- optional `interruptOn`
- optional `skills`

Important inheritance rules from the docs:

- `systemPrompt`: does not inherit from parent
- `tools`: does not inherit from parent
- `middleware`: does not inherit from parent
- `skills`: does not inherit from parent
- `model`: inherits parent by default if omitted
- `interruptOn`: inherits parent behavior by default, but subagent config overrides it

This means custom subagents are intentionally explicit and isolated.

### Compiled subagents

You can also supply a compiled LangGraph runnable as a subagent.

This matters because it means Deep Agents can delegate either to:

- lightweight dictionary-configured specialists
- fully custom compiled graphs

So the `task` tool is not limited to one built-in subagent shape.

### The general-purpose subagent

Deep Agents automatically provide a built-in `general-purpose` subagent unless you override it.

The docs say:

- it is automatically available
- it has filesystem tools by default
- it can be customized
- it inherits the main agent's skills

This gives the agent one default worker even if you do not define custom specialists.

### Best practices from the subagent docs

The subagents docs repeatedly recommend:

- write clear descriptions
- keep system prompts detailed
- minimize subagent tool sets
- choose models by task
- return concise results

These are not stylistic suggestions. They are part of the context-control strategy.

## Async subagents

Async subagents are a distinct feature from normal subagents.

The docs say they are:

- a preview feature targeted for `deepagents` `1.9.0`
- currently available via prerelease versions such as `1.9.0-alpha.0`
- not recommended for production use yet

### What they are for

Async subagents are for:

- long-running tasks
- parallel background work
- mid-flight updates
- cancellation
- continuing user interaction while workers run

### Sync vs async

The async subagents docs present a clear contrast:

- sync subagents: supervisor blocks until completion
- async subagents: return a job ID immediately and continue independently

Async subagents support:

- follow-up instructions
- cancellation
- status checks
- their own stateful progress across interactions

### Async tools

The async feature adds these tools:

- `start_async_task`
- `check_async_task`
- `update_async_task`
- `cancel_async_task`
- `list_async_tasks`

### Transport and protocol

Async subagents communicate with any server implementing Agent Protocol.

The docs say this can be:

- LangSmith Deployments
- self-hosted Agent Protocol-compatible servers

This is significant architecturally. Synchronous subagents are local delegation inside the graph. Async subagents can be remote worker processes accessed through a protocol boundary.

### State management

The docs explicitly explain why async task metadata lives in a dedicated `asyncTasks` state channel:

- ordinary message history can be summarized or compacted
- task IDs and background state need stronger durability than normal message text

That is a smart design choice and one of the clearest examples of Deep Agents adapting its state model to its own context-compaction behavior.

### Deployment topologies

The async docs describe three topologies:

- single deployment
- split deployment
- hybrid

This turns Deep Agents into more than a single-process harness. With async subagents, it can behave like a distributed supervisor-worker system.

## Sandboxes and code execution

Sandboxes are specialized backends that provide both:

- filesystem tools
- `execute`

### Why sandboxes matter

The harness docs and sandbox docs position them as the safe way to let agents:

- install dependencies
- run tests
- execute scripts
- manipulate files

without giving those powers directly to the host machine.

### How Deep Agents detects shell capability

The harness docs say:

- if the backend implements `SandboxBackendProtocol`, the harness adds `execute`
- otherwise the agent only has filesystem tools

The harness docs also note that large `execute` outputs are truncated and saved to a file so the agent can read them incrementally later.

### Deployment patterns

The docs repeatedly distinguish:

- full agent inside sandbox
- sandbox as tool

Deep Agents strongly favors "sandbox as tool" as a first-class pattern:

- the agent loop can run outside
- tool calls target the sandbox
- secrets can stay outside if you design it correctly
- multiple sandbox providers can be used

This is one of the main differences the comparison page highlights versus Claude Agent SDK and Codex.

### Security model

The docs are careful and correct here:

- sandboxes protect the host
- they do not make the agent trustworthy
- agents inside the sandbox can still read anything available inside it
- secrets should not be dropped into the sandbox casually

The production docs specifically recommend sandbox auth proxy patterns so secrets are injected into outbound requests rather than placed in sandbox files or environment variables.

## Human-in-the-loop

Deep Agents uses LangGraph interrupts for approval workflows.

### Configuration

You configure approvals with `interruptOn`, mapping tool names to booleans or richer configs.

The docs show allowed decisions such as:

- `approve`
- `edit`
- `reject`

### Runtime behavior

When an interrupt fires:

- execution pauses
- the result contains interrupt data
- the caller must decide how to resume

The HITL docs also make these operational points explicit:

- a checkpointer is required
- resumes must use the same thread/config
- when multiple tool calls are batched into one interrupt, you must answer all of them in order

### Editing arguments

When `"edit"` is allowed, callers can modify tool arguments before execution resumes.

This is more powerful than a yes/no permission gate. It lets the agent propose an action and the user correct or constrain it without restarting the run.

### Scope

HITL can be applied:

- on the main agent
- on subagents
- from within tool calls themselves

This is important because approval policy is part of the graph/runtime configuration, not a separate UI-only feature.

## Models

Deep Agents works with any LangChain chat model that supports tool calling.

### Ways to specify a model

The docs support:

- provider-qualified strings like `openai:gpt-5.3-codex`
- `initChatModel(...)`
- provider-specific model classes

The string form is convenience syntax. Under the hood, the docs say it calls `initChatModel` with default parameters.

### Model parameters

If you need provider-specific configuration such as:

- token limits
- reasoning/thinking budgets
- timeouts
- retry counts

the docs recommend using `initChatModel` or a provider-native model class directly.

### Runtime model selection

For user-selectable or dynamically selected models, the docs recommend:

- put the model choice in runtime context
- use `contextSchema`
- swap models with middleware in `wrapModelCall`

This is an important design point:

- the graph stays stable
- model choice becomes a per-invocation concern

### Suggested models

The models page lists several Anthropic, OpenAI, Google, and open-weight models that perform well on the Deep Agents eval suite. The docs explicitly caution that passing the eval suite is necessary but not sufficient for harder long-horizon tasks.

That is the right mental model:

- tool-calling competence is table stakes
- real task fit still needs validation

## System prompt behavior

The customization docs are explicit that Deep Agents includes a built-in system prompt with guidance on:

- planning
- filesystem use
- subagents

Your custom `systemPrompt` is prepended to that built-in prompt.

This means:

- you define role and domain behavior
- the harness defines operating procedure

Middleware can also add prompt material, which is why deep-agent prompting is layered rather than single-source.

## Structured output

The customization docs support `responseFormat`, so Deep Agents can produce structured results rather than only free-form text.

This matters because it means the harness is compatible with more application-shaped outputs:

- typed reports
- extracted records
- schema-validated summaries

The long-running harness behavior is not limited to coding-agent style chat output.

## Streaming

Deep Agents builds on LangGraph streaming with explicit support for subagent-aware streams.

### What you can stream

The streaming docs describe these stream modes:

- `updates`
- `messages`
- `custom`
- combinations of multiple modes

With `subgraphs: true`, namespaces identify which events come from child subagents.

### `updates`

Use `updates` to track step-level progress.

The docs show:

- empty namespace for main-agent steps
- non-empty namespace for subagent steps

This is good for:

- progress views
- lifecycle indicators
- operator dashboards

### `messages`

Use `messages` to stream LLM tokens and tool-call-related content from both the main agent and subagents.

The docs show that subagent-originated message events can be recognized by namespace segments starting with `tools:`.

### `custom`

Use `custom` when tools emit their own progress signals through `config.writer`.

This allows domain-specific live events, not just generic model/tool updates.

### Multi-mode streaming

The docs explicitly support streaming multiple modes together to build rich execution views.

That is important because Deep Agents UIs are not just chat logs. They can combine:

- chat tokens
- state updates
- tool events
- child-worker progress

## Frontend patterns

The frontend docs are not just cosmetic examples. They clarify the intended UI model for Deep Agents.

### Frontend overview

The overview page describes Deep Agents as a coordinator-worker architecture and recommends `useStream` as the client contract.

The key state surfaces are:

- `stream.messages`
- `stream.subagents`
- `stream.values.todos`

This maps directly to the runtime:

- coordinator messages
- worker state
- structured plan state

### Subagent streaming pattern

The dedicated subagent-streaming page adds a lot of practical detail.

Key recommendations:

- always use `filterSubagentMessages: true`
- render the coordinator message stream separately from child worker output
- use `getSubagentsByMessage` to attach worker cards to the coordinator message that spawned them
- enable `streamSubgraphs: true` when submitting

The page also documents a `SubagentStreamInterface` with fields such as:

- `id`
- `status`
- `messages`
- `result`
- `toolCall`
- `startedAt`
- `completedAt`

This makes it clear that the frontend contract is worker-aware, not just text-aware.

### Todo list pattern

The todo-list page explains how the todo plan is surfaced directly from agent state through `stream.values.todos`.

Important takeaways:

- agent state is not just messages
- todo status moves through `pending`, `in_progress`, and `completed`
- UIs can use the todo array as a live progress dashboard
- the pattern generalizes to arbitrary structured state exposed through `stream.values`

This is one of the clearest demonstrations that Deep Agents is meant to power application UIs, not just terminal chats.

### Sandbox frontend pattern

The sandbox frontend page is effectively a recipe for an IDE-like coding-agent product.

It describes a three-layer architecture:

1. deep agent with sandbox backend
2. custom API server for browsing sandbox files
3. frontend with file tree, code/diff viewer, and chat

It also documents several sandbox lifecycle strategies:

- thread-scoped sandbox, recommended
- agent-scoped sandbox
- user-scoped sandbox
- session-scoped sandbox for simpler demos

The page's most important product insight is that the UI and backend must share the same sandbox identity, typically via thread ID, so file browsing and agent operations point at the same environment.

## ACP: Agent Client Protocol integration

The ACP page explains how Deep Agents integrates with code editors and IDEs.

### ACP vs MCP

The docs distinguish them clearly:

- ACP: editor/IDE talks to the agent
- MCP: agent talks to external tools/servers

This is a crucial distinction and avoids a common confusion.

### `deepagents-acp`

The `deepagents-acp` package exposes deep agents over ACP.

You can use it:

- programmatically via `startServer(...)`
- via `DeepAgentsServer`
- via the CLI command `npx deepagents-acp`

The docs say the default ACP transport is stdio, which is the natural choice for editor-launched local servers.

### What ACP exposes

The ACP docs show support for:

- multiple named agents on one server
- built-in slash commands: `/plan`, `/agent`, `/ask`, `/clear`, `/status`
- custom slash commands
- IDE-level human approvals via `interruptOn`
- custom tools, backends, skills, and memory

That means ACP is not just a text transport. It is a way to expose a configured deep agent into editor UX.

### Clients

The page explicitly names:

- Zed
- JetBrains IDEs
- VS Code via `vscode-acp`
- Neovim ACP-compatible plugins

It also says DeepAgents appears in the ACP Agent Registry for supported clients.

## Deep Agents CLI

The CLI is the strongest example of how LangChain expects people to productize the SDK.

### What it is

The docs describe it as an open-source terminal coding agent built on the Deep Agents SDK.

The CLI adds a user-facing product shell around the harness concepts:

- persistent memory
- project conventions
- customizable skills
- approvals
- file operations
- shell execution
- web search
- HTTP requests
- MCP tools
- tracing

### Built-in CLI capabilities

The CLI docs explicitly list:

- file operations
- shell command execution
- web search
- HTTP requests
- task planning and tracking
- memory storage and retrieval
- context compaction and offloading
- human-in-the-loop
- skills
- MCP tools
- LangSmith tracing

This is effectively the Deep Agents harness turned into a coding agent product.

### Built-in CLI tools

The CLI docs list at least these default tools:

- `ls`
- `read_file`
- `write_file`
- `edit_file`
- `glob`
- `grep`
- `execute`

The built-in tool table also notes:

- `read_file` supports common image formats as multimodal content
- `write_file`, `edit_file`, and `execute` require approval by default in the standard CLI configuration

### Memory in the CLI

The CLI makes memory concrete through `AGENTS.md`.

The docs say:

- global memory: `~/.deepagents/<agent_name>/AGENTS.md`
- project memory: `.deepagents/AGENTS.md` in the project root
- both are appended to the system prompt at startup
- `/remember` explicitly prompts the agent to update memory and skills from the current conversation

The CLI docs also note that the agent may update `AGENTS.md` based on feedback, patterns, and explicit memory instructions.

### Skills in the CLI

The CLI uses the same skill model as the SDK, but wraps it in filesystem conventions and commands:

- `deepagents skills create`
- `deepagents skills list`
- `deepagents skills info`
- `deepagents skills delete`

The CLI docs position skills as reusable, on-demand capability bundles, and `/remember` can prompt the agent to review whether memory or skills should be updated from the current conversation.

### Custom subagents in the CLI

The CLI docs add an important user-facing subagent format:

- project-level: `.deepagents/agents/{subagent-name}/AGENTS.md`
- user-level: `~/.deepagents/{agent}/agents/{subagent-name}/AGENTS.md`

The frontmatter maps onto a subagent spec:

- `name`
- `description`
- optional `model`

The markdown body becomes the subagent's system prompt.

The docs also note an important limitation:

- this file-based format does not expose full SDK subagent control for tools, middleware, `interruptOn`, or `skills`
- CLI-defined custom subagents inherit the main agent's tools
- use the SDK directly for full control

### MCP in the CLI

The CLI supports MCP client behavior.

The docs say:

- the CLI auto-discovers `.mcp.json` at the project root
- explicit MCP configs can be added with `--mcp-config`
- MCP loading can be disabled with `--no-mcp`
- `--trust-project-mcp` can skip approval for project-level stdio MCP configs

This matches the broader Deep Agents idea that tool surfaces can be extended externally rather than only in code.

### Remote sandboxes in the CLI

The CLI docs explicitly say it uses the "sandbox as tool" pattern:

- the CLI process runs locally
- filesystem and execute tool calls target the remote sandbox

The page lists supported/mentioned sandbox types including:

- LangSmith
- AgentCore
- Modal
- Daytona
- Runloop

with LangSmith included by default and others requiring extras.

### Non-interactive mode

The CLI docs make several operational constraints explicit:

- `-n` runs a single non-interactive task
- piped stdin implies non-interactive mode
- piped input is capped at 10 MiB
- shell execution is disabled by default in non-interactive mode
- `-S` / `--shell-allow-list` is required to allow specific shell commands

This is an important safety distinction between interactive and unattended operation.

### Model provider behavior

The model-providers page adds operational detail:

- the `/model` selector is built dynamically from installed provider packages
- supported models must handle tool calling and text input/output
- models can be pinned as defaults
- missing providers can be configured in `config.toml`

The docs explicitly define CLI startup resolution order:

1. `--model`
2. `[models].default`
3. `[models].recent`
4. environment-based auto-detection from a limited credential set

The docs also specifically mention router/proxy integrations such as:

- OpenRouter
- LiteLLM

This reinforces that model abstraction is a real Deep Agents feature, not cosmetic provider swapping.

## Production guidance

The production guide is where the docs become operational instead of conceptual.

### Preferred deployment path

The docs state that the fastest way to production is LangSmith Deployments.

It provisions:

- assistants
- threads
- runs
- store
- checkpointer

It also adds:

- authentication
- webhooks
- cron
- observability
- exposure via MCP or A2A

This confirms that Deep Agents is meant to be productionized on top of LangGraph/LangSmith infrastructure.

### Multi-tenancy and auth

The production guide defines three important scopes:

- thread
- user
- assistant

It also separates:

- end-user identity and authorization
- team access control via LangSmith RBAC

This distinction is important:

- namespace scoping decides what data could be shared
- auth decides who is allowed to access it

### Async and durability

The production guide also emphasizes:

- write async tools
- use async middleware hooks
- use async graph factories for resources like sandboxes and MCP connections

On durability, it reiterates that LangGraph checkpoints state at every step. This enables:

- crash recovery
- indefinite interrupts
- time travel/replay
- safer recovery around sensitive actions

### Production storage recommendations

The guide is explicit:

- `StateBackend`: ephemeral scratch space
- `StoreBackend`: persistent cross-conversation storage
- `CompositeBackend`: mix both
- do not use `FilesystemBackend` or `LocalShellBackend` in deployed agents

That last point is important enough to restate: host-backed filesystem/shell backends are local-dev tools, not deployment-isolation strategies.

### Sandbox lifecycle

The production guide focuses on two main scopes:

- thread-scoped sandboxes
- assistant-scoped sandboxes

Thread-scoped:

- fresh per conversation
- isolated
- cleaned up by TTL

Assistant-scoped:

- shared across conversations
- good when setup cost is high
- useful for persistent repos or preinstalled dependencies

This is a product decision as much as a technical one.

### Secret handling

The production docs strongly recommend sandbox auth proxy patterns.

The key message is:

- do not upload secrets into the sandbox
- do not expose raw sandbox env vars casually
- use proxy-based credential injection for outbound calls

The docs are blunt that agents can read any accessible sandbox file or environment variable.

### Guardrails

The production guide frames guardrails as middleware concerns.

The docs recommend middleware for:

- model and tool call limits
- retries and fallbacks
- PII handling

Specific examples include:

- `modelCallLimitMiddleware`
- `toolCallLimitMiddleware`
- `modelRetryMiddleware`
- `modelFallbackMiddleware`
- `toolRetryMiddleware`
- `piiMiddleware`

The docs also explain the intended PII strategies:

- `redact`
- `mask`
- `hash`
- `block`

That is consistent with the larger architecture: operational controls live mostly in middleware rather than bespoke runtime branches.

## Comparison with Claude Agent SDK and Codex

The comparison page is not neutral marketing copy; it is useful for identifying what Deep Agents considers its real differentiators.

The page highlights these Deep Agents strengths:

- model flexibility across many providers
- long-term memory across sessions and threads
- sandbox-as-tool pattern
- virtual filesystem with pluggable backends
- LangSmith-based deployment and observability

It contrasts that with:

- Claude Agent SDK: more standardized around Claude, strong hooks, self-managed hosting
- Codex SDK: more standardized around OpenAI/Codex, built-in OS-level sandbox modes, OpenAI-native tooling

The feature table also explicitly claims:

- Deep Agents has long-term memory where the others do not
- Deep Agents supports virtual filesystems and pluggable backends where the others do not
- Deep Agents supports "agent runs operations in sandboxes" while the others mostly emphasize running the agent in a sandbox

This is useful because it shows how LangChain positions the harness:

- not as the best prebuilt coding agent
- but as a flexible, model-agnostic agent harness with stronger storage and deployment abstractions

## Version drift and doc inconsistencies

There are a few places where the docs and README are not perfectly aligned.

### Default model mismatch

Current JS customization docs say the default model is:

- `claude-sonnet-4-6`

Older examples in the README and parts of the ACP/CLI docs still show:

- `claude-sonnet-4-5-20250929`

This document treats the current JS docs as more authoritative for current behavior.

### Async subagents are explicitly preview-only

The async subagents page is version-sensitive and clearly marked as preview for `1.9.0`.

That means:

- the concept is part of the current docs
- production assumptions should still treat it as unstable

### Namespace requirements are tightening

The backend docs say `StoreBackend.namespace` will become required in `v1.9.0`.

That is both a practical migration signal and a strong hint that older implicit assistant-level defaults are no longer considered safe enough.

## What Deep Agents is best at

Deep Agents is a strong fit when you need:

- long-running multi-step tasks
- planning and explicit task tracking
- large artifacts or outputs that should move into files
- worker delegation for context isolation
- durable memory across sessions
- agent products that need streaming UIs, IDE integration, or deployment support

Good examples:

- research agents
- coding agents
- agents that write or inspect many files
- workflows where memory and execution environments must persist selectively

## When not to use it

Deep Agents is probably too much when:

- the task is short and simple
- you do not need files, subagents, or memory
- you want full low-level orchestration control
- you want a simpler `createAgent`-style build

Use LangGraph directly when you need:

- deterministic branching
- bespoke graph control flow
- specialized orchestration beyond the harness model

Use simpler LangChain agents when you do not need Deep Agents' state and context-management overhead.

## Practical synthesis

After reading the full current JS docs section, the most accurate high-level understanding is:

Deep Agents is a general-purpose harness for building coordinator-worker agents that can stay effective over long tasks by treating planning, files, memory, and delegation as core execution primitives rather than optional extras.

Its distinctive design choices are:

- explicit planning with todos
- filesystem-backed context compression
- subagents as context quarantine
- pluggable backends for storage and execution
- model/provider flexibility
- first-class frontend/editor/deployment stories built on LangGraph and LangSmith

That combination is what makes it feel closer to a reference architecture than a thin convenience wrapper.

## Quick reference

### The most important SDK concepts

- `createDeepAgent`: build the harnessed agent graph
- `write_todos`: planning tool
- `task`: synchronous delegation to subagents
- `backend`: filesystem and execution environment abstraction
- `CompositeBackend`: route some paths to ephemeral storage and others to persistence
- `interruptOn`: HITL approval policy
- `skills`: on-demand task-specific capability bundles
- `memory`: always-loaded memory context; in the CLI this is commonly represented by `AGENTS.md`
- `responseFormat`: structured output

### The most important backend choices

- `StateBackend`: default scratch space
- `StoreBackend`: durable storage across threads
- `CompositeBackend`: mix scratch + persistence
- `FilesystemBackend`: local disk, trusted environments only
- `LocalShellBackend`: host shell, highest risk
- sandbox backend: isolated filesystem + `execute`

### The most important production rules

- use namespace factories for stores
- do not deploy `FilesystemBackend` or `LocalShellBackend`
- prefer sandboxes for code execution
- keep secrets out of sandboxes when possible
- use middleware for limits, retries, and privacy
- treat runtime context as runtime data, not prompt data

## Source links

- Deep Agents overview: https://docs.langchain.com/oss/javascript/deepagents/overview
- Quickstart: https://docs.langchain.com/oss/javascript/deepagents/quickstart
- Customization: https://docs.langchain.com/oss/javascript/deepagents/customization
- Harness: https://docs.langchain.com/oss/javascript/deepagents/harness
- Models: https://docs.langchain.com/oss/javascript/deepagents/models
- Context engineering: https://docs.langchain.com/oss/javascript/deepagents/context-engineering
- Backends: https://docs.langchain.com/oss/javascript/deepagents/backends
- Subagents: https://docs.langchain.com/oss/javascript/deepagents/subagents
- Async subagents: https://docs.langchain.com/oss/javascript/deepagents/async-subagents
- Human-in-the-loop: https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop
- Memory: https://docs.langchain.com/oss/javascript/deepagents/long-term-memory
- Skills: https://docs.langchain.com/oss/javascript/deepagents/skills
- Sandboxes: https://docs.langchain.com/oss/javascript/deepagents/sandboxes
- Streaming: https://docs.langchain.com/oss/javascript/deepagents/streaming
- Frontend overview: https://docs.langchain.com/oss/javascript/deepagents/frontend/overview
- Frontend subagent streaming: https://docs.langchain.com/oss/javascript/deepagents/frontend/subagent-streaming
- Frontend todo list: https://docs.langchain.com/oss/javascript/deepagents/frontend/todo-list
- Frontend sandbox: https://docs.langchain.com/oss/javascript/deepagents/frontend/sandbox
- ACP: https://docs.langchain.com/oss/javascript/deepagents/acp
- CLI overview: https://docs.langchain.com/oss/javascript/deepagents/cli/overview
- CLI model providers: https://docs.langchain.com/oss/javascript/deepagents/cli/providers
- Going to production: https://docs.langchain.com/oss/javascript/deepagents/going-to-production
- Comparison: https://docs.langchain.com/oss/javascript/deepagents/comparison
- README: https://github.com/langchain-ai/deepagentsjs?tab=readme-ov-file
