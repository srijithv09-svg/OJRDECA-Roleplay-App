"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceEmptyState, ResourceErrorState, ResourceLoadingState } from "./resource-states";
import { ResourcesService } from "@/lib/services/resources";
import type { ResourceListItem } from "@/lib/types";

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

export function ResourceDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [resource, setResource] = useState<ResourceListItem | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResource() {
      try {
        const nextResource = await ResourcesService.getResourceById(id);

        if (!isActive) {
          return;
        }

        setResource(nextResource);

        if (!nextResource) {
          setSignedUrl(null);
          setError(null);
          return;
        }

        const nextSignedUrl = await ResourcesService.createResourceSignedUrl(nextResource);

        if (!isActive) {
          return;
        }

        setSignedUrl(nextSignedUrl);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "An unexpected error occurred while loading this resource.",
        );
        setResource(null);
        setSignedUrl(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadResource();

    return () => {
      isActive = false;
    };
  }, [id, reloadKey]);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (!resource) {
    return <ResourceEmptyState label="resource" />;
  }

  const metadata = [
    ["Resource type", resource.resource_type],
    ["Cluster", resource.cluster],
    ["Event", resource.event_name],
    ["Instructional area", resource.instructional_area],
    ["Year", resource.year],
    ["Original filename", resource.original_filename],
    ["Confidence score", resource.confidence_score],
    ["Import notes", resource.import_notes],
  ];

  return (
    <>
      <PageHeader
        actions={
          <>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              href="/resources"
            >
              Review queue
            </Link>
            {signedUrl ? (
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                href={signedUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open PDF in new tab
              </a>
            ) : null}
          </>
        }
        description="Review imported metadata and inspect the stored PDF from Supabase Storage."
        eyebrow="Resource detail"
        title={resource.title}
      />

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Metadata" title="Resource details" />
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">{resource.resource_type}</Badge>
                <Badge tone={resource.approval_status === "pending" ? "amber" : "green"}>
                  {resource.approval_status ?? "No status"}
                </Badge>
              </div>

              <dl className="grid gap-3 text-sm">
                {metadata.map(([label, value]) => (
                  <div className="rounded-lg bg-slate-50 p-3" key={label}>
                    <dt className="font-semibold text-slate-800">{label}</dt>
                    <dd className="mt-1 break-words text-slate-600">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Indicators" title="Performance indicators" />
            {resource.performance_indicators?.length ? (
              <ul className="space-y-2 text-sm text-slate-600">
                {resource.performance_indicators.map((indicator) => (
                  <li className="rounded-lg border border-slate-100 p-3" key={indicator}>
                    {indicator}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                No performance indicators were detected for this resource.
              </p>
            )}
          </Card>
        </div>

        <Card className="min-h-[720px]">
          <CardHeader eyebrow="PDF" title="Document viewer" />
          {signedUrl ? (
            <iframe
              className="h-[640px] w-full rounded-lg border border-slate-200 bg-slate-100"
              src={signedUrl}
              title={resource.title}
            />
          ) : (
            <div className="grid min-h-[640px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">PDF unavailable</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                  This resource does not have a `storage_path` or `file_path` available
                  for signed URL generation.
                </p>
              </div>
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
