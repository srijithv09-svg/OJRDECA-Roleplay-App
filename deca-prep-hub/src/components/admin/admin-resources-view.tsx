"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { isAdminRole } from "@/lib/auth";
import { decaEvents, getDecaEventByCode } from "@/lib/deca/events";
import { getCurrentProfile } from "@/lib/services/profiles";
import { ResourcesService } from "@/lib/services/resources";
import type {
  Profile,
  ResourceApprovalStatus,
  ResourceListItem,
  ResourceMetadataUpdate,
  SupabaseResourceType,
} from "@/lib/types";

type MetadataDraft = {
  cluster: string;
  event_category: string;
  event_code: string;
  event_name: string;
  instructional_area: string;
  performance_indicators: string;
  performance_indicators_reviewed: boolean;
  resource_type: SupabaseResourceType;
  title: string;
  year: string;
};

type MetadataTextField = "cluster" | "event_category" | "event_name" | "instructional_area" | "year";
type ApprovalStatusFilter = "all" | "approved" | "pending" | "rejected";
type SelectOption = {
  label: string;
  value: string;
};

const metadataTextFields: Array<[MetadataTextField, string]> = [
  ["cluster", "Cluster"],
  ["event_category", "Event category"],
  ["event_name", "Event name"],
  ["instructional_area", "Instructional area"],
  ["year", "Year"],
];

const approvalStatusOptions: ApprovalStatusFilter[] = ["pending", "approved", "rejected", "all"];
const resourceTypeOptions: Array<"all" | SupabaseResourceType> = [
  "all",
  "roleplay",
  "exam",
  "reference",
  "unknown",
];

function toDraft(resource: ResourceListItem): MetadataDraft {
  return {
    cluster: resource.cluster ?? "",
    event_category: resource.event_category ?? "",
    event_code: resource.event_code ?? "",
    event_name: resource.event_name ?? "",
    instructional_area: resource.instructional_area ?? "",
    performance_indicators: resource.performance_indicators?.join("\n") ?? "",
    performance_indicators_reviewed: Boolean(resource.performance_indicators_reviewed),
    resource_type: resource.resource_type,
    title: resource.title,
    year: resource.year?.toString() ?? "",
  };
}

function toMetadataUpdate(
  draft: MetadataDraft,
  originalResource: ResourceListItem,
): ResourceMetadataUpdate {
  const performanceIndicators = draft.performance_indicators
    .split(/\r?\n/)
    .map((indicator) => indicator.trim())
    .filter(Boolean);
  const isRoleplay = draft.resource_type === "roleplay";

  return {
    cluster: draft.cluster.trim() || null,
    event_category: draft.event_category.trim() || null,
    event_code: draft.event_code.trim().toUpperCase() || null,
    event_name: draft.event_name.trim() || null,
    instructional_area: draft.instructional_area.trim() || null,
    performance_indicators: isRoleplay
      ? performanceIndicators.length > 0
        ? performanceIndicators
        : null
      : originalResource.performance_indicators,
    performance_indicators_reviewed: isRoleplay
      ? draft.performance_indicators_reviewed
      : originalResource.performance_indicators_reviewed,
    resource_type: draft.resource_type,
    title: draft.title.trim(),
    year: draft.year.trim() ? Number(draft.year) : null,
  };
}

function formatValue(value: boolean | number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

function getStatusTone(status: ResourceApprovalStatus | null) {
  if (status === "approved") {
    return "green";
  }

  if (status === "rejected") {
    return "slate";
  }

  return "amber";
}

function optionize(values: Array<number | string | null | undefined>): SelectOption[] {
  return Array.from(new Set(values.filter(Boolean).map(String)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((value) => ({ label: value, value }));
}

function searchableText(resource: ResourceListItem) {
  return [
    resource.title,
    resource.original_filename,
    resource.event_name,
    resource.event_code,
    resource.event_category,
    resource.cluster,
    resource.instructional_area,
    resource.resource_type,
    resource.year,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function AdminResourcesView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingResource, setEditingResource] = useState<ResourceListItem | null>(null);
  const [draft, setDraft] = useState<MetadataDraft | null>(null);
  const [search, setSearch] = useState("");
  const [approvalStatusFilter, setApprovalStatusFilter] =
    useState<ApprovalStatusFilter>("pending");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<"all" | SupabaseResourceType>(
    "all",
  );
  const [clusterFilter, setClusterFilter] = useState("all");
  const [instructionalAreaFilter, setInstructionalAreaFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
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

        if (!isAdminRole(nextProfile?.role)) {
          setResources([]);
          setError(null);
          return;
        }

        const nextResources = await ResourcesService.listResources();

        if (!isActive) {
          return;
        }

        setResources(nextResources);
        setSelectedIds(new Set());
        setEditingResource(null);
        setDraft(null);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load resources.",
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

  const clusterOptions = useMemo(
    () => optionize(resources.map((resource) => resource.cluster)),
    [resources],
  );
  const instructionalAreaOptions = useMemo(
    () => optionize(resources.map((resource) => resource.instructional_area)),
    [resources],
  );
  const yearOptions = useMemo(
    () => optionize(resources.map((resource) => resource.year)),
    [resources],
  );

  const filteredResources = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return resources.filter((resource) => {
      const matchesSearch =
        !normalizedSearch || searchableText(resource).includes(normalizedSearch);
      const matchesStatus =
        approvalStatusFilter === "all" || resource.approval_status === approvalStatusFilter;
      const matchesType =
        resourceTypeFilter === "all" || resource.resource_type === resourceTypeFilter;
      const matchesCluster = clusterFilter === "all" || resource.cluster === clusterFilter;
      const matchesInstructionalArea =
        instructionalAreaFilter === "all" ||
        resource.instructional_area === instructionalAreaFilter;
      const matchesYear = yearFilter === "all" || String(resource.year) === yearFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType &&
        matchesCluster &&
        matchesInstructionalArea &&
        matchesYear
      );
    });
  }, [
    approvalStatusFilter,
    clusterFilter,
    instructionalAreaFilter,
    resourceTypeFilter,
    resources,
    search,
    yearFilter,
  ]);

  const selectedVisibleIds = useMemo(
    () => filteredResources.filter((resource) => selectedIds.has(resource.id)).map((resource) => resource.id),
    [filteredResources, selectedIds],
  );

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  function patchResources(updatedResources: ResourceListItem[]) {
    const updatesById = new Map(updatedResources.map((resource) => [resource.id, resource]));

    setResources((current) =>
      current.map((resource) => updatesById.get(resource.id) ?? resource),
    );
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

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allVisibleSelected =
        filteredResources.length > 0 && filteredResources.every((resource) => next.has(resource.id));

      for (const resource of filteredResources) {
        if (allVisibleSelected) {
          next.delete(resource.id);
        } else {
          next.add(resource.id);
        }
      }

      return next;
    });
  }

  function startEditing(resource: ResourceListItem) {
    setEditingResource(resource);
    setDraft(toDraft(resource));
  }

  function closeEditor() {
    setEditingResource(null);
    setDraft(null);
  }

  async function openPdf(resource: ResourceListItem) {
    setOpeningPdfId(resource.id);
    setError(null);

    try {
      const pdfLink = await ResourcesService.getResourcePdfLink(resource.id);
      window.open(pdfLink.signedUrl, "_blank", "noopener,noreferrer");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to open PDF.");
    } finally {
      setOpeningPdfId(null);
    }
  }

  async function updateStatus(id: string, status: "approved" | "rejected") {
    setIsSaving(true);
    setError(null);

    try {
      const updatedResource = await ResourcesService.updateApprovalStatus(id, status);
      patchResources([updatedResource]);
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

  async function bulkUpdateStatus(status: "approved" | "rejected") {
    const ids = Array.from(selectedIds);

    if (ids.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updatedResources =
        status === "approved"
          ? await ResourcesService.bulkApprove(ids)
          : await ResourcesService.bulkReject(ids);
      patchResources(updatedResources);
      setSelectedIds(new Set());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `Unable to bulk ${status === "approved" ? "approve" : "reject"}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMetadata() {
    if (!draft || !editingResource) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updatedResource = await ResourcesService.updateMetadata(
        editingResource.id,
        toMetadataUpdate(draft, editingResource),
      );
      patchResources([updatedResource]);
      closeEditor();
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
    return (
      <ResourceErrorState
        message="Unable to verify account role."
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
          You must be an admin to review imported resources.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        actions={<ButtonLink href="/admin">Back to Admin</ButtonLink>}
        description="Review imported PDFs, tune metadata, and approve resources for student visibility."
        eyebrow="Admin"
        title="Resource approvals"
      />

      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}

      <Card>
        <div className="grid gap-3 xl:grid-cols-[1.4fr_180px_180px_180px]">
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Search
            <input
              className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, filename, event, cluster, type, year..."
              type="search"
              value={search}
            />
          </label>

          <FilterSelect
            label="Status"
            onChange={(value) => setApprovalStatusFilter(value as ApprovalStatusFilter)}
            options={approvalStatusOptions.map((status) => ({ label: status, value: status }))}
            value={approvalStatusFilter}
          />
          <FilterSelect
            label="Type"
            onChange={(value) => setResourceTypeFilter(value as "all" | SupabaseResourceType)}
            options={resourceTypeOptions.map((type) => ({ label: type, value: type }))}
            value={resourceTypeFilter}
          />
          <FilterSelect
            label="Year"
            onChange={setYearFilter}
            options={[{ label: "all", value: "all" }, ...yearOptions]}
            value={yearFilter}
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
          <FilterSelect
            label="Cluster"
            onChange={setClusterFilter}
            options={[{ label: "all", value: "all" }, ...clusterOptions]}
            value={clusterFilter}
          />
          <FilterSelect
            label="Instructional area"
            onChange={setInstructionalAreaFilter}
            options={[{ label: "all", value: "all" }, ...instructionalAreaOptions]}
            value={instructionalAreaFilter}
          />
          <div className="flex flex-wrap items-end gap-2">
            <button
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              disabled={filteredResources.length === 0}
              onClick={toggleAllVisible}
              type="button"
            >
              {selectedVisibleIds.length === filteredResources.length && filteredResources.length > 0
                ? "Clear visible"
                : "Select visible"}
            </button>
            <button
              className="min-h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isSaving || selectedIds.size === 0}
              onClick={() => void bulkUpdateStatus("approved")}
              type="button"
            >
              Approve selected ({selectedIds.size})
            </button>
            <button
              className="min-h-11 rounded-md bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
              disabled={isSaving || selectedIds.size === 0}
              onClick={() => void bulkUpdateStatus("rejected")}
              type="button"
            >
              Reject selected
            </button>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Showing {filteredResources.length} of {resources.length} resources.
        </p>
      </Card>

      <div className="grid gap-4">
        {filteredResources.length === 0 ? (
          <Card className="grid min-h-56 place-items-center text-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">No resources found</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Adjust the search or filters to find imported resources.
              </p>
            </div>
          </Card>
        ) : null}

        {filteredResources.map((resource) => (
          <ResourceApprovalCard
            isOpeningPdf={openingPdfId === resource.id}
            isSaving={isSaving}
            isSelected={selectedIds.has(resource.id)}
            key={resource.id}
            onEdit={() => startEditing(resource)}
            onOpenPdf={() => void openPdf(resource)}
            onReject={() => void updateStatus(resource.id, "rejected")}
            onApprove={() => void updateStatus(resource.id, "approved")}
            onToggleSelected={() => toggleSelected(resource.id)}
            resource={resource}
          />
        ))}
      </div>

      {editingResource && draft ? (
        <MetadataEditModal
          draft={draft}
          isSaving={isSaving}
          onClose={closeEditor}
          onDraftChange={setDraft}
          onSave={() => void saveMetadata()}
        />
      ) : null}
    </>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <select
        className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResourceApprovalCard({
  isOpeningPdf,
  isSaving,
  isSelected,
  onApprove,
  onEdit,
  onOpenPdf,
  onReject,
  onToggleSelected,
  resource,
}: {
  isOpeningPdf: boolean;
  isSaving: boolean;
  isSelected: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onOpenPdf: () => void;
  onReject: () => void;
  onToggleSelected: () => void;
  resource: ResourceListItem;
}) {
  const hasReviewedIndicators =
    resource.resource_type === "roleplay" &&
    resource.performance_indicators_reviewed &&
    resource.performance_indicators?.length;

  return (
    <Card>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-3">
          <input
            aria-label={`Select ${resource.title}`}
            checked={isSelected}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
            onChange={onToggleSelected}
            type="checkbox"
          />
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={getStatusTone(resource.approval_status)}>
                {resource.approval_status ?? "No status"}
              </Badge>
              <Badge tone="blue">{resource.resource_type}</Badge>
              {resource.event_code ? <Badge>{resource.event_code}</Badge> : null}
              <Badge>{resource.year ?? "Year TBD"}</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">{resource.title}</h2>
            <p className="mt-1 break-words text-sm text-slate-500">
              {resource.original_filename ?? "No original filename"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-blue-300"
            disabled={isOpeningPdf}
            onClick={onOpenPdf}
            type="button"
          >
            {isOpeningPdf ? "Opening..." : "Open / Download PDF"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            disabled={isSaving}
            onClick={onEdit}
            type="button"
          >
            Edit metadata
          </button>
          <button
            className="min-h-10 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:bg-emerald-300"
            disabled={isSaving}
            onClick={onApprove}
            type="button"
          >
            Approve
          </button>
          <button
            className="min-h-10 rounded-md bg-red-700 px-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:bg-red-300"
            disabled={isSaving}
            onClick={onReject}
            type="button"
          >
            Reject
          </button>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Event code", resource.event_code],
          ["Event name", resource.event_name],
          ["Event category", resource.event_category],
          ["Cluster", resource.cluster],
        ].map(([label, value]) => (
          <div className="rounded-lg bg-slate-50 p-3 text-sm" key={label}>
            <dt className="font-semibold text-slate-800">{label}</dt>
            <dd className="mt-1 break-words text-slate-600">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {resource.resource_type === "roleplay" ? (
          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <p className="text-sm font-semibold text-slate-800">Performance indicators</p>
            {hasReviewedIndicators ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {resource.performance_indicators?.map((indicator) => (
                  <li key={indicator}>{indicator}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Performance indicators pending review
              </p>
            )}
            {resource.performance_indicators?.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Raw extracted indicators
                </summary>
                <ul className="mt-2 grid gap-2">
                  {resource.performance_indicators.map((indicator) => (
                    <li
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600"
                      key={indicator}
                    >
                      {indicator}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <details className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Developer details
          </summary>
          <dl className="mt-3 grid gap-3 text-sm">
            {[
              ["storage_path", resource.storage_path],
              ["file_path", resource.file_path],
              ["import_notes", resource.import_notes],
              ["confidence_score", resource.confidence_score],
            ].map(([label, value]) => (
              <div className="rounded-lg bg-white p-3" key={label}>
                <dt className="font-semibold text-slate-800">{label}</dt>
                <dd className="mt-1 break-words text-slate-600">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </Card>
  );
}

function MetadataEditModal({
  draft,
  isSaving,
  onClose,
  onDraftChange,
  onSave,
}: {
  draft: MetadataDraft;
  isSaving: boolean;
  onClose: () => void;
  onDraftChange: (draft: MetadataDraft) => void;
  onSave: () => void;
}) {
  const isRoleplayDraft = draft.resource_type === "roleplay";
  function selectEventCode(eventCode: string) {
    const selectedEvent = getDecaEventByCode(eventCode);

    if (!selectedEvent) {
      onDraftChange({ ...draft, event_code: "" });
      return;
    }

    onDraftChange({
      ...draft,
      cluster: selectedEvent.cluster,
      event_category: selectedEvent.category,
      event_code: selectedEvent.code,
      event_name: selectedEvent.name,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <form
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Edit
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Metadata</h2>
          </div>
          <button
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-slate-800 md:col-span-2">
            Title
            <input
              className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
              value={draft.title}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Resource type
            <select
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  resource_type: event.target.value as SupabaseResourceType,
                })
              }
              value={draft.resource_type}
            >
              {resourceTypeOptions
                .filter((type) => type !== "all")
                .map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Event code
            <select
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => selectEventCode(event.target.value)}
              value={draft.event_code}
            >
              <option value="">No event matched - choose manually</option>
              {decaEvents.map((event) => (
                <option key={event.code} value={event.code}>
                  {event.code} - {event.name}
                  {event.code === "MCS" || event.code === "BLTDM" ? " (learning pilot)" : ""}
                </option>
              ))}
            </select>
          </label>

          {metadataTextFields.map(([key, label]) => (
            <label className="grid gap-2 text-sm font-semibold text-slate-800" key={key}>
              {label}
              <input
                className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => onDraftChange({ ...draft, [key]: event.target.value })}
                type={key === "year" ? "number" : "text"}
                value={draft[key]}
              />
            </label>
          ))}

          {isRoleplayDraft ? (
            <>
              <label className="grid gap-2 text-sm font-semibold text-slate-800 md:col-span-2">
                Performance indicators
                <textarea
                  className="min-h-32 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) =>
                    onDraftChange({ ...draft, performance_indicators: event.target.value })
                  }
                  value={draft.performance_indicators}
                />
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-800 md:col-span-2">
                <input
                  checked={draft.performance_indicators_reviewed}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      performance_indicators_reviewed: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                Mark performance indicators as reviewed
              </label>
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 md:col-span-2">
              Performance indicators are only edited and displayed for roleplay resources.
              Existing indicator data is preserved but hidden for exams, references, and unknown resources.
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
            disabled={isSaving}
            type="submit"
          >
            Save metadata
          </button>
        </div>
      </form>
    </div>
  );
}
