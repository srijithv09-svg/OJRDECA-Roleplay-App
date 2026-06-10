"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isAdminRole } from "@/lib/auth";
import { decaEvents, getDecaEventByCode } from "@/lib/deca/events";
import { detectResourceMetadata, type DetectedResourceMetadata } from "@/lib/resources/metadata-detection";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile, ResourceListItem, SupabaseResourceType } from "@/lib/types";

type UploadDraft = DetectedResourceMetadata & {
  file: File;
  id: string;
};

type UploadResponse = {
  error?: string;
  failedCount: number;
  results: Array<{
    error?: string;
    originalFilename: string;
    resource?: ResourceListItem;
  }>;
  uploadedCount: number;
};

type ExtractionType = "answer_key" | "exam" | "judge_rubric" | "roleplay";
type ExtractionTypeOption = "auto" | ExtractionType;
type ExtractionSummary = {
  duplicate?: boolean;
  extractionType: ExtractionType;
  jobId: string | null;
  message?: string;
  recordsCreated: Record<string, number>;
  resourceId: string;
  status: string;
  warnings: string[];
};
type ExtractionState = {
  error?: string;
  extraction?: ExtractionSummary;
  isLoading: boolean;
};

const resourceTypeOptions: SupabaseResourceType[] = ["roleplay", "exam", "reference", "unknown"];
const extractionTypeOptions: Array<{ label: string; value: ExtractionTypeOption }> = [
  { label: "Auto-detect", value: "auto" },
  { label: "Exam", value: "exam" },
  { label: "Answer Key", value: "answer_key" },
  { label: "Roleplay", value: "roleplay" },
  { label: "Judge Rubric", value: "judge_rubric" },
];

function draftFromFile(file: File): UploadDraft {
  return {
    ...detectResourceMetadata(file.name),
    file,
    id: crypto.randomUUID(),
  };
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function AdminUploadView() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [runExtractionAfterUpload, setRunExtractionAfterUpload] = useState(false);
  const [extractionStates, setExtractionStates] = useState<Record<string, ExtractionState>>({});
  const [extractionTypes, setExtractionTypes] = useState<Record<string, ExtractionTypeOption>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void getCurrentOwnProfile()
      .then((nextProfile) => {
        if (isActive) {
          setProfile(nextProfile);
          setError(null);
        }
      })
      .catch((caughtError) => {
        if (isActive) {
          setProfile(null);
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to verify admin access.",
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsCheckingAccess(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const canUpload = useMemo(
    () => drafts.length > 0 && drafts.every((draft) => draft.title.trim()),
    [drafts],
  );

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const pdfFiles = files.filter(isPdf);

    setError(files.length !== pdfFiles.length ? "Only PDF files were added." : null);
    setUploadResponse(null);
    setDrafts((currentDrafts) => [...currentDrafts, ...pdfFiles.map(draftFromFile)]);
  }

  function updateDraft(id: string, patch: Partial<DetectedResourceMetadata>) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) => {
        if (draft.id !== id) {
          return draft;
        }

        const selectedEvent = getDecaEventByCode(patch.event_code);
        const nextResourceType = selectedEvent ? "roleplay" : patch.resource_type ?? draft.resource_type;

        return {
          ...draft,
          ...patch,
          cluster: selectedEvent ? selectedEvent.cluster : patch.cluster ?? draft.cluster,
          event_category: selectedEvent
            ? selectedEvent.category
            : patch.event_category ?? draft.event_category,
          event_code: patch.event_code === "" ? null : patch.event_code ?? draft.event_code,
          event_name: selectedEvent ? selectedEvent.name : patch.event_name ?? draft.event_name,
          instructional_area:
            nextResourceType !== "roleplay"
              ? null
              : patch.instructional_area ?? draft.instructional_area,
          resource_type: nextResourceType,
        };
      }),
    );
  }

  function removeDraft(id: string) {
    setDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== id));
  }

  async function uploadDrafts() {
    setIsUploading(true);
    setError(null);
    setUploadResponse(null);
    setExtractionStates({});
    setExtractionTypes({});

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(sessionError?.message ?? "You must be signed in as an admin.");
      }

      const formData = new FormData();

      for (const draft of drafts) {
        formData.append("files", draft.file, draft.file.name);
      }

      formData.append(
        "metadata",
        JSON.stringify(
          drafts.map((draft) => ({
            cluster: draft.cluster,
            confidence_score: draft.confidence_score,
            event_name: draft.event_name,
            event_category: draft.event_category,
            event_code: draft.event_code,
            import_notes: draft.import_notes,
            instructional_area: draft.instructional_area,
            original_filename: draft.original_filename,
            resource_type: draft.resource_type,
            title: draft.title.trim(),
            year: draft.year,
          })),
        ),
      );

      const response = await fetch("/api/admin/resources/upload", {
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        method: "POST",
      });
      const payload = (await response.json()) as UploadResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to upload resources.");
      }

      setUploadResponse(payload);
      const successfulResources = payload.results
        .map((result) => result.resource)
        .filter((resource): resource is ResourceListItem => Boolean(resource));

      setExtractionTypes(
        Object.fromEntries(successfulResources.map((resource) => [resource.id, "auto"])),
      );
      setDrafts((currentDrafts) =>
        currentDrafts.filter((draft) =>
          payload.results.some((result) => result.originalFilename === draft.file.name && result.error),
        ),
      );

      if (runExtractionAfterUpload) {
        for (const resource of successfulResources) {
          await runExtraction(resource.id, "auto");
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to upload resources.");
    } finally {
      setIsUploading(false);
    }
  }

  async function runExtraction(
    resourceId: string,
    extractionType: ExtractionTypeOption = extractionTypes[resourceId] ?? "auto",
    force = false,
  ) {
    setExtractionStates((current) => ({
      ...current,
      [resourceId]: { isLoading: true },
    }));

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(sessionError?.message ?? "You must be signed in as an admin.");
      }

      const response = await fetch("/api/admin/ai/extract-resource", {
        body: JSON.stringify({
          extraction_type: extractionType === "auto" ? undefined : extractionType,
          force,
          resource_id: resourceId,
        }),
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        code?: string;
        error?: string;
        extraction?: ExtractionSummary;
      };

      if (!response.ok) {
        if (payload.code === "gemini_missing_key") {
          throw new Error(
            "Gemini is not configured. Add GEMINI_API_KEY in the server environment to enable AI extraction.",
          );
        }

        throw new Error(payload.error ?? "Unable to run AI extraction.");
      }

      setExtractionStates((current) => ({
        ...current,
        [resourceId]: {
          extraction: payload.extraction,
          isLoading: false,
        },
      }));
    } catch (caughtError) {
      setExtractionStates((current) => ({
        ...current,
        [resourceId]: {
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to run AI extraction.",
          isLoading: false,
        },
      }));
    }
  }

  if (isCheckingAccess) {
    return (
      <Card className="grid min-h-56 place-items-center text-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Admin upload
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-950">Checking access</h1>
        </div>
      </Card>
    );
  }

  if (!isAdminRole(profile?.role)) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Admin only
        </p>
        <h1 className="mt-2 text-2xl font-bold text-red-950">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          You must be an admin to upload resources.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        actions={<LinkButton href="/admin/resources">Review pending resources</LinkButton>}
        description="Upload PDFs, review detected metadata, and create pending resources for approval."
        eyebrow="Admin"
        title="Upload Resource"
      />

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <p className="font-semibold text-red-950">Upload issue</p>
          <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
        </Card>
      ) : null}

      {uploadResponse ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-semibold text-emerald-950">
            Uploaded {uploadResponse.uploadedCount} resource
            {uploadResponse.uploadedCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            {uploadResponse.failedCount} failed. New resources are pending until approved.
          </p>
          <LinkButton className="mt-4" href="/admin/resources">
            Open approval queue
          </LinkButton>
          <LinkButton className="ml-2 mt-4" href="/admin/ai-review">
            Open AI Review
          </LinkButton>
        </Card>
      ) : null}

      <Card>
        <CardHeader eyebrow="PDF intake" title="Select files" />
        <label
          className="grid min-h-44 cursor-pointer place-items-center rounded-lg border border-dashed border-blue-300 bg-blue-50 p-6 text-center transition hover:bg-blue-100"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
        >
          <input
            accept="application/pdf,.pdf"
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files);
                event.target.value = "";
              }
            }}
            type="file"
          />
          <span className="text-base font-semibold text-blue-800">
            Drop PDFs here or choose files
          </span>
          <span className="mt-2 text-sm text-blue-700">
            Resources are created as pending and stay hidden from students until approval.
          </span>
        </label>
      </Card>

      {drafts.length > 0 ? (
        <Card>
          <CardHeader eyebrow="Review" title="Detected metadata" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="py-3 pr-3">Original filename</th>
                  <th className="py-3 pr-3">Title</th>
                  <th className="py-3 pr-3">Type</th>
                  <th className="py-3 pr-3">Year</th>
                  <th className="py-3 pr-3">Cluster</th>
                  <th className="py-3 pr-3">Event code</th>
                  <th className="py-3 pr-3">Event name</th>
                  <th className="py-3 pr-3">Category</th>
                  <th className="py-3 pr-3">Notes</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={draft.id}>
                    <td className="max-w-56 py-3 pr-3 font-medium text-slate-700">
                      {draft.original_filename}
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className="h-10 w-56 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) => updateDraft(draft.id, { title: event.target.value })}
                        value={draft.title}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            resource_type: event.target.value as SupabaseResourceType,
                          })
                        }
                        value={draft.resource_type}
                      >
                        {resourceTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className="h-10 w-24 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            year: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                        type="number"
                        value={draft.year ?? ""}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className="h-10 w-44 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) => updateDraft(draft.id, { cluster: event.target.value })}
                        value={draft.cluster ?? ""}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        className="h-10 w-40 rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          updateDraft(draft.id, { event_code: event.target.value || null })
                        }
                        value={draft.event_code ?? ""}
                      >
                        <option value="">Unknown / Manual</option>
                        {decaEvents.map((event) => (
                          <option key={event.code} value={event.code}>
                            {event.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className="h-10 w-64 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          updateDraft(draft.id, { event_name: event.target.value })
                        }
                        value={draft.event_name ?? ""}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        className="h-10 w-52 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          updateDraft(draft.id, { event_category: event.target.value })
                        }
                        value={draft.event_category ?? ""}
                      />
                    </td>
                    <td className="max-w-64 py-3 pr-3 text-xs leading-5 text-slate-500">
                      {draft.import_notes} Confidence: {Math.round(draft.confidence_score * 100)}%
                    </td>
                    <td className="py-3 text-right">
                      <button
                        className="min-h-10 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                        onClick={() => removeDraft(draft.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <label className="mr-auto flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">
              <input
                checked={runExtractionAfterUpload}
                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                onChange={(event) => setRunExtractionAfterUpload(event.target.checked)}
                type="checkbox"
              />
              Run AI extraction after upload
            </label>
            <button
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              onClick={() => {
                setDrafts([]);
                setUploadResponse(null);
              }}
              type="button"
            >
              Clear
            </button>
            <button
              className="min-h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={!canUpload || isUploading}
              onClick={() => void uploadDrafts()}
              type="button"
            >
              {isUploading ? "Uploading..." : "Upload and create pending resources"}
            </button>
          </div>
        </Card>
      ) : null}

      {uploadResponse?.results.some((result) => result.resource) ? (
        <Card>
          <CardHeader eyebrow="AI extraction" title="Run extraction for uploaded resources" />
          <div className="grid gap-4">
            {uploadResponse.results
              .filter((result) => result.resource)
              .map((result) => {
                const resource = result.resource as ResourceListItem;
                const extractionState = extractionStates[resource.id];
                const selectedType = extractionTypes[resource.id] ?? "auto";

                return (
                  <div
                    className="rounded-lg border border-slate-200 bg-white p-4"
                    key={resource.id}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{resource.title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {resource.original_filename ?? result.originalFilename} · pending resource
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          onChange={(event) =>
                            setExtractionTypes((current) => ({
                              ...current,
                              [resource.id]: event.target.value as ExtractionTypeOption,
                            }))
                          }
                          value={selectedType}
                        >
                          {extractionTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                          disabled={Boolean(extractionState?.isLoading)}
                          onClick={() => void runExtraction(resource.id, selectedType)}
                          type="button"
                        >
                          {extractionState?.isLoading ? "Running..." : "Run AI Extraction"}
                        </button>
                        {extractionState?.extraction?.duplicate ? (
                          <button
                            className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
                            disabled={Boolean(extractionState?.isLoading)}
                            onClick={() => void runExtraction(resource.id, selectedType, true)}
                            type="button"
                          >
                            Force re-extraction
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {extractionState?.error ? (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {extractionState.error}
                      </div>
                    ) : null}

                    {extractionState?.extraction ? (
                      <ExtractionResultSummary extraction={extractionState.extraction} />
                    ) : null}
                  </div>
                );
              })}
          </div>
        </Card>
      ) : null}
    </>
  );
}

function ExtractionResultSummary({ extraction }: { extraction: ExtractionSummary }) {
  const jobHref = extraction.jobId ? `/admin/ai-review/jobs/${extraction.jobId}` : "/admin/ai-review";

  return (
    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
      <p className="font-semibold">
        {extraction.duplicate ? "Extraction already exists" : "Extraction request finished"} ·{" "}
        {extraction.status}
      </p>
      <p className="mt-2">
        Type: {extraction.extractionType}. Job: {extraction.jobId ?? "No new job"}.
      </p>
      <p className="mt-2">Records created: {JSON.stringify(extraction.recordsCreated)}</p>
      {extraction.message ? <p className="mt-2">{extraction.message}</p> : null}
      {extraction.warnings.length > 0 ? (
        <ul className="mt-2 list-inside list-disc">
          {extraction.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkButton href="/admin/ai-review">Open AI Review</LinkButton>
        <LinkButton href={jobHref}>{extraction.jobId ? "Open job detail" : "Open review center"}</LinkButton>
      </div>
    </div>
  );
}

function LinkButton({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <Link
      className={`inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 ${className ?? ""}`}
      href={href}
    >
      {children}
    </Link>
  );
}
