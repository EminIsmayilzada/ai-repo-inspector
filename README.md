# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
```

The report is written to `review-report.md`.

**Flags**

- `--repo <path>` — required. The full value is kept as-is (including
  spaces); there's no need to quote around spaces specially.
- `--base-ref <ref>` — defaults to `main`. The ref is verified with `git
  rev-parse --verify --quiet <ref>^{commit}` before use; an unknown ref
  gives a clear "Unknown base ref" error instead of a raw git failure. A
  ref starting with `-` (e.g. `--output=x`) is rejected outright — it is
  never passed through to git, which would otherwise parse it as an
  option instead of a revision.
- `--format markdown|json` — `markdown` is the only implemented format.
  `--format json` is a recognized, valid value but exits 1 with a "not
  supported yet" message; any other value is rejected as invalid.
- `--validate <command>` — repeatable. Each command runs in the target
  repo's directory with a 5-minute timeout (configurable only via code,
  not a flag) and a 10 MB output cap. **Validation commands are shell-
  dependent**: Node's `child_process.exec` runs them through `cmd.exe` on
  Windows and a POSIX shell (`sh`) elsewhere, so a command that works in
  CI (Linux) may behave differently, or not exist at all, on a
  contributor's Windows machine, and vice versa. Prefer commands (or
  `node -e "..."` one-liners) that work the same way on both.

**Exit codes**

| Code | Meaning |
|---|---|
| `0` | Report written, all validations passed (or none were requested) |
| `1` | Usage error (bad/missing/unknown flag, unsupported `--format`) or a runtime error (e.g. the repo path or base ref doesn't resolve) — no report is written |
| `2` | Report written, but at least one validation command failed |

## MCP

Start the stdio server with:

```bash
npm run mcp-server
```

It exposes a `review_repository` tool. **Known contract bugs, not yet
fixed** — see "Known limitations" below before relying on this adapter.

## Interface decision: CLI-first

The CLI is the primary, fully supported interface; MCP is a secondary,
restricted adapter over the same core (`reviewRepositoryData` /
`reviewRepository` in `src/core.ts`). The full reasoning — primary user,
trust boundary, context-cost tradeoffs — is in `PROJECT.md` §2 and
`SUBMISSION.md`.

The only differences the two adapters are meant to have, once the MCP
side is brought up to the same bar as the CLI:

| | CLI (primary) | MCP (secondary, restricted) |
|---|---|---|
| Validation commands | any command the caller passes | only exact matches from an allow-list fixed at server start (default: none) |
| Output | full report written to a file (default `review-report.md`) | returned inline, size-capped, summary first |
| Errors | one-line message + exit code (0/1/2 above) | MCP error result (`isError: true`), no stack traces |

Both adapters call the same `src/core.ts` functions, so for the same repo
and the same allowed commands they report the same changed files and
validation results. Any other difference would be a bug.

**Current status: the MCP adapter does not yet meet this bar** — see
below.

## Known limitations

- **MCP contract bugs, not fixed**: the tool's schema declares `repo_path`
  but the handler reads `input.repoPath` (always `undefined`), so a
  caller using the documented field silently inspects the server's own
  working directory instead of the target repo. `validationCommands` run
  with no allow-list — any command the caller sends executes as-is, and
  because of the `repo_path` bug its side effects land in the server's
  own directory. The module also has a top-level `await
  server.connect(...)` with no exports, so it can't be imported or tested
  without hanging the importing process.
- **`--format json`** is validated but not implemented — it exits 1 with
  a "not supported yet" message rather than producing JSON.
- **Renames and copies** (`git mv`, `git cp`) are reported as `modified`
  with both old and new paths joined by a literal tab, not as `renamed`.
- **Uncommitted and untracked changes are ignored** — only the committed
  diff between the base ref and `HEAD` is reported.
- **Validation output**: no per-command pass/fail marker or summary in
  the report; output containing a triple-backtick fence can break the
  report's own Markdown fencing; there's no cap on how much output from
  a single command is embedded in the report.
- **Validation timeout, Windows only**: `exec()`'s `timeout` option kills
  only the immediate `cmd.exe` shell it spawns the command through, not
  any grandchild process the shell started — an orphaned process can keep
  running after the command is reported as timed out. A correct fix is a
  process-tree kill (`taskkill /t` on Windows); not implemented.
- **`package.json`'s `bin`** points to `dist/cli.js`, but `tsconfig.json`'s
  `rootDir: "."` makes `tsc` emit to `dist/src/cli.js` — installing this
  package's bin would 404.

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp-server.ts   MCP adapter
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown report generation
test/               public starter tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.