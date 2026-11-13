import { exec } from "node:child_process";
import type { ValidationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Runs one validation command and reports its outcome. Never rejects: a
 * non-zero exit, a timeout or output over the buffer limit all resolve
 * with `status: "failed"` so the caller can keep running the rest.
 */
export function runValidation(
  command: string,
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    exec(command, { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join("\n");

      if (!error) {
        resolve({ command, status: "passed", output });
        return;
      }

      if (error.killed && error.signal) {
        resolve({
          command,
          status: "failed",
          output: `Command timed out after ${timeoutMs}ms (${error.signal})${output ? `\n${output}` : ""}`,
        });
        return;
      }

      resolve({
        command,
        status: "failed",
        exitCode: typeof error.code === "number" ? error.code : undefined,
        output,
      });
    });
  });
}

/** Runs each command in order, even if an earlier one fails or times out. */
export async function runValidations(
  commands: string[],
  cwd: string,
  timeoutMs?: number,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, timeoutMs));
  }
  return results;
}
