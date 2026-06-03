"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RoleplayAttemptsService } from "@/lib/services/roleplay-attempts";
import type { RoleplayAttemptResult } from "@/lib/types";

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not saved";
  }

  return String(value);
}

export function RoleplayAttemptDetailView() {
  const params = useParams<{ attemptId?: string | string[] }>();
  const router = useRouter();
  const attemptId = Array.isArray(params.attemptId)
    ? params.attemptId[0]
    : params.attemptId;
  const [result, setResult] = useState<RoleplayAttemptResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadAttempt() {
      try {
        if (!attemptId) {
          throw new Error("Missing attempt id.");
        }

        const nextResult = await RoleplayAttemptsService.getRoleplayAttemptResult(attemptId);
        const nextAudioUrl = nextResult.attempt.audio_path
          ? await RoleplayAttemptsService.getRoleplayAttemptAudioSignedUrl(attemptId).catch(
              () => null,
            )
          : null;

        if (!isActive) {
          return;
        }

        setResult(nextResult);
        setAudioUrl(nextAudioUrl);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setResult(null);
        setAudioUrl(null);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load roleplay attempt.",
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadAttempt();

    return () => {
      isActive = false;
    };
  }, [attemptId, reloadKey]);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  async function deleteAttempt() {
    if (!attemptId) {
      return;
    }

    setIsDeleting(true);
    setIsConfirmingDelete(false);
    setError(null);

    try {
      await RoleplayAttemptsService.deleteRoleplayAttempt(attemptId);
      router.push("/roleplays");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to delete attempt.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error && !result) {
    return <ErrorState message={error} onRetry={retryLoad} />;
  }

  if (!result) {
    return null;
  }

  const { attempt, resource } = result;

  return (
    <>
      <PageHeader
        actions={
          <>
            <LinkButton href="/roleplays">Back to roleplays</LinkButton>
            <LinkButton href={`/roleplays/${resource.id}/practice?attemptId=${attempt.id}`}>
              Edit attempt
            </LinkButton>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:text-red-300"
              disabled={isDeleting}
              onClick={() => setIsConfirmingDelete(true)}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Delete attempt"}
            </button>
          </>
        }
        description="Review your saved response and reflection. Transcription and AI feedback are prepared for a future release."
        eyebrow="Roleplay attempt"
        title={resource.title}
      />

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <p className="font-semibold text-red-950">Unable to complete that action</p>
          <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
        </Card>
      ) : null}

      {isConfirmingDelete ? (
        <DeleteAttemptDialog
          isDeleting={isDeleting}
          onCancel={() => setIsConfirmingDelete(false)}
          onConfirm={() => void deleteAttempt()}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Event" value={resource.event_code ?? "TBD"} />
        <StatCard label="Confidence" value={attempt.confidence_rating ?? "N/A"} />
        <StatCard label="Transcript" value={attempt.transcript_status} />
        <StatCard label="AI feedback" value={attempt.ai_feedback_status} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Metadata" title="Roleplay details" />
            <div className="flex flex-wrap gap-2">
              {resource.event_code ? <Badge>{resource.event_code}</Badge> : null}
              <Badge tone="blue">{resource.event_category ?? "Roleplay"}</Badge>
              <Badge>{resource.year ?? "Year TBD"}</Badge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              {[
                ["Event name", resource.event_name],
                ["Cluster", resource.cluster],
                ["Event category", resource.event_category],
                ["Created", formatDate(attempt.created_at)],
              ].map(([label, value]) => (
                <div className="rounded-lg bg-slate-50 p-3" key={label}>
                  <dt className="font-semibold text-slate-800">{label}</dt>
                  <dd className="mt-1 break-words text-slate-600">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader eyebrow="Audio" title="Spoken practice recording" />
            {attempt.audio_path ? (
              audioUrl ? (
                <audio className="w-full" controls src={audioUrl}>
                  <track kind="captions" />
                </audio>
              ) : (
                <p className="text-sm leading-6 text-slate-600">
                  Audio is attached, but the playback link could not be loaded.
                </p>
              )
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                No audio recording was attached to this attempt.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500" disabled type="button">
                Generate transcript - Coming soon
              </button>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Future feedback" title="AI feedback coming soon" />
            <p className="text-sm leading-6 text-slate-600">
              This attempt is saved with transcript, audio, score, strengths, and growth-area
              fields ready for the future AI feedback workflow.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500" disabled type="button">
                Generate AI feedback - Coming soon
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <TextCard title="Saved response notes" value={attempt.response_notes} />
          <TextCard title="Self-reflection" value={attempt.self_reflection} />
          <TextCard title="What went well" value={attempt.performance_indicator_notes} />
          <TextCard title="Judge/partner feedback" value={attempt.judge_feedback} />
        </div>
      </section>
    </>
  );
}

function TextCard({ title, value }: { title: string; value: string | null }) {
  return (
    <Card>
      <CardHeader eyebrow="Notes" title={title} />
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
        {value?.trim() || "Not saved"}
      </p>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <Badge tone="blue">{label}</Badge>
      <p className="mt-5 text-3xl font-bold capitalize text-slate-950">{value}</p>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      <Card className="min-h-44 animate-pulse">
        <div className="h-7 w-24 rounded bg-slate-100" />
        <div className="mt-5 h-12 w-64 rounded bg-slate-100" />
        <div className="mt-4 h-4 max-w-xl rounded bg-slate-100" />
      </Card>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="text-lg font-semibold text-red-950">Unable to load roleplay attempt</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">{message}</p>
      <button
        className="mt-5 h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white transition hover:bg-red-800"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </Card>
  );
}

function DeleteAttemptDialog({
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      role="dialog"
    >
      <Card className="w-full max-w-lg">
        <Badge tone="amber">Delete attempt</Badge>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">
          Remove this roleplay attempt?
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This will remove the saved response and reflection from your roleplay analytics.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            Keep attempt
          </button>
          <button
            className="min-h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:bg-red-300"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
          >
            {isDeleting ? "Deleting..." : "Delete attempt"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function LinkButton({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
      href={href}
    >
      {children}
    </Link>
  );
}
