"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getRoleLabel, isAdminRole } from "@/lib/auth";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { getProfileDisplayName } from "@/lib/profile-display";
import { AnalyticsService } from "@/lib/services/analytics";
import { EXAM_ATTEMPTS_CHANGED_EVENT } from "@/lib/services/exam-attempts";
import { getCurrentProfile } from "@/lib/services/profiles";
import { ReadinessService } from "@/lib/services/readiness";
import { ROLEPLAY_ATTEMPTS_CHANGED_EVENT } from "@/lib/services/roleplay-attempts";
import type {
  AnalyticsAreaSummary,
  AnalyticsAttemptSummary,
  Json,
  Profile,
  StudentAnalyticsSummary,
  StudentReadinessSummary,
} from "@/lib/types";

type DashboardState = {
  analytics: StudentAnalyticsSummary | null;
  analyticsError: string | null;
  profile: Profile;
  readiness: StudentReadinessSummary | null;
  readinessError: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StatCard({
  description,
  eyebrow,
  title,
  value,
}: {
  description?: string;
  eyebrow: string;
  title: string;
  value: number | string;
}) {
  return (
    <Card>
      <Badge tone="blue">{eyebrow}</Badge>
      <p className="mt-5 text-4xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      <Card className="min-h-44 animate-pulse">
        <div className="h-4 w-36 rounded bg-slate-100" />
        <div className="mt-5 h-9 w-2/3 rounded bg-slate-100" />
        <div className="mt-4 h-4 w-full max-w-xl rounded bg-slate-100" />
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card className="min-h-36 animate-pulse" key={index}>
            <div className="h-7 w-24 rounded bg-slate-100" />
            <div className="mt-5 h-9 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-36 rounded bg-slate-100" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const friendlyMessage = getFriendlyErrorMessage(
    message,
    "Unable to load dashboard data right now. Please try again.",
  );

  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="text-lg font-semibold text-red-950">Unable to load dashboard</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">{friendlyMessage}</p>
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

function AttemptRow({ attempt }: { attempt: AnalyticsAttemptSummary }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
      <div>
        <p className="font-semibold text-slate-950">{attempt.resource_title}</p>
        <p className="mt-1 text-sm text-slate-500">
          {attempt.cluster ?? "Cluster TBD"} - {formatDate(attempt.completed_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={attempt.percentage >= 70 ? "green" : "amber"}>{attempt.percentage}%</Badge>
        <ButtonLink href={`/exams/attempts/${attempt.id}`}>Results</ButtonLink>
      </div>
    </div>
  );
}

function AreaList({
  areas,
  emptyLabel,
  mode,
}: {
  areas: AnalyticsAreaSummary[];
  emptyLabel: string;
  mode: "strong" | "weak";
}) {
  if (areas.length === 0) {
    return <p className="text-sm leading-6 text-slate-600">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {areas.slice(0, 4).map((area) => {
        const count = mode === "strong" ? area.correct_count : area.incorrect_count;

        return (
          <div className="rounded-lg border border-slate-100 p-3" key={area.instructional_area}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-slate-950">{area.instructional_area}</span>
              <span className="text-slate-600">{count} questions</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function jsonStringList(value: Json | null) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function ReadinessUnavailable({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
      {message}
    </div>
  );
}

export function DashboardView() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      try {
        const nextProfile = await getCurrentProfile();

        if (!nextProfile) {
          throw new Error("No active profile was found for the current session.");
        }

        const [analyticsResult, readinessResult] = await Promise.allSettled([
          AnalyticsService.getStudentAnalytics(),
          ReadinessService.getStudentReadinessSummary(),
        ]);

        if (!isActive) {
          return;
        }

        setDashboard({
          analytics:
            analyticsResult.status === "fulfilled" ? analyticsResult.value : null,
          analyticsError:
            analyticsResult.status === "rejected"
              ? analyticsResult.reason instanceof Error
                ? analyticsResult.reason.message
                : "Analytics unavailable."
              : null,
          profile: nextProfile,
          readiness:
            readinessResult.status === "fulfilled" ? readinessResult.value : null,
          readinessError:
            readinessResult.status === "rejected"
              ? readinessResult.reason instanceof Error
                ? readinessResult.reason.message
                : "Readiness guidance unavailable."
              : null,
        });
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setDashboard(null);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "An unexpected error occurred while loading dashboard data.",
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    function refreshDashboard() {
      setReloadKey((currentKey) => currentKey + 1);
    }

    window.addEventListener(EXAM_ATTEMPTS_CHANGED_EVENT, refreshDashboard);
    window.addEventListener(ROLEPLAY_ATTEMPTS_CHANGED_EVENT, refreshDashboard);
    window.addEventListener("focus", refreshDashboard);

    return () => {
      window.removeEventListener(EXAM_ATTEMPTS_CHANGED_EVENT, refreshDashboard);
      window.removeEventListener(ROLEPLAY_ATTEMPTS_CHANGED_EVENT, refreshDashboard);
      window.removeEventListener("focus", refreshDashboard);
    };
  }, []);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={retryLoad} />;
  }

  if (!dashboard) {
    return (
      <Card className="grid min-h-64 place-items-center text-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Dashboard unavailable</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
            Sign in with an approved school account to view your analytics.
          </p>
        </div>
      </Card>
    );
  }

  const { analytics, analyticsError, profile, readiness, readinessError } = dashboard;
  const isAdmin = isAdminRole(profile.role);
  const displayName = getProfileDisplayName(profile) ?? "member";
  const hasAttempts = (analytics?.examsCompleted ?? 0) > 0;
  const isExamAnalyticsUnavailable = !analytics || Boolean(analytics.examAnalyticsUnavailable);
  const isRoleplayPracticeUnavailable =
    !analytics || Boolean(analytics.roleplayPracticeUnavailable);

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href="/exams" variant="primary">
              Open exams
            </ButtonLink>
            <ButtonLink href="/analytics">View analytics</ButtonLink>
            {isAdmin ? <ButtonLink href="/admin/analytics">Admin Analytics</ButtonLink> : null}
          </>
        }
        description="Track saved exam attempts, score trends, and instructional area patterns."
        eyebrow={isAdmin ? "Admin dashboard" : "Student dashboard"}
        title={`Welcome back, ${displayName}`}
      />

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="!border-[var(--primary-soft-strong)] !bg-[var(--primary)] !text-white shadow-lg shadow-red-950/10 dark:!border-[var(--border-strong)] dark:shadow-black/30">
          <p className="text-sm font-semibold text-white/80">Recommended next step</p>
          <h2 className="mt-3 text-3xl font-bold">
            {readiness ? readiness.recommendedNextStep.title : "Readiness guidance unavailable"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">
            {readiness
              ? readiness.recommendedNextStep.description
              : readinessError ?? "Reload the dashboard when readiness data is available."}
          </p>
          {readiness ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href={readiness.recommendedNextStep.href}>Continue</ButtonLink>
              <span className="text-sm font-medium text-white/80">
                {readiness.recommendedNextStep.reason}
              </span>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader eyebrow="Account" title="Logged-in profile" />
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">Email</p>
              <p className="mt-1 break-words text-slate-600">
                {profile.email ?? "Email unavailable"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">Role</p>
              <p className="mt-1 text-slate-600">{getRoleLabel(profile.role)}</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader eyebrow="Continue learning" title="MCS guided pathway" />
          <p className="text-sm leading-6 text-slate-600">
            Guided learning currently starts with MCS. Resource prep supports all DECA
            events.
          </p>
          {readiness ? (
            <>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {Object.entries(readiness.learning.masteryCounts).map(([status, count]) => (
                  <div className="rounded-lg bg-slate-50 p-3" key={status}>
                    <p className="text-2xl font-bold text-slate-950">{count}</p>
                    <p className="mt-1 text-xs font-semibold capitalize text-slate-500">
                      {status.replaceAll("_", " ")}
                    </p>
                  </div>
                ))}
              </div>
              <ButtonLink className="mt-5" href="/learn/mcs">
                Open MCS learning
              </ButtonLink>
            </>
          ) : (
            <ReadinessUnavailable
              message={readinessError ?? "Learning progress unavailable."}
            />
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Concept mastery" title="Weakest concepts" />
          {readiness && readiness.learning.weakestConcepts.length > 0 ? (
            <div className="space-y-3">
              {readiness.learning.weakestConcepts.map((concept) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
                  key={concept.id}
                >
                  <div>
                    <p className="font-semibold text-slate-950">{concept.name}</p>
                    <p className="mt-1 text-sm capitalize text-slate-500">
                      {concept.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  <ButtonLink href={concept.href}>Practice</ButtonLink>
                </div>
              ))}
            </div>
          ) : (
            <ReadinessUnavailable
              message={
                readiness
                  ? "No MCS concept mastery rows yet."
                  : readinessError ?? "Learning progress unavailable."
              }
            />
          )}
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          eyebrow="Attempts"
          title="Exams completed"
          value={isExamAnalyticsUnavailable ? "N/A" : analytics?.examsCompleted ?? 0}
        />
        <StatCard
          eyebrow="Average"
          title="Average exam score"
          value={!isExamAnalyticsUnavailable && hasAttempts ? `${analytics?.averageScore}%` : "N/A"}
        />
        <StatCard
          eyebrow="Best"
          title="Best score"
          value={
            isExamAnalyticsUnavailable || analytics?.bestScore === null
              ? "N/A"
              : `${analytics?.bestScore}%`
          }
        />
        <StatCard
          eyebrow="Roleplays"
          title="Practice attempts"
          value={isRoleplayPracticeUnavailable ? "N/A" : analytics?.roleplayAttemptsCompleted ?? 0}
        />
      </section>

      {analyticsError ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-950">
            Analytics unavailable: {analyticsError}
          </p>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader eyebrow="Recent attempts" title="Latest scores" />
          {isExamAnalyticsUnavailable ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              Exam analytics unavailable
            </div>
          ) : analytics.recentAttempts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              No exam attempts yet. Take an exam with an answer key to populate
              your dashboard analytics.
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.recentAttempts.map((attempt) => (
                <AttemptRow attempt={attempt} key={attempt.id} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Roleplay practice" title="Latest AI feedback" />
          {readiness && readiness.recentRoleplayFeedback.items.length > 0 ? (
            <div className="space-y-3">
              {readiness.recentRoleplayFeedback.items.map((attempt) => {
                const growthAreas = jsonStringList(attempt.growth_areas);

                return (
                  <div className="rounded-lg border border-slate-100 p-3" key={attempt.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{attempt.resource_title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {attempt.event_code ?? "Event TBD"} - {formatDate(attempt.created_at)}
                        </p>
                      </div>
                      <Badge tone={attempt.ai_overall_score === null ? "slate" : "blue"}>
                        {attempt.ai_overall_score === null
                          ? attempt.ai_feedback_status
                          : `${attempt.ai_overall_score}%`}
                      </Badge>
                    </div>
                    {growthAreas[0] ? (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        Focus: {growthAreas[0]}
                      </p>
                    ) : null}
                    <ButtonLink className="mt-3" href={attempt.href}>
                      Open
                    </ButtonLink>
                  </div>
                );
              })}
            </div>
          ) : isRoleplayPracticeUnavailable ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              Roleplay practice data unavailable
            </div>
          ) : analytics?.recentRoleplayAttempts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              No roleplay attempts yet. Save a written practice response to see it here.
            </div>
          ) : (
            <div className="space-y-3">
              {analytics?.recentRoleplayAttempts.map((attempt) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
                  key={attempt.id}
                >
                  <div>
                    <p className="font-semibold text-slate-950">{attempt.resource_title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {attempt.event_code ?? "Event TBD"} - {formatDate(attempt.created_at)}
                    </p>
                  </div>
                  <ButtonLink href={`/roleplays/attempts/${attempt.id}`}>Open</ButtonLink>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Instructional areas" title="Strong areas" />
          <AreaList
            areas={isExamAnalyticsUnavailable ? [] : analytics?.strongAreas ?? []}
            emptyLabel={
              isExamAnalyticsUnavailable
                ? "Exam analytics unavailable"
                : "Strong areas appear after correct answers are saved."
            }
            mode="strong"
          />
        </Card>
        <Card>
          <CardHeader eyebrow="Instructional areas" title="Needs work" />
          <AreaList
            areas={isExamAnalyticsUnavailable ? [] : analytics?.weakAreas ?? []}
            emptyLabel={
              isExamAnalyticsUnavailable
                ? "Exam analytics unavailable"
                : "Weak areas appear after missed answers are saved."
            }
            mode="weak"
          />
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader eyebrow="Concept feedback" title="Recent feedback" />
          {readiness && readiness.recentConceptFeedback.items.length > 0 ? (
            <div className="space-y-3">
              {readiness.recentConceptFeedback.items.slice(0, 3).map((item) => (
                <div className="rounded-lg border border-slate-100 p-3" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{item.concept_name}</p>
                    <Badge tone={item.has_revision ? "green" : "amber"}>
                      {item.has_revision ? "Revised" : "Needs revision"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Score: {item.score ?? "N/A"}
                    {item.revision_score === null ? "" : ` -> ${item.revision_score}`}
                  </p>
                  <ButtonLink className="mt-3" href={item.href}>
                    Open
                  </ButtonLink>
                </div>
              ))}
            </div>
          ) : (
            <ReadinessUnavailable
              message={readiness ? "No concept feedback yet." : "Concept feedback unavailable."}
            />
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Exam practice" title="Score trend" />
          {readiness && readiness.exam.trend.length > 0 ? (
            <div className="space-y-3">
              {readiness.exam.trend.slice(0, 4).map((attempt) => (
                <div
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 p-3"
                  key={attempt.id}
                >
                  <div>
                    <p className="font-semibold text-slate-950">{attempt.resource_title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDate(attempt.completed_at)}
                    </p>
                  </div>
                  <Badge tone={attempt.percentage >= 70 ? "green" : "amber"}>
                    {attempt.percentage}%
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <ReadinessUnavailable
              message={readiness ? "No exam attempts yet." : "Exam analytics unavailable."}
            />
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Activity" title="Last 7 days" />
          {readiness ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Question attempts</span>
                <span className="font-semibold text-slate-950">
                  {readiness.activity.summary.recentQuestionAttempts}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Concept feedback</span>
                <span className="font-semibold text-slate-950">
                  {readiness.activity.summary.recentConceptFeedback}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Roleplay attempts</span>
                <span className="font-semibold text-slate-950">
                  {readiness.activity.summary.recentRoleplayAttempts}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Exam attempts</span>
                <span className="font-semibold text-slate-950">
                  {readiness.activity.summary.recentExamAttempts}
                </span>
              </div>
              <p className="pt-2 text-xs font-semibold text-slate-500">
                Last practiced: {formatDate(readiness.activity.summary.lastPracticedAt)}
              </p>
            </div>
          ) : (
            <ReadinessUnavailable message="Activity summary unavailable." />
          )}
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Continue learning",
            description: "Open the current recommended MCS pilot pathway for concept practice.",
            href: "/learn/mcs",
          },
          {
            title: "Take a cluster exam",
            description: "Enter answers for an approved exam with an answer key.",
            href: "/exams",
          },
          {
            title: "Review progress",
            description: "Open your full attempt history and instructional area breakdown.",
            href: "/analytics",
          },
          {
            title: "Review resources",
            description: isAdmin
              ? "Approve resources or review chapter analytics."
              : "Revisit approved resources and choose your next practice target.",
            href: isAdmin ? "/admin/resources" : "/resources",
          },
        ].map((action) => (
          <Card key={action.title}>
            <h2 className="text-lg font-semibold text-slate-950">{action.title}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
              {action.description}
            </p>
            <ButtonLink className="mt-5" href={action.href}>
              Open
            </ButtonLink>
          </Card>
        ))}
      </section>
    </>
  );
}
