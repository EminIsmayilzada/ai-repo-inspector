import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { changedFiles } from "../src/git.js";

function createFixtureRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "inspector-git-"));
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

describe("changedFiles", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    while (fixtures.length > 0) {
      const dir = fixtures.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a baseRef starting with '-' instead of passing it to git as an option", () => {
    const dir = createFixtureRepo();
    fixtures.push(dir);

    expect(() => changedFiles(dir, "--output=x")).toThrow();
    expect(existsSync(path.join(dir, "x...HEAD"))).toBe(false);
  });

  it("gives a clear 'unknown base ref' error for an unknown ref, not a raw git failure", () => {
    const dir = createFixtureRepo();
    fixtures.push(dir);

    expect(() => changedFiles(dir, "nope")).toThrow(/unknown base ref/i);
  });
});
