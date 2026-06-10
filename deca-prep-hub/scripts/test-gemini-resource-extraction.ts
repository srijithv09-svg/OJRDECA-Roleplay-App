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

  if (!resourceId) {
    throw new Error(
      "Usage: npm run test:gemini-extract -- <resource-id> [--type=exam|answer_key|roleplay|judge_rubric] [--force]",
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

  return {
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
