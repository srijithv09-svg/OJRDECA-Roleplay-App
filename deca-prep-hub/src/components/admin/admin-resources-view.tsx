"use client";

import { useEffect, useMemo, useState } from "react";
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
    resource_type: resource.resource_type,
    title: resource.title,
    year: resource.year?.toString() ?? "",
  };
}

function toMetadataUpdate(draft: MetadataDraft): ResourceMetadataUpdate {
  return {
    cluster: draft.cluster.trim() || null,
    event_category: draft.event_category.trim() || null,
    event_code: draft.event_code.trim().toUpperCase() || null,
    event_name: draft.event_name.trim() || null,
    instructional_area:
      draft.resource_type === "roleplay" ? draft.instructional_area.trim() || null : null,
    resource_type: draft.resource_type,
    title: draft.title.trim(),
    year: draft.year.trim() ? Number(draft.year) : null,
  };
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

  const statusResourceCount = resources.filter((resource) =>
    approvalStatusFilter === "all" || resource.approval_status === approvalStatusFilter,
  ).length;

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
    const ids = selectedVisibleIds;

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
    if (!draft || !editingResource || !draft.title.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updatedResource = await ResourcesService.updateMetadata(
        editingResource.id,
        toMetadataUpdate(draft),
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
          You must be an admin or advisor to manage resources.
        </p>
      </Card>
    );
  }

  const hasFilters = Boolean(search.trim()) || resourceTypeFilter !== "all" || clusterFilter !== "all" || instructionalAreaFilter !== "all" || yearFilter !== "all";

  function resetFilters() {
    setSearch("");
    setResourceTypeFilter("all");
    setClusterFilter("all");
    setInstructionalAreaFilter("all");
    setYearFilter("all");
  }

  return (
    <>
      <PageHeader
        actions={<><ButtonLink href="/admin">Admin overview</ButtonLink><ButtonLink href="/admin/upload" variant="primary">Upload PDFs</ButtonLink></>}
        description="Review documents, edit their details, and decide what students can access."
        eyebrow="Admin"
        title="Manage resources"
      />
      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}
      <section aria-label="Resource library" className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex flex-wrap gap-x-5 border-b border-border px-4 sm:px-5" aria-label="Filter by approval status">
          {approvalStatusOptions.map((status) => (
            <button aria-pressed={approvalStatusFilter === status} className={`flex min-h-12 items-center gap-2 border-b-2 text-sm font-medium capitalize ${approvalStatusFilter === status ? "border-primary text-primary" : "border-transparent text-[var(--muted-foreground)] hover:text-foreground"}`} key={status} onClick={() => { setApprovalStatusFilter(status); setSelectedIds(new Set()); closeEditor(); }} type="button">
              {status === "all" ? "All resources" : status}
              <span className="text-xs tabular-nums text-[var(--muted)]">{resources.filter((resource) => status === "all" || resource.approval_status === status).length}</span>
            </button>
          ))}
        </div>
        <div className="space-y-3 border-b border-border p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="ui-label">Search resources<input className="ui-field" onChange={(event) => setSearch(event.target.value)} placeholder="Title, filename, event, or cluster" type="search" value={search} /></label>
            <FilterSelect label="Resource type" onChange={(value) => setResourceTypeFilter(value as "all" | SupabaseResourceType)} options={resourceTypeOptions.map((type) => ({ label: type === "all" ? "All types" : typeLabels[type], value: type }))} value={resourceTypeFilter} />
          </div>
          <details>
            <summary className="w-fit cursor-pointer py-1 text-sm font-medium text-[var(--muted-foreground)]">More filters</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <FilterSelect label="Cluster" onChange={setClusterFilter} options={[{ label: "All clusters", value: "all" }, ...clusterOptions]} value={clusterFilter} />
              <FilterSelect label="Instructional area" onChange={setInstructionalAreaFilter} options={[{ label: "All areas", value: "all" }, ...instructionalAreaOptions]} value={instructionalAreaFilter} />
              <FilterSelect label="Year" onChange={setYearFilter} options={[{ label: "All years", value: "all" }, ...yearOptions]} value={yearFilter} />
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-[var(--muted)]" role="status">Showing {filteredResources.length} of {statusResourceCount} {approvalStatusFilter === "all" ? "total" : approvalStatusFilter} resources.</p>
            {hasFilters ? <button className="min-h-10 text-sm font-medium text-primary underline underline-offset-4" onClick={resetFilters} type="button">Clear filters</button> : null}
          </div>
        </div>
        {filteredResources.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card-muted px-4 py-2 sm:px-5">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"><input checked={selectedVisibleIds.length === filteredResources.length} className="h-4 w-4 accent-[var(--primary)]" disabled={isSaving} onChange={toggleAllVisible} type="checkbox" />{selectedVisibleIds.length ? `${selectedVisibleIds.length} selected` : "Select all shown"}</label>
            {selectedVisibleIds.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Actions for selected resources">
                <button className="ui-button ui-button-secondary" disabled={isSaving} onClick={() => setSelectedIds(new Set())} type="button">Clear selection</button>
                <button className="ui-button ui-button-danger" disabled={isSaving} onClick={() => void bulkUpdateStatus("rejected")} type="button">Reject selected</button>
                <button className="ui-button ui-button-primary" disabled={isSaving} onClick={() => void bulkUpdateStatus("approved")} type="button">Approve selected</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <h2 className="text-lg font-semibold">{hasFilters ? "No matching resources" : approvalStatusFilter === "pending" ? "Nothing waiting for approval" : "No resources here yet"}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{hasFilters ? "Try a different search or clear the filters." : "Uploaded PDFs arrive in Pending before students can see them."}</p>
            {!hasFilters ? <ButtonLink className="mt-5" href="/admin/upload">Upload PDFs</ButtonLink> : null}
          </div>
        )}
        <div className="divide-y divide-[var(--border)]">
          {filteredResources.map((resource) => (
            <article className="min-w-0" key={resource.id}>
              <div className="flex gap-3 p-4 sm:p-5">
                <input aria-label={`Select ${resource.title}`} checked={selectedIds.has(resource.id)} className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--primary)]" disabled={isSaving} onChange={() => toggleSelected(resource.id)} type="checkbox" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold">{resource.title}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">{[typeLabels[resource.resource_type], resource.cluster, resource.event_code, resource.year].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className={`mr-1 text-xs font-medium capitalize ${resource.approval_status === "approved" ? "text-emerald-700" : resource.approval_status === "pending" ? "text-amber-800" : "text-[var(--muted)]"}`}>{resource.approval_status ?? "No status"}</span>
                      <button className="ui-button ui-button-secondary" disabled={openingPdfId === resource.id} onClick={() => void openPdf(resource)} type="button">{openingPdfId === resource.id ? "Opening…" : "Open PDF"}</button>
                      <button aria-controls={`review-${resource.id}`} aria-expanded={editingResource?.id === resource.id} className="ui-button ui-button-secondary" disabled={isSaving} onClick={() => editingResource?.id === resource.id ? closeEditor() : startEditing(resource)} type="button">{editingResource?.id === resource.id ? "Close review" : "Review / edit"}</button>
                      {resource.approval_status !== "approved" ? <button className="ui-button ui-button-primary" disabled={isSaving} onClick={() => void updateStatus(resource.id, "approved")} type="button">Approve</button> : null}
                    </div>
                  </div>
                </div>
              </div>
              {editingResource?.id === resource.id && draft ? (
                <div className="border-t border-border bg-card-muted p-4 sm:p-5" id={`review-${resource.id}`}>
                  <MetadataEditor draft={draft} filename={resource.original_filename} isSaving={isSaving} onClose={closeEditor} onDraftChange={setDraft} onSave={() => void saveMetadata()} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-sm text-[var(--muted)]">{resource.approval_status === "approved" ? "Approved. Students can access this document." : "Students cannot access this document until it is approved."}</p>
                    {resource.approval_status !== "rejected" ? <button className="ui-button ui-button-danger" disabled={isSaving} onClick={() => void updateStatus(resource.id, "rejected")} type="button">Reject resource</button> : null}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

const typeLabels: Record<SupabaseResourceType, string> = { roleplay: "Roleplay", exam: "Exam", reference: "Reference", unknown: "Unclassified" };

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: SelectOption[]; value: string }) {
  return <label className="ui-label">{label}<select className="ui-field" onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function MetadataEditor({ draft, filename, isSaving, onClose, onDraftChange, onSave }: { draft: MetadataDraft; filename: string | null; isSaving: boolean; onClose: () => void; onDraftChange: (draft: MetadataDraft) => void; onSave: () => void }) {
  function selectEventCode(eventCode: string) {
    const selectedEvent = getDecaEventByCode(eventCode);
    onDraftChange(selectedEvent ? { ...draft, cluster: selectedEvent.cluster, event_category: selectedEvent.category, event_code: selectedEvent.code, event_name: selectedEvent.name } : { ...draft, event_code: "" });
  }
  return (
    <form aria-label={`Edit ${draft.title}`} onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <fieldset className="min-w-0" disabled={isSaving}>
        <legend className="font-semibold">Document details</legend>
        {filename ? <p className="mt-1 break-words text-xs text-[var(--muted)]">{filename}</p> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="ui-label sm:col-span-2 lg:col-span-3">Title<input className="ui-field" onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} required value={draft.title} /></label>
          <FilterSelect label="Resource type" onChange={(value) => onDraftChange({ ...draft, resource_type: value as SupabaseResourceType })} options={resourceTypeOptions.filter((type) => type !== "all").map((type) => ({ label: typeLabels[type as SupabaseResourceType], value: type }))} value={draft.resource_type} />
          <label className="ui-label">Event<select className="ui-field" onChange={(event) => selectEventCode(event.target.value)} value={draft.event_code}><option value="">No specific event</option>{decaEvents.map((event) => <option key={event.code} value={event.code}>{event.code} — {event.name}</option>)}</select></label>
          <label className="ui-label">Year<input className="ui-field" max="2100" min="1900" onChange={(event) => onDraftChange({ ...draft, year: event.target.value })} type="number" value={draft.year} /></label>
          <label className="ui-label">Cluster<input className="ui-field" onChange={(event) => onDraftChange({ ...draft, cluster: event.target.value })} value={draft.cluster} /></label>
          {draft.resource_type === "roleplay" ? <label className="ui-label sm:col-span-2">Instructional area<input className="ui-field" onChange={(event) => onDraftChange({ ...draft, instructional_area: event.target.value })} value={draft.instructional_area} /></label> : null}
        </div>
        <details className="mt-4"><summary className="w-fit cursor-pointer py-1 text-sm font-medium">Additional event details</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{metadataTextFields.filter(([key]) => key === "event_name" || key === "event_category").map(([key, label]) => <label className="ui-label" key={key}>{label}<input className="ui-field" onChange={(event) => onDraftChange({ ...draft, [key]: event.target.value })} value={draft[key]} /></label>)}</div></details>
        <p className="mt-4 text-sm text-[var(--muted)]">{draft.resource_type === "reference" ? "Approved reference files appear in the Reference section." : draft.resource_type === "exam" ? "Manage this exam’s answers in Answer keys after saving its details." : draft.resource_type === "unknown" ? "Choose a resource type so students can find this document." : "Approved roleplays appear in Roleplay practice."}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button className="ui-button ui-button-secondary" onClick={onClose} type="button">Cancel</button><button className="ui-button ui-button-primary" disabled={!draft.title.trim()} type="submit">{isSaving ? "Saving…" : "Save details"}</button></div>
      </fieldset>
    </form>
  );
}
