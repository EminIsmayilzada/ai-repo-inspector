#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { reviewRepositoryData } from "./core.js";
import { markdownReport } from "./report.js";

type Format = "markdown" | "json";

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format?: Format;
  validations: string[];
};

const USAGE =
  "Usage: inspector review --repo <path> [--base-ref <ref>] [--format markdown] [--validate <command>]";

const FLAGS_WITH_VALUES = new Set(["--repo", "--base-ref", "--format", "--validate"]);

class UsageError extends Error {}

function isFormat(value: string): value is Format {
  return value === "markdown" || value === "json";
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", validations: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (!FLAGS_WITH_VALUES.has(token)) {
      throw new UsageError(`Unknown flag: ${token}`);
    }
    const value = argv[++index];
    if (value === undefined) {
      throw new UsageError(`Missing value for ${token}`);
    }
    if (token === "--repo") {
      args.repositoryPath = value;
    } else if (token === "--base-ref") {
      args.baseRef = value;
    } else if (token === "--format") {
      if (!isFormat(value)) {
        throw new UsageError(`Invalid --format value: "${value}" (expected "markdown" or "json")`);
      }
      args.format = value;
    } else {
      args.validations.push(value);
    }
  }
  return args;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 1;
  }

  if (args.command !== "review" || !args.repositoryPath) {
    console.error(USAGE);
    return 1;
  }

  if (args.format === "json") {
    console.error("JSON output is not supported yet. Omit --format or use --format markdown.");
    return 1;
  }

  const data = await reviewRepositoryData({
    repositoryPath: args.repositoryPath,
    baseRef: args.baseRef,
    validationCommands: args.validations,
  });

  const report = markdownReport({
    repositoryPath: args.repositoryPath,
    changedFiles: data.changedFiles,
    validationResults: data.validationResults,
  });
  writeFileSync("review-report.md", report, "utf8");
  console.log("Review report written to review-report.md");

  return data.validationResults.some((result) => result.status === "failed") ? 2 : 0;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
