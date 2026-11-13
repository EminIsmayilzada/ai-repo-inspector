import { changedFiles } from "./git.js";
import { markdownReport } from "./report.js";
import type { ChangedFile, ReviewRequest, ValidationResult } from "./types.js";
import { runValidations } from "./validation.js";

export type ReviewData = {
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

/** Runs the git diff and the validation commands; returns structured data, no formatting. */
export async function reviewRepositoryData(request: ReviewRequest): Promise<ReviewData> {
  const files = changedFiles(request.repositoryPath, request.baseRef);
  const validationResults = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );
  return { changedFiles: files, validationResults };
}

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const data = await reviewRepositoryData(request);
  return markdownReport({
    repositoryPath: request.repositoryPath,
    changedFiles: data.changedFiles,
    validationResults: data.validationResults,
  });
}
