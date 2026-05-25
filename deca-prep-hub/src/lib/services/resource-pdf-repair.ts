import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ResourceListItem } from "../types";

type StorageObject = {
  id: string | null;
  metadata: Record<string, unknown> | null;
  name: string;
};

export type ResourcePdfCandidate = {
  matchedBy: string[];
  path: string;
};

export type ResourcePdfRepairResult = {
  candidates: ResourcePdfCandidate[];
  resource: Pick<
    ResourceListItem,
    "file_path" | "id" | "original_filename" | "resource_type" | "storage_path" | "title"
  >;
  signedUrl: string | null;
  signedUrlPath: string | null;
  signingAttempts: Array<{
    error: string | null;
    path: string;
    success: boolean;
  }>;
  updated: boolean;
};

const STORAGE_BUCKET = "resources";

function dedupe(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

export function normalizeObjectPath(objectPath: string) {
  return objectPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^resources\//i, "");
}

export function stripLeadingAssetId(filename: string) {
  return filename.replace(/^[a-f0-9]{16,}[_-]/i, "");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function comparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function filenameStem(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function isStorageObject(item: StorageObject) {
  return Boolean(item.id || item.metadata);
}

function getStrippedPathTerms(pathValue: string | null | undefined) {
  if (!pathValue?.trim()) {
    return [];
  }

  const basename = stripLeadingAssetId(path.basename(normalizeObjectPath(pathValue)));

  return [basename, filenameStem(basename)];
}

export function getResourcePdfSearchTerms(
  resource: Pick<ResourceListItem, "file_path" | "original_filename" | "storage_path" | "title">,
) {
  const strippedFilename = resource.original_filename
    ? stripLeadingAssetId(path.basename(resource.original_filename))
    : "";
  const strippedStem = strippedFilename ? filenameStem(strippedFilename) : "";

  return dedupe([
    slugify(resource.title),
    strippedFilename,
    strippedStem,
    ...getStrippedPathTerms(resource.storage_path),
    ...getStrippedPathTerms(resource.file_path),
  ]);
}

export async function listStorageFiles(
  supabase: SupabaseClient<Database>,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Storage list failed for "${prefix || "/"}": ${error.message}`);
    }

    const objects = (data ?? []) as StorageObject[];

    for (const object of objects) {
      const objectPath = prefix ? `${prefix}/${object.name}` : object.name;

      if (isStorageObject(object)) {
        paths.push(normalizeObjectPath(objectPath));
      } else {
        paths.push(...(await listStorageFiles(supabase, objectPath)));
      }
    }

    if (objects.length < limit) {
      break;
    }

    offset += limit;
  }

  return paths;
}

export function findResourcePdfCandidates(
  resource: Pick<ResourceListItem, "file_path" | "original_filename" | "storage_path" | "title">,
  storagePaths: string[],
) {
  const exactPaths = [resource.storage_path, resource.file_path]
    .filter((candidate): candidate is string => Boolean(candidate?.trim()))
    .map(normalizeObjectPath);
  const searchTerms = getResourcePdfSearchTerms(resource);
  const candidatesByPath = new Map<string, Set<string>>();

  for (const exactPath of exactPaths) {
    candidatesByPath.set(exactPath, new Set(["stored path"]));
  }

  for (const storagePath of storagePaths) {
    const pathMatches = candidatesByPath.get(storagePath) ?? new Set<string>();
    const normalizedPath = storagePath.toLowerCase();
    const comparablePath = comparable(storagePath);

    for (const term of searchTerms) {
      const normalizedTerm = term.toLowerCase();
      const comparableTerm = comparable(term);

      if (
        normalizedTerm &&
        (normalizedPath.includes(normalizedTerm) || comparablePath.includes(comparableTerm))
      ) {
        pathMatches.add(term);
      }
    }

    if (pathMatches.size > 0) {
      candidatesByPath.set(storagePath, pathMatches);
    }
  }

  return Array.from(candidatesByPath.entries()).map(([candidatePath, matchedBy]) => ({
    matchedBy: Array.from(matchedBy),
    path: candidatePath,
  }));
}

async function createSignedUrl(supabase: SupabaseClient<Database>, storagePath: string) {
  return supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 3600);
}

export async function createStoredResourcePdfSignedUrl(
  supabase: SupabaseClient<Database>,
  resource: Pick<ResourceListItem, "storage_path">,
) {
  if (!resource.storage_path?.trim()) {
    throw new Error("This resource does not have a storage_path.");
  }

  const storagePath = normalizeObjectPath(resource.storage_path);
  const { data, error } = await createSignedUrl(supabase, storagePath);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Signed URL response did not include a URL.");
  }

  return {
    signedUrl: data.signedUrl,
    storagePath,
  };
}

export async function repairResourcePdfPath(
  supabase: SupabaseClient<Database>,
  resourceId: string,
  options: { update?: boolean } = {},
): Promise<ResourcePdfRepairResult> {
  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select("id,title,original_filename,resource_type,storage_path,file_path")
    .eq("id", resourceId)
    .single();

  if (resourceError) {
    throw new Error(`Resource query failed: ${resourceError.message}`);
  }

  const storagePaths = await listStorageFiles(supabase);
  const candidates = findResourcePdfCandidates(resource, storagePaths);
  const signingAttempts: ResourcePdfRepairResult["signingAttempts"] = [];
  let signedUrl: string | null = null;
  let signedUrlPath: string | null = null;

  for (const candidate of candidates) {
    const { data, error } = await createSignedUrl(supabase, candidate.path);
    const candidateSignedUrl = data?.signedUrl ?? null;
    const success = Boolean(!error && candidateSignedUrl);

    signingAttempts.push({
      error: success ? null : error?.message ?? "Signed URL response did not include a URL.",
      path: candidate.path,
      success,
    });

    if (candidateSignedUrl && success) {
      signedUrl = candidateSignedUrl;
      signedUrlPath = candidate.path;
      break;
    }
  }

  let updated = false;

  if (options.update && signedUrlPath) {
    const { error: updateError } = await supabase
      .from("resources")
      .update({
        file_path: signedUrlPath,
        storage_path: signedUrlPath,
      })
      .eq("id", resource.id);

    if (updateError) {
      throw new Error(`Resource update failed: ${updateError.message}`);
    }

    updated = resource.storage_path !== signedUrlPath || resource.file_path !== signedUrlPath;
    resource.storage_path = signedUrlPath;
    resource.file_path = signedUrlPath;
  }

  return {
    candidates,
    resource,
    signedUrl,
    signedUrlPath,
    signingAttempts,
    updated,
  };
}
