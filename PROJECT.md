# PROJECT.md: Repository Inspector assessment plan

Read this at the start of every session. It tells you what the project is,
what to do in which order, and which tools to use at each step. Rules and
conventions are in `CLAUDE.md`.

> Provenance: this plan and the issue list were drafted with Claude (chat)
> from a read-only look at the starter, before the 90-minute timer started.
> Every issue below is a **hypothesis until reproduced**.

## 1. What the project is

A small TypeScript tool that answers "what changed on this branch, and do the
checks pass?". Two front doors share one engine:

```
cli.ts (developers) ─────┐
                         ├─► core.ts ─► git.ts         git diff <base>...HEAD → changed files
mcp-server.ts (AI agents)┘           ─► validation.ts  runs commands like "npm test"
                                     ─► report.ts      Markdown report
```

The goal: improve correctness, safety, reliability, contract, output, docs
and tests, then justify a production interface choice (CLI-first,
MCP-first or hybrid). Completion is not required. Verified, honestly scoped
work is.

## 2. Interface decision: CLI-first (Emin's decision)

**Decision: CLI-first, with MCP kept as a secondary, restricted adapter over
the same core.** This is decided. Don't re-open it, but tell Emin if you find
evidence against it.

**Why (Emin's reasoning):**

- **Primary user:** a developer, or a coding agent that already has a
  terminal (Claude Code, Cursor, Codex), running the tool locally or in CI.
  All of them can run a CLI, so one interface serves the main users.
- **Secondary user:** agents without shell access. They get MCP, limited to
  what is safe.
- **Context cost:** a CLI costs an agent nothing until it's used. An MCP
  tool's description sits in the agent's context all the time, and its
  output goes straight into the context.
- **Trust boundary:** the CLI caller is a human (or an agent the human
  already lets run shell commands), so running the validation commands they
  pass is acceptable. The MCP caller is a model that may have read untrusted
  repo content (prompt injection), so it must not choose arbitrary shell
  commands.
- **Scope:** in 90 minutes, one interface done properly is worth more than
  two done halfway.

**What this means for the implementation:**

| | CLI (primary) | MCP (secondary, restricted) |
|---|---|---|
| Inspect a repo / base ref | ✅ full | ✅ full |
| Validation commands | ✅ any command the caller passes | ⚠️ only exact matches from an allow-list set at server start (default: none) |
| Output | Full report written to a file (default `review-report.md`) | Report returned inline, **size-capped**, summary first |
| Errors | Clear message + non-zero exit code | Clear MCP error result (`isError`), no stack traces |
| Investment | Most fixes, flags and tests go here | Fix the contract bug, add the restrictions, one end-to-end test |

**Consistency rule:** both adapters call the same core function with the same
request type. For the same repo and the same allowed commands, they must
report the same changed files and validation results. The **only** intended
differences are the allow-list, the output cap and where the output goes.
Each difference must be documented in the README and covered by a test. One
test runs the same fixture through both adapters and compares the results.

**Evidence that would change the decision:** usage data showing most callers
are agents without shell access, or hosts that depend on MCP tool discovery.
Either would push toward MCP-first or hybrid.

Emin writes this in his own words in SUBMISSION.md. Don't write it for him.

## 3. Issue list (ranked hypotheses: reproduce first)

| # | File | Hypothesis | How to reproduce |
|---|---|---|---|
| 1 | validation.ts | Non-zero exit rejects the promise: no report, later commands skipped; status `failed` never produced | CLI with `--validate "exit 1"` |
| 2 | mcp-server.ts | Schema declares `repo_path`, handler reads `input.repoPath` (undefined), typed `any` | call the tool via in-memory client |
| 3 | mcp-server.ts | Agent-supplied `validationCommands` run through a shell with no restriction | tool call with `["echo hi > pwned.txt"]` |
| 4 | cli.ts | `--repo` value is cut at the first space (`.split(" ")[0]`); missing flag values not reported | `--repo "../my demo"` |
| 5 | git.ts | Renames (`R100\told\tnew`) become "modified" with both paths joined; copies likewise | fixture with `git mv` |
| 6 | git.ts | Uncommitted and untracked changes ignored; `untracked` status never produced | fixture with uncommitted file |
| 7 | git.ts | Base hard-coded to `main`; unknown ref throws a raw stack trace; ref starting with `-` is passed to git as an option | `--base-ref nope`, `--base-ref "--output=x"` |
| 8 | validation.ts | No timeout; `exec` default maxBuffer (1 MB) kills large output; stderr dropped when stdout is non-empty | `--validate "sleep 999"` |
| 9 | report.ts | Pass/fail not shown; output containing ``` breaks the Markdown fence; no size cap; no summary | unit test |
| 10 | cli.ts, core.ts | `--format json` accepted but ignored; invalid format not rejected | `--format json` |
| 11 | package.json | `bin` points to `dist/cli.js`; with `rootDir: "."` the build writes `dist/src/cli.js` | `npm run build && ls dist` |
| 12 | mcp-server.ts | Top-level `await server.connect(...)` makes the module impossible to import in tests | try to import it |

Priority under the CLI-first decision:
- **Must do:** #1 (core, affects everyone), #4 (CLI is the primary
  interface), then #2, #12 and #3 (MCP must be correct and safe, even
  though it is secondary).
- **If time allows:** #5–#9, which improve the primary CLI report.
- **Nice-to-have, or list as known limitations:** #10–#11.
- **Out of scope:** feature parity between CLI and MCP. It's not a goal
  under CLI-first.

## 4. Steps

Time budget is a guide. If a step overruns, finish the current fix cleanly,
then move unfinished items to "known limitations".

### Step 0: Setup (≈5 min)
- Guardrails are active (see CLAUDE.md "Guardrails"). Emin confirms with
  `/hooks` that the 2 PreToolUse hooks and 1 Stop hook are loaded.
- Do: `npm install`, `npm run typecheck`, `npm test`. Record outcomes in
  `WORKLOG.md`.
- Create a demo repo **outside** this repo:
  ```bash
  mkdir -p ../demo && cd ../demo && git init -b main
  echo a > a.txt && git add . && git -c user.name=demo -c user.email=demo@example.com commit -m init
  git checkout -b feature && git mv a.txt b.txt && echo x > c.txt
  git add . && git -c user.name=demo -c user.email=demo@example.com commit -m change
  echo y > untracked.txt && cd -
  ```
- Tools: Bash.

### Step 1: Investigate (≈10 min), plan mode, no edits
- Read every file in `src/` and `test/` plus `package.json`, `tsconfig.json`,
  `.github/workflows/public-checks.yml`.
- Confirm or reject each hypothesis in section 3 by running it. Update the
  table with ✅ confirmed / ❌ not reproduced / ➕ newly found.
- Check the installed MCP SDK API (context7, or read
  `node_modules/@modelcontextprotocol/sdk/`): how `server.tool` /
  `registerTool` work in 1.29.0, and where `InMemoryTransport` and `Client`
  are exported. Write the exact import paths in WORKLOG.md.
- Tools: Read, Grep, Glob, Bash (repro only), context7. Optionally an
  **Explore** subagent for the file sweep.
- Output: confirmed, ranked list. Ask Emin to approve the order.

### Step 2: Fix #1, validation failures (≈10 min)
- Test first: a failing command yields `status: "failed"`, an exit code,
  combined stdout and stderr, and the next command still runs.
- Fix: catch errors per command, never reject the whole run. Add a timeout
  and a larger `maxBuffer`. Distinguish timeout from non-zero exit. Extra
  fields on `ValidationResult` are optional.
- Tools: Write (test), Edit, Bash (`npm test`).
- Note for every fix: after writing the failing test, the Stop hook will
  block once. Reply "intentional TDD red step" with the failing output, then
  wait for Emin. Put new tests in **new files** (e.g.
  `test/validation.test.ts`): `test/report.test.ts` is protected.

### Step 3: Fix #4 (+#10 if quick), CLI as the primary interface (≈10 min)
- Keep the whole `--repo` value. Error on a missing flag value or unknown
  flag. Validate `--format` (`markdown` | `json`). Implement JSON output only
  if quick, otherwise error clearly that it isn't supported yet.
- Exit codes, so CI and agents can rely on them: `0` = report written and
  all validations passed, `1` = usage or runtime error, `2` = report
  written but at least one validation failed. Still write the report on
  failure.
- Errors print a one-line message, not a stack trace.
- Tests: a path with spaces works; a missing value gives the usage message
  and exit code 1; a failing `--validate` writes the report and exits 2.
- Tools: Edit, Write, Bash.

### Step 4: Fix #2 + #12, MCP contract (≈10 min)
- Refactor `mcp-server.ts` to export a `createServer()` function. Connect
  the stdio transport only when the file is run directly.
- Make the handler read the declared `repo_path` field with a typed
  schema (no `any`), so the compiler catches a mismatch.
- Errors come back as an MCP error result (`isError: true`) with a short
  message, never a crash or a stack trace.
- Test via the SDK's in-memory transport: calling `review_repository` on a
  fixture repo returns that repo's changes.
- Tools: context7 (SDK API), Edit, Write, Bash.

### Step 5: Fix #3, MCP restrictions + consistency (≈10 min)
- Validation commands for MCP come only from an allow-list fixed at server
  start (for example the env var `INSPECTOR_ALLOWED_VALIDATIONS`, one command
  per line). Exact match only. Anything else is refused with a clear error.
  Default: none allowed.
- Validate `repo_path`: it must exist and be a git work tree, with a clear
  error otherwise.
- Cap the MCP response size (summary first, then details, with a
  "truncated" note) to protect the agent's context.
- Update the tool description so an agent knows what is allowed and that
  it is restricted on purpose.
- Do **not** add regex "sanitizing" of commands.
- Tests:
  - an allow-listed command runs
  - a non-listed one is refused and has no side effect
  - the **consistency test**: the same fixture through the CLI path and the
    MCP path gives the same changed files and validation statuses
- Tools: Edit, Write, Bash.

### Step 6: If time allows: #5–#9 (≈15 min)
- git.ts:
  - use `execFile` args with `--`
  - reject refs starting with `-`
  - verify the base with `git rev-parse --verify --quiet <ref>^{commit}`
  - turn on rename detection and parse `R`/`C` lines into the new path
  - optionally include uncommitted and untracked files with `status: "untracked"`
- report.ts:
  - show pass/fail per command and a summary at the top
  - use a fence longer than any backtick run in the output
  - cap output per command with a "truncated" note
- One issue per commit. Stop when 15 minutes remain.

### Step 7: Final verification and docs (≈10 min)
- `npm run typecheck && npm run build && npm test`: all green.
- Run the CLI on `../demo` (with and without a failing `--validate`) and read
  `review-report.md`.
- Optional: start `npm run mcp-server` and call it from a real MCP client.
- Update README: CLI-first decision and the CLI/MCP difference table,
  allow-list env var, exit codes, any new flags.
- Optional: a **reviewer subagent** with read-only tools reviews the full
  diff for bugs, contract breaks and missing tests. Fix only real issues.
- Tools: Bash, Edit, subagent.

### Step 8: Hand-off to Emin (≈5 min)
- Give Emin from WORKLOG.md:
  - what was fixed, with commit hashes
  - commands run and their outcomes
  - what was not done, and why
  - every AI suggestion that was corrected or rejected
  - blockers
- Emin writes SUBMISSION.md in his own words, commits, and pushes. Do not
  push (it is blocked anyway).
- Also report any time a guardrail blocked you and what you did instead.
  That is useful evidence for SUBMISSION.md.

## 5. WORKLOG.md format

```markdown
## <time> Step N: <title>
- Command: `...` → outcome (pass/fail, key line)
- Decision: ... because ...
- AI suggestion rejected/corrected: ... → why
```

## 6. Definition of done (per fix)

1. A test that failed before and passes now.
2. `npm run typecheck && npm run build && npm test` green.
3. No public contract renamed or removed.
4. Diff reviewed by Emin, then committed with a clear message.
5. WORKLOG.md updated.
