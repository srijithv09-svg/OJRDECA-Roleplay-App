"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { AnalyticsService } from "@/lib/services/analytics";
import {
  EXAM_ATTEMPTS_CHANGED_EVENT,
  ExamAttemptsService,
} from "@/lib/services/exam-attempts";
import type {
  AnalyticsAreaSummary,
  AnalyticsAttemptSummary,
  RoleplayAttemptSummary,
  StudentAnalyticsSummary,
} from "@/lib/types";

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <Badge tone="blue">Current</Badge>
      <p className="mt-5 text-4xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{label}</p>
    </Card>
  );
}

function EmptyAnalyticsCard() {
  return (
    <Card className="border-dashed bg-slate-50">
      <Badge tone="blue">Getting started</Badge>
      <h2 className="mt-4 text-xl font-semibold text-slate-950">
        Your analytics will appear after your first graded exam.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Open an approved exam with an answer key, enter your answers, and submit it.
        Saved attempts will populate score trends, missed questions, and instructional
        area strengths.
      </p>
      <ButtonLink className="mt-5" href="/exams" variant="primary">
        Find an exam
      </ButtonLink>
    </Card>
  );
}

function AreaCard({
  areas,
  emptyLabel,
  title,
  tone,
}: {
  areas: AnalyticsAreaSummary[];
  emptyLabel: string;
  title: string;
  tone: "amber" | "green";
}) {
  return (
    <Card>
      <CardHeader eyebrow={tone === "green" ? "Strengths" : "Weaknesses"} title={title} />
      {areas.length === 0 ? (
        <p className="text-sm leading-6 text-slate-600">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {areas.map((area) => {
            const value = tone === "green" ? area.correct_count : area.incorrect_count;

            return (
              <div className="rounded-lg border border-slate-100 p-3" key={area.instructional_area}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-950">
                    {area.instructional_area}
                  </span>
                  <Badge tone={tone}>{value} questions</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AttemptHistoryRow({
  attempt,
  deletingAttemptId,
  onDelete,
}: {
  attempt: AnalyticsAttemptSummary;
  deletingAttemptId: string | null;
  onDelete: (attemptId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-semibold text-slate-950">{attempt.resource_title}</p>
        <p className="mt-1 text-sm text-slate-500">
          {attempt.cluster ?? "Cluster TBD"} - {formatDate(attempt.completed_at)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={attempt.percentage >= 70 ? "green" : "amber"}>
          {attempt.score} / {attempt.total_questions} - {attempt.percentage}%
        </Badge>
        <ButtonLink href={`/exams/attempts/${attempt.id}`}>Results</ButtonLink>
        <button
          className="min-h-10 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:text-red-300"
          disabled={deletingAttemptId === attempt.id}
          onClick={() => onDelete(attempt.id)}
          type="button"
        >
          {deletingAttemptId === attempt.id ? "Deleting..." : "Delete attempt"}
        </button>
      </div>
    </div>
  );
}

function RoleplayAttemptRow({ attempt }: { attempt: RoleplayAttemptSummary }) {
  return (
    <Link
      className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50 sm:flex-row sm:items-center sm:justify-between"
      href={`/roleplays/attempts/${attempt.id}`}
    >
      <div>
        <p className="font-semibold text-slate-950">{attempt.resource_title}</p>
        <p className="mt-1 text-sm text-slate-500">
          {attempt.event_code ?? "Event TBD"} - {formatDate(attempt.created_at)}
        </p>
      </div>
      <Badge tone="blue">Confidence {attempt.confidence_rating ?? "N/A"}</Badge>
    </Link>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<StudentAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null);
  const [deleteDialogAttemptId, setDeleteDialogAttemptId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadAnalytics() {
      try {
        const nextAnalytics = await AnalyticsService.getStudentAnalytics();

        if (!isActive) {
          return;
        }

        setAnalytics(nextAnalytics);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setAnalytics(null);
        setError(
          caughtError instanceof Error ? caughtError.message : "Unable to load analytics.",
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    function refreshAnalytics() {
      setReloadKey((currentKey) => currentKey + 1);
    }

    window.addEventListener(EXAM_ATTEMPTS_CHANGED_EVENT, refreshAnalytics);
    window.addEventListener("focus", refreshAnalytics);

    return () => {
      window.removeEventListener(EXAM_ATTEMPTS_CHANGED_EVENT, refreshAnalytics);
      window.removeEventListener("focus", refreshAnalytics);
    };
  }, []);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  async function deleteAttempt(attemptId: string) {
    setDeletingAttemptId(attemptId);
    setDeleteDialogAttemptId(null);
    setError(null);

    try {
      await ExamAttemptsService.deleteExamAttempt(attemptId);
      setReloadKey((currentKey) => currentKey + 1);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to delete attempt.",
      );
    } finally {
      setDeletingAttemptId(null);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error && !analytics) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (!analytics) {
    return null;
  }

  const hasAttempts = analytics.examsCompleted > 0;
  const isExamAnalyticsUnavailable = Boolean(analytics.examAnalyticsUnavailable);
  const isRoleplayPracticeUnavailable = Boolean(analytics.roleplayPracticeUnavailable);

  return (
    <>
      <PageHeader
        actions={<ButtonLink href="/exams">Take another exam</ButtonLink>}
        description="Attempt history, score trends, instructional area patterns, and missed-question summaries from your saved exams."
        eyebrow="Progress tracking"
        title="Analytics"
      />

      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}

      {deleteDialogAttemptId ? (
        <DeleteAttemptDialog
          isDeleting={deletingAttemptId === deleteDialogAttemptId}
          onCancel={() => setDeleteDialogAttemptId(null)}
          onConfirm={() => void deleteAttempt(deleteDialogAttemptId)}
        />
      ) : null}

      {!hasAttempts && !isExamAnalyticsUnavailable ? <EmptyAnalyticsCard /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Exams completed"
          value={isExamAnalyticsUnavailable ? "N/A" : analytics.examsCompleted}
        />
        <StatCard
          label="Average score"
          value={!isExamAnalyticsUnavailable && hasAttempts ? `${analytics.averageScore}%` : "N/A"}
        />
        <StatCard
          label="Best score"
          value={
            isExamAnalyticsUnavailable || analytics.bestScore === null
              ? "N/A"
              : `${analytics.bestScore}%`
          }
        />
        <StatCard
          label="Most recent"
          value={
            isExamAnalyticsUnavailable || analytics.mostRecentScore === null
              ? "N/A"
              : `${analytics.mostRecentScore}%`
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader eyebrow="Roleplay practice" title="Recent roleplay attempts" />
          {isRoleplayPracticeUnavailable ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              Roleplay practice data unavailable
            </div>
          ) : analytics.recentRoleplayAttempts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              No roleplay attempts yet. Open an approved roleplay and save a practice response to
              start building this history.
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.recentRoleplayAttempts.map((attempt) => (
                <RoleplayAttemptRow attempt={attempt} key={attempt.id} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Roleplays" title="Most practiced events" />
          <p className="mb-4 text-4xl font-bold text-slate-950">
            {isRoleplayPracticeUnavailable ? "N/A" : analytics.roleplayAttemptsCompleted}
          </p>
          {isRoleplayPracticeUnavailable ? (
            <p className="text-sm leading-6 text-slate-600">
              Roleplay practice data unavailable
            </p>
          ) : analytics.mostPracticedEventCodes.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">
              Event-code practice counts appear after you save roleplay attempts.
            </p>
          ) : (
            <div className="space-y-2">
              {analytics.mostPracticedEventCodes.map((event) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm"
                  key={event.event_code}
                >
                  <span className="font-semibold text-slate-950">{event.event_code}</span>
                  <span className="text-slate-600">{event.attempts} attempts</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader eyebrow="Trend" title="Score trend" />
          {isExamAnalyticsUnavailable ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Exam analytics unavailable</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Roleplay practice data will still appear if it is available.
              </p>
            </div>
          ) : analytics.attemptHistory.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">No trend yet</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Score trend appears after your first graded attempt.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.attemptHistory.slice(0, 10).map((attempt) => (
                <div className="rounded-lg border border-slate-100 p-3" key={attempt.id}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-slate-950">{attempt.resource_title}</span>
                    <span className="text-slate-600">{attempt.percentage}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-blue-700"
                      style={{ width: `${Math.min(100, attempt.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Misses" title="Missed question summary" />
          {isExamAnalyticsUnavailable ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Exam analytics unavailable</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Missed questions cannot be loaded right now.
              </p>
            </div>
          ) : analytics.missedQuestions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">
                {hasAttempts ? "No missed questions saved" : "No missed questions yet"}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {hasAttempts
                  ? "Nice work. Incorrect answers will appear here when saved."
                  : "Missed questions will appear after you submit a graded exam."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.missedQuestions.slice(0, 8).map((miss) => (
                <Link
                  className="block rounded-lg border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50"
                  href={`/exams/attempts/${miss.attempt_id}`}
                  key={`${miss.attempt_id}-${miss.question_number}`}
                >
                  <p className="text-sm font-semibold text-slate-950">
                    {miss.resource_title} - Question {miss.question_number}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{miss.instructional_area}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AreaCard
          areas={isExamAnalyticsUnavailable ? [] : analytics.strongAreas}
          emptyLabel={
            isExamAnalyticsUnavailable
              ? "Exam analytics unavailable"
              : "Strong areas appear after correct answers are saved."
          }
          title="Strong instructional areas"
          tone="green"
        />
        <AreaCard
          areas={isExamAnalyticsUnavailable ? [] : analytics.weakAreas}
          emptyLabel={
            isExamAnalyticsUnavailable
              ? "Exam analytics unavailable"
              : "Weak areas appear after incorrect answers are saved."
          }
          title="Weak instructional areas"
          tone="amber"
        />
      </section>

      <Card>
        <CardHeader eyebrow="History" title="Attempt history" />
        {isExamAnalyticsUnavailable ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            Exam analytics unavailable
          </div>
        ) : analytics.attemptHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            No attempts yet. Open an exam with an answer key to start building your analytics.
          </div>
        ) : (
          <div className="space-y-3">
            {analytics.attemptHistory.map((attempt) => (
              <AttemptHistoryRow
                attempt={attempt}
                deletingAttemptId={deletingAttemptId}
                key={attempt.id}
                onDelete={setDeleteDialogAttemptId}
              />
            ))}
          </div>
        )}
      </Card>
    </>
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
          Remove this saved attempt?
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Are you sure you want to delete this attempt? This will remove it from
          your analytics and cannot be undone.
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
