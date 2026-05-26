"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getProfileDisplayName } from "@/lib/profile-display";
import { AnalyticsService } from "@/lib/services/analytics";
import { getCurrentProfile } from "@/lib/services/profiles";
import type {
  AnalyticsAreaSummary,
  AnalyticsAttemptSummary,
  Profile,
  StudentAnalyticsSummary,
} from "@/lib/types";

type DashboardState = {
  analytics: StudentAnalyticsSummary;
  profile: Profile;
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
  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="text-lg font-semibold text-red-950">Unable to load dashboard</h2>
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

export function DashboardView() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      try {
        const [nextProfile, analytics] = await Promise.all([
          getCurrentProfile(),
          AnalyticsService.getStudentAnalytics(),
        ]);

        if (!nextProfile) {
          throw new Error("No active profile was found for the current session.");
        }

        if (!isActive) {
          return;
        }

        setDashboard({ analytics, profile: nextProfile });
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

  const { analytics, profile } = dashboard;
  const isAdmin = profile.role === "admin";
  const displayName = getProfileDisplayName(profile) ?? "member";

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
        <Card className="!border-blue-800 !bg-blue-700 !text-white">
          <p className="text-sm font-semibold text-blue-100">Exam performance</p>
          <h2 className="mt-3 text-3xl font-bold">
            {analytics.examsCompleted > 0
              ? `${analytics.averageScore}% average score`
              : "Start your first graded exam"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">
            These numbers come from your saved exam attempts and update when an
            attempt is added or deleted.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [analytics.examsCompleted, "Exams completed"],
              [analytics.bestScore === null ? "N/A" : `${analytics.bestScore}%`, "Best score"],
              [
                analytics.mostRecentScore === null ? "N/A" : `${analytics.mostRecentScore}%`,
                "Most recent",
              ],
            ].map(([value, label]) => (
              <div className="rounded-lg bg-white/10 p-4 ring-1 ring-white/20" key={label}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="mt-1 text-xs font-medium text-blue-100">{label}</p>
              </div>
            ))}
          </div>
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
              <p className="mt-1 capitalize text-slate-600">{profile.role}</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard eyebrow="Attempts" title="Exams completed" value={analytics.examsCompleted} />
        <StatCard eyebrow="Average" title="Average exam score" value={`${analytics.averageScore}%`} />
        <StatCard
          eyebrow="Best"
          title="Best score"
          value={analytics.bestScore === null ? "N/A" : `${analytics.bestScore}%`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader eyebrow="Recent attempts" title="Latest scores" />
          {analytics.recentAttempts.length === 0 ? (
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
          <CardHeader eyebrow="Instructional areas" title="Strong and weak areas" />
          <div className="grid gap-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Strong</p>
              <AreaList
                areas={analytics.strongAreas}
                emptyLabel="Strong areas appear after correct answers are saved."
                mode="strong"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Needs work</p>
              <AreaList
                areas={analytics.weakAreas}
                emptyLabel="Weak areas appear after missed answers are saved."
                mode="weak"
              />
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
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
