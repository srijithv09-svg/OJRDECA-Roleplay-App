import type { DetectedResourceMetadata } from "./metadata-detection";

export type UploadDraft = DetectedResourceMetadata & { file: File; id: string };
export type UploadResult = { draftId: string; originalFilename: string; error?: string };
export type UploadSummary = {
  failedCount: number;
  uploadedCount: number;
  results: UploadResult[];
};
export type UploadProgress = { completed: number; total: number; filename: string };

async function uploadFile(draft: UploadDraft, accessToken: string, fetcher: typeof fetch) {
  const { file } = draft;
  const metadata = {
    cluster: draft.cluster,
    confidence_score: draft.confidence_score,
    event_category: draft.event_category,
    event_code: draft.event_code,
    event_name: draft.event_name,
    import_notes: draft.import_notes,
    instructional_area: draft.instructional_area,
    original_filename: draft.original_filename,
    resource_type: draft.resource_type,
    title: draft.title.trim(),
    year: draft.year,
  };
  const body = new FormData();
  body.append("files", file, file.name);
  body.append("metadata", JSON.stringify([metadata]));

  const response = await fetcher("/api/admin/resources/upload", {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
    method: "POST",
  }).catch(() => {
    throw new Error("The connection was interrupted. Check the approval queue before retrying this file.");
  });

  // Hosting errors (including oversized requests) can be plain text or HTML.
  if (response.status === 413) {
    throw new Error("This PDF exceeds the upload size limit. Compress it or split it into smaller PDFs, then try again.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Upload failed (HTTP ${response.status}). Check the approval queue before retrying.`,
    );
  }
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (typeof result?.error === "string") throw new Error(result.error);
  if (payload?.uploadedCount !== 1 || typeof result?.resource?.id !== "string") {
    throw new Error("The server did not confirm this upload. Check the approval queue before retrying.");
  }
}

export async function uploadResourceBatch(
  drafts: UploadDraft[],
  accessToken: string,
  onProgress: (progress: UploadProgress, result?: UploadResult) => void,
  fetcher: typeof fetch = fetch,
): Promise<UploadSummary> {
  const results: UploadResult[] = [];

  // Keep each PDF in its own request so a folder does not exceed the host's body limit.
  for (const draft of drafts) {
    onProgress({ completed: results.length, total: drafts.length, filename: draft.file.name });
    const result: UploadResult = { draftId: draft.id, originalFilename: draft.file.name };
    try {
      await uploadFile(draft, accessToken, fetcher);
    } catch (error) {
      result.error = error instanceof Error
        ? error.message
        : "Upload interrupted. Check the approval queue before retrying.";
    }
    results.push(result);
    onProgress({ completed: results.length, total: drafts.length, filename: draft.file.name }, result);
  }

  const failedCount = results.filter((result) => result.error).length;
  return { failedCount, uploadedCount: results.length - failedCount, results };
}
