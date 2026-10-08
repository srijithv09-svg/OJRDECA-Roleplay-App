"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isAdminRole } from "@/lib/auth";
import { decaEvents, getDecaEventByCode } from "@/lib/deca/events";
import { detectResourceMetadata, type DetectedResourceMetadata } from "@/lib/resources/metadata-detection";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uploadResourceBatch, type UploadDraft, type UploadProgress, type UploadSummary } from "@/lib/resources/upload";
import type { Profile, SupabaseResourceType } from "@/lib/types";

const resourceTypeOptions: SupabaseResourceType[] = ["roleplay", "exam", "reference", "unknown"];
const typeLabels: Record<SupabaseResourceType, string> = { roleplay: "Roleplay", exam: "Exam", reference: "Reference", unknown: "Unclassified" };

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
        const eventWasCleared = patch.event_code !== undefined && !patch.event_code?.trim();
        const nextResourceType = patch.resource_type ?? draft.resource_type;

        return {
          ...draft,
          ...patch,
          cluster: selectedEvent ? selectedEvent.cluster : patch.cluster ?? draft.cluster,
          event_category: selectedEvent
            ? selectedEvent.category
            : eventWasCleared ? null : patch.event_category ?? draft.event_category,
          event_code: patch.event_code !== undefined ? patch.event_code?.trim().toUpperCase() || null : draft.event_code,
          event_name: selectedEvent ? selectedEvent.name : eventWasCleared ? null : patch.event_name ?? draft.event_name,
          instructional_area:
            nextResourceType !== "roleplay"
              ? null
              : patch.instructional_area !== undefined ? patch.instructional_area : draft.instructional_area,
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
        description="Choose your PDFs, check their details, then send them to the approval queue."
        eyebrow="Admin"
        title="Upload resources"
      />

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <p className="font-semibold text-red-950" role="alert">Upload issue: {error}</p>

        </Card>
      ) : null}

      {uploadResponse ? (
        <Card>
          <p className="font-semibold text-slate-950" role="status">
            Uploaded {uploadResponse.uploadedCount} resource
            {uploadResponse.uploadedCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {uploadResponse.failedCount > 0 ? `${uploadResponse.failedCount} failed. Only those files remain below for retry.` : "All files are ready for review."} New resources stay hidden until approved.
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

      <fieldset disabled={isUploading} className="min-w-0 space-y-5">
        <legend className="sr-only">Choose and review PDF uploads</legend>
        <section className="rounded-md border border-border bg-card p-4 sm:p-5" aria-labelledby="select-files-title">
          <h2 className="font-semibold" id="select-files-title">1. Choose PDFs</h2>
          <label
            className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] bg-card-muted p-5 text-center transition hover:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
          >
            <input accept="application/pdf,.pdf" aria-label="Choose PDF files" className="sr-only" multiple onChange={(event) => { if (event.target.files) { addFiles(event.target.files); event.target.value = ""; } }} type="file" />
            <span className="font-semibold text-primary">Choose files <span className="font-normal text-[var(--muted-foreground)]">or drop PDFs here</span></span>
            <span className="mt-2 text-sm text-[var(--muted)]">Select several PDFs at once. Each file uploads separately.</span>
          </label>
        </section>

        {drafts.length > 0 ? (
          <section aria-labelledby="review-files-title" className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
              <div>
                <h2 className="font-semibold" id="review-files-title">2. Review {drafts.length} {drafts.length === 1 ? "file" : "files"}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Check the title and resource type. Open more details to adjust the event, cluster, or year.</p>
              </div>
              <button className="ui-button ui-button-secondary" onClick={() => { setDrafts([]); setUploadResponse(null); }} type="button">Clear files</button>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {drafts.map((draft, index) => (
                <UploadDraftCard draft={draft} index={index} key={draft.id} onRemove={() => removeDraft(draft.id)} onUpdate={(patch) => updateDraft(draft.id, patch)} />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-border bg-card-muted p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <p className="text-sm text-[var(--muted-foreground)]">{canUpload ? "Files will be pending until you approve them." : "Add a title to every file before uploading."}</p>
              <button className="ui-button ui-button-primary shrink-0" disabled={!canUpload || isUploading} onClick={() => void uploadDrafts()} type="button">{isUploading ? "Uploading…" : uploadResponse?.failedCount ? `Retry ${drafts.length} ${drafts.length === 1 ? "file" : "files"}` : `Upload ${drafts.length} ${drafts.length === 1 ? "file" : "files"}`}</button>
            </div>
          </section>
        ) : null}
      </fieldset>
    </>
  );
}

function UploadDraftCard({ draft, index, onRemove, onUpdate }: { draft: UploadDraft; index: number; onRemove: () => void; onUpdate: (patch: Partial<DetectedResourceMetadata>) => void }) {
  return (
    <article className="min-w-0 space-y-4 p-4 sm:p-5" aria-label={`File ${index + 1}: ${draft.original_filename}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all text-xs text-[var(--muted)]">{draft.original_filename}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{(draft.file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button aria-label={`Remove ${draft.original_filename}`} className="ui-button ui-button-secondary shrink-0" onClick={onRemove} type="button">Remove</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="ui-label">Title<input className="ui-field" onChange={(event) => onUpdate({ title: event.target.value })} required value={draft.title} /></label>
        <label className="ui-label">Resource type<select className="ui-field" onChange={(event) => onUpdate({ resource_type: event.target.value as SupabaseResourceType })} value={draft.resource_type}>{resourceTypeOptions.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
      </div>
      {draft.resource_type === "reference" ? <p className="text-sm text-[var(--muted-foreground)]">This document will appear in Reference once approved.</p> : draft.resource_type === "unknown" ? <p className="text-sm text-amber-800">Choose a resource type so students can find this document.</p> : null}
      <details>
        <summary className="w-fit cursor-pointer py-1 text-sm font-medium text-[var(--muted-foreground)]">More details<span className="ml-2 font-normal text-[var(--muted)]">{[draft.event_code, draft.cluster, draft.year].filter(Boolean).join(" · ")}</span></summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="ui-label sm:col-span-2">Event<select className="ui-field" onChange={(event) => onUpdate({ event_code: event.target.value })} value={draft.event_code ?? ""}><option value="">No specific event</option>{decaEvents.map((event) => <option key={event.code} value={event.code}>{event.code} — {event.name}</option>)}</select></label>
          <label className="ui-label">Year<input className="ui-field" onChange={(event) => onUpdate({ year: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.year ?? ""} /></label>
          <label className="ui-label">Cluster<input className="ui-field" onChange={(event) => onUpdate({ cluster: event.target.value })} value={draft.cluster ?? ""} /></label>
          <label className="ui-label">Event name<input className="ui-field" onChange={(event) => onUpdate({ event_name: event.target.value })} value={draft.event_name ?? ""} /></label>
          <label className="ui-label">Event category<input className="ui-field" onChange={(event) => onUpdate({ event_category: event.target.value })} value={draft.event_category ?? ""} /></label>
          {draft.resource_type === "roleplay" ? <label className="ui-label sm:col-span-2 lg:col-span-3">Instructional area<input className="ui-field" onChange={(event) => onUpdate({ instructional_area: event.target.value })} value={draft.instructional_area ?? ""} /></label> : null}
        </div>
      </details>
    </article>
  );
}

function LinkButton({ children, className, href }: { children: ReactNode; className?: string; href: string }) {
  return <Link className={`ui-button ui-button-secondary ${className ?? ""}`} href={href}>{children}</Link>;
}
