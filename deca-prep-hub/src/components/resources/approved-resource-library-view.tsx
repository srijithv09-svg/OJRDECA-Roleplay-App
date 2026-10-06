"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
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
      <Card>
        <div
          className={`grid gap-3 sm:grid-cols-2 ${mode === "roleplay" ? "xl:grid-cols-4" : "xl:grid-cols-[2fr_1fr_1fr]"}`}
        >
          <label className="relative grid gap-2 text-sm font-semibold text-slate-800">
            Search
            <span className="relative">
              <Icon
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                name="search"
              />
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
        <p className="mt-4 text-sm text-slate-500">
          Showing {filteredResources.length} of {resources.length} approved{" "}
          {emptyLabel}.
        </p>
        {selectedClusterLabel && selectedClusterFilter ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span>Your cluster: {selectedClusterLabel}</span>
            <button
              className="min-h-9 rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              onClick={() => setClusterFilter(selectedClusterFilter)}
              type="button"
            >
              Show my cluster
            </button>
            {clusterFilter !== "all" ? (
              <button
                className="min-h-9 rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                onClick={() => setClusterFilter("all")}
                type="button"
              >
                All clusters
              </button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {filteredResources.length === 0 ? (
        <div className="space-y-3">
          <ResourceEmptyState label={emptyLabel} />
          {resources.length > 0 ? (
            <button
              className="text-sm font-semibold text-primary"
              onClick={() => {
                setSearch("");
                setClusterFilter("all");
                setYearFilter("all");
                setEventFilter("all");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border bg-card">
          {filteredResources.map((resource) => (
            <StudentResourceCard
              isOpeningPdf={openingPdfId === resource.id}
              key={resource.id}
              mode={mode}
              onOpenPdf={() => void openPdf(resource)}
              resource={resource}
            />
          ))}
        </div>
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
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <select
        aria-label={label}
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
    <article className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-[var(--muted)]">
          {[resource.event_code, resource.cluster, resource.year]
            .filter(Boolean)
            .join(" · ") || "Chapter resource"}
        </p>
        <h2 className="mt-2 text-base font-semibold leading-6">
          <Link
            className="hover:text-primary"
            href={`/resources/${resource.id}`}
          >
            {resource.title}
          </Link>
        </h2>
        {mode === "roleplay" && resource.event_name ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {resource.event_name}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          className="min-h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-primary-soft disabled:opacity-50"
          disabled={isOpeningPdf}
          onClick={onOpenPdf}
          type="button"
        >
          {isOpeningPdf ? "Opening…" : "Open PDF"}
        </button>
        {mode !== "reference" ? (
          <Link
            className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
            href={practiceHref}
          >
            {mode === "roleplay" ? "Practice" : "Open exam"}
          </Link>
        ) : (
          <Link
            className="px-3 py-2 text-sm font-medium text-primary"
            href={`/resources/${resource.id}`}
          >
            Details
          </Link>
        )}
      </div>
    </article>
  );
}
