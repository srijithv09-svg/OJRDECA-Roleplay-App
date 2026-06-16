import type { ResourceListItem, SupabaseResourceType } from "../types";

export type DecaEvent = {
  code: string;
  name: string;
  cluster: string;
  category: string;
  resourceTypeHint: "roleplay" | "exam" | "reference";
};

export const decaEvents = [
  { code: "ACT", name: "Accounting Applications Series", cluster: "Finance", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "AAM", name: "Apparel and Accessories Marketing Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "ASM", name: "Automotive Services Marketing Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "BFS", name: "Business Finance Series", cluster: "Finance", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "BSM", name: "Business Services Marketing Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "BOR", name: "Business Services Operations Research", cluster: "Business Management and Administration", category: "Operations Research", resourceTypeHint: "reference" },
  { code: "ENT", name: "Entrepreneurship Series", cluster: "Entrepreneurship", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "FMS", name: "Food Marketing Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "HLM", name: "Hotel and Lodging Management Series", cluster: "Hospitality and Tourism", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "HRM", name: "Human Resources Management Series", cluster: "Business Management and Administration", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "IMCE", name: "Integrated Marketing Campaign-Event", cluster: "Marketing", category: "Project", resourceTypeHint: "reference" },
  { code: "IMCP", name: "Integrated Marketing Campaign-Product", cluster: "Marketing", category: "Project", resourceTypeHint: "reference" },
  { code: "IMCS", name: "Integrated Marketing Campaign-Service", cluster: "Marketing", category: "Project", resourceTypeHint: "reference" },
  { code: "MCS", name: "Marketing Communications Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "QSRM", name: "Quick Serve Restaurant Management Series", cluster: "Hospitality and Tourism", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "RFSM", name: "Restaurant and Food Service Management Series", cluster: "Hospitality and Tourism", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "RMS", name: "Retail Merchandising Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "SEM", name: "Sports and Entertainment Marketing Series", cluster: "Marketing", category: "Individual Series", resourceTypeHint: "roleplay" },
  { code: "BMOR", name: "Buying and Merchandising Operations Research", cluster: "Marketing", category: "Operations Research", resourceTypeHint: "reference" },
  { code: "BLTDM", name: "Business Law and Ethics Team Decision Making", cluster: "Business Management and Administration", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "BTDM", name: "Buying and Merchandising Team Decision Making", cluster: "Marketing", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "ETDM", name: "Entrepreneurship Team Decision Making", cluster: "Entrepreneurship", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "FTDM", name: "Financial Services Team Decision Making", cluster: "Finance", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "HTDM", name: "Hospitality Services Team Decision Making", cluster: "Hospitality and Tourism", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "MTDM", name: "Marketing Management Team Decision Making", cluster: "Marketing", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "STDM", name: "Sports and Entertainment Marketing Team Decision Making", cluster: "Marketing", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "TTDM", name: "Travel and Tourism Team Decision Making", cluster: "Hospitality and Tourism", category: "Team Decision Making", resourceTypeHint: "roleplay" },
  { code: "PBM", name: "Principles of Business Management and Administration", cluster: "Business Management and Administration", category: "Principles", resourceTypeHint: "roleplay" },
  { code: "PEN", name: "Principles of Entrepreneurship", cluster: "Entrepreneurship", category: "Principles", resourceTypeHint: "roleplay" },
  { code: "PFN", name: "Principles of Finance", cluster: "Finance", category: "Principles", resourceTypeHint: "roleplay" },
  { code: "PHT", name: "Principles of Hospitality and Tourism", cluster: "Hospitality and Tourism", category: "Principles", resourceTypeHint: "roleplay" },
  { code: "PMK", name: "Principles of Marketing", cluster: "Marketing", category: "Principles", resourceTypeHint: "roleplay" },
  { code: "PFL", name: "Personal Financial Literacy", cluster: "Personal Financial Literacy", category: "Personal Financial Literacy", resourceTypeHint: "roleplay" },
  { code: "PMBS", name: "Business Solutions Project", cluster: "Business Management and Administration", category: "Project", resourceTypeHint: "reference" },
  { code: "PMCA", name: "Community Awareness Project", cluster: "Business Management and Administration", category: "Project", resourceTypeHint: "reference" },
  { code: "PMCD", name: "Career Development Project", cluster: "Business Management and Administration", category: "Project", resourceTypeHint: "reference" },
  { code: "PMCG", name: "Community Giving Project", cluster: "Business Management and Administration", category: "Project", resourceTypeHint: "reference" },
  { code: "PMFL", name: "Financial Literacy Project", cluster: "Business Management and Administration", category: "Project", resourceTypeHint: "reference" },
  { code: "PMSP", name: "Sales Project", cluster: "Business Management and Administration", category: "Project", resourceTypeHint: "reference" },
  { code: "PSE", name: "Professional Selling", cluster: "Marketing", category: "Professional Selling and Consulting", resourceTypeHint: "roleplay" },
] satisfies DecaEvent[];

const eventsByCode = new Map(decaEvents.map((event) => [event.code, event]));
const eventCodesByLength = decaEvents
  .map((event) => event.code)
  .sort((left, right) => right.length - left.length || left.localeCompare(right));

function normalizeCode(code: string | null | undefined) {
  return code?.trim().toUpperCase() ?? "";
}

function normalizeName(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(series|event|deca)\b/g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function resourceDetectionText(resource: Partial<ResourceListItem>) {
  return [
    resource.original_filename,
    resource.title,
    resource.storage_path,
    resource.file_path,
    resource.import_notes,
    resource.event_code,
    resource.event_name,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getDecaEventByCode(code: string | null | undefined) {
  return eventsByCode.get(normalizeCode(code)) ?? null;
}

export function getDecaEventByName(name: string | null | undefined) {
  const normalized = normalizeName(name);

  return decaEvents.find((event) => normalizeName(event.name) === normalized) ?? null;
}

export function detectDecaEventCodeFromText(text: string | null | undefined) {
  const normalized = text?.replace(/\\/g, "/") ?? "";

  for (const code of eventCodesByLength) {
    const pattern = new RegExp(`(?:^|[^A-Za-z0-9])${code}(?:[^A-Za-z0-9]|$)`, "i");

    if (pattern.test(normalized)) {
      return code;
    }
  }

  return null;
}

export function detectDecaEventFromText(text: string | null | undefined) {
  const code = detectDecaEventCodeFromText(text);

  if (code) {
    return getDecaEventByCode(code);
  }

  const normalized = normalizeName(text);

  return decaEvents.find((event) => normalized.includes(normalizeName(event.name))) ?? null;
}

export function detectDecaEventFromResource(resource: Partial<ResourceListItem>) {
  const explicitEvent = getDecaEventByCode(resource.event_code);

  if (explicitEvent) {
    return explicitEvent;
  }

  return detectDecaEventFromText(resourceDetectionText(resource));
}

export function detectDecaEventFromFilename(filename: string) {
  return detectDecaEventFromText(filename);
}

export function getClusterForEventCode(code: string | null | undefined) {
  return getDecaEventByCode(code)?.cluster ?? null;
}

export function getEventNameForCode(code: string | null | undefined) {
  return getDecaEventByCode(code)?.name ?? null;
}

export function getCategoryForEventCode(code: string | null | undefined) {
  return getDecaEventByCode(code)?.category ?? null;
}

export function getEventResourceTypeHint(code: string | null | undefined): SupabaseResourceType | null {
  return getDecaEventByCode(code)?.resourceTypeHint ?? null;
}
