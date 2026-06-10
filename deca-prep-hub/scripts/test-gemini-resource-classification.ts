import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { classifyResourceById } = await import("../src/lib/ai/extraction/resource-classifier");
  const resourceId = process.argv[2];

  if (!resourceId) {
    throw new Error("Usage: npm run test:gemini-classify -- <resource-id>");
  }

  const result = await classifyResourceById(resourceId);

  console.log("Gemini resource classification test");
  console.log(`job_id: ${result.jobId}`);
  console.log(`status: ${result.status}`);
  console.log(`classification_id: ${result.classificationId ?? "none"}`);
  console.log(`classification: ${result.result.resourceType}`);
  console.log(`confidence: ${result.result.confidence}`);
  console.log(`model: ${result.model ?? "default"}`);

  if (result.result.warnings.length > 0) {
    console.log(`warnings: ${result.result.warnings.join("; ")}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.name === "ResourceClassificationError") {
    const extractionError = error as Error & { code?: string; jobId?: string };
    console.error("Gemini resource classification test failed");
    console.error(`code: ${extractionError.code ?? "unknown"}`);
    console.error(`job_id: ${extractionError.jobId ?? "none"}`);
    console.error(`message: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : "Gemini resource classification test failed.");
  }

  process.exitCode = 1;
});
