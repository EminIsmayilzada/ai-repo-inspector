# Submission

## What did you investigate first, and why?
Before the timer I used Claude (chat) to read the starter and draft a plan, 12 bug hypotheses, CLAUDE.md, and guardrails (permissions + hooks). Once the timer started, I treated every hypothesis as unproven and had Claude Code reproduce each one on a demo repo before touching code. All 12 reproduced. Two were worse than expected: `--base-ref "--output=x"` made git write a file (argument injection), and the MCP tool, called exactly as its schema says, silently inspected the server's own folder and ran an arbitrary command there (pwned.txt).

## What did you choose to implement or fix?
Under a CLI-first decision, I prioritised what breaks or endangers the primary interface:
- 1109bca: failing validation commands no longer crash the run. They report "failed" with exit code and stdout+stderr, later commands still run, plus a timeout and output buffer.
- 1c69475: (found while verifying) vitest ran every test twice from dist/, so I excluded dist.
- 343f7ba: CLI keeps paths with spaces, rejects unknown flags and missing values with a usage message, validates --format (json returns "not supported yet"), exit codes 0/1/2.
- 241c026: git argument injection. Refs starting with "-" are rejected, unknown refs give a clear error, and "--" is passed to git.
Tests went from 1 to 11, each written to fail first.

## What did you intentionally not do?
- MCP fixes (#12 untestable module, #2 repo_path/repoPath mismatch, #3 unrestricted commands). These were next in line, but I ran out of time. Until they're fixed, the MCP server should not be exposed to agents. This is stated in the README.
- Renames shown as "modified", untracked files ignored, report formatting (pass/fail, fence escaping, size cap), package.json bin path, and real JSON output.

## Interface decision
- Decision: CLI-first, with a restricted MCP adapter.
- Primary user and execution environment: developers, terminal-capable coding agents (Claude Code, Cursor) and CI, running locally or in a pipeline.
- Trust boundary and allowed capabilities: the CLI caller is trusted to run the validation commands it passes. The MCP caller is a model that may have read untrusted repo content, so it should get read-only inspection plus only commands allow-listed at server start.
- Reliability, discoverability, latency/context, and output tradeoffs: a CLI costs an agent no context until used and gives clear exit codes for CI. MCP offers discovery and structured input, but its output lands in the agent's context, so it needs a size cap.
- How supported interfaces remain consistent: both adapters call the same core function. Intended differences are only the MCP allow-list, output cap and inline output, each to be documented and tested. Honest status: the MCP adapter still has the starter bugs, so today the CLI is the only interface I'd advertise.
- Evidence that would change this decision: usage showing most callers are agents without shell access, or hosts relying on MCP tool discovery. Either would push toward MCP-first.

## How did you use an AI coding agent?
Claude Code in VS Code, guided by CLAUDE.md (rules) and PROJECT.md (plan), and enforced by .claude/settings.json and hooks:
- Blocked: push, new dependencies, edits to the starter test.
- Commits need my approval.
- A Stop hook runs typecheck and tests before Claude can finish a reply.
Every fix went red → green. I read each diff before committing.

## Where did you check, correct, or reject an AI suggestion? (required)
1. Claude planned to reproduce the missing timeout with `sleep 999`. On Windows, exec runs commands through cmd.exe, where `sleep` doesn't exist, so it would have failed instantly and looked like something else. I switched it to `node -e` commands and logged the shell dependency as a portability limitation.
2. After reproducing the git injection, Claude kept #7 in "if time allows". I promoted it to must-do, because it was a proven file-write and a small fix.
3. Claude proposed killing two node.exe processes by PID. I rejected it and checked the PIDs myself first. They had already exited, so the kill was unnecessary and could have hit an unrelated process.
4. My chat-side plan claimed vitest excludes dist/ by default. Running the build then the tests proved this wrong, and that led to fix 1c69475.

## Commands used to verify the result, with outcomes
- `npm run typecheck && npm run build && npm test`: passes, 4 files, 11 tests, each run once.
- `npm run inspector -- review --repo ../demo --validate "node -e ..."`: a passing command exits 0. A failing one exits 2, the report is still written, and stderr is captured.
- Each fix's test was shown failing before the change (full log in WORKLOG.md).
- GitHub Actions on the final push: [ GitHub Actions "Public checks" (npm ci → typecheck → build → test): passed on every pushed commit, including the final SUBMISSION.md commit.]

## A blocker you hit and how you approached it
On Windows, the timeout kills cmd.exe but not the process it started, so a timed-out command keeps running until it finishes. A proper fix needs a process-tree kill, so I documented it as a limitation instead of expanding scope. I also found a false positive in my own guard hook: it read `2>&1` in `npm install 2>&1` as a package name.

## Known limitations and the next three things you would do
1. Fix MCP: export createServer() (#12), read repo_path (#2), allow-list validation commands (#3), and add a test running one fixture through both CLI and MCP.
2. Report quality: rename and untracked handling, pass/fail summary, safe fences, output size cap.
3. Windows process-tree kill on timeout, and fix the guard hook's tokenizer.

## Approximate focused-work time
- Start: [17:50]
- Finish: [19:13]