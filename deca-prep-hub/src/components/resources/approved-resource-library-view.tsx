"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ResourceEmptyState, ResourceErrorState, ResourceLoadingState } from "./resource-states";
import { ResourcesService, type PublicResourceListItem } from "@/lib/services/resources";
import type { SupabaseResourceType } from "@/lib/types";

type LibraryMode = "exam" | "roleplay";
type SelectOption = {
  label: string;
  value: string;
};

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

function optionize(values: Array<number | string | null | undefined>): SelectOption[] {
  return Array.from(new Set(values.filter(Boolean).map(String)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((value) => ({ label: value, value }));
}

function searchableText(resource: PublicResourceListItem) {
  return [
    resource.title,
    resource.event_name,
    resource.cluster,
    resource.instructional_area,
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
  const [search, setSearch] = useState("");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [instructionalAreaFilter, setInstructionalAreaFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResources() {
      try {
        const nextResources = await ResourcesService.listApprovedPublicResources({
          resourceType: mode as SupabaseResourceType,
        });

        if (!isActive) {
          return;
        }

        setResources(nextResources);
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
      const matchesCluster = clusterFilter === "all" || resource.cluster === clusterFilter;
      const matchesInstructionalArea =
        instructionalAreaFilter === "all" ||
        resource.instructional_area === instructionalAreaFilter;
      const matchesYear = yearFilter === "all" || String(resource.year) === yearFilter;

      return matchesSearch && matchesCluster && matchesInstructionalArea && matchesYear;
    });
  }, [clusterFilter, instructionalAreaFilter, resources, search, yearFilter]);

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
      setError(caughtError instanceof Error ? caughtError.message : "Unable to open PDF.");
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
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_180px]">
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
            options={[{ label: "all", value: "all" }, ...clusterOptions]}
            value={clusterFilter}
          />
          <FilterSelect
            label="Instructional area"
            onChange={setInstructionalAreaFilter}
            options={[{ label: "all", value: "all" }, ...instructionalAreaOptions]}
            value={instructionalAreaFilter}
          />
          <FilterSelect
            label="Year"
            onChange={setYearFilter}
            options={[{ label: "all", value: "all" }, ...yearOptions]}
            value={yearFilter}
          />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Showing {filteredResources.length} of {resources.length} approved {emptyLabel}.
        </p>
      </Card>

      {filteredResources.length === 0 ? (
        <ResourceEmptyState label={emptyLabel} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
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
  const isRoleplay = mode === "roleplay";

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <Badge tone="blue">{resource.resource_type}</Badge>
        <Badge>{resource.year ?? "Year TBD"}</Badge>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{resource.title}</h2>
      {isRoleplay ? (
        <p className="mt-1 text-sm font-medium text-slate-500">
          {resource.event_name ?? "Event not assigned"}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm">
        {[
          ...(isRoleplay ? ([["Event", resource.event_name]] as const) : []),
          ["Cluster", resource.cluster],
          ...(isRoleplay
            ? ([["Instructional area", resource.instructional_area]] as const)
            : []),
          ["Year", resource.year],
        ].map(([label, value]) => (
          <div className="rounded-lg bg-slate-50 p-3" key={label}>
            <dt className="font-semibold text-slate-800">{label}</dt>
            <dd className="mt-1 break-words text-slate-600">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
          disabled={isOpeningPdf}
          onClick={onOpenPdf}
          type="button"
        >
          {isOpeningPdf ? "Opening..." : "Open / Download PDF"}
        </button>
        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
          href={`/resources/${resource.id}`}
        >
          Details
        </Link>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          type="button"
        >
          {isRoleplay ? "Practice roleplay" : "Take exam"}
        </button>
      </div>
    </Card>
  );
}
