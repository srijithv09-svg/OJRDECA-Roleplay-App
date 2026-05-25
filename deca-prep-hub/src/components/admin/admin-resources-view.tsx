"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { getCurrentProfile } from "@/lib/services/profiles";
import { ResourcesService } from "@/lib/services/resources";
import type {
  Profile,
  ResourceListItem,
  ResourceMetadataUpdate,
  SupabaseResourceType,
} from "@/lib/types";

type MetadataDraft = {
  cluster: string;
  event_name: string;
  instructional_area: string;
  performance_indicators: string;
  performance_indicators_reviewed: boolean;
  resource_type: SupabaseResourceType;
  title: string;
  year: string;
};

type MetadataTextField = "cluster" | "event_name" | "instructional_area" | "year";

const metadataTextFields: Array<[MetadataTextField, string]> = [
  ["cluster", "Cluster"],
  ["event_name", "Event name"],
  ["instructional_area", "Instructional area"],
  ["year", "Year"],
];

const resourceTypeOptions: SupabaseResourceType[] = [
  "roleplay",
  "exam",
  "reference",
  "unknown",
];

function toDraft(resource: ResourceListItem): MetadataDraft {
  return {
    cluster: resource.cluster ?? "",
    event_name: resource.event_name ?? "",
    instructional_area: resource.instructional_area ?? "",
    performance_indicators: resource.performance_indicators?.join("\n") ?? "",
    performance_indicators_reviewed: Boolean(resource.performance_indicators_reviewed),
    resource_type: resource.resource_type,
    title: resource.title,
    year: resource.year?.toString() ?? "",
  };
}

function toMetadataUpdate(draft: MetadataDraft): ResourceMetadataUpdate {
  const performanceIndicators = draft.performance_indicators
    .split(/\r?\n/)
    .map((indicator) => indicator.trim())
    .filter(Boolean);

  return {
    cluster: draft.cluster.trim() || null,
    event_name: draft.event_name.trim() || null,
    instructional_area: draft.instructional_area.trim() || null,
    performance_indicators: performanceIndicators.length > 0 ? performanceIndicators : null,
    performance_indicators_reviewed: draft.performance_indicators_reviewed,
    resource_type: draft.resource_type,
    title: draft.title.trim(),
    year: draft.year.trim() ? Number(draft.year) : null,
  };
}

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

export function AdminResourcesView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MetadataDraft | null>(null);
  const [search, setSearch] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<"all" | SupabaseResourceType>(
    "all",
  );
  const [clusterFilter, setClusterFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadAdminResources() {
      try {
        const nextProfile = await getCurrentProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);

        if (nextProfile?.role !== "admin") {
          setResources([]);
          setError(null);
          return;
        }

        const nextResources = await ResourcesService.listResources({
          approvalStatus: "pending",
        });

        if (!isActive) {
          return;
        }

        setResources(nextResources);
        setSelectedIds(new Set());
        setEditingId(null);
        setDraft(null);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load pending resources.",
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminResources();

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const clusters = useMemo(
    () =>
      Array.from(
        new Set(resources.map((resource) => resource.cluster).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b)),
    [resources],
  );

  const filteredResources = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return resources.filter((resource) => {
      const matchesType =
        resourceTypeFilter === "all" || resource.resource_type === resourceTypeFilter;
      const matchesCluster = clusterFilter === "all" || resource.cluster === clusterFilter;
      const searchable = [
        resource.title,
        resource.resource_type,
        resource.cluster,
        resource.event_name,
        resource.instructional_area,
        resource.original_filename,
        resource.import_notes,
        resource.storage_path,
        ...(resource.performance_indicators ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesType && matchesCluster && searchable.includes(normalizedSearch);
    });
  }, [clusterFilter, resourceTypeFilter, resources, search]);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function startEditing(resource: ResourceListItem) {
    setEditingId(resource.id);
    setDraft(toDraft(resource));
  }

  async function updateStatus(id: string, status: "approved" | "rejected") {
    setIsSaving(true);
    setError(null);

    try {
      await ResourcesService.updateApprovalStatus(id, status);
      setResources((current) => current.filter((resource) => resource.id !== id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update resource.");
    } finally {
      setIsSaving(false);
    }
  }

  async function bulkApprove() {
    const ids = Array.from(selectedIds);

    if (ids.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await ResourcesService.bulkApprove(ids);
      setResources((current) => current.filter((resource) => !selectedIds.has(resource.id)));
      setSelectedIds(new Set());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to bulk approve.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMetadata(id: string) {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updatedResource = await ResourcesService.updateMetadata(id, toMetadataUpdate(draft));
      setResources((current) =>
        current.map((resource) => (resource.id === id ? updatedResource : resource)),
      );
      setEditingId(null);
      setDraft(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save metadata.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
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
          You must be an admin to review imported resources.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        description="Review imported PDFs, fix metadata, and approve resources for student visibility."
        eyebrow="Admin"
        title="Resource approvals"
      />

      {error ? (
        <ResourceErrorState message={error} onRetry={retryLoad} />
      ) : null}

      <Card>
        <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px_auto]">
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Search
            <input
              className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, filenames, notes, indicators..."
              type="search"
              value={search}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Resource type
            <select
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) =>
                setResourceTypeFilter(event.target.value as "all" | SupabaseResourceType)
              }
              value={resourceTypeFilter}
            >
              <option value="all">All types</option>
              {resourceTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Cluster
            <select
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => setClusterFilter(event.target.value)}
              value={clusterFilter}
            >
              <option value="all">All clusters</option>
              {clusters.map((cluster) => (
                <option key={cluster} value={cluster}>
                  {cluster}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              className="min-h-11 w-full rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isSaving || selectedIds.size === 0}
              onClick={bulkApprove}
              type="button"
            >
              Approve selected ({selectedIds.size})
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {filteredResources.length === 0 ? (
          <Card className="grid min-h-56 place-items-center text-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">No pending resources found</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pending imports will appear here when they match the current filters.
              </p>
            </div>
          </Card>
        ) : null}

        {filteredResources.map((resource) => {
          const isEditing = editingId === resource.id && draft;

          return (
            <Card key={resource.id}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex gap-3">
                  <input
                    aria-label={`Select ${resource.title}`}
                    checked={selectedIds.has(resource.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    onChange={() => toggleSelected(resource.id)}
                    type="checkbox"
                  />
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="amber">pending</Badge>
                      <Badge tone="blue">{resource.resource_type}</Badge>
                      <Badge>{resource.year ?? "Year TBD"}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-slate-950">
                      {resource.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {resource.original_filename ?? "No original filename"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                    disabled={isSaving}
                    onClick={() => startEditing(resource)}
                    type="button"
                  >
                    Edit metadata
                  </button>
                  <button
                    className="min-h-10 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:bg-emerald-300"
                    disabled={isSaving}
                    onClick={() => updateStatus(resource.id, "approved")}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="min-h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:bg-red-300"
                    disabled={isSaving}
                    onClick={() => updateStatus(resource.id, "rejected")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </div>

              <dl className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Cluster", resource.cluster],
                  ["Event", resource.event_name],
                  ["Instructional area", resource.instructional_area],
                  ["Confidence score", resource.confidence_score],
                  ["Import notes", resource.import_notes],
                  ["Storage path", resource.storage_path],
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm" key={label}>
                    <dt className="font-semibold text-slate-800">{label}</dt>
                    <dd className="mt-1 break-words text-slate-600">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800">Performance indicators</p>
                {resource.performance_indicators_reviewed &&
                resource.performance_indicators?.length ? (
                  <p className="mt-2 text-sm text-slate-600">
                    {resource.performance_indicators.length} reviewed indicator
                    {resource.performance_indicators.length === 1 ? "" : "s"}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Performance indicators pending review
                  </p>
                )}
                {resource.performance_indicators?.length ? (
                  <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                      Raw extracted indicators
                    </summary>
                    <ul className="mt-3 grid gap-2">
                      {resource.performance_indicators.map((indicator) => (
                        <li
                          className="rounded-lg border border-slate-100 bg-white p-3 text-sm text-slate-600"
                          key={indicator}
                        >
                          {indicator}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>

              {isEditing ? (
                <form className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <CardHeader eyebrow="Edit" title="Metadata" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-slate-800 md:col-span-2">
                      Title
                      <input
                        className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, title: event.target.value } : current,
                          )
                        }
                        value={draft.title}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-slate-800">
                      Resource type
                      <select
                        className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  resource_type: event.target.value as SupabaseResourceType,
                                }
                              : current,
                          )
                        }
                        value={draft.resource_type}
                      >
                        {resourceTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    {metadataTextFields.map(([key, label]) => (
                      <label
                        className="grid gap-2 text-sm font-semibold text-slate-800"
                        key={key}
                      >
                        {label}
                        <input
                          className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, [key]: event.target.value } : current,
                            )
                          }
                          type={key === "year" ? "number" : "text"}
                          value={draft[key]}
                        />
                      </label>
                    ))}

                    <label className="grid gap-2 text-sm font-semibold text-slate-800 md:col-span-2">
                      Performance indicators
                      <textarea
                        className="min-h-28 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? { ...current, performance_indicators: event.target.value }
                              : current,
                          )
                        }
                        value={draft.performance_indicators}
                      />
                    </label>

                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-800 md:col-span-2">
                      <input
                        checked={draft.performance_indicators_reviewed}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  performance_indicators_reviewed: event.target.checked,
                                }
                              : current,
                          )
                        }
                        type="checkbox"
                      />
                      Mark performance indicators as reviewed
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
                      disabled={isSaving}
                      onClick={(event) => {
                        event.preventDefault();
                        void saveMetadata(resource.id);
                      }}
                      type="submit"
                    >
                      Save metadata
                    </button>
                    <button
                      className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(null);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
