import { NextResponse } from "next/server";
import { sanitizeStorageFilename } from "@/lib/resources/metadata-detection";
import { normalizeResourceUploadMetadata, type UploadMetadataInput } from "@/lib/resources/upload-metadata";
import { isAdminRole } from "@/lib/auth";
import { requireAuthenticatedSchoolUser } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ResourceListItem } from "@/lib/types";

type UploadResult = {
  error?: string;
  originalFilename: string;
  resource?: ResourceListItem;
};

const resourceColumns =
  "id,title,cluster,event_code,event_name,event_category,instructional_area,year,resource_type,approval_status,original_filename,confidence_score,import_notes,file_path,storage_path";

function parseMetadata(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return new Map<string, UploadMetadataInput>();
  }

  const parsed = JSON.parse(value) as UploadMetadataInput[];

  return new Map(parsed.map((metadata) => [metadata.original_filename, metadata]));
}

function buildStoragePath(metadata: ReturnType<typeof normalizeResourceUploadMetadata>, filename: string) {
  const year = metadata.year ?? new Date().getFullYear();
  const uniquePrefix = crypto.randomUUID().slice(0, 12);

  return `${metadata.resource_type}/${year}/${uniquePrefix}_${sanitizeStorageFilename(filename)}`;
}

async function verifyAdmin(userId: string) {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("profiles")
    .select("id,email,role,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return isAdminRole(data?.role);
}

export async function POST(request: Request) {
  const { error: authError, user } = await requireAuthenticatedSchoolUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: authError ?? "Unauthorized." }, { status: 401 });
  }

  const isAdmin = await verifyAdmin(user.id);

  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((file): file is File => file instanceof File);
  let metadataByFilename: Map<string, UploadMetadataInput>;

  try {
    metadataByFilename = parseMetadata(formData.get("metadata"));
  } catch {
    return NextResponse.json({ error: "Invalid upload metadata." }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "Upload at least one PDF file." }, { status: 400 });
  }

  const adminSupabase = getSupabaseAdminClient();
  const results: UploadResult[] = [];

  for (const file of files) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      results.push({
        error: "Only PDF files can be uploaded.",
        originalFilename: file.name,
      });
      continue;
    }

    const metadata = normalizeResourceUploadMetadata(file.name, metadataByFilename.get(file.name));
    const storagePath = buildStoragePath(metadata, file.name);

    const { error: uploadError } = await adminSupabase.storage
      .from("resources")
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      results.push({
        error: uploadError.message,
        originalFilename: file.name,
      });
      continue;
    }

    const { data, error: insertError } = await adminSupabase
      .from("resources")
      .insert({
        ...metadata,
        approval_status: "pending",
        file_path: storagePath,
        storage_path: storagePath,
      })
      .select(resourceColumns)
      .single();

    if (insertError) {
      await adminSupabase.storage.from("resources").remove([storagePath]);

      results.push({
        error: insertError.message,
        originalFilename: file.name,
      });
      continue;
    }

    results.push({
      originalFilename: file.name,
      resource: data,
    });
  }

  const uploadedCount = results.filter((result) => result.resource).length;
  const failedCount = results.length - uploadedCount;

  return NextResponse.json({
    failedCount,
    results,
    uploadedCount,
  });
}
