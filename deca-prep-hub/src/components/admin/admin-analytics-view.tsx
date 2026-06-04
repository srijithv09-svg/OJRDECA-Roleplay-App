"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState } from "@/components/resources/resource-states";
import { isAdminRole } from "@/lib/auth";
import { AnalyticsService } from "@/lib/services/analytics";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import type {
  AdminAnalyticsSummary,
  AnalyticsAreaSummary,
  AnalyticsAttemptSummary,
  Profile,
  SupabaseResourceType,
} from "@/lib/types";

const resourceTypes: SupabaseResourceType[] = ["roleplay", "exam", "reference", "unknown"];
const approvalStatuses = ["pending", "approved", "rejected"] as const;

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

function getResourceTypeTone(type: SupabaseResourceType) {
  if (type === "roleplay") {
    return "blue";
  }

  if (type === "exam") {
    return "green";
  }

  if (type === "reference") {
    return "amber";
  }

  return "slate";
}

function getApprovalTone(status: string) {
  if (status === "approved") {
    return "green";
  }

  if (status === "pending") {
    return "amber";
  }

  return "slate";
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

function CountRow({
  count,
  label,
  maxCount,
  tone,
}: {
  count: number;
  label: string;
  maxCount: number;
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const width = maxCount > 0 ? Math.max(8, Math.round((count / maxCount) * 100)) : 0;
  const barColor =
    tone === "green"
      ? "bg-emerald-600"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "blue"
          ? "bg-blue-700"
          : "bg-slate-500";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-medium capitalize text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function AreaRows({ areas }: { areas: AnalyticsAreaSummary[] }) {
  if (areas.length === 0) {
    return <p className="text-sm leading-6 text-slate-600">No missed instructional areas yet.</p>;
  }

  return (
    <div className="space-y-3">
      {areas.map((area) => (
        <div className="rounded-lg border border-slate-100 p-3" key={area.instructional_area}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-slate-950">{area.instructional_area}</span>
            <Badge tone="amber">{area.incorrect_count} missed</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentAttemptRows({ attempts }: { attempts: AnalyticsAttemptSummary[] }) {
  if (attempts.length === 0) {
    return <p className="text-sm leading-6 text-slate-600">No exam attempts submitted yet.</p>;
  }

  return (
    <div className="space-y-3">
      {attempts.map((attempt) => (
        <div className="rounded-lg border border-slate-100 p-3" key={attempt.id}>
          <div className="flex flex-wrap gap-2">
            <Badge tone={attempt.percentage >= 70 ? "green" : "amber"}>{attempt.percentage}%</Badge>
            <Badge>{formatDate(attempt.completed_at)}</Badge>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-950">{attempt.resource_title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {attempt.user_email ?? "User email unavailable"} - {attempt.score} /{" "}
            {attempt.total_questions}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AdminAnalyticsView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadAnalytics() {
      let nextProfile: Profile | null = null;

      try {
        nextProfile = await getCurrentOwnProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setProfileError(null);
      } catch {
        if (!isActive) {
          return;
        }

        setProfile(null);
        setAnalytics(null);
        setProfileError("Unable to verify account role.");
        setAnalyticsError(null);
        return;
      }

      if (!isAdminRole(nextProfile?.role)) {
        setAnalytics(null);
        setAnalyticsError(null);
        return;
      }

      try {
        const nextAnalytics = await AnalyticsService.getAdminAnalytics();

        if (!isActive) {
          return;
        }

        setAnalytics(nextAnalytics);
        setAnalyticsError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setAnalytics(null);
        setAnalyticsError(
          caughtError instanceof Error ? caughtError.message : "Unable to load admin analytics.",
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

  const maxResourceTypeCount = useMemo(
    () => Math.max(...Object.values(analytics?.resourceTypeCounts ?? {}), 0),
    [analytics],
  );
  const maxApprovalCount = useMemo(
    () => Math.max(...Object.values(analytics?.approvalCounts ?? {}), 0),
    [analytics],
  );

  function retryLoad() {
    setIsLoading(true);
    setProfileError(null);
    setAnalyticsError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card className="min-h-40 animate-pulse" key={index}>
            <div className="h-7 w-24 rounded-md bg-slate-100" />
            <div className="mt-6 h-9 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-36 rounded bg-slate-100" />
          </Card>
        ))}
      </div>
    );
  }

  if (profileError) {
    return (
      <ResourceErrorState
        message={profileError}
        onRetry={retryLoad}
        title="Unable to verify account role"
      />
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
          You must be an admin to view chapter analytics.
        </p>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <ResourceErrorState
        message={analyticsError ?? "Unable to load admin analytics."}
        onRetry={retryLoad}
        title="Unable to load admin analytics"
      />
    );
  }

  return (
    <>
      <PageHeader
        description="Monitor exam attempts, instructional area patterns, resource status, and chapter-wide activity."
        eyebrow="Admin"
        title="Admin analytics"
      />

      {analyticsError ? (
        <ResourceErrorState
          message={analyticsError}
          onRetry={retryLoad}
          title="Unable to load admin analytics"
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard eyebrow="Attempts" label="Total attempts" value={analytics.totalAttempts} />
        <StatCard eyebrow="Scores" label="Average score" value={`${analytics.averageScore}%`} />
        <StatCard
          eyebrow="Users"
          label="Total profiles"
          value={analytics.profileCount ?? "Unavailable"}
        />
        <StatCard
          eyebrow="Library"
          label="Approved resources"
          value={analytics.approvalCounts.approved}
        />
      </section>

      {analytics.profileCountUnavailable ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-950">
            Profile count unavailable due to access policy.
          </p>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Library" title="Resource counts by type" />
          <div className="space-y-4">
            {resourceTypes.map((type) => (
              <CountRow
                count={analytics.resourceTypeCounts[type]}
                key={type}
                label={type}
                maxCount={maxResourceTypeCount}
                tone={getResourceTypeTone(type)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Workflow" title="Approval counts" />
          <div className="space-y-4">
            {approvalStatuses.map((status) => (
              <CountRow
                count={analytics.approvalCounts[status]}
                key={status}
                label={status}
                maxCount={maxApprovalCount}
                tone={getApprovalTone(status)}
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Exams" title="Most attempted exams" />
          {analytics.mostAttemptedExams.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">No exams have attempts yet.</p>
          ) : (
            <div className="space-y-3">
              {analytics.mostAttemptedExams.map((exam) => (
                <div className="rounded-lg border border-slate-100 p-3" key={exam.resource_id}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-slate-950">{exam.resource_title}</span>
                    <Badge tone="blue">{exam.attempts} attempts</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Weaknesses" title="Common weak instructional areas" />
          <AreaRows areas={analytics.weakAreas} />
        </Card>
      </section>

      <Card>
        <CardHeader eyebrow="Recent" title="Recent attempts across users" />
        <RecentAttemptRows attempts={analytics.recentAttempts} />
      </Card>
    </>
  );
}
