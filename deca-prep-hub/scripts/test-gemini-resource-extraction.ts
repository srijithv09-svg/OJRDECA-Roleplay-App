import { loadEnvConfig } from "@next/env";
import {
  type ExtractResourceOptions,
} from "../src/lib/ai/extraction/resource-extraction-orchestrator";
import type { ResourceExtractionType } from "../src/lib/ai/extraction/shared";

loadEnvConfig(process.cwd());

function parseArgs() {
  const args = process.argv.slice(2);
  const resourceId = args.find((arg) => !arg.startsWith("--"));
  const force = args.includes("--force");
  const typeArg = args.find((arg) => arg.startsWith("--type="))?.split("=")[1];
  const chunkSizeArg = args.find((arg) => arg.startsWith("--chunk-size="))?.split("=")[1];
  const chunkThresholdArg = args.find((arg) => arg.startsWith("--chunk-threshold="))?.split("=")[1];

  if (!resourceId) {
    throw new Error(
      "Usage: npm run test:gemini-extract -- <resource-id> [--type=exam|answer_key|roleplay|judge_rubric] [--force] [--chunk-size=10000] [--chunk-threshold=12000]",
    );
  }

  if (
    typeArg &&
    typeArg !== "answer_key" &&
    typeArg !== "exam" &&
    typeArg !== "judge_rubric" &&
    typeArg !== "roleplay"
  ) {
    throw new Error("--type must be one of exam, answer_key, roleplay, or judge_rubric.");
  }

  const chunkSize = chunkSizeArg ? Number.parseInt(chunkSizeArg, 10) : undefined;
  const chunkThreshold = chunkThresholdArg
    ? Number.parseInt(chunkThresholdArg, 10)
    : undefined;

  if (chunkSize !== undefined && (!Number.isFinite(chunkSize) || chunkSize < 1000)) {
    throw new Error("--chunk-size must be an integer of at least 1000.");
  }

  if (
    chunkThreshold !== undefined &&
    (!Number.isFinite(chunkThreshold) || chunkThreshold < 1000)
  ) {
    throw new Error("--chunk-threshold must be an integer of at least 1000.");
  }

  return {
    chunkSize,
    chunkThreshold,
    extractionType: (typeArg ?? null) as ResourceExtractionType | null,
    force,
    resourceId,
  };
}

async function main() {
  const { extractResource } = await import(
    "../src/lib/ai/extraction/resource-extraction-orchestrator"
  );
  const args = parseArgs();
  const options: ExtractResourceOptions & { resourceId: string } = {
    extractionType: args.extractionType,
    chunkSize: args.chunkSize,
    chunkThreshold: args.chunkThreshold,
    force: args.force,
    resourceId: args.resourceId,
  };
  const summary = await extractResource(options);

  console.log("Gemini resource extraction test");
  console.log(`resource_id: ${summary.resourceId}`);
  console.log(`job_id: ${summary.jobId ?? "none"}`);
  console.log(`status: ${summary.status}`);
  console.log(`extraction_type: ${summary.extractionType}`);
  console.log(`records_created: ${JSON.stringify(summary.recordsCreated)}`);

  if (summary.diagnostics) {
    if (summary.diagnostics.originalTextCharCount !== undefined) {
      console.log(`original_text_char_count: ${summary.diagnostics.originalTextCharCount}`);
    }
    console.log(`text_char_count: ${summary.diagnostics.textCharCount}`);
    console.log(`text_token_estimate: ${summary.diagnostics.tokenEstimate}`);
    console.log(`extraction_strategy: ${summary.diagnostics.strategy}`);
    console.log(`chunk_count: ${summary.diagnostics.chunkCount}`);
    console.log(`chunk_size: ${summary.diagnostics.chunkSize}`);
    console.log(`development_limit_applied: ${summary.diagnostics.developmentLimitApplied ?? false}`);
    if (summary.diagnostics.developmentMaxChunks) {
      console.log(`development_max_chunks: ${summary.diagnostics.developmentMaxChunks}`);
    }
    if (summary.diagnostics.developmentMaxExtractionChars) {
      console.log(`development_max_extraction_chars: ${summary.diagnostics.developmentMaxExtractionChars}`);
    }
    if (summary.diagnostics.answerKeySectionTrimmed !== undefined) {
      console.log(`answer_key_section_trimmed: ${summary.diagnostics.answerKeySectionTrimmed}`);
    }
    if (summary.diagnostics.removedTrailingTextCharCount !== undefined) {
      console.log(`removed_trailing_text_char_count: ${summary.diagnostics.removedTrailingTextCharCount}`);
    }
  }

  if (summary.message) {
    console.log(`message: ${summary.message}`);
  }

  if (summary.warnings.length > 0) {
    console.log(`warnings: ${summary.warnings.join("; ")}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.name === "ResourceExtractionError") {
    const extractionError = error as Error & { code?: string; jobId?: string };
    console.error("Gemini resource extraction test failed");
    console.error(`code: ${extractionError.code ?? "unknown"}`);
    console.error(`job_id: ${extractionError.jobId ?? "none"}`);
    console.error(`message: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : "Gemini resource extraction test failed.");
  }

  process.exitCode = 1;
});
