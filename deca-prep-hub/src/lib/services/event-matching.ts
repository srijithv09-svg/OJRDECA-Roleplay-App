import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { detectDecaEventFromText } from "@/lib/deca/events";
import type { Database, DecaEvent } from "@/lib/types";

type EventSupabase = SupabaseClient<Database>;

type ResourceMetadata = {
  event_code?: string | null;
  event_name?: string | null;
  file_path?: string | null;
  import_notes?: string | null;
  original_filename?: string | null;
  storage_path?: string | null;
  title?: string | null;
};

type GeminiExtractionMetadata = {
  detectedEventCode?: string | null;
  detectedEventName?: string | null;
};

const eventColumns =
  "id,code,name,cluster,event_type,participants,exam_cluster,description,is_pilot,sort_order,created_at,updated_at";

export function normalizeEventCode(input: string | null | undefined) {
  return input?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
}

export function normalizeEventName(input: string | null | undefined) {
  return input
    ?.toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(deca|series|event)\b/g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function metadataSearchText(metadata: ResourceMetadata) {
  return [
    metadata.event_code,
    metadata.event_name,
    metadata.original_filename,
    metadata.title,
    metadata.storage_path,
    metadata.file_path,
    metadata.import_notes,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function findEventByCode(
  supabase: EventSupabase,
  code: string | null | undefined,
) {
  const normalizedCode = normalizeEventCode(code);

  if (!normalizedCode) {
    return null;
  }

  const { data, error } = await supabase
    .from("events")
    .select(eventColumns)
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function findEventByAlias(
  supabase: EventSupabase,
  input: string | null | undefined,
) {
  const normalizedInput = input?.trim();

  if (!normalizedInput) {
    return null;
  }

  const { data: alias, error } = await supabase
    .from("event_aliases")
    .select("event_id")
    .ilike("alias", normalizedInput)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return alias?.event_id ? findEventById(supabase, alias.event_id) : null;
}

async function findEventById(supabase: EventSupabase, id: string) {
  const { data, error } = await supabase
    .from("events")
    .select(eventColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findEventByNormalizedName(
  supabase: EventSupabase,
  input: string | null | undefined,
) {
  const normalizedInput = normalizeEventName(input);

  if (!normalizedInput) {
    return null;
  }

  const events = await getCanonicalEventOptions(supabase);

  return events.find((event) => normalizeEventName(event.name) === normalizedInput) ?? null;
}

async function matchFromText(supabase: EventSupabase, text: string) {
  const staticMatch = detectDecaEventFromText(text);

  if (staticMatch) {
    return findEventByCode(supabase, staticMatch.code);
  }

  const events = await getCanonicalEventOptions(supabase);
  const normalizedText = normalizeEventName(text);

  return events.find((event) => normalizedText.includes(normalizeEventName(event.name))) ?? null;
}

export async function matchEventFromResourceMetadata(
  supabase: EventSupabase,
  metadata: ResourceMetadata,
) {
  return (
    (await findEventByCode(supabase, metadata.event_code)) ??
    (await findEventByAlias(supabase, metadata.event_code)) ??
    (await findEventByAlias(supabase, metadata.event_name)) ??
    (await findEventByNormalizedName(supabase, metadata.event_name)) ??
    (await matchFromText(supabase, metadataSearchText(metadata)))
  );
}

export async function matchEventFromGeminiExtraction(
  supabase: EventSupabase,
  extraction: GeminiExtractionMetadata,
  resourceMetadata?: ResourceMetadata,
) {
  return (
    (await findEventByCode(supabase, extraction.detectedEventCode)) ??
    (await findEventByAlias(supabase, extraction.detectedEventCode)) ??
    (await findEventByAlias(supabase, extraction.detectedEventName)) ??
    (await findEventByNormalizedName(supabase, extraction.detectedEventName)) ??
    (resourceMetadata ? await matchEventFromResourceMetadata(supabase, resourceMetadata) : null)
  );
}

export async function getCanonicalEventOptions(supabase: EventSupabase): Promise<DecaEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(eventColumns)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
