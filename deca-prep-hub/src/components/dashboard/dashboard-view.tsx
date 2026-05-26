"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getProfileDisplayName } from "@/lib/profile-display";
import { countProfiles, getCurrentProfile } from "@/lib/services/profiles";
import {
  ResourcesService,
  type RecentPublicResourceListItem,
  type ResourceDashboardSummary,
} from "@/lib/services/resources";
import type { Profile } from "@/lib/types";

type DashboardState = {
  profile: Profile;
  profileCount: number | null;
  summary: ResourceDashboardSummary;
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

function formatResourceType(resource: RecentPublicResourceListItem) {
  if (resource.resource_type === "roleplay") {
    return "Roleplay";
  }

  if (resource.resource_type === "exam") {
    return "Exam";
  }

  if (resource.resource_type === "reference") {
    return "Reference";
  }

  return "Resource";
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

function DashboardLoadingState() {
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

function DashboardErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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

function EmptyRecentResources() {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
      No approved resources have been added yet. Once admins approve roleplays,
      exams, or references, the newest items will appear here.
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

        const isAdmin = nextProfile.role === "admin";
        const [summary, nextProfileCount] = await Promise.all([
          ResourcesService.getDashboardSummary({ includeAdmin: isAdmin }),
          isAdmin ? countProfiles().catch(() => null) : Promise.resolve(null),
        ]);

        if (!isActive) {
          return;
        }

        setDashboard({
          profile: nextProfile,
          profileCount: nextProfileCount,
          summary,
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

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  if (isLoading) {
    return <DashboardLoadingState />;
  }

  if (error) {
    return <DashboardErrorState message={error} onRetry={retryLoad} />;
  }

  if (!dashboard) {
    return (
      <Card className="grid min-h-64 place-items-center text-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Dashboard unavailable</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
            Sign in with an approved school account to view your resource dashboard.
          </p>
        </div>
      </Card>
    );
  }

  const { profile, profileCount, summary } = dashboard;
  const isAdmin = profile.role === "admin";
  const displayName = getProfileDisplayName(profile) ?? "member";

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href="/roleplays" variant="primary">
              Practice roleplays
            </ButtonLink>
            <ButtonLink href="/exams">Open exams</ButtonLink>
            {isAdmin ? <ButtonLink href="/admin/resources">Admin Resources</ButtonLink> : null}
          </>
        }
        description="Track approved resources from Supabase and jump into the next practice flow."
        eyebrow={isAdmin ? "Admin dashboard" : "Student dashboard"}
        title={`Welcome back, ${displayName}`}
      />

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="!border-blue-800 !bg-blue-700 !text-white">
          <p className="text-sm font-semibold text-blue-100">Resource library</p>
          <h2 className="mt-3 text-3xl font-bold">Approved DECA resources are ready</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">
            The dashboard is now using live Supabase data for approved roleplays,
            exams, and recent resource approvals.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [summary.approvedRoleplays, "Approved roleplays"],
              [summary.approvedExams, "Approved exams"],
              [summary.approvedResources, "Total approved"],
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
              <p className="mt-1 break-words text-slate-600">{profile.email ?? "Email unavailable"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">Role</p>
              <p className="mt-1 capitalize text-slate-600">{profile.role}</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          description="Live count of approved roleplay resources."
          eyebrow="Roleplays"
          title="Total approved roleplays"
          value={summary.approvedRoleplays}
        />
        <StatCard
          description="Live count of approved exam resources."
          eyebrow="Exams"
          title="Total approved exams"
          value={summary.approvedExams}
        />
        <StatCard
          description="Includes roleplays, exams, references, and other approved resource rows."
          eyebrow="Resources"
          title="Total approved resources"
          value={summary.approvedResources}
        />
      </section>

      {isAdmin ? (
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            description="Waiting for review on the admin resources page."
            eyebrow="Admin"
            title="Pending resources"
            value={summary.pendingResources}
          />
          <StatCard
            description="Rows rejected during resource review."
            eyebrow="Admin"
            title="Rejected resources"
            value={summary.rejectedResources}
          />
          <StatCard
            description={profileCount === null ? "Profile count is not accessible with current policies." : "Profiles visible to this admin session."}
            eyebrow="Users"
            title="Total profiles"
            value={profileCount ?? "Unavailable"}
          />
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader eyebrow="Recently approved" title="Newest resources" />
          {summary.recentApprovedResources.length === 0 ? (
            <EmptyRecentResources />
          ) : (
            <div className="space-y-3">
              {summary.recentApprovedResources.map((resource) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
                  key={resource.id}
                >
                  <div>
                    <p className="font-semibold text-slate-950">{resource.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatResourceType(resource)} · {resource.cluster ?? "Cluster TBD"} ·{" "}
                      {resource.year ?? "Year TBD"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={resource.resource_type === "exam" ? "green" : "blue"}>
                      {formatResourceType(resource)}
                    </Badge>
                    <span className="text-xs font-medium text-slate-500">
                      {formatDate(resource.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Practice analytics" title="Coming soon" />
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Average exam score</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Available after practice attempts.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Weak instructional areas</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Coming soon after scored roleplay and exam practice data is captured.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "Run a roleplay round",
            description: "Open an approved case and use it as the starting point for practice.",
            href: "/roleplays",
          },
          {
            title: "Take a cluster exam",
            description: "Browse approved exams until the full testing workflow is ready.",
            href: "/exams",
          },
          {
            title: "Review resources",
            description: isAdmin
              ? "Approve, reject, and repair imported resource metadata."
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
