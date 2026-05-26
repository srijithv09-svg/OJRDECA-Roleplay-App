"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { ExamAttemptsService } from "@/lib/services/exam-attempts";
import type { ExamAttemptAnswer, ExamAttemptResult } from "@/lib/types";

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAnswer(answer: ExamAttemptAnswer["selected_answer"]) {
  return answer === "UNANSWERED" ? "Unanswered" : answer;
}

export function ExamAttemptResultView() {
  const params = useParams<{ attemptId?: string | string[] }>();
  const router = useRouter();
  const attemptId = Array.isArray(params.attemptId) ? params.attemptId[0] : params.attemptId;
  const [result, setResult] = useState<ExamAttemptResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResult() {
      try {
        if (!attemptId) {
          throw new Error("Missing attempt id.");
        }

        const nextResult = await ExamAttemptsService.getExamAttemptResult(attemptId);

        if (!isActive) {
          return;
        }

        setResult(nextResult);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load attempt results.",
        );
        setResult(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadResult();

    return () => {
      isActive = false;
    };
  }, [attemptId, reloadKey]);

  const missedQuestions = useMemo(
    () => result?.answers.filter((answer) => !answer.is_correct) ?? [],
    [result],
  );

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  async function deleteAttempt() {
    if (!attemptId) {
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this attempt? This will remove it from your analytics and cannot be undone.",
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await ExamAttemptsService.deleteExamAttempt(attemptId);
      router.push("/analytics");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to delete attempt.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (!result) {
    return (
      <Card className="grid min-h-64 place-items-center text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">Attempt unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This saved attempt could not be found.
          </p>
        </div>
      </Card>
    );
  }

  const score = result.attempt.score ?? 0;
  const totalQuestions = result.attempt.total_questions ?? result.answers.length;
  const percentage = result.attempt.percentage ?? 0;
  const incorrectCount = Math.max(0, totalQuestions - score);

  return (
    <>
      <PageHeader
        actions={
          <>
            <LinkButton href="/exams">Back to Exams</LinkButton>
            <LinkButton href={`/exams/${result.resource.id}/take`}>
              Retake / Enter Another Attempt
            </LinkButton>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:text-red-300"
              disabled={isDeleting}
              onClick={() => void deleteAttempt()}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Delete attempt"}
            </button>
          </>
        }
        description="Review your saved exam score and missed questions."
        eyebrow="Exam results"
        title={result.resource.title}
      />

      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard eyebrow="Score" label="Correct answers" value={`${score} / ${totalQuestions}`} />
        <StatCard eyebrow="Percentage" label="Final percentage" value={`${percentage}%`} />
        <StatCard eyebrow="Correct" label="Questions correct" value={score} />
        <StatCard eyebrow="Incorrect" label="Questions missed" value={incorrectCount} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader eyebrow="Attempt" title="Summary" />
          <dl className="grid gap-3 text-sm">
            {[
              ["Cluster", result.resource.cluster],
              ["Year", result.resource.year],
              ["Completed", formatDate(result.attempt.completed_at)],
            ].map(([label, value]) => (
              <div className="rounded-lg bg-slate-50 p-3" key={label}>
                <dt className="font-semibold text-slate-800">{label}</dt>
                <dd className="mt-1 break-words text-slate-600">
                  {value === null || value === undefined || value === "" ? "Not available" : value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader eyebrow="Instructional areas" title="Breakdown" />
          {result.breakdown.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">
              Instructional area breakdown is available once answer key rows include
              instructional areas.
            </p>
          ) : (
            <div className="space-y-3">
              {result.breakdown.map((area) => (
                <div className="rounded-lg border border-slate-100 p-3" key={area.instructional_area}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-slate-950">
                      {area.instructional_area}
                    </span>
                    <span className="text-slate-600">
                      {area.correct_count} / {area.total_count} · {area.percentage}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-blue-700"
                      style={{ width: `${area.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card>
        <CardHeader eyebrow="Review" title="Missed questions" />
        {missedQuestions.length === 0 ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-950">Perfect score</p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              No missed questions were saved for this attempt.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {missedQuestions.map((answer) => (
              <div className="rounded-lg border border-slate-100 bg-white p-3" key={answer.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">
                    Question {answer.question_number}
                  </p>
                  <Badge tone="amber">{answer.instructional_area ?? "No area"}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <dt className="font-semibold text-slate-800">Selected</dt>
                    <dd className="mt-1 text-slate-600">{formatAnswer(answer.selected_answer)}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <dt className="font-semibold text-slate-800">Correct</dt>
                    <dd className="mt-1 text-slate-600">{answer.correct_answer}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function StatCard({
  eyebrow,
  label,
  value,
}: {
  eyebrow: string;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <Badge tone="blue">{eyebrow}</Badge>
      <p className="mt-5 text-4xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{label}</p>
    </Card>
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
