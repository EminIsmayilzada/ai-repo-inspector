import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

/** Throws a clear error for a ref that could be a git option, or that doesn't resolve to a commit. */
function verifyRef(repositoryPath: string, ref: string): void {
  if (ref.startsWith("-")) {
    throw new Error(`Invalid base ref: "${ref}" (refs may not start with "-")`);
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: repositoryPath,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    throw new Error(`Unknown base ref: "${ref}"`);
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  verifyRef(repositoryPath, base);
  const output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`, "--"]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}
