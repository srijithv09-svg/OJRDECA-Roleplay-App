"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isAdminRole } from "@/lib/auth";
import { decaEvents, getDecaEventByCode } from "@/lib/deca/events";
import { detectResourceMetadata, type DetectedResourceMetadata } from "@/lib/resources/metadata-detection";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uploadResourceBatch, type UploadDraft, type UploadProgress, type UploadSummary } from "@/lib/resources/upload";
import type { Profile, SupabaseResourceType } from "@/lib/types";

const resourceTypeOptions: SupabaseResourceType[] = ["roleplay", "exam", "reference", "unknown"];

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
  const [uploadResponse, setUploadResponse] = useState<UploadSummary | null>(null);
  const uploadLock = useRef(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
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
    if (uploadLock.current) return;
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
        const nextResourceType = patch.resource_type ?? draft.resource_type;

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
    if (uploadLock.current || !canUpload) return;
    uploadLock.current = true;
    setProgress(null);
    setIsUploading(true);
    setError(null);
    setUploadResponse(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(sessionError?.message ?? "You must be signed in as an admin.");
      }

      const summary = await uploadResourceBatch(drafts, session.access_token, (nextProgress, result) => {
        setProgress(nextProgress);
        if (result && !result.error) {
          setDrafts((current) => current.filter((draft) => draft.id !== result.draftId));
        }
      });
      setUploadResponse(summary);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to upload resources.");
    } finally {
      uploadLock.current = false;
      setProgress(null);
      setIsUploading(false);
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
          You must be an admin or advisor to upload resources.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <LinkButton href="/admin">Back to Admin</LinkButton>
            <LinkButton href="/admin/resources">Review pending resources</LinkButton>
          </>
        }
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
        <Card>
          <p className="font-semibold text-slate-950">
            Uploaded {uploadResponse.uploadedCount} resource
            {uploadResponse.uploadedCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {uploadResponse.failedCount} failed. New resources are pending until approved.
          </p>
          {uploadResponse.failedCount > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-red-800">
              {uploadResponse.results.filter((result) => result.error).map((result) => (
                <li className="break-words" key={result.draftId}>
                  <span className="font-semibold">{result.originalFilename}:</span> {result.error}
                </li>
              ))}
            </ul>
          ) : null}
          <LinkButton className="mt-4" href="/admin/resources">
            Open approval queue
          </LinkButton>
        </Card>
      ) : null}

      {isUploading ? (
        <Card>
          <p role="status" className="break-words text-sm text-slate-700">
            {progress
              ? `${progress.completed} of ${progress.total} files processed. Uploading ${progress.filename}`
              : "Preparing upload..."}
          </p>
          {progress ? <progress className="mt-3 w-full" aria-label="Upload progress" max={progress.total} value={progress.completed} /> : null}
          <p className="mt-2 text-sm text-slate-500">Keep this page open until all files have finished.</p>
        </Card>
      ) : null}

      <fieldset disabled={isUploading} className="min-w-0 space-y-6">
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
              PDFs upload one at a time. Resources stay hidden from students until approved.
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
                          <option value="">No event matched - choose manually</option>
                          {decaEvents.map((event) => (
                            <option key={event.code} value={event.code}>
                              {event.code} - {event.name}
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
      </fieldset>
    </>
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
