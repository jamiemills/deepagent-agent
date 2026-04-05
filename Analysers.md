# DeepAgent Analyzer And Policy System

This document is a comprehensive rundown of the rules, analyzers, gates, hooks, and CI enforcement currently in place in this repository.

It is intentionally split into three parts:

1. A portable, behavior-first description of the system.
   This section is written so it can be shared with another LLM without requiring the repo.
2. A concrete implementation mapping to this repository.
   This section explains exactly where the logic lives and how it is wired.
3. Improvements that could be made.
   This section is a forward-looking gap analysis and refinement plan.

-------------------------------------------------------------------------------
## Section 1: Portable Behavioral Summary
-------------------------------------------------------------------------------

### 1. System Goal

The repository uses a layered, deterministic quality-control system intended to do two things at once:

1. Reject unsafe, sloppy, or policy-violating changes mechanically rather than socially.
2. Give agents and humans fast, categorized feedback about why a change failed.

The system is built around the principle that an agent is not trusted simply because it was prompted well. Instead, code must pass a set of analyzers and policy gates that each own a narrow, explicit responsibility.

The settled analyzer intent split is:

1. `Biome`: hygiene and formatting
2. `ESLint + SonarJS`: complexity and size
3. `Semgrep`: architecture and policy
4. `tsc`: type correctness
5. `Vitest`: runtime behavior

A separate diff-aware policy engine sits in front of those analyzers and enforces meta-policies about the *change itself*, such as whether the diff is too large or whether enforcement files are being weakened.

### 2. High-Level Flow

The local and CI flows are intentionally related but not identical.

```text
                     +-----------------------+
                     |   Developer / Agent   |
                     +-----------+-----------+
                                 |
                   +-------------+--------------+
                   |                            |
                   v                            v
          +------------------+          +------------------+
          |   pre-commit     |          |     pre-push     |
          |   fast lane      |          |    slow lane     |
          +------------------+          +------------------+
          | biome            |          | diff policy      |
          | diff policy      |          | verify           |
          | complexity lint  |          | typed lint       |
          +------------------+          +------------------+
                   |                            |
                   +-------------+--------------+
                                 |
                                 v
                       +--------------------+
                       |   pull request      |
                       |   required CI gate  |
                       +--------------------+
                       | agent-policy       |
                       | diff mode: PR range|
                       +--------------------+
                                 |
                                 v
                       +--------------------+
                       |  merge to main      |
                       +--------------------+
```

There is also a separate live-integration workflow, but it is intentionally not part of the required merge gate:

```text
+-------------------------+
| Manual / on-demand run  |
+------------+------------+
             |
             v
+-------------------------+
| live-provider-tests     |
+-------------------------+
| live-vertex             |
| live-openai-codex       |
+-------------------------+
| secret-aware            |
| non-blocking            |
+-------------------------+
```

### 3. Branch Protection And GitHub Enforcement

GitHub-side protection exists in addition to repo-local scripts.

Its function is to make the required gate unavoidable during normal collaboration.

Current enforcement model:

1. The required status check is `agent-policy`.
2. Status checks are strict.
3. Admin enforcement is enabled.
4. Force pushes are disabled.
5. Branch deletions are disabled.
6. Pull-request review settings exist, but with `0` required approvals.

Behaviorally, this means the repository expects merges to be governed by the `agent-policy` workflow, not by informal trust.

### 4. Canonical Gate: `agent-policy`

This is the main blocking quality gate.

Its purpose is to provide a single stable command that local tooling and CI can all call.

Conceptually:

```text
agent-policy
|
+-- diff policy
+-- deterministic verification
|   |
|   +-- Biome hygiene
|   +-- TypeScript typecheck
|   +-- ESLint/SonarJS complexity budgets
|   +-- Semgrep policy rules
|   +-- Vitest suite
|
+-- typed linting
```

Its behavior is:

1. Fail if the change itself violates repo policies.
2. Fail if the codebase is not hygienic.
3. Fail if the code is not type-correct.
4. Fail if complexity or size budgets are exceeded.
5. Fail if architectural or policy rules are violated.
6. Fail if behavior regressions appear in tests.
7. Fail if typed semantic linting catches issues.

This gate is intentionally deterministic and credential-free. It is designed to be safe as a required CI check.

### 5. Fast Lane: `pre-commit`

The `pre-commit` hook is the fast local feedback lane.

Its purpose is to stop obviously bad changes before a commit is created, while staying fast enough to be tolerable.

It runs:

1. `Biome`
2. diff-aware policy checks
3. ESLint complexity budgets

Behavior:

1. Catch hygiene and formatting problems early.
2. Reject oversized or policy-breaking diffs early.
3. Reject obvious complexity violations before a commit exists.
4. Avoid the slower typed lint, typecheck, and full test suite.

This is a local back-pressure mechanism, not the final gate.

### 6. Slow Lane: `pre-push`

The `pre-push` hook runs the full `agent-policy` gate.

Its purpose is to provide stronger local back-pressure before code reaches GitHub.

Behavior:

1. Uses the same canonical gate as CI.
2. Gives developers or agents a full local rejection before they burn CI cycles.
3. Reduces the need for “push and see what breaks” iteration.

### 7. Diff-Aware Policy Gate

This is the most repo-specific and strategically important part of the system.

It does not primarily analyze code *quality*; it analyzes the *change*.

#### 7.1 Purpose

It enforces policies that cannot be expressed well by ordinary static analyzers alone, especially:

1. Large diffs are harder to review and more likely to hide regressions.
2. Changes to enforcement code must be treated as sensitive.
3. Analyzer weakening must be blocked as a class of change.
4. Complexity should not regress in touched production files.
5. Exceptions must be explicit, scoped, versioned, and expiring.

#### 7.2 Policies Enforced

The diff policy engine currently enforces four named policies:

1. `large-diff`
2. `enforcement-change`
3. `config-weakening`
4. `complexity-regression`

#### 7.3 Large Diff Policy

Purpose:

Reject changes that are too large to review comfortably.

Current thresholds:

1. changed lines must be `<= 150`
2. files changed must be `<= 5`

Behavior:

1. It counts added plus deleted lines.
2. It counts touched files.
3. If either threshold is exceeded, it fails.

ASCII model:

```text
if (changed_lines > 150) fail
if (files_changed > 5)  fail
```

This is a reviewability rule, not a correctness rule.

#### 7.4 Enforcement Change Policy

Purpose:

Treat modifications to the policy and analyzer machinery as sensitive changes.

Behavior:

1. If a diff touches protected enforcement files, it triggers a policy violation.
2. Those changes are not automatically forbidden, but they require explicit exception coverage.
3. Protected files include hooks, workflow files, analyzer scripts, diff-policy engine files, and Semgrep rule files.

This exists because an agent under pressure will often weaken the gate instead of fixing the underlying problem.

#### 7.5 Config Weakening Policy

Purpose:

Block a class of changes whose intent is to weaken or bypass enforcement.

Behavior:

It inspects config and script contents and rejects changes such as:

1. removing required scripts
2. replacing real checks with no-op commands
3. weakening Biome enforcement of `noExplicitAny`
4. weakening Biome enforcement of `noNonNullAssertion`
5. re-enabling Biome complexity ownership
6. weakening ESLint complexity budgets
7. weakening typed lint wiring
8. deleting required Semgrep rule files
9. enabling `skipLibCheck`
10. weakening hooks or the required CI workflow
11. removing required protected paths and required rule references from the policy engine itself

This is the “guard the guards” layer.

ASCII model:

```text
change touches enforcement?
  |
  +-- yes --> did it preserve required checks and thresholds?
               |
               +-- no --> fail
               +-- yes -> still sensitive; may need explicit exception
```

#### 7.6 Complexity Regression Policy

Purpose:

Prevent touched production files from becoming more complex even if they remain under absolute caps.

Behavior:

1. Applies only to changed `src/**/*.ts` files.
2. Compares the file before and after the change.
3. Computes four metrics internally:
   - file LOC
   - max function LOC
   - max cyclomatic complexity
   - max cognitive complexity
4. Fails if any of those metrics increase.

Important nuance:

This is not the same as the absolute ESLint budget.

The ESLint budget asks:

```text
Is the resulting file over the limit?
```

The regression rule asks:

```text
Did this touched source file become worse than it was before?
```

So the repository currently has both:

1. absolute complexity ceilings
2. no-regression checks on touched source files

That combination is stronger than either one alone.

### 8. Exception Manifest System

The repository does not allow inline suppressions as the normal escape hatch.

Instead, it uses a versioned exception manifest.

#### 8.1 Purpose

Allow explicit, reviewed, temporary exceptions without silently degrading the codebase.

#### 8.2 Behavior

An exception entry must be:

1. versioned
2. path-scoped
3. policy-specific
4. reasoned
5. expiring

The manifest is validated for:

1. correct schema
2. unique IDs
3. valid policy names
4. non-empty path patterns
5. non-empty reasons
6. valid expiry date
7. path applicability when the manifest is being changed

#### 8.3 Important Current Behavior

Expired exceptions are no longer honored in PR CI even if the manifest file itself is unchanged.

That matters because otherwise an exception can “linger” past expiry simply because nobody edits the manifest again.

The manifest is currently empty.

ASCII model:

```text
policy violation found
        |
        v
matching exception exists?
        |
   +----+----+
   |         |
  no        yes
   |         |
 fail    exception active?
             |
        +----+----+
        |         |
       no        yes
        |         |
      fail      allow
```

### 9. Biome

#### 9.1 Purpose

Biome owns hygiene and formatting.

It is intentionally *not* the complexity-budget tool in this repository.

#### 9.2 Behavior

Biome runs over the repository and enforces broad hygiene rules, including:

1. formatting
2. correctness-oriented linting
3. suspicious-pattern linting
4. security-oriented linting
5. style linting
6. explicit ban on `any`
7. explicit ban on non-null assertions

#### 9.3 What It Does *Not* Own Here

Biome complexity rules are intentionally disabled.

That separation exists to keep ownership clear:

1. Biome = well-formed, hygienic code
2. ESLint/SonarJS = complexity budgets

This avoids tool overlap and ambiguous failure ownership.

### 10. TypeScript Typecheck (`tsc`)

#### 10.1 Purpose

Provide the hard type-correctness barrier.

#### 10.2 Behavior

1. Runs TypeScript project checking.
2. Fails on type errors.
3. Runs before complexity, Semgrep, and tests in the `verify` pipeline.
4. `skipLibCheck` is intentionally not allowed.

This makes types the first strong semantic correctness barrier after hygiene.

### 11. ESLint + SonarJS Complexity Budgets

This analyzer owns code size and complexity budgets.

#### 11.1 Purpose

Reject code that is too hard to understand, too long, or too branchy.

#### 11.2 Current Budgets

1. cyclomatic complexity `<= 10`
2. cognitive complexity `<= 15`
3. function length `<= 50 LOC`
4. file length `<= 400 LOC`

These budgets are hard gates.

#### 11.3 Scope

Applies to:

1. `src/**/*.ts`
2. `test/**/*.ts`

It intentionally does *not* analyze `vitest.config.ts` anymore.

#### 11.4 Role In The System

This analyzer is about maintainability pressure, not type soundness or repo policy.

ASCII model:

```text
ESLint/SonarJS answers:

- Is this function too large?
- Is this file too large?
- Is branching too complex?
- Is the control flow too cognitively dense?
```

### 12. Typed ESLint

Typed linting exists as a separate slow-lane semantic pass.

#### 12.1 Purpose

Use TypeScript-aware ESLint analysis where type information is helpful, without collapsing analyzer ownership.

#### 12.2 Behavior

1. Runs with project-aware typed linting enabled.
2. Uses `recommendedTypeChecked` as the baseline.
3. Runs only in the slow lane, not in the fast pre-commit lane.
4. Excludes some rules that are intentionally owned elsewhere.

#### 12.3 Why It Is Separate

This repo avoids letting typed ESLint duplicate Biome’s role or the complexity gate’s role.

So typed lint here is:

1. slower
2. semantic
3. secondary to `tsc`
4. intentionally narrower than “all linting in one place”

### 13. Semgrep

Semgrep owns architecture and policy.

It is the repository’s primary custom rule engine.

#### 13.1 Purpose

Encode repo-specific policy that generic analyzers do not model well.

#### 13.2 Current Rule Categories

Current rule pack enforces:

1. no `as any`
2. no config weakening patterns
3. no monkeypatching
4. no suppression comments
5. no core-domain imports into infra layers
6. no storage-to-adapter imports
7. no tools-to-adapter imports
8. no temporal-to-service imports
9. required schema validation at selected boundaries

#### 13.3 Concrete Semgrep Rules

##### 13.3.1 No `as any`

Purpose:

Reject escape-hatch type casts that deliberately erase type safety.

Behavior:

Flags expressions of the form:

```text
value as any
```

##### 13.3.2 No Config Weakening

Purpose:

Catch weakening patterns directly in config or hook text.

Behavior:

Flags things like:

1. turning off `noExplicitAny`
2. turning off `noNonNullAssertion`
3. replacing required scripts with no-op commands
4. bypassing the pre-commit hook with `|| true`

This overlaps intentionally with diff-policy because the risk is high.

##### 13.3.3 No Monkeypatching

Purpose:

Reject global and prototype mutation as an implementation shortcut.

Behavior:

Flags patterns such as:

1. `SomeType.prototype.method = ...`
2. `Object.defineProperty(SomeType.prototype, ...)`
3. `globalThis.foo = ...`
4. monkeypatching built-in runtime objects like `Array`, `Object`, `Promise`, etc.

##### 13.3.4 No Suppression Comments

Purpose:

Block the easiest degradation path: silencing analyzers instead of fixing code.

Behavior:

Flags inline suppressions such as:

1. `eslint-disable`
2. `@ts-ignore`
3. `@ts-expect-error`
4. `biome-ignore`
5. `nosemgrep`
6. `semgrep: ignore`

It covers both slash-comment languages and hash-comment files such as hooks and YAML.

##### 13.3.5 Architectural Boundary Rules

Purpose:

Enforce dependency direction in code layout.

Behavior:

Current rules block:

1. `src/core/**` importing `service`, `storage`, `temporal`, or `tools`
   - with a current carve-out for `src/core/research-runner.ts`
2. `src/storage/**` importing `service`, `temporal`, or `tools`
3. `src/tools/**` importing `service`, `storage`, or `temporal`
4. `src/temporal/**` importing `service`

This keeps architectural direction explicit and machine-checkable.

##### 13.3.6 Boundary Validation Rules

Purpose:

Require schema validation at selected external boundaries.

Behavior:

Current rules require validation at:

1. service request bodies
2. remote API JSON responses
3. Temporal input objects
4. JSON loaded from storage

The rule logic mainly looks for `.parse(...)` or `.safeParse(...)` wrappers around risky ingress points.

### 14. Vitest

Vitest owns runtime behavior.

#### 14.1 Purpose

Catch actual behavioral regressions rather than static-code smells.

#### 14.2 Behavior

1. runs the repository test suite
2. is part of `verify`
3. is therefore part of `agent-policy`
4. remains the last step in the deterministic verification chain

This order is deliberate:

```text
hygiene -> types -> complexity -> policy -> behavior
```

That sequence ensures the cheapest and clearest failures happen before full execution tests.

### 15. Live Provider Tests

These are not part of the required merge gate.

#### 15.1 Purpose

Allow real end-to-end validation of credentialed providers without making ordinary PRs depend on secrets or flaky external systems.

#### 15.2 Current Live Jobs

1. Vertex live integration
2. OpenAI Codex live integration

#### 15.3 Behavior

1. manually triggered
2. secret-aware
3. self-skipping when required secrets are absent
4. non-blocking for mergeability

This is the right separation because live provider tests are valuable but not deterministic enough to be the required merge gate.

### 16. Ordered Feedback Strategy

The system is deliberately ordered so that the error feedback matches the cheapest useful correction loop.

#### 16.1 Fast Lane Order

```text
Biome
  -> Diff policy
      -> ESLint complexity
```

Why:

1. format and hygiene problems are fastest to catch
2. diff-policy catches repo-policy mistakes before slower semantic checks
3. complexity catches maintainability problems before a commit lands

#### 16.2 Full Gate Order

```text
Diff policy
  -> Biome
      -> tsc
          -> ESLint complexity
              -> Semgrep
                  -> Vitest
                      -> typed lint
```

Operationally the repository groups the middle part as `verify`, then runs typed lint after it.

Reasoning:

1. reject bad changes first
2. reject low-level hygiene problems second
3. reject type-invalid code before maintainability or architecture analysis
4. reject complexity issues before repo-specific policy failures
5. reject policy violations before behavioral tests finish
6. finish with slower semantic linting

### 17. Output And Feedback Shape

The gate system is designed to produce structured, stage-labeled failures.

In CI, the runner scripts emit step summaries so the failure is not just a wall of raw logs.

Conceptually:

```text
Agent Policy
==> Diff policy
==> Deterministic verification
==> Typed linting
```

And within deterministic verification:

```text
Verify
==> Biome hygiene
==> TypeScript typecheck
==> Complexity budgets
==> Semgrep policy rules
==> Vitest suite
```

This matters because a useful gate is not merely strict; it is legible.

-------------------------------------------------------------------------------
## Section 2: Repository-Specific Implementation
-------------------------------------------------------------------------------

### 18. Core Scripts In `research-agent/package.json`

The main repo policy commands are implemented as package scripts.

#### 18.1 Fast Local Lane

`check:fast`

Behavior:

1. `bunx biome check .`
2. `bun run policy:diff`
3. `bun run lint:complexity`

#### 18.2 Deterministic Verification

`verify`

Implemented via `bun scripts/run-verify.mjs`.

That script runs these steps in this order:

1. `lint` as `Biome hygiene`
2. `typecheck` as `TypeScript typecheck`
3. `lint:complexity` as `Complexity budgets`
4. `lint:semgrep` as `Semgrep policy rules`
5. `test` as `Vitest suite`

#### 18.3 Canonical Required Gate

`agent-policy`

Implemented via `bun scripts/run-agent-policy.mjs`.

That script runs these steps in this order:

1. `policy:diff` as `Diff policy`
2. `verify` as `Deterministic verification`
3. `lint:typed` as `Typed linting`

#### 18.4 Other Important Scripts

1. `lint` -> Biome
2. `lint:complexity` -> ESLint complexity config
3. `lint:typed` -> typed ESLint config
4. `lint:semgrep` -> Semgrep scan over code + config + hooks
5. `test:semgrep` -> Semgrep rule-pack tests
6. `typecheck` -> TypeScript project check
7. `test` -> Vitest suite
8. `prepare` -> install hooks

### 19. Step Runner Scripts

Three Bun scripts orchestrate the ordered output.

#### 19.1 `research-agent/scripts/run-step-sequence.mjs`

Function:

1. executes named package scripts one by one
2. prints step headings like `==> Step Name`
3. captures exit status
4. appends Markdown summaries to `GITHUB_STEP_SUMMARY` in CI
5. aborts immediately on first failing step

This is what gives the CI gate its structured, per-stage summary.

#### 19.2 `research-agent/scripts/run-verify.mjs`

Function:

Declares the ordered `verify` steps and hands them to the generic runner.

#### 19.3 `research-agent/scripts/run-agent-policy.mjs`

Function:

Declares the ordered top-level `agent-policy` steps and hands them to the generic runner.

### 20. Local Hooks

#### 20.1 `research-agent/.githooks/pre-commit`

Runs:

```text
bun run check:fast
```

Function:

1. fast local rejection before commit creation
2. format/hygiene check
3. staged diff policy check
4. complexity budget check

#### 20.2 `research-agent/.githooks/pre-push`

Runs:

```text
bun run agent-policy
```

Function:

1. full local slow lane before push
2. same canonical gate as CI

### 21. Biome Configuration

File:

`research-agent/biome.json`

Important implementation details:

1. ignores `node_modules`, `.data`, `coverage`, and `semgrep/rules`
2. formatter enabled
3. linter enabled
4. `rules.all = true`
5. `recommended = false`
6. complexity group disabled
7. `suspicious.noExplicitAny = error`
8. `style.noNonNullAssertion = error`
9. several repo-specific relaxations remain intentional, such as allowing `console`

Meaning:

Biome is configured as a broad hygiene engine, but it is intentionally prevented from becoming the complexity-budget owner.

### 22. ESLint Complexity Configuration

File:

`research-agent/eslint.complexity.config.mjs`

Important implementation details:

1. scope: `src/**/*.ts`, `test/**/*.ts`
2. ignores: `node_modules`, `.data`, `coverage`
3. parser: `@typescript-eslint/parser`
4. rules:
   - `complexity: 10`
   - `max-lines: 400`
   - `max-lines-per-function: 50`
   - `sonarjs/cognitive-complexity: 15`
5. `vitest.config.ts` is intentionally excluded

Meaning:

This file is the hard owner of size and complexity ceilings.

### 23. Typed ESLint Configuration

File:

`research-agent/eslint.typed.config.mjs`

Important implementation details:

1. uses `@eslint/js`
2. uses `typescript-eslint`
3. includes `recommendedTypeChecked`
4. enables `parserOptions.projectService = true`
5. scopes to `src/**/*.ts` and `test/**/*.ts`
6. intentionally disables some rules already owned elsewhere or judged too noisy for this repo
7. intentionally leaves `no-explicit-any` and `no-non-null-assertion` off here because those are enforced by Biome

Meaning:

Typed lint exists, but it is intentionally constrained so analyzer ownership remains clean.

### 24. Semgrep Scan Scope

Script:

`lint:semgrep`

Semgrep scans:

1. `src`
2. `test`
3. `biome.json`
4. `eslint.complexity.config.mjs`
5. `package.json`
6. `tsconfig.json`
7. `.githooks`

Meaning:

Semgrep is not only scanning code. It also scans the enforcement surface itself.

### 25. Semgrep Rules Implemented

Rule files under `research-agent/semgrep/rules`:

1. `no-as-any.yml`
2. `no-config-weakening.yml`
3. `no-domain-to-infra-imports.yml`
4. `no-monkeypatching.yml`
5. `no-storage-to-adapter-imports.yml`
6. `no-suppression-comments.yml`
7. `no-temporal-to-service-imports.yml`
8. `no-tools-to-adapter-imports.yml`
9. `require-boundary-validation.yml`

Rule-pack tests are exercised via:

```text
semgrep test semgrep/rules
```

### 26. Diff Policy Engine

Core files:

1. `research-agent/src/diff-policy.ts`
2. `research-agent/src/diff-policy-enforcement.ts`
3. `research-agent/src/diff-policy-config.ts`
4. `research-agent/src/diff-policy-complexity.ts`
5. `research-agent/src/diff-policy-manifest.ts`
6. `research-agent/src/diff-policy-shared.ts`

#### 26.1 Modes

The engine supports two modes:

1. `staged`
   - local hooks
   - reads the staged tree
2. `range`
   - PR CI
   - compares PR base and head refs

This is an important implementation choice because CI should evaluate the PR diff, not the local staged diff.

#### 26.2 Shared Thresholds And Protected Paths

Defined in `diff-policy-shared.ts`:

1. `MAX_CHANGED_LINES = 150`
2. `MAX_CHANGED_FILES = 5`
3. protected enforcement paths include:
   - required workflow
   - hooks
   - runner scripts
   - diff-policy engine files
   - Semgrep rule pack

#### 26.3 Violation Collection

Implemented in `diff-policy-enforcement.ts`.

It produces the four policy types:

1. `large-diff`
2. `enforcement-change`
3. `config-weakening`
4. `complexity-regression`

#### 26.4 Config Weakening Logic

Implemented in `diff-policy-config.ts`.

It checks:

1. required scripts still exist
2. `agent-policy` still points to the runner
3. `check:fast` still includes Biome + diff policy + complexity lint
4. `lint:typed` still uses the typed config and TS file globs
5. `verify` still includes the required verification runner
6. `lint:semgrep` still scans the required enforcement surfaces
7. Biome still ignores `semgrep/rules`
8. Biome complexity remains disabled
9. `noExplicitAny` stays enforced in Biome
10. `noNonNullAssertion` stays enforced in Biome
11. complexity config still contains the required budgets
12. typed ESLint config still includes required typed-lint markers
13. diff-policy shared config still contains protected thresholds and required rule references
14. `skipLibCheck` remains banned
15. hooks still call the correct gates
16. the required workflow still exists and remains PR-based
17. required Semgrep rule files still exist

#### 26.5 Complexity Regression Logic

Implemented in `diff-policy-complexity.ts`.

It parses TypeScript source using `@typescript-eslint/parser` and computes:

1. relevant file LOC
2. max function LOC
3. max cyclomatic complexity
4. max cognitive complexity

It currently applies only to changed `src/**/*.ts` files.

### 27. Exception Manifest

File:

`research-agent/policy-exceptions.json`

Current state:

```json
{
  "version": 1,
  "exceptions": []
}
```

Validation and coverage logic live in:

`research-agent/src/diff-policy-manifest.ts`

Important implementation details:

1. manifest self-edits do not recursively require exceptions for the manifest file itself
2. if the manifest is touched, entry structure is validated strictly
3. expired exceptions are ignored during violation coverage even if the manifest is unchanged
4. uncovered violations surface as failures with explicit policy names and paths

### 28. TypeScript Configuration

File:

`research-agent/tsconfig.json`

Behavioral implication:

1. `skipLibCheck` is not allowed
2. typecheck is a hard gate
3. package script does not need `--noEmit` because the TS config already governs project behavior

### 29. Required CI Workflow

Workflow file:

`.github/workflows/agent-policy.yml`

Implementation details:

1. workflow name: `agent-policy`
2. trigger: `pull_request` on `main`
3. not triggered on `push`
4. full checkout with `fetch-depth: 0`
5. installs Bun
6. installs Python
7. installs Semgrep via pip
8. runs `bun install --frozen-lockfile`
9. runs `bun run agent-policy`
10. sets:
    - `DIFF_POLICY_MODE=range`
    - `DIFF_POLICY_BASE_REF=<PR base SHA>`
    - `DIFF_POLICY_HEAD_REF=<PR head SHA>`
11. appends a summary to `GITHUB_STEP_SUMMARY`

Meaning:

The required CI gate is intentionally just the repo’s canonical gate, executed in PR-diff mode.

### 30. Live Provider Workflow

Workflow file:

`.github/workflows/live-provider-tests.yml`

Implementation details:

1. trigger: `workflow_dispatch`
2. separate `live-vertex` and `live-openai-codex` jobs
3. each job installs Bun and dependencies
4. jobs self-skip cleanly when required secrets are missing
5. Vertex job materializes ADC JSON at runtime
6. OpenAI Codex job uses `OPENAI_CODEX_ACCESS_TOKEN`
7. default live Codex model falls back to `gpt-5.2`

Meaning:

Live provider checks exist, but they are intentionally decoupled from mergeability.

### 31. GitHub Branch Protection

Current GitHub-side protection for `main` is:

1. required status check: `agent-policy`
2. strict status checks: enabled
3. admin enforcement: enabled
4. required pull-request review settings present, with `0` required approvals
5. force pushes disabled
6. deletions disabled

This is repository-settings enforcement, not code-in-repo enforcement.

### 32. Practical Failure Modes By Stage

This is how failures typically look in practice.

#### 32.1 Diff Policy Failure

Typical causes:

1. too many changed lines
2. too many files changed
3. editing policy files without an exception
4. reintroducing `skipLibCheck`
5. weakening hooks or workflow scripts
6. making a source file more complex than before

#### 32.2 Biome Failure

Typical causes:

1. formatting drift
2. `any`
3. non-null assertions
4. generic suspicious or correctness findings

#### 32.3 Typecheck Failure

Typical causes:

1. broken imports
2. invalid types
3. incompatible runtime schemas and types

#### 32.4 Complexity Failure

Typical causes:

1. function too large
2. file too large
3. cyclomatic complexity too high
4. cognitive complexity too high

#### 32.5 Semgrep Failure

Typical causes:

1. inline suppression comment
2. `as any`
3. monkeypatching
4. architecture boundary violation
5. unvalidated boundary ingress
6. config weakening pattern

#### 32.6 Test Failure

Typical causes:

1. behavioral regression
2. invalid integration assumptions
3. changed runtime contracts

#### 32.7 Typed Lint Failure

Typical causes:

1. semantic TypeScript lint findings from the typed rule set
2. issues that are not pure type errors but still require project-aware linting

-------------------------------------------------------------------------------
## Section 3: Improvements That Could Be Made
-------------------------------------------------------------------------------

### 33. Highest-Value Improvements

#### 33.1 Tighten Architectural Boundaries Further

Current architecture rules are useful but still selective.

Good next step:

1. eliminate remaining carve-outs where possible
2. add more explicit layer-direction rules
3. document intended dependency graph and mirror it with Semgrep

ASCII target:

```text
core        -> may depend on nothing below it
storage     -> may depend on core only
tools       -> may depend on core only
temporal    -> may depend on core and selected adapters only
service     -> may depend on orchestration and boundary schemas
```

#### 33.2 Expand Boundary Validation Coverage

Current boundary-validation rules cover several important cases, but not every external ingress.

Good next step:

1. model output parsing
2. file IO beyond `JSON.parse(...)`
3. additional queue or workflow payload shapes
4. environment/config boundary validation patterns
5. tool output that becomes structured data

#### 33.3 Make Typed Lint More Deliberate

Typed lint is present, but currently conservative.

Good next step:

1. review which typed rules are disabled
2. re-enable only those that add clear value without duplicating Biome or `tsc`
3. keep the rule set small and high-signal

#### 33.4 Improve CI Annotations

The runner scripts already produce step summaries, which is good.

Good next step:

1. add TypeScript problem matchers if not already present through the environment
2. add SARIF publishing for Semgrep if inline GitHub code scanning is desired
3. publish richer per-step artifacts when failures occur

This would improve agent feedback quality further.

### 34. Medium-Value Improvements

#### 34.1 Add More Rule-Pack Documentation

The Semgrep rules are clear in code, but a concise policy README for them would help new contributors and future LLMs understand the intent faster.

#### 34.2 Add Policy Metrics Reporting

Useful but optional:

1. average changed lines per PR
2. most common failing policy
3. complexity regression trend
4. frequency of exception usage

This would turn the gate system into a measurement system as well.

#### 34.3 Narrow Diff-Policy Complexity Metrics To Touched Functions

Current no-regression logic compares per-file maxima.

That is already useful, but a future refinement could compare only changed functions instead of whole-file maxima.

Tradeoff:

1. more precise
2. more implementation complexity
3. higher risk of brittle heuristics

#### 34.4 Add More Live Providers Only If They Stay Non-Blocking

If more providers are added, keep the same pattern:

1. secret-aware
2. manual or scheduled
3. not part of required mergeability

That preserves deterministic PR gating.

### 35. Low-Value Or Potentially Harmful Changes To Avoid

#### 35.1 Do Not Collapse Analyzer Ownership Back Together

Avoid making:

1. Biome also own complexity budgets
2. typed ESLint also own `no any` and non-null assertions
3. Semgrep also become a generic lint tool

That would blur failure ownership and reduce clarity.

#### 35.2 Do Not Make Live Provider Tests Required For Ordinary PRs

That would reintroduce secrets and external flakiness into the required merge path.

#### 35.3 Do Not Reintroduce Inline Suppressions As The Primary Escape Hatch

The exception manifest system is stronger because it is:

1. centralized
2. reviewable
3. expiring
4. path-scoped

### 36. Overall Assessment

The current system is strong because it has three characteristics at once:

1. clear ownership boundaries between analyzers
2. a deterministic required gate for CI and local slow-lane use
3. a diff-aware policy engine that protects the enforcement surface itself

In practice, the most distinctive parts are:

1. the diff-aware policy gate
2. the exception manifest with real expiry enforcement
3. the clean analyzer intent split
4. the PR-only required CI gate
5. the separation of deterministic merge checks from live provider checks

That combination makes the system suitable for both human contributors and autonomous agents.
