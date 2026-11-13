import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runValidations } from "../src/validation.js";

describe("runValidations", () => {
  it("reports a failed status with the exit code and combined output for a non-zero exit, and still runs the next command", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "inspector-validation-"));

    try {
      const results = await runValidations(
        [
          `node -e "console.log('out'); console.error('err'); process.exit(3)"`,
          `node -e "console.log('ran')"`,
        ],
        cwd,
      );

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("failed");
      expect(results[0]).toHaveProperty("exitCode", 3);
      expect(results[0].output).toContain("out");
      expect(results[0].output).toContain("err");
      expect(results[1].status).toBe("passed");
      expect(results[1].output).toContain("ran");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it(
    "marks a long-running command as failed with a clear timeout message instead of hanging",
    async () => {
      const cwd = mkdtempSync(path.join(tmpdir(), "inspector-validation-"));

      try {
        const results = await runValidations(
          [`node -e "setTimeout(() => {}, 60000)"`],
          cwd,
          300,
        );

        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("failed");
        expect(results[0].output).toContain("timed out");
      } finally {
        // Known Windows limitation (logged in WORKLOG.md): exec()'s timeout
        // only kills the cmd.exe shell, not the grandchild it spawned, so
        // the grandchild can still hold this directory as its cwd here.
        // Cleanup is best-effort; it must not fail the test over that.
        try {
          rmSync(cwd, { recursive: true, force: true });
        } catch {
          // ignore: orphaned grandchild still holds the directory on Windows
        }
      }
    },
    15000,
  );
});
