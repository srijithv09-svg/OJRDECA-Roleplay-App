"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState } from "@/components/resources/resource-states";
import { getCurrentProfile, listProfiles } from "@/lib/services/profiles";
import { ResourcesService } from "@/lib/services/resources";
import type {
  Profile,
  ResourceListItem,
  SupabaseResourceType,
} from "@/lib/types";

const resourceTypes: SupabaseResourceType[] = ["roleplay", "exam", "reference", "unknown"];
const approvalStatuses = ["pending", "approved", "rejected"] as const;
type TrackedApprovalStatus = (typeof approvalStatuses)[number];

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

export function AdminAnalyticsView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [recentApprovedResources, setRecentApprovedResources] = useState<ResourceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadAnalytics() {
      try {
        const nextProfile = await getCurrentProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);

        if (nextProfile?.role !== "admin") {
          setProfiles([]);
          setResources([]);
          setRecentApprovedResources([]);
          setError(null);
          return;
        }

        const [nextProfiles, nextResources, nextRecentApprovedResources] = await Promise.all([
          listProfiles(),
          ResourcesService.listResources(),
          ResourcesService.listRecentApprovedResources(),
        ]);

        if (!isActive) {
          return;
        }

        setProfiles(nextProfiles);
        setResources(nextResources);
        setRecentApprovedResources(nextRecentApprovedResources);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
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

  const resourceTypeCounts = useMemo(() => {
    const counts = Object.fromEntries(resourceTypes.map((type) => [type, 0])) as Record<
      SupabaseResourceType,
      number
    >;

    for (const resource of resources) {
      if (resourceTypes.includes(resource.resource_type)) {
        counts[resource.resource_type] += 1;
      }
    }

    return counts;
  }, [resources]);

  const approvalCounts = useMemo(() => {
    const counts = Object.fromEntries(approvalStatuses.map((status) => [status, 0])) as Record<
      TrackedApprovalStatus,
      number
    >;

    for (const resource of resources) {
      if (
        resource.approval_status === "pending" ||
        resource.approval_status === "approved" ||
        resource.approval_status === "rejected"
      ) {
        counts[resource.approval_status] += 1;
      }
    }

    return counts;
  }, [resources]);

  const recentUsers = profiles.slice(0, 6);
  const maxResourceTypeCount = Math.max(...Object.values(resourceTypeCounts), 0);
  const maxApprovalCount = Math.max(...Object.values(approvalCounts), 0);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
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

  if (error && !profile) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (profile?.role !== "admin") {
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

  return (
    <>
      <PageHeader
        description="Monitor member access, imported resources, approval activity, and future performance analytics."
        eyebrow="Admin"
        title="Admin analytics"
      />

      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard eyebrow="Users" label="Total profiles" value={profiles.length} />
        <StatCard eyebrow="Resources" label="Total resources" value={resources.length} />
        <StatCard eyebrow="Approvals" label="Pending review" value={approvalCounts.pending} />
        <StatCard eyebrow="Library" label="Approved resources" value={approvalCounts.approved} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Library" title="Resource counts by type" />
          <div className="space-y-4">
            {resourceTypes.map((type) => (
              <CountRow
                count={resourceTypeCounts[type]}
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
                count={approvalCounts[status]}
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
          <CardHeader eyebrow="Members" title="Recent users" />
          {recentUsers.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">No profiles found yet.</p>
          ) : (
            <div className="space-y-3">
              {recentUsers.map((userProfile) => (
                <div
                  className="flex flex-col gap-3 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={userProfile.id}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {userProfile.email ?? "Email unavailable"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Joined {formatDate(userProfile.created_at)}
                    </p>
                  </div>
                  <Badge tone={userProfile.role === "admin" ? "blue" : "slate"}>
                    {userProfile.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Resources" title="Recent approved resources" />
          {recentApprovedResources.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">
              Approved resources will appear here after admin review.
            </p>
          ) : (
            <div className="space-y-3">
              {recentApprovedResources.map((resource) => (
                <div className="rounded-lg border border-slate-100 p-3" key={resource.id}>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={getResourceTypeTone(resource.resource_type)}>
                      {resource.resource_type}
                    </Badge>
                    <Badge tone="green">approved</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-950">{resource.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[resource.cluster, resource.event_name, formatDate(resource.created_at)]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Future" title="Test score analytics" />
          <div className="grid gap-3">
            {["Average exam score", "Completed diagnostics", "Score growth"].map((label) => (
              <div className="rounded-lg border border-slate-100 p-3" key={label}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                  <span className="text-sm font-bold text-slate-400">Coming soon</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 w-1/3 rounded-full bg-slate-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Future" title="Weak instructional areas" />
          <div className="space-y-3">
            {["Pricing", "Operations", "Marketing information management"].map((area) => (
              <div
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 p-3"
                key={area}
              >
                <span className="text-sm font-semibold text-slate-700">{area}</span>
                <Badge tone="amber">Awaiting scores</Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
