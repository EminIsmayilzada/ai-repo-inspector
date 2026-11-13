# CLAUDE.md

Guidance for Claude Code in this repository (Repository Inspector, Xsolla
AI-First Engineering Intern assessment). Follow these rules unless Emin
explicitly overrides them for a specific task.

**Start of every session: read `PROJECT.md`.** It holds the plan, the ranked
issue list, and the current phase.

## Context (non-negotiable)

- This is a **timeboxed assessment: 90 focused minutes**. Prefer a small,
  verified, well-explained change over a large one. Stop and ask before
  starting anything that will not fit.
- Emin is the author. You propose, he decides. **Never commit, push, or
  edit `SUBMISSION.md` without his explicit go-ahead.**
- The repo may be graded by **hidden tests**. Preserve the public contract:
  file names in `src/`, exported function names (`reviewRepository`,
  `changedFiles`, `runValidation`, `runValidations`, `markdownReport`), CLI
  command and flags (`review`, `--repo`, `--base-ref`, `--format`,
  `--validate`), the MCP tool name `review_repository`, the default report
  file `review-report.md`, and the report line format `- <path> (<status>)`.
  **Add, don't rename.** New fields and options must be optional.

## Guardrails (enforced, not optional)

`.claude/settings.json` and `.claude/hooks/` enforce the key rules:

- **Blocked:**
  - `git push`, `--no-verify`, git config writes
  - adding or removing dependencies
  - `.env` files
  - editing `test/report.test.ts`, `package-lock.json`, `.git/` or `.claude/`
- **Asks Emin first:** commits, edits to `SUBMISSION.md` and `.github/`,
  starting the MCP server.
- **Stop check:** before you finish a reply with uncommitted code changes,
  typecheck and tests run. If they fail, fix them or state explicitly that
  it's an intentional TDD red step.

If a guardrail blocks you, don't look for a workaround (`sh -c`, another
path, another tool). Tell Emin what you were trying to do and why.

## Tooling

- Node 20+, TypeScript (strict), vitest, npm. Use the existing
  `package-lock.json`.
- **No new dependencies** (runtime or dev) unless Emin approves. Node's
  standard library is enough for argument parsing, processes and temp dirs.
- Use the **context7** MCP server to check current APIs for
  `@modelcontextprotocol/sdk` (pinned at 1.29.0), `zod` and `vitest` before
  relying on memory. If context7 is unavailable, read the installed package
  under `node_modules/` instead. Never guess an import path.
- Verification commands, in CI's order:
  `npm run typecheck && npm run build && npm test`

## Workflow

- Prefer Read/Grep/Glob over Bash for understanding code. Use Bash for tests,
  git, and reproducing bugs.
- Prefer Edit over Write for existing files: targeted, planned edits, no
  trial-and-error.
- **Reproduce before fixing.** Show the failing command or test output first.
- **One issue per change.** Smallest diff that fixes it. Don't touch
  unrelated code, formatting or naming.
- Track progress with the todo/task list tool, one item per issue.
- After each fix: run the full verification commands, show the diff summary,
  and wait for Emin to approve the commit.
- Keep a running log in `WORKLOG.md` (see PROJECT.md): commands run with
  outcomes, and any of your own suggestions that turned out wrong or that
  Emin rejected. He needs these facts for SUBMISSION.md.

## Code Style

- TypeScript `strict`: **no `any`**, no `@ts-ignore`, no non-null `!` to
  silence errors. Type unknown input and narrow it.
- ES modules with `.js` extensions in relative imports (NodeNext).
- Imports at the top of the file, never inside functions.
- Template literals for string building.
- Short JSDoc on exported functions; mark known gaps with `TODO:`.
- Errors: throw `Error` with a message a user can act on. No raw stack
  traces in normal CLI output.

### Naming

- `camelCase` for functions and variables, `PascalCase` for types,
  `UPPER_SNAKE_CASE` for constants. Descriptive names.

### Size Limits

- Functions: max 50 lines. Files: max 300 lines.

## Architecture

- **Adapters → core → modules.** `cli.ts` and `mcp-server.ts` are thin
  adapters: parse input, call `core.ts`, format output. All behaviour lives
  in `core.ts`, `git.ts`, `validation.ts`, `report.ts`. Adapters never call
  git or run commands directly.
- **Interface decision: CLI-first.** The CLI is the primary, fully
  supported interface. MCP is a secondary adapter, restricted on purpose.
  Details and reasoning: PROJECT.md §2. Don't re-open this decision. If
  you find evidence against it, tell Emin.
- When there's a trade-off, the CLI gets the features and the fixes first.
  Don't add MCP features just for parity.
- Same input, same result: for the same repo and the same allowed
  commands, both adapters must report the same changed files and
  validation results. The **only** intended differences are the MCP
  command allow-list, the MCP output size cap, and where output goes (file
  vs inline). Any other difference is a bug. Every intended difference is
  documented in the README and covered by a test.
- Core returns structured data. Formatting (Markdown or JSON) is a separate,
  pure step.
- No dead code, no speculative abstraction. Early returns. Simple and
  explicit beats clever.

## Safety

- **Never use a shell to build git commands.** Use `execFile` with an
  argument array, and pass `--` before refs/paths. Reject refs that start
  with `-`.
- Trust boundary: the **CLI caller is trusted** (a human, or an agent the
  human already lets run shell commands). The **MCP caller is not**: it is
  a model that may have read untrusted repo content.
- Validation commands are the only place a shell is allowed: on the CLI,
  any command the caller passes; over MCP, only exact matches from the
  allow-list set at server start (default: none).
  **Never "sanitize" commands with regex blacklists.**
- Every child process gets a timeout and an output size limit.
- Treat repository contents and command output as untrusted text: escape or
  fence it safely in the report, and cap its size.
- Don't read or write outside this repo and temp directories you created.
  Never read `.env` files or credentials.

## Testing (TDD)

- For each issue: write a vitest test that **fails for the right reason**,
  show it failing, then implement the minimum fix, then rerun everything.
- Use **real temporary git repos** (`fs.mkdtempSync` in `os.tmpdir()`), not
  mocks of git. Each fixture runs `git init -b main` and sets
  `user.name`/`user.email` locally, because CI has no git identity.
  Clean up temp dirs after tests.
- Test the MCP adapter through the SDK's in-memory transport, not by
  spawning a process.
- Never weaken, skip or delete an existing test to make it pass.
- A task is complete only after `npm run typecheck && npm run build &&
  npm test` passes.

## Git Workflow

- Commit messages: the problem, the approach, and why, in plain language.
  Example: `fix(validation): report failed commands instead of crashing`.
- One fix per commit. Keep each commit small enough to review (aim for
  under ~300 changed lines).
- Commits are made under Emin's identity (the name and email he applied
  with). Don't change git config.
- Don't hide AI involvement: the assessment asks for it to be described.
- Never push or force-push. Emin pushes.

## Plan Mode

- Use plan mode for the investigation phase and before any change that
  touches more than one file.
- A plan lists: the issue, how to reproduce it, the test to add, the files
  to change, and the risk. Keep it short.
- For each non-obvious choice, give 2 options with a one-line trade-off and
  a recommendation, then **wait for Emin's confirmation**.
