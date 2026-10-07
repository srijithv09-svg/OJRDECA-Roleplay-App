"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import {
  ResourceEmptyState,
  ResourceErrorState,
  ResourceLoadingState,
} from "./resource-states";
import {
  eventMatchesSelectedCluster,
  getDecaClusterLabel,
} from "@/lib/deca/clusters";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import {
  ResourcesService,
  type PublicResourceListItem,
} from "@/lib/services/resources";
import type { DecaClusterPreference } from "@/lib/deca/clusters";
import type { SupabaseResourceType } from "@/lib/types";

type LibraryMode = "exam" | "roleplay" | "reference";
type SelectOption = {
  label: string;
  value: string;
};

function optionize(
  values: Array<number | string | null | undefined>,
): SelectOption[] {
  return Array.from(new Set(values.filter(Boolean).map(String)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((value) => ({ label: value, value }));
}

function searchableText(resource: PublicResourceListItem) {
  return [
    resource.title,
    resource.event_code,
    resource.event_name,
    resource.event_category,
    resource.cluster,
    resource.year,
    resource.original_filename,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ApprovedResourceLibraryView({
  emptyLabel,
  mode,
}: {
  emptyLabel: string;
  mode: LibraryMode;
}) {
  const [resources, setResources] = useState<PublicResourceListItem[]>([]);
  const [selectedCluster, setSelectedCluster] =
    useState<DecaClusterPreference | null>(null);
  const [search, setSearch] = useState("");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResources() {
      try {
        const [nextResources, nextProfile] = await Promise.all([
          ResourcesService.listApprovedPublicResources({
            resourceType: mode as SupabaseResourceType,
          }),
          getCurrentOwnProfile().catch(() => null),
        ]);

        if (!isActive) {
          return;
        }

        setResources(nextResources);
        setSelectedCluster(nextProfile?.selected_cluster ?? null);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "An unexpected error occurred while loading resources.",
        );
        setResources([]);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadResources();

    return () => {
      isActive = false;
    };
  }, [mode, reloadKey]);

  const clusterOptions = useMemo(
    () => optionize(resources.map((resource) => resource.cluster)),
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
        !normalizedSearch ||
        searchableText(resource).includes(normalizedSearch);
      const matchesCluster =
        clusterFilter === "all" || resource.cluster === clusterFilter;
      const matchesEvent =
        eventFilter === "all" || resource.event_code === eventFilter;
      const matchesYear =
        yearFilter === "all" || String(resource.year) === yearFilter;

      return matchesSearch && matchesCluster && matchesYear && matchesEvent;
    });
  }, [clusterFilter, eventFilter, resources, search, yearFilter]);
  const selectedClusterLabel = getDecaClusterLabel(selectedCluster);
  const hasFilters = Boolean(search.trim()) || [clusterFilter, eventFilter, yearFilter].some((value) => value !== "all");

  function clearFilters() {
    setSearch("");
    setClusterFilter("all");
    setYearFilter("all");
    setEventFilter("all");
  }
  const selectedClusterFilter = useMemo(() => {
    if (!selectedCluster) {
      return null;
    }

    return (
      clusterOptions.find((option) =>
        eventMatchesSelectedCluster(option.value, selectedCluster),
      )?.value ?? null
    );
  }, [clusterOptions, selectedCluster]);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  async function openPdf(resource: PublicResourceListItem) {
    setOpeningPdfId(resource.id);
    setError(null);

    try {
      const pdfLink = await ResourcesService.getResourcePdfLink(resource.id);
      window.open(pdfLink.signedUrl, "_blank", "noopener,noreferrer");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to open PDF.",
      );
    } finally {
      setOpeningPdfId(null);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  return (
    <section className="space-y-5">
      <div>
        <div
          className={`grid gap-3 sm:grid-cols-2 ${mode === "roleplay" ? "xl:grid-cols-4" : "xl:grid-cols-[2fr_1fr_1fr]"}`}
        >
          <label className="ui-label">
            Search
            <span className="relative">
              <Icon
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                name="search"
              />
              <input
                className="ui-field !pl-10"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${emptyLabel}, events, clusters...`}
                type="search"
                value={search}
              />
            </span>
          </label>

          <FilterSelect
            label="Cluster"
            onChange={setClusterFilter}
            options={[
              { label: "All clusters", value: "all" },
              ...clusterOptions,
            ]}
            value={clusterFilter}
          />
          {mode === "roleplay" ? (
            <FilterSelect
              label="Event"
              onChange={setEventFilter}
              options={[
                { label: "All events", value: "all" },
                ...optionize(resources.map((r) => r.event_code)),
              ]}
              value={eventFilter}
            />
          ) : null}
          <FilterSelect
            label="Year"
            onChange={setYearFilter}
            options={[{ label: "All years", value: "all" }, ...yearOptions]}
            value={yearFilter}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-[var(--muted)]" role="status">
            {hasFilters ? `${filteredResources.length} of ${resources.length}` : resources.length} {emptyLabel}
          </p>
          {hasFilters ? <button className="inline-flex min-h-9 items-center font-medium text-primary" onClick={clearFilters} type="button">Clear filters</button> : null}
        </div>
        {selectedClusterLabel && selectedClusterFilter ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span>Your cluster: {selectedClusterLabel}</span>
            <button
              className="inline-flex min-h-9 items-center font-medium text-primary"
              onClick={() => setClusterFilter(selectedClusterFilter)}
              type="button"
            >
              Show my cluster
            </button>
            {clusterFilter !== "all" ? (
              <button
                className="inline-flex min-h-9 items-center font-medium text-primary"
                onClick={() => setClusterFilter("all")}
                type="button"
              >
                All clusters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {filteredResources.length === 0 ? (
        <ResourceEmptyState label={emptyLabel} filtered={resources.length > 0} />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {filteredResources.map((resource) => (
            <StudentResourceCard
              isOpeningPdf={openingPdfId === resource.id}
              key={resource.id}
              mode={mode}
              onOpenPdf={() => void openPdf(resource)}
              resource={resource}
            />
          ))}
        </ul>
      )}
    </section>
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
    <label className="ui-label">
      {label}
      <select
        aria-label={label}
        className="ui-field"
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

function StudentResourceCard({
  isOpeningPdf,
  mode,
  onOpenPdf,
  resource,
}: {
  isOpeningPdf: boolean;
  mode: LibraryMode;
  onOpenPdf: () => void;
  resource: PublicResourceListItem;
}) {
  const practiceHref =
    mode === "roleplay"
      ? `/roleplays/${resource.id}/practice`
      : `/exams/${resource.id}/take`;
  return (
    <li className="flex min-w-0 flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-6">
          <Link
            className="hover:text-primary"
            href={`/resources/${resource.id}`}
          >
            {resource.title}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {[resource.event_code, resource.cluster, resource.year].filter(Boolean).join(" · ") || "Chapter resource"}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          aria-label={`Open PDF: ${resource.title}`}
          className={`ui-button ${mode === "reference" ? "ui-button-primary" : "ui-button-secondary"}`}
          disabled={isOpeningPdf}
          onClick={onOpenPdf}
          type="button"
        >
          {isOpeningPdf ? "Opening…" : "Open PDF"}
        </button>
        {mode !== "reference" ? (
          <Link
            aria-label={`${mode === "roleplay" ? "Practice roleplay" : "Practice exam"}: ${resource.title}`}
            className="ui-button ui-button-primary"
            href={practiceHref}
          >
            {mode === "roleplay" ? "Practice roleplay" : "Practice exam"}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
