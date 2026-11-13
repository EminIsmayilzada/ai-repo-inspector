#!/usr/bin/env node
// PreToolUse hook for Bash: blocks commands that break the assessment rules.
// Exit 2 = block; the stderr message is shown to Claude so it can adjust.
// This guards against mistakes. It matches command text, so it is not a
// security boundary (e.g. `sh -c "..."` can hide a command).
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = String(input?.tool_input?.command ?? "");

// Split compound commands so each part is checked on its own.
const segments = command
  .split(/&&|\|\||;|\||\n/)
  .map((part) => part.trim())
  .filter(Boolean);

function tokens(segment) {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function block(reason) {
  process.stderr.write(`Blocked by project hook: ${reason}\n`);
  process.exit(2);
}

for (const segment of segments) {
  const words = tokens(segment);
  const [tool, sub, ...rest] = words;

  // 1. Emin pushes, never Claude.
  if (tool === "git" && sub === "push") {
    block("never push. Emin reviews and pushes himself.");
  }

  // 2. Don't skip git hooks or CI-style checks.
  if (tool === "git" && words.includes("--no-verify")) {
    block("don't skip git hooks with --no-verify.");
  }

  // 3. Don't change git identity or config (commits must stay under Emin's name).
  if (tool === "git" && sub === "config") {
    const nonFlags = rest.filter((word) => !word.startsWith("-"));
    const isWrite =
      nonFlags.length >= 2 ||
      rest.some((word) => ["--unset", "--unset-all", "--add", "--replace-all"].includes(word));
    if (isWrite) {
      block("don't change git config. Use `git -c key=value <command>` for one-off settings in demo repos.");
    }
  }

  // 4. No new dependencies without Emin's approval (bare `npm install` / `npm ci` are fine).
  const installVerbs = ["install", "i", "add", "uninstall", "remove", "rm"];
  if (tool === "npm" && installVerbs.includes(sub ?? "")) {
    const packages = rest.filter((word) => !word.startsWith("-"));
    if (packages.length > 0) {
      block(`adding or removing dependencies (${packages.join(", ")}) needs Emin's approval. Ask him first.`);
    }
  }
  if ((tool === "yarn" || tool === "pnpm") && ["add", "remove"].includes(sub ?? "")) {
    block("this project uses npm, and new dependencies need Emin's approval.");
  }

  // 5. Never read secrets files (.env.example is fine).
  const touchesEnv = words.some((word) => {
    const clean = word.replace(/^['"]|['"]$/g, "");
    const name = clean.split(/[\\/]/).pop() ?? "";
    return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
  });
  if (touchesEnv) {
    block("don't read or write .env files.");
  }
}

process.exit(0);
