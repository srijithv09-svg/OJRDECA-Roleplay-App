type ScenarioNumber = 1 | 2;

const directInstructionalAreaByEventCode = {
  BLTDM: "Customer Relations",
  BTDM: "Selling",
  ETDM: "Product/Service Management",
  FTDM: "Financial Analysis",
  HTDM: "Customer Relations",
  MTDM: "Economics",
  PBM: "Customer Relations",
  PEN: "Information Management",
  PFL: "Managing Credit",
  PFN: "Operations",
  PHT: "Economics",
  PMK: "Communication Skills",
  STDM: "Promotion",
  TTDM: "Customer Relations",
} as const;

const scenarioInstructionalAreaByEventCode = {
  AAM: { 1: "Operations", 2: "Marketing-Information Management" },
  ACT: { 1: "Financial Analysis", 2: "Financial Analysis" },
  ASM: { 1: "Promotion", 2: "Marketing" },
  BFS: { 1: "Financial Analysis", 2: "Financial Analysis" },
  BSM: { 1: "Product/Service Management", 2: "Promotion" },
  ENT: { 1: "Product/Service Management", 2: "Entrepreneurship" },
  FMS: { 1: "Market Planning", 2: "Customer Relations" },
  HLM: { 1: "Promotion", 2: "Financial Analysis" },
  HRM: { 1: "Emotional Intelligence", 2: "Communication Skills" },
  MCS: { 1: "Promotion", 2: "Product/Service Management" },
  QSRM: { 1: "Promotion", 2: "Market Planning" },
  RFSM: { 1: "Customer Relations", 2: "Information Management" },
  RMS: { 1: "Promotion", 2: "Product/Service Management" },
  SEM: { 1: "Selling", 2: "Customer Relations" },
} as const;

type EventCode =
  | keyof typeof directInstructionalAreaByEventCode
  | keyof typeof scenarioInstructionalAreaByEventCode;

export type DecaInstructionalAreaResource = {
  file_path?: string | null;
  original_filename?: string | null;
  resource_type?: string | null;
  storage_path?: string | null;
  title?: string | null;
  year?: number | null;
};

const supportedYears = new Set([2025, 2026]);
const eventCodes = [
  ...Object.keys(directInstructionalAreaByEventCode),
  ...Object.keys(scenarioInstructionalAreaByEventCode),
].sort((a, b) => b.length - a.length) as EventCode[];

function normalizeLookupText(value: string) {
  return value.replace(/\\/g, "/").replace(/[_-]+/g, " ");
}

function textFromInput(input: DecaInstructionalAreaResource | string) {
  if (typeof input === "string") {
    return input;
  }

  return [
    input.title,
    input.original_filename,
    input.file_path,
    input.storage_path,
  ]
    .filter(Boolean)
    .join(" ");
}

function isSupportedYear(year: number | null | undefined) {
  return year === null || year === undefined || supportedYears.has(year);
}

export function getEventCodeFromFilenameOrTitle(
  input: DecaInstructionalAreaResource | string,
): EventCode | null {
  const lookupText = normalizeLookupText(textFromInput(input)).toUpperCase();

  for (const eventCode of eventCodes) {
    const pattern = new RegExp(`(?:^|[^A-Z0-9])${eventCode}(?:[^A-Z0-9]|$)`);

    if (pattern.test(lookupText)) {
      return eventCode;
    }
  }

  return null;
}

export function getScenarioNumberFromFilenameOrTitle(
  input: DecaInstructionalAreaResource | string,
): ScenarioNumber | null {
  const lookupText = normalizeLookupText(textFromInput(input));
  const scenarioMatch = lookupText.match(
    /\b(?:scenario|association event|district event|icdc preliminary|preliminary|prelimimary|event)\s*(1|2)(?:[a-z])?\b/i,
  );

  if (!scenarioMatch) {
    return null;
  }

  return Number(scenarioMatch[1]) as ScenarioNumber;
}

export function getInstructionalAreaForResource(
  resource: DecaInstructionalAreaResource,
): string | null {
  if (resource.resource_type !== "roleplay" || !isSupportedYear(resource.year)) {
    return null;
  }

  const eventCode = getEventCodeFromFilenameOrTitle(resource);

  if (!eventCode) {
    return null;
  }

  if (eventCode in directInstructionalAreaByEventCode) {
    return directInstructionalAreaByEventCode[
      eventCode as keyof typeof directInstructionalAreaByEventCode
    ];
  }

  const scenarioNumber = getScenarioNumberFromFilenameOrTitle(resource);

  if (!scenarioNumber) {
    return null;
  }

  return (
    scenarioInstructionalAreaByEventCode[
      eventCode as keyof typeof scenarioInstructionalAreaByEventCode
    ]?.[scenarioNumber] ?? null
  );
}
