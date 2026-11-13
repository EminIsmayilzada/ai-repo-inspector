# WORKLOG.md

Running log of commands, decisions and outcomes. Format per PROJECT.md §5.

## 2026-11-13 Step 0: Setup

- Command: `npm install` → pass. 143 packages added. `npm audit` reports
  15 vulnerabilities (6 moderate, 8 high, 1 critical) in transitive deps —
  not actioned (no new/changed dependencies allowed without Emin's
  approval, and this is pre-existing in the starter's lockfile).
- Command: `npm run typecheck` → pass, no errors.
- Command: `npm test` → pass, 1/1 (`test/report.test.ts`).
- Created the demo fixture at `C:\Users\hp\projects\demo` (sibling of this
  repo) exactly per PROJECT.md: `main` has `a.txt`; branch `feature` has
  `git mv a.txt b.txt` + new `c.txt`, committed; plus an untracked
  `untracked.txt`. Commits made with `-c user.name=demo -c
  user.email=demo@example.com`, local to that repo only.
- MCP SDK 1.29.0 import paths (context7 not available in this session;
  read `node_modules/@modelcontextprotocol/sdk/package.json` exports +
  `dist/esm` instead, per CLAUDE.md fallback):
  - `McpServer` → `@modelcontextprotocol/sdk/server/mcp.js` (already used
    in `src/mcp-server.ts`)
  - `StdioServerTransport` → `@modelcontextprotocol/sdk/server/stdio.js`
    (already used)
  - `Client` → `@modelcontextprotocol/sdk/client/index.js`,
    constructor `new Client({ name, version })`, `client.connect(transport)`,
    `client.callTool({ name, arguments })`
  - `InMemoryTransport` → `@modelcontextprotocol/sdk/inMemory.js`, static
    `InMemoryTransport.createLinkedPair()` returns `[serverTransport,
    clientTransport]`

## 2026-11-13 Step 1: Investigate — reproduction results

Platform note logged up front because it affected how #8 was reproduced:
**validation commands run through whatever shell `node:child_process.exec`
picks per OS** — `cmd.exe` on Windows (this machine), a POSIX shell (`sh`)
on Linux/macOS/CI. `sleep 999`, `echo hi > pwned.txt` etc. from the original
hypotheses are POSIX-only and don't work as literally written on Windows.
Reproduced with Node one-liners instead (portable). **This shell dependency
itself is worth a line in the README** — a validation command that passes
in CI (Linux) may behave differently or not exist locally (Windows), and
vice versa.

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | `validation.ts`: non-zero exit rejects the promise, no report, status `failed` never produced | ✅ confirmed | `inspector review --repo ../demo --validate "exit 1"` → uncaught rejection, raw stack trace (`Error: Command failed: exit 1`) to stderr, `review-report.md` **not written at all**, exit code 1. |
| 2 | `mcp-server.ts`: schema says `repo_path`, handler reads `input.repoPath` | ✅ confirmed — worse than hypothesized | Real `InMemoryTransport`+`Client` call with `{ repo_path: "../demo" }` (exact schema field) → `repositoryPath` resolves to `undefined`. Does **not** crash: `execFileSync(..., { cwd: undefined })` silently inherits the server process's own cwd, so git ran against **this repo** instead of the target, returning an empty, misleading `# Review Report: undefined` with no changed files and no error. A caller doing exactly what the schema says gets silent wrong-repo output, not a visible failure. |
| 3 | `mcp-server.ts`: agent-supplied `validationCommands` run through a shell, unrestricted | ✅ confirmed | Same in-memory call with `validationCommands: ["node -e \"require('fs').writeFileSync('pwned.txt','pwned')\""]` → command executed, no allow-list check anywhere. Because of #2's cwd bug, the file landed in **this repo's own root** (`pwned.txt`, created and verified, then deleted). Confirms both "no restriction" and that the blast radius is the server's own filesystem, not just the intended target repo. |
| 4 | `cli.ts`: `--repo` cut at first space; missing flag values unreported | ✅ confirmed, with one correction | `--repo "../my demo"` → parsed path truncated to `../my` (confirmed indirectly: both this and a deliberately nonexistent `--repo ../nonexistent-dir-xyz` produce the identical low-level `spawnSync git ENOENT` from a nonexistent `cwd`, a Windows-specific symptom of a bad path, not a clear "path not found" message). Missing value for `--validate` (flag is last arg) → uncaught `TypeError [ERR_INVALID_ARG_TYPE]` raw stack trace, process crashes. Unknown flags (e.g. `--unknown-flag somevalue`) are silently dropped with **no error at all**, run continues normally. **Correction to the original hypothesis:** a missing value for `--repo` itself is *already* handled — `!args.repositoryPath` triggers the usage message + exit 1, so that specific case is not a bug; the real gaps are missing-value crashes on other flags (`--validate`, `--base-ref`) and silently-ignored unknown flags. |
| 5 | `git.ts`: renames become "modified" with joined paths | ✅ confirmed | Review across `main...feature` (which has `git mv a.txt b.txt`) → report line `- a.txt\tb.txt (modified)` (literal tab character joining both paths, status `modified` not `renamed`). |
| 6 | `git.ts`: uncommitted/untracked changes ignored, `untracked` status never produced | ✅ confirmed | Demo repo has `untracked.txt` present (`git status --porcelain` → `?? untracked.txt`) throughout every run above; it never once appears in any `markdownReport` output. |
| 7 | `git.ts`: base hard-coded to `main`; unknown ref throws raw stack trace; ref starting with `-` passed to git as an option | ✅ confirmed, with a sharper finding | `--base-ref nope` → raw `status: 128` object dumped to stderr with full git stderr text, not a clean message. `--base-ref "--output=x"` → **no error at all**; git parsed `--output=x...HEAD` as its own `--output` flag and silently wrote a file literally named `x...HEAD` inside the target repo instead of diffing (verified: file existed, deleted after). This is git argument injection via an unvalidated `--base-ref`, not just a crash risk. |
| 8 | `validation.ts`: no timeout; default 1 MB maxBuffer; stderr dropped when stdout non-empty | ✅ confirmed (all three parts; Windows-adapted repro per Emin's correction — `cmd.exe`, not `sh`) | No timeout: `--validate "node -e \"setTimeout(()=>{}, 600000)\""` was still running after a 20s wait (moved to background, manually killed — see Decision below) — nothing bounds it short of the full 600s. MaxBuffer: `--validate "node -e \"process.stdout.write('x'.repeat(2000000))\""` → raw `RangeError [ERR_CHILD_PROCESS_STDIO_MAXBUFFER]` stack trace, process crashes, no report. Stderr dropped: `--validate "node -e \"console.log('out'); console.error('err')\""` → report shows only `out`, `err` never appears (`output: stdout \|\| stderr` discards stderr whenever stdout is non-empty). |
| 9 | `report.ts`: no pass/fail shown; output containing ` ``` ` breaks the fence; no size cap; no summary | ✅ confirmed (pass/fail, broken fence, no summary — directly observed; size cap not separately tested, no evidence found either way) | Every report above has no "passed"/"failed" marker per command and no top summary, just `# Review Report: <path>` → file list → raw validation dumps. A validation command that prints `` ``` `` (`node -e "console.log(String.fromCharCode(96,96,96)+' injected')"`) produced ```` ``` `` ` injected ```` inside the report — the inner triple-backtick closes the outer fence early, breaking the Markdown structure for everything after it. |
| 10 | `cli.ts`/`core.ts`: `--format json` accepted but ignored; invalid format not rejected | ✅ confirmed | `--format json` produces byte-identical Markdown output to no `--format` at all. `--format totally-invalid-format` is **also** silently accepted (writes the same Markdown report, no validation error) — the field is parsed but never read by `core.ts`/`report.ts` at all. |
| 11 | `package.json`: `bin` → `dist/cli.js`, but `rootDir: "."` makes `tsc` write `dist/src/cli.js` | ✅ confirmed | `npm run build` → `dist/` contains `dist/src/*.js` and `dist/test/`; `dist/cli.js` does **not exist**. The published `bin` entry would 404 on install. |
| 12 | `mcp-server.ts`: top-level `await server.connect(...)` makes the module impossible to import in tests | ✅ confirmed | `mcp-server.ts` has **zero exports** — nothing to attach a second (in-memory) transport to even if import succeeded. Importing it with no stdio piped in (`node ... < /dev/null`) does not throw, but the process never exits on its own: running it under `timeout 5` killed it after 5s (exit 124); the stdio transport keeps the event loop alive waiting for input forever. Any test runner that imports this module as-is hangs until force-killed. |

**No hypothesis was rejected.** All 12 reproduced. One hypothesis (#4) is
partially corrected above (missing `--repo` value is already handled).
Two hypotheses (#2, #3) turned out to compound: because of #2's `cwd:
undefined` fallback, #3's unrestricted command execution lands in the
**server's own working directory**, not just the caller's intended
target — raises the severity of #3 above what was originally written.

- Decision: for the #8 no-timeout repro, used the Bash tool's own 20s
  timeout rather than letting the Node process run the full 600s, then
  killed the backgrounded task explicitly — sufficient to prove "it does
  not stop on its own," no need to burn the full 10 minutes.
- Decision: reproduced #2/#3 by re-registering the exact same tool
  schema/handler code from `mcp-server.ts` in a throwaway script
  (`.repro-mcp.mjs`, deleted after use, never committed) wired to a real
  `InMemoryTransport`/`Client` pair, instead of importing `mcp-server.ts`
  directly — confirmed separately (hypothesis #12) that a direct import
  hangs the process and exposes no `server` to attach a second transport
  to, so this was the only way to exercise the real handler logic through
  the real SDK without spawning a process (which CLAUDE.md rules out for
  MCP tests).
- No code in `src/` or `test/` was changed in this phase. All throwaway
  repro artifacts (`.repro-mcp.mjs`, `pwned.txt`, injected git-diff output
  file) were deleted after use; `git status --porcelain` in this repo is
  clean.

## 2026-11-13 Re-ranking (Emin's call, after reviewing the confirmed list)

- Decision: move **#7 into must-do**, right after the MCP fixes. Reason:
  the `--base-ref "--output=x"` repro showed real git argument injection
  (git silently wrote a file into the target repo instead of diffing),
  not just a crash risk — and the fix is small (reject refs starting with
  `-`, verify the ref with `git rev-parse --verify`, pass `--` before
  paths/refs).
- New order: **#1 → #4 → #12+#2 → #3 → #7**, then #5/#6/#8/#9 if time
  allows. #10/#11 stay nice-to-have/known-limitations.
- This supersedes the priority grouping I proposed after Step 1 (which
  had kept #7 in the "if time allows" band with #5/#6/#8/#9).

## 2026-11-13 Step 2: Fix #1 (validation failures)

- Test first: added `test/validation.test.ts` (new file, `test/report.test.ts`
  untouched) asserting a non-zero exit resolves with `status: "failed"`, an
  `exitCode`, combined stdout+stderr, and that the next command still runs.
  `npm run typecheck` passed; `npm test` failed with the exact crash from
  the #1 repro (`Error: Command failed: ...`), i.e. failed for the right
  reason. Stopped there per the TDD workflow and got Emin's go-ahead.
- Fix in `src/validation.ts`: `runValidation` no longer `reject()`s on a
  non-zero exit — it resolves `{ status: "failed", exitCode, output }`.
  `output` is now `stdout` and `stderr` combined (`[stdout, stderr].filter
  (Boolean).join("\n")`), fixing the `stdout || stderr` drop from #8 as a
  side effect of touching this branch anyway. Added a `timeoutMs` parameter
  (default 5 minutes, per Emin) and a larger `maxBuffer` (10 MB, up from
  Node's 1 MB default) on the underlying `exec()` call. `ValidationResult`
  gained an optional `exitCode?: number` field — existing callers/tests
  unaffected.
- Added a second test: a command with a 60s internal `setTimeout` given a
  300ms `timeoutMs` resolves `status: "failed"` with a "timed out" message
  instead of hanging.
- **Known limitation found while verifying this (Windows-specific, logged
  here rather than fixed — out of scope for #1):** `exec()`'s `timeout`
  option kills only the immediate shell process. On Windows, `exec` runs
  commands through `cmd.exe /d /s /c "<command>"`; when the timeout fires,
  Node calls `.kill()` on that `cmd.exe` process only. Windows has no
  POSIX-style process-group signal propagation, so a grandchild the shell
  spawned (e.g. the `node -e ...` in the timeout test) is **not** killed
  and keeps running until it finishes on its own. Observed directly: after
  the timeout test, two orphaned `node.exe` processes were still alive
  (checked with `tasklist`), and the temp directory they were still `cwd`'d
  into could not be removed (`EPERM`) until they exited on their own ~60s
  later. A correct fix is a tree-kill (`taskkill /pid <pid> /t /f` on
  Windows, a negative-pid signal to a detached process group on POSIX) —
  real but non-trivial additional scope, so it is **not implemented**.
  The test's own cleanup was changed to a best-effort `try/catch` around
  `rmSync` so this known limitation doesn't fail the test; the actual
  behavior under test (status/message) is unaffected and still asserted.
- **Separate newly-found issue (➕, not fixed, flagged for awareness):**
  running the CI order (`npm run typecheck && npm run build && npm test`)
  leaves `dist/` present when `vitest run` executes, and vitest has no
  configured `exclude` for it, so every test file under `test/` runs
  **twice** — once from source, once from the compiled copy under
  `dist/test/`. This inflates the reported test/file counts (e.g. "2
  failed | 2 passed (4)" for what is really 2 distinct tests) and doubles
  the side effects of every test (relevant here: two orphaned processes
  per run, not one). This is a consequence of #11 (no `rootDir`/`outDir`
  separation) compounding with a missing vitest exclude — connected to
  #11 but a distinct fix (a `vitest.config.ts` or `test.exclude`), so left
  as-is pending Emin's call on whether to fix it now or list it as a known
  limitation.
- Verification: `npm run typecheck && npm run build && npm test` all
  green after the fixes above (ignoring the double-run noise described
  above, which affects test *counting*, not correctness).

## 2026-11-13 Fix the dist-duplication finding (➕ from Step 2)

- Decision (Emin's call): fix it now rather than leave it as a known
  limitation — it's a one-file, minimal addition.
- Added `vitest.config.ts`: `exclude: [...configDefaults.exclude,
  "dist/**"]`, imported from `vitest/config`. Keeps vitest's own default
  excludes (so nothing already filtered, e.g. `node_modules`, stops being
  filtered) and adds only `dist/**`; `include` left untouched.
- Command: `rm -rf dist && npm run typecheck && npm run build && npm test`
  → all pass. `npm test` now reports `Test Files 2 passed (2)` / `Tests 3
  passed (3)` — each test runs exactly once, matching the 2 real files
  (`report.test.ts`, `validation.test.ts`) and 3 real tests. Confirms the
  double-run from the previous entry is gone.

## 2026-11-13 Step 3: Fix #4 (CLI) — failing tests (red step)

- `src/cli.ts` has no exports and self-runs `main()` against the real
  `process.argv` as an import side effect (same shape of problem as #12's
  MCP module), so a test can't import it directly without either running
  it against the test runner's own argv or refactoring first. To write
  failing tests *before* touching `src/cli.ts`, `test/cli.test.ts` spawns
  the real CLI as a subprocess instead: `node <tsx's dist/cli.mjs>
  src/cli.ts <args>` via `spawnSync` with an argv array (no shell — the
  same array-args discipline that fixes #4's own space-truncation bug
  applies to the test harness invoking it). Each test uses a real temp git
  repo fixture (`mkdtempSync` + `git init -b main` + one commit, per the
  project's testing convention).
- Five tests added, covering exactly the five sub-problems Emin listed.
  `npm run typecheck` passes. `npm test` → all 5 fail, each for the
  expected reason:
  1. **Space truncation**: `--repo` pointing at a directory with a space
     in its name → expected exit `0`, got `1` (today: path cut at the
     space, `changedFiles` gets a nonexistent cwd, crashes).
  2. **Missing `--validate` value**: expected stderr not to contain
     `"TypeError"` and to contain `"Usage:"` → got the raw
     `TypeError [ERR_INVALID_ARG_TYPE]` stack trace from #4's original
     repro, no usage message at all.
  3. **Unknown flag**: expected exit `1` and no `review-report.md`
     written → got exit `0` and a report written (flag silently ignored).
  4. **Invalid `--format` value** (`xml`): expected exit `1` → got exit
     `0` (value silently ignored, markdown written anyway).
  5. **Exit codes**: a failing `--validate` command → expected exit `2`
     with the report still written → got exit `0` (no exit-code logic
     tied to validation results exists yet).
- Design note flagged for Emin, not yet decided: Emin's ask says "--format
  validation", not "implement JSON output". Current plan for the fix step
  is to validate `--format` against `"markdown" | "json"` literally (reject
  anything else), and since real JSON serialization isn't being built now,
  have `--format json` itself exit 1 with "not supported yet" rather than
  silently falling back to markdown — matching PROJECT.md Step 3's explicit
  fallback ("implement JSON output only if quick, otherwise error clearly
  that it isn't supported yet"). No test pins this exact "json" message
  down yet since it wasn't in Emin's explicit list; only the invalid-value
  rejection (test 4 above) is tested.
- Stopped here per the TDD workflow; no changes made to `src/cli.ts` in
  this entry.

## 2026-11-13 Step 3: Fix #4 (CLI) — implementation

- Decision confirmed by Emin: `--format json` exits 1 with a clear "not
  supported yet" message. Added a sixth, one-line test asserting exit `1`
  and stderr containing "not supported yet" for `--format json`.
- `src/cli.ts`: `parseArgs` now keeps the whole `--repo` value (no more
  `.split(" ")[0]`), throws a `UsageError` for any unrecognized flag and
  for any recognized flag missing its value, and validates `--format`
  against a `value is Format` type guard (rejects anything other than
  `"markdown"`/`"json"`). `main()` now returns a numeric exit code instead
  of mutating `process.exitCode` inline: usage/parse errors and an
  unimplemented `--format json` return `1` before any work happens; after
  a successful review, it returns `2` if any validation result has
  `status: "failed"`, else `0`. All error paths print `error.message`
  (or a plain usage line) only — no stack traces.
- `src/core.ts`: added `reviewRepositoryData(request): Promise<{
  changedFiles, validationResults }>`, the structured-data step the CLI
  needs to compute exit codes without parsing the rendered report text.
  `reviewRepository` (existing export, contract-protected) is now a thin
  wrapper — `reviewRepositoryData` + `markdownReport` — with its own
  signature and string output unchanged for the same input. `cli.ts` calls
  `reviewRepositoryData` directly and formats with `markdownReport` itself,
  matching CLAUDE.md's "cli.ts... call core.ts, format output" and "core
  returns structured data" architecture notes.
- Verification: `npm run typecheck && npm run build && npm test` → all
  green, `Test Files 3 passed (3)` / `Tests 9 passed (9)` (each test runs
  once, per the earlier vitest-exclude fix).
