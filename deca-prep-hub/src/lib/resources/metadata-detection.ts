import { detectDecaEventCodeFromText, getDecaEventByCode } from "../deca/events";
import { getInstructionalAreaForResource } from "../deca/instructional-areas";
import type { SupabaseResourceType } from "../types";

export type DetectedResourceMetadata = {
  cluster: string | null;
  confidence_score: number;
  event_category: string | null;
  event_code: string | null;
  event_name: string | null;
  import_notes: string;
  instructional_area: string | null;
  original_filename: string;
  resource_type: SupabaseResourceType;
  title: string;
  year: number | null;
};

function filenameStem(filename: string) {
  return filename.replace(/\.[^.]+$/i, "");
}

function normalizeForTitle(value: string) {
  return filenameStem(value)
    .replace(/^[a-f0-9]{12,}[_-]/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectYear(value: string) {
  const yearMatch = value.match(/\b(20[1-3]\d)\b/);

  if (yearMatch) {
    return Number(yearMatch[1]);
  }

  const schoolYearMatch = value.match(/\b(\d{2})\s*[-_]\s*(\d{2})\b/);

  if (schoolYearMatch) {
    return 2000 + Number(schoolYearMatch[2]);
  }

  const shortYearMatch = value.match(/\b(?:C)?(\d{2})[_\s-]?HS\b/i);

  return shortYearMatch ? 2000 + Number(shortYearMatch[1]) : null;
}

export function textClearlyIndicatesReference(value: string) {
  return (
    /\bperformance[-_\s]*indicators?\b/i.test(value) ||
    /\bexam[-_\s]*blueprint\b/i.test(value) ||
    /\bblueprint\b/i.test(value) ||
    /\bguidelines?\b/i.test(value)
  );
}

export function textClearlyIndicatesExam(value: string) {
  return /\b(?:cluster\s+sample\s+exam|sample\s+exam|exam)\b/i.test(
    value.replace(/[_-]+/g, " "),
  );
}

function detectResourceType(value: string, eventCode: string | null): SupabaseResourceType {
  if (textClearlyIndicatesReference(value)) {
    return "reference";
  }

  if (textClearlyIndicatesExam(value)) {
    return "exam";
  }

  if (eventCode || /\b(?:roleplay|role[-_\s]*play|case study|scenario)\b/i.test(value)) {
    return "roleplay";
  }

  return "unknown";
}

function detectClusterFallback(value: string) {
  if (/\bmarketing\b/i.test(value)) {
    return "Marketing";
  }

  if (/\bfinance|financial\b/i.test(value)) {
    return "Finance";
  }

  if (/\bhospitality|tourism|hotel|restaurant\b/i.test(value)) {
    return "Hospitality and Tourism";
  }

  if (/\bentrepreneurship|entrepreneur\b/i.test(value)) {
    return "Entrepreneurship";
  }

  if (/\bmanagement|business administration\b/i.test(value)) {
    return "Business Management and Administration";
  }

  return null;
}

function detectionNote({
  eventCode,
  resourceType,
  year,
}: {
  eventCode: string | null;
  resourceType: SupabaseResourceType;
  year: number | null;
}) {
  const notes = [`Detected ${resourceType} from filename/path.`];

  if (eventCode) {
    notes.push(`Matched DECA event code ${eventCode}.`);
  }

  if (year) {
    notes.push(`Detected year ${year}.`);
  }

  return notes.join(" ");
}

export function detectResourceMetadata(filename: string, extraText = ""): DetectedResourceMetadata {
  const detectionText = `${filename} ${extraText}`;
  const title = normalizeForTitle(filename) || filename;
  const year = detectYear(detectionText);
  const eventCode = detectDecaEventCodeFromText(detectionText);
  const event = eventCode ? getDecaEventByCode(eventCode) : null;
  const resourceType = detectResourceType(detectionText, eventCode);
  const cluster = resourceType === "roleplay" && event ? event.cluster : detectClusterFallback(detectionText);
  const instructionalArea =
    resourceType === "roleplay"
      ? getInstructionalAreaForResource({
          original_filename: filename,
          resource_type: resourceType,
          title,
          year,
        })
      : null;
  const confidenceScore =
    resourceType === "unknown" ? 0.25 : eventCode || year ? 0.8 : 0.55;

  return {
    cluster,
    confidence_score: confidenceScore,
    event_category: resourceType === "roleplay" ? event?.category ?? null : null,
    event_code: resourceType === "roleplay" ? eventCode : null,
    event_name: resourceType === "roleplay" ? event?.name ?? null : null,
    import_notes: detectionNote({ eventCode, resourceType, year }),
    instructional_area: instructionalArea,
    original_filename: filename,
    resource_type: resourceType,
    title,
    year,
  };
}

export function sanitizeStorageFilename(filename: string) {
  const safeName = filename
    .replace(/[^\w.\-() ]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
}
