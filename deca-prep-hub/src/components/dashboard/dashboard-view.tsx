"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { isAdminRole } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/services/profiles";
import { AnalyticsService } from "@/lib/services/analytics";
import { EXAM_ATTEMPTS_CHANGED_EVENT } from "@/lib/services/exam-attempts";
import { ROLEPLAY_ATTEMPTS_CHANGED_EVENT } from "@/lib/services/roleplay-attempts";
import type { Profile, StudentAnalyticsSummary } from "@/lib/types";

const practiceOptions = [
  {
    number: "01",
    title: "Exam practice",
    href: "/exams",
    action: "Browse exams",
    description:
      "Work through an uploaded cluster exam. Submit your answers and review your score.",
  },
  {
    number: "02",
    title: "Roleplay practice",
    href: "/roleplays",
    action: "Browse roleplays",
    description:
      "Prepare a scenario, practice your presentation, and keep your notes and recordings.",
  },
];

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function DashboardView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analytics, setAnalytics] = useState<StudentAnalyticsSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getCurrentProfile(),
      AnalyticsService.getStudentAnalytics(),
    ]).then(([profileResult, result]) => {
      if (!active) return;
      setProfile(
        profileResult.status === "fulfilled" ? profileResult.value : null,
      );
      setAnalytics(result.status === "fulfilled" ? result.value : null);
      setError(result.status === "rejected");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener(EXAM_ATTEMPTS_CHANGED_EVENT, refresh);
    window.addEventListener(ROLEPLAY_ATTEMPTS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(EXAM_ATTEMPTS_CHANGED_EVENT, refresh);
      window.removeEventListener(ROLEPLAY_ATTEMPTS_CHANGED_EVENT, refresh);
    };
  }, []);

  const examUnavailable = !analytics || analytics.examAnalyticsUnavailable;
  const roleplayUnavailable =
    !analytics || analytics.roleplayPracticeUnavailable;
  const recentSessions = [
    {
      title: "Recent exams",
      unavailable: examUnavailable,
      empty:
        "No exams completed yet. Choose an exam above to start your first session.",
      items:
        analytics?.recentAttempts
          .slice(0, 4)
          .map((a) => ({
            id: a.id,
            title: a.resource_title,
            date: a.completed_at,
            detail: `${a.percentage}%`,
            href: `/exams/attempts/${a.id}`,
          })) ?? [],
    },
    {
      title: "Recent roleplays",
      unavailable: roleplayUnavailable,
      empty:
        "Your saved responses and recordings will appear here after you practice.",
      items:
        analytics?.recentRoleplayAttempts
          .slice(0, 4)
          .map((a) => ({
            id: a.id,
            title: a.resource_title,
            date: a.created_at,
            detail: a.event_code ?? "Roleplay",
            href: `/roleplays/attempts/${a.id}`,
          })) ?? [],
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Owen J. Roberts DECA"
        title="Your practice desk"
        description="Choose your materials. Put in a session. Come back to your progress."
        actions={<ButtonLink href="/analytics">History & scores</ButtonLink>}
      />
      <section
        aria-label="Start a practice session"
        className="grid gap-5 md:grid-cols-2"
      >
        {practiceOptions.map((option) => (
          <Link
            className="practice-option group"
            href={option.href}
            key={option.href}
          >
            <span className="text-xs font-medium tabular-nums text-[var(--muted)]">
              {option.number} / PRACTICE
            </span>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight">
              {option.title}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
              {option.description}
            </p>
            <span className="mt-8 flex items-center justify-between text-sm font-semibold text-primary">
              {option.action}
              <span aria-hidden="true">↗</span>
            </span>
          </Link>
        ))}
      </section>
      <Link
        href="/reference"
        className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-5"
      >
        <div>
          <h2 className="font-semibold">Reference library</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Performance indicators, cluster guides, exam blueprints, and other
            uploaded documents.
          </p>
        </div>
        <span className="text-sm font-semibold text-primary">
          Browse reference <span aria-hidden="true">→</span>
        </span>
      </Link>
      <section
        aria-label="Practice totals"
        className="grid grid-cols-3 divide-x divide-border border-b border-border pb-6"
      >
        {[
          [
            "Exams completed",
            loading ? "…" : examUnavailable ? "—" : analytics.examsCompleted,
          ],
          [
            "Average exam score",
            loading
              ? "…"
              : examUnavailable || !analytics.examsCompleted
                ? "—"
                : `${analytics.averageScore}%`,
          ],
          [
            "Roleplays practiced",
            loading
              ? "…"
              : roleplayUnavailable
                ? "—"
                : analytics.roleplayAttemptsCompleted,
          ],
        ].map(([label, value]) => (
          <div className="px-3 first:pl-0 sm:px-6" key={label}>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
              {label}
            </p>
          </div>
        ))}
      </section>
      {error ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]"
        >
          <p>
            Your history could not be loaded. You can still browse practice
            materials.
          </p>
          <button
            className="font-semibold text-primary"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Retry history
          </button>
        </div>
      ) : null}
      <section className="grid gap-5 xl:grid-cols-2">
        {recentSessions.map((group) => (
          <Card key={group.title}>
            <CardHeader
              title={group.title}
              action={
                <Link className="text-sm text-primary" href="/analytics">
                  View history
                </Link>
              }
            />
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Loading history…</p>
            ) : group.unavailable ? (
              <p className="text-sm text-[var(--muted)]">
                History is unavailable.
              </p>
            ) : !group.items.length ? (
              <p className="py-4 text-sm leading-6 text-[var(--muted)]">
                {group.empty}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {group.items.map((attempt) => (
                  <li key={attempt.id}>
                    <Link
                      className="flex items-center justify-between gap-4 py-4 hover:text-primary"
                      href={attempt.href}
                    >
                      <div>
                        <p className="text-sm font-medium">{attempt.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatDate(attempt.date)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {attempt.detail}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </section>
      {isAdminRole(profile?.role) ? (
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5 text-sm">
          <span className="text-[var(--muted)]">Chapter management</span>
          <Link className="font-medium text-primary" href="/admin/upload">
            Upload resources
          </Link>
          <Link className="font-medium text-primary" href="/admin/resources">
            Review approvals
          </Link>
          <Link className="font-medium text-primary" href="/admin/exam-keys">
            Manage answer keys
          </Link>
        </div>
      ) : null}
    </>
  );
}
