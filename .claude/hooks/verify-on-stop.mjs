#!/usr/bin/env node
// Stop hook: before Claude finishes a reply, run typecheck + tests if code changed.
// If they fail, block once (exit 2) so Claude either fixes them or states
// clearly that the failure is an intentional TDD "red" step.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));

// Already blocked once in this turn: let Claude stop, to avoid an endless loop.
if (input?.stop_hook_active) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();

// Only check when code, tests or config have uncommitted changes.
let changed = "";
try {
  changed = execFileSync(
    "git",
    ["status", "--porcelain", "--", "src", "test", "package.json", "tsconfig.json"],
    { cwd: projectDir, encoding: "utf8" },
  ).trim();
} catch {
  process.exit(0); // Not a git repo or git unavailable: don't get in the way.
}
if (!changed) process.exit(0);

function run(script) {
  const result = spawnSync("npm", ["run", script, "--silent"], {
    cwd: projectDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output };
}

const failures = [];
for (const script of ["typecheck", "test"]) {
  const result = run(script);
  if (!result.ok) {
    const tail = result.output.split("\n").slice(-30).join("\n");
    failures.push(`npm run ${script} failed:\n${tail}`);
  }
}

if (failures.length === 0) process.exit(0);

process.stderr.write(
  [
    "Verification hook: there are uncommitted code changes and checks are failing.",
    ...failures,
    "",
    "If this is the intentional TDD red step (a new test that should fail), say so",
    "explicitly in your reply and stop. Otherwise fix the failure before finishing.",
    "Never weaken or skip a test to make this pass.",
  ].join("\n") + "\n",
);
process.exit(2);
