import "server-only";

import {
  classifyResourceById,
  ResourceClassificationError,
} from "@/lib/ai/extraction/resource-classifier";
import { extractAnswerKeyFromResource } from "./answer-key-extractor";
import { extractExamFromResource } from "./exam-extractor";
import { extractRoleplayFromResource } from "./roleplay-extractor";
import { extractRubricFromResource } from "./rubric-extractor";
import {
  getExtractionSupabase,
  getLatestClassification,
  loadResourceForExtraction,
  ResourceExtractionError,
  type ExtractionSummary,
  type ResourceExtractionOptions,
  type ResourceExtractionType,
} from "./shared";
import { getClassificationTextExcerpt } from "./text-prep";

export type ExtractResourceOptions = ResourceExtractionOptions & {
  extractionType?: ResourceExtractionType | null;
};

const supportedExtractionTypes = new Set<ResourceExtractionType>([
  "answer_key",
  "exam",
  "judge_rubric",
  "roleplay",
]);

function isSupportedExtractionType(value: unknown): value is ResourceExtractionType {
  return typeof value === "string" && supportedExtractionTypes.has(value as ResourceExtractionType);
}

function inferExtractionTypeFromResource(resourceType: string | null | undefined) {
  if (resourceType === "exam" || resourceType === "roleplay") {
    return resourceType;
  }

  return null;
}

async function resolveExtractionType({
  explicitType,
  resourceId,
  supabase,
  userId,
}: {
  explicitType?: ResourceExtractionType | null;
  resourceId: string;
  supabase: ReturnType<typeof getExtractionSupabase>;
  userId?: string | null;
}) {
  if (explicitType) {
    return explicitType;
  }

  const latestClassification = await getLatestClassification(resourceId, supabase);

  if (isSupportedExtractionType(latestClassification)) {
    return latestClassification;
  }

  const resource = await loadResourceForExtraction(resourceId, supabase);
  const inferredType = inferExtractionTypeFromResource(resource.resource_type);

  if (inferredType) {
    return inferredType;
  }

  try {
    const classification = await classifyResourceById(resourceId, {
      supabase,
      textExcerpt: resource.detected_text
        ? getClassificationTextExcerpt(resource.detected_text)
        : null,
      userId,
    });

    if (isSupportedExtractionType(classification.result.resourceType)) {
      return classification.result.resourceType;
    }

    throw new ResourceExtractionError(
      "unsupported_extraction_type",
      `Resource classification ${classification.result.resourceType} is not supported for Phase 3 extraction.`,
    );
  } catch (error) {
    if (error instanceof ResourceExtractionError) {
      throw error;
    }

    if (error instanceof ResourceClassificationError) {
      throw new ResourceExtractionError(
        error.code === "gemini_missing_key" ? "gemini_missing_key" : "gemini_api_error",
        error.message,
        error.jobId,
      );
    }

    throw error;
  }
}

export async function extractResource({
  chunkSize,
  chunkThreshold,
  extractionType = null,
  force = false,
  resourceId,
  supabase = getExtractionSupabase(),
  userId = null,
}: ExtractResourceOptions & { resourceId: string }): Promise<ExtractionSummary> {
  if (extractionType && !isSupportedExtractionType(extractionType)) {
    throw new ResourceExtractionError(
      "unsupported_extraction_type",
      `Unsupported extraction type: ${extractionType}`,
    );
  }

  const resolvedType = await resolveExtractionType({
    explicitType: extractionType,
    resourceId,
    supabase,
    userId,
  });
  const options = { chunkSize, chunkThreshold, force, supabase, userId };

  if (resolvedType === "exam") {
    return extractExamFromResource(resourceId, options);
  }

  if (resolvedType === "answer_key") {
    return extractAnswerKeyFromResource(resourceId, options);
  }

  if (resolvedType === "roleplay") {
    return extractRoleplayFromResource(resourceId, options);
  }

  if (resolvedType === "judge_rubric") {
    return extractRubricFromResource(resourceId, options);
  }

  throw new ResourceExtractionError(
    "unsupported_extraction_type",
    `Unsupported extraction type: ${resolvedType}`,
  );
}
