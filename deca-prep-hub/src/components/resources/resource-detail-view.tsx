"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ExamAttemptsService } from "@/lib/services/exam-attempts";
import { ResourcesService, type PublicResourceListItem } from "@/lib/services/resources";
import { RoleplayAttemptsService } from "@/lib/services/roleplay-attempts";
import type { ExamAttempt, RoleplayAttemptSummary } from "@/lib/types";
import { ResourceEmptyState, ResourceErrorState, ResourceLoadingState } from "./resource-states";

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

function normalizeFilenameValue(value: string) {
  return value
    .replace(/^[a-f0-9]{16,}[_-]/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getUsefulOriginalFilename(resource: PublicResourceListItem) {
  if (!resource.original_filename) {
    return null;
  }

  const normalizedFilename = normalizeFilenameValue(resource.original_filename);
  const normalizedTitle = normalizeFilenameValue(resource.title);

  if (!normalizedFilename || normalizedFilename === normalizedTitle) {
    return null;
  }

  return resource.original_filename;
}

export function ResourceDetailView() {
  const params = useParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [resource, setResource] = useState<PublicResourceListItem | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [examKeyState, setExamKeyState] = useState<
    "available" | "error" | "idle" | "loading" | "unavailable"
  >("idle");
  const [examQuestionCount, setExamQuestionCount] = useState(0);
  const [recentAttempts, setRecentAttempts] = useState<ExamAttempt[]>([]);
  const [recentRoleplayAttempts, setRecentRoleplayAttempts] = useState<RoleplayAttemptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResource() {
      try {
        if (!id) {
          throw new Error("Missing resource id.");
        }

        const nextResource = await ResourcesService.getApprovedPublicResourceById(id);

        if (!isActive) {
          return;
        }

        if (!nextResource) {
          setResource(null);
          setSignedUrl(null);
          setPdfError(null);
          setExamKeyState("idle");
          setExamQuestionCount(0);
          setRecentAttempts([]);
          setRecentRoleplayAttempts([]);
          setError(null);
          return;
        }

        setResource(nextResource);
        setError(null);

        try {
          const pdfLink = await ResourcesService.getResourcePdfLink(nextResource.id);

          if (!isActive) {
            return;
          }

          setSignedUrl(pdfLink.signedUrl);
          setPdfError(null);
        } catch (caughtError) {
          if (!isActive) {
            return;
          }

          setSignedUrl(null);
          setPdfError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to create a signed PDF link.",
          );
        }

        if (nextResource.resource_type === "exam") {
          setExamKeyState("loading");
          setExamQuestionCount(0);
          setRecentAttempts([]);

          try {
            const nextExam = await ExamAttemptsService.getExamForTaking(nextResource.id);

            if (!isActive) {
              return;
            }

            setExamKeyState(nextExam.hasAnswerKey ? "available" : "unavailable");
            setExamQuestionCount(nextExam.questionCount);
          } catch {
            if (!isActive) {
              return;
            }

            setExamKeyState("error");
            setExamQuestionCount(0);
          }

          try {
            const attempts = await ExamAttemptsService.getStudentExamAttemptsForResource(
              nextResource.id,
            );

            if (!isActive) {
              return;
            }

            setRecentAttempts(attempts);
          } catch {
            if (isActive) {
              setRecentAttempts([]);
            }
          }
        } else if (nextResource.resource_type === "roleplay") {
          setExamKeyState("idle");
          setExamQuestionCount(0);
          setRecentAttempts([]);

          try {
            const attempts = await RoleplayAttemptsService.getStudentRoleplayAttemptsForResource(
              nextResource.id,
            );

            if (!isActive) {
              return;
            }

            setRecentRoleplayAttempts(attempts);
          } catch {
            if (isActive) {
              setRecentRoleplayAttempts([]);
            }
          }
        } else {
          setExamKeyState("idle");
          setExamQuestionCount(0);
          setRecentAttempts([]);
          setRecentRoleplayAttempts([]);
        }
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "An unexpected error occurred while loading this resource.",
        );
        setResource(null);
        setSignedUrl(null);
        setPdfError(null);
        setExamKeyState("idle");
        setExamQuestionCount(0);
        setRecentAttempts([]);
        setRecentRoleplayAttempts([]);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadResource();

    return () => {
      isActive = false;
    };
  }, [id, reloadKey]);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setPdfError(null);
    setExamKeyState("idle");
    setExamQuestionCount(0);
    setRecentAttempts([]);
    setRecentRoleplayAttempts([]);
    setReloadKey((currentKey) => currentKey + 1);
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (!resource) {
    return <ResourceEmptyState label="approved resource" />;
  }

  const isRoleplay = resource.resource_type === "roleplay";
  const isExam = resource.resource_type === "exam";
  const libraryHref = isExam ? "/exams" : isRoleplay ? "/roleplays" : "/reference";
  const usefulOriginalFilename = getUsefulOriginalFilename(resource);
  const metadata = [
    ["Type", isRoleplay ? "Roleplay" : isExam ? "Exam" : "Reference"],
    ["Cluster", resource.cluster],
    ["Year", resource.year],
    ...(isRoleplay ? [["Event", resource.event_code], ["Event name", resource.event_name], ["Category", resource.event_category]] : []),
    ...(usefulOriginalFilename ? [["Filename", usefulOriginalFilename]] : []),
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <>
      <Link className="inline-flex min-h-8 w-fit items-center text-sm font-medium text-primary" href={libraryHref}>
        ← Back to {isExam ? "exams" : isRoleplay ? "roleplays" : "reference"}
      </Link>
      <PageHeader
        title={resource.title}
        description={[resource.cluster, resource.year, resource.event_name].filter(Boolean).join(" · ") || "Chapter resource"}
        actions={
          <>
            {signedUrl ? (
              <a className={`ui-button ${isRoleplay || (isExam && examKeyState === "available") ? "ui-button-secondary" : "ui-button-primary"}`} href={signedUrl} rel="noreferrer" target="_blank">
                Open PDF <span className="sr-only">in a new tab</span>
              </a>
            ) : null}
            {isRoleplay ? <Link className="ui-button ui-button-primary" href={`/roleplays/${resource.id}/practice`}>Practice roleplay</Link> : null}
            {isExam && examKeyState === "available" ? <Link className="ui-button ui-button-primary" href={`/exams/${resource.id}/take`}>Practice exam</Link> : null}
          </>
        }
      />

      {!signedUrl ? (
        <div className="ui-notice flex flex-wrap items-center justify-between gap-3" role="alert">
          <div><p className="font-semibold">PDF unavailable</p><p className="mt-1 text-[var(--muted)]">{pdfError ?? "The file could not be opened. Try again."}</p></div>
          <button className="ui-button ui-button-secondary" onClick={retryLoad} type="button">Retry PDF</button>
        </div>
      ) : null}

      <section className={`grid items-start gap-6 ${isRoleplay || isExam ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" : "max-w-3xl"}`}>
        <Card>
          <CardHeader title="Document details" />
          <dl className="divide-y divide-border text-sm">
            {metadata.map(([label, value]) => (
              <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4" key={label}>
                <dt className="text-[var(--muted)]">{label}</dt>
                <dd className="break-words font-medium">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
          {!isRoleplay && !isExam ? <p className="mt-4 border-t border-border pt-4 text-sm text-[var(--muted)]">Open the PDF to read or download this reference document.</p> : null}
        </Card>

        {isExam ? (
          <Card>
            <CardHeader title="Exam practice" />
            {examKeyState === "available" ? (
              <p className="text-sm leading-6 text-[var(--muted)]">{examQuestionCount} questions. Open the PDF, enter your answers, then submit to see your score.</p>
            ) : (
              <div className="ui-notice">
                <p className="font-semibold">{examKeyState === "loading" ? "Checking answer key…" : examKeyState === "error" ? "Unable to check grading availability" : "Not ready for grading yet"}</p>
                <p className="mt-2 leading-6 text-[var(--muted)]">{examKeyState === "error" ? "Try again to check whether you can submit this exam." : "You can read the PDF now. Answer entry will be available once the answer key is ready."}</p>
                {examKeyState === "error" ? <button className="ui-button ui-button-secondary mt-3" onClick={retryLoad} type="button">Try again</button> : null}
              </div>
            )}
            <h3 className="mt-6 border-t border-border pt-5 text-sm font-semibold">Your attempts</h3>
            {recentAttempts.length ? (
              <ul className="mt-2 divide-y divide-border">
                {recentAttempts.map((attempt) => (
                  <li key={attempt.id}>
                    <Link className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:text-primary" href={`/exams/attempts/${attempt.id}`}>
                      <span>{attempt.completed_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(attempt.completed_at)) : "Date unavailable"}</span>
                      <span className="font-semibold tabular-nums">{attempt.score ?? 0} / {attempt.total_questions ?? 0} · {attempt.percentage ?? 0}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-[var(--muted)]">Your completed attempts will appear here.</p>}
          </Card>
        ) : null}

        {isRoleplay ? (
          <Card>
            <CardHeader title="Your roleplay attempts" />
            {recentRoleplayAttempts.length ? (
              <ul className="divide-y divide-border">
                {recentRoleplayAttempts.map((attempt) => (
                  <li key={attempt.id}>
                    <Link className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:text-primary" href={`/roleplays/attempts/${attempt.id}`}>
                      <span>{attempt.created_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(attempt.created_at)) : "Date unavailable"}</span>
                      <span className="font-medium">Confidence {attempt.confidence_rating ?? "—"} / 5</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm leading-6 text-[var(--muted)]">No saved attempts yet. Practice this scenario to save your response, reflection, and optional recording.</p>}
          </Card>
        ) : null}
      </section>
    </>
  );
}
