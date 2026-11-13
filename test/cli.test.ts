import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Spawn the real CLI as a subprocess (via tsx's own CLI entry, no shell)
// instead of importing src/cli.ts: the module has no exports and runs
// main() against the real process.argv as a side effect of being
// imported, so importing it in-process isn't a safe option.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CLI_ENTRY = path.join(REPO_ROOT, "src", "cli.ts");

function createFixtureRepo(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  writeFileSync(path.join(dir, "a.txt"), "a\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync(
    "git",
    ["-c", "user.name=demo", "-c", "user.email=demo@example.com", "commit", "-m", "init"],
    { cwd: dir },
  );
  return dir;
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [TSX_CLI, CLI_ENTRY, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("cli", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    while (fixtures.length > 0) {
      const dir = fixtures.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a --repo path containing a space without truncating it", () => {
    const dir = createFixtureRepo("inspector cli ");
    fixtures.push(dir);

    const result = runCli(["review", "--repo", dir], dir);

    expect(result.status).toBe(0);
    const report = readFileSync(path.join(dir, "review-report.md"), "utf8");
    expect(report).toContain(`# Review Report: ${dir}`);
  });

  it("exits 1 with a clear usage message, not a raw stack trace, when --validate is missing its value", () => {
    const dir = createFixtureRepo("inspector-cli-");
    fixtures.push(dir);

    const result = runCli(["review", "--repo", dir, "--validate"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("TypeError");
    expect(result.stderr).toContain("Usage:");
  });

  it("exits 1 with a clear message for an unknown flag, and does no work", () => {
    const dir = createFixtureRepo("inspector-cli-");
    fixtures.push(dir);

    const result = runCli(["review", "--repo", dir, "--unknown-flag", "value"], dir);

    expect(result.status).toBe(1);
    expect(existsSync(path.join(dir, "review-report.md"))).toBe(false);
  });

  it("exits 1 with a clear message for an invalid --format value", () => {
    const dir = createFixtureRepo("inspector-cli-");
    fixtures.push(dir);

    const result = runCli(["review", "--repo", dir, "--format", "xml"], dir);

    expect(result.status).toBe(1);
  });

  it("exits 1 with a clear 'not supported yet' message for --format json", () => {
    const dir = createFixtureRepo("inspector-cli-");
    fixtures.push(dir);

    const result = runCli(["review", "--repo", dir, "--format", "json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not supported yet");
  });

  it("exits 2 when the report is written but a validation command fails", () => {
    const dir = createFixtureRepo("inspector-cli-");
    fixtures.push(dir);

    const result = runCli(
      ["review", "--repo", dir, "--validate", `node -e "process.exit(1)"`],
      dir,
    );

    expect(result.status).toBe(2);
    expect(existsSync(path.join(dir, "review-report.md"))).toBe(true);
  });
});
