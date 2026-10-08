import { getDecaEventByCode } from "../deca/events";
import type { SupabaseResourceType } from "../types";
import { detectResourceMetadata, type DetectedResourceMetadata } from "./metadata-detection";

export type UploadMetadataInput = Partial<DetectedResourceMetadata> & { original_filename: string };

const allowedTypes = new Set<SupabaseResourceType>(["roleplay", "exam", "reference", "unknown"]);

function optionalText(value: string | null | undefined, fallback: string | null) {
  return value === undefined ? fallback : value?.trim() || null;
}

/** Filename detection fills omitted fields; explicitly cleared review fields stay empty. */
export function normalizeResourceUploadMetadata(filename: string, submitted?: UploadMetadataInput) {
  const detected = detectResourceMetadata(filename);
  const eventCode = optionalText(submitted?.event_code, detected.event_code)?.toUpperCase() ?? null;
  const event = getDecaEventByCode(eventCode);
  const eventWasReviewed = submitted?.event_code !== undefined;
  const resourceType = submitted?.resource_type ?? detected.resource_type;
  const year = submitted?.year === undefined ? detected.year : submitted.year;

  return {
    cluster: event?.cluster ?? optionalText(submitted?.cluster, detected.cluster),
    confidence_score: submitted?.confidence_score ?? detected.confidence_score,
    event_category: event?.category ?? optionalText(submitted?.event_category, eventWasReviewed ? null : detected.event_category),
    event_code: event?.code ?? eventCode,
    event_name: event?.name ?? optionalText(submitted?.event_name, eventWasReviewed ? null : detected.event_name),
    import_notes: submitted?.import_notes?.trim() ?? detected.import_notes,
    instructional_area: resourceType === "roleplay" ? optionalText(submitted?.instructional_area, detected.instructional_area) : null,
    original_filename: filename,
    resource_type: allowedTypes.has(resourceType) ? resourceType : "unknown",
    title: submitted?.title?.trim() || detected.title,
    year: year !== null && Number.isInteger(Number(year)) && Number(year) > 0 ? Number(year) : null,
  };
}
