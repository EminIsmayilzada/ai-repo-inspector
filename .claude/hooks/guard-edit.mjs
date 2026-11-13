#!/usr/bin/env node
// PreToolUse hook for file edits: protects files Claude must not change.
// Exit 2 = block; the stderr message is shown to Claude so it can adjust.
import { readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const target = String(input?.tool_input?.file_path ?? input?.tool_input?.notebook_path ?? "");
if (!target) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
const relative = path
  .relative(projectDir, path.resolve(projectDir, target))
  .split(path.sep)
  .join("/");
const fileName = relative.split("/").pop() ?? "";

const rules = [
  {
    match: () => relative === "test/report.test.ts",
    reason:
      "test/report.test.ts is the starter's public test and part of the contract. Don't change it. Add new tests in new files under test/.",
  },
  {
    match: () => relative === "package-lock.json",
    reason: "don't hand-edit the lock file. Dependency changes need Emin's approval and go through npm.",
  },
  {
    match: () => relative === ".git" || relative.startsWith(".git/"),
    reason: "never edit git internals.",
  },
  {
    match: () => relative.startsWith(".claude/"),
    reason: "the guardrails in .claude/ are Emin's. Don't change them. Ask him if one is in your way.",
  },
  {
    match: () => /^\.env(\..+)?$/.test(fileName) && fileName !== ".env.example",
    reason: "don't read or write .env files.",
  },
];

for (const rule of rules) {
  if (rule.match()) {
    process.stderr.write(`Blocked by project hook: ${rule.reason}\n`);
    process.exit(2);
  }
}

process.exit(0);
