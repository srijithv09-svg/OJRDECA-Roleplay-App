"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/services/profiles";
import { ResourcesService } from "@/lib/services/resources";
import type { Profile, ResourceListItem } from "@/lib/types";
import { ResourceEmptyState, ResourceErrorState, ResourceLoadingState } from "./resource-states";

function formatValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return String(value);
}

export function ResourceDetailView() {
  const params = useParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resource, setResource] = useState<ResourceListItem | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlPath, setSignedUrlPath] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResource() {
      try {
        if (!id) {
          throw new Error("Missing resource id.");
        }

        const [nextProfile, nextResource] = await Promise.all([
          getCurrentProfile(),
          ResourcesService.getResourceById(id),
        ]);

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setResource(nextResource);
        setError(null);
        setRepairMessage(null);

        if (!nextResource) {
          setSignedUrl(null);
          setSignedUrlPath(null);
          setPdfError(null);
          return;
        }

        try {
          const pdfLink = await ResourcesService.getResourcePdfLink(nextResource.id);

          if (!isActive) {
            return;
          }

          setSignedUrl(pdfLink.signedUrl);
          setSignedUrlPath(pdfLink.storagePath);
          setPdfError(null);
        } catch (caughtError) {
          if (!isActive) {
            return;
          }

          setSignedUrl(null);
          setSignedUrlPath(nextResource.storage_path);
          setPdfError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to create a signed PDF link.",
          );
        }
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
        setSignedUrlPath(null);
        setPdfError(null);
        setRepairMessage(null);
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
    setPdfError(null);
    setRepairMessage(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  async function repairPdfPath() {
    if (!resource) {
      return;
    }

    setIsRepairing(true);
    setPdfError(null);
    setRepairMessage(null);

    try {
      const result = await ResourcesService.repairResourcePdfPath(resource.id);

      setSignedUrl(result.signedUrl);
      setSignedUrlPath(result.storagePath);
      setResource((current) =>
        current
          ? {
              ...current,
              file_path: result.storagePath,
              storage_path: result.storagePath,
            }
          : current,
      );
      setRepairMessage(
        result.updated
          ? `PDF path repaired: ${result.storagePath}`
          : `PDF path already correct: ${result.storagePath}`,
      );
    } catch (caughtError) {
      setPdfError(
        caughtError instanceof Error ? caughtError.message : "Unable to repair the PDF path.",
      );
    } finally {
      setIsRepairing(false);
    }
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

  const isAdmin = profile?.role === "admin";
  const hasReviewedIndicators =
    resource.performance_indicators_reviewed && resource.performance_indicators?.length;
  const metadata = [
    ["Resource id", resource.id],
    ["Resource type", resource.resource_type],
    ["Cluster", resource.cluster],
    ["Event", resource.event_name],
    ["Instructional area", resource.instructional_area],
    ["Year", resource.year],
    ["Original filename", resource.original_filename],
    ["Storage path", resource.storage_path],
    ["Signed path", signedUrlPath],
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
            {isAdmin ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={isRepairing}
                onClick={repairPdfPath}
                type="button"
              >
                {isRepairing ? "Repairing..." : "Repair PDF Path"}
              </button>
            ) : null}
            {signedUrl ? (
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                href={signedUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open / Download PDF
              </a>
            ) : null}
          </>
        }
        description="Review imported metadata and open the stored PDF from Supabase Storage."
        eyebrow="Resource detail"
        title={resource.title}
      />

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
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

        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="PDF" title="Resource file" />
            {signedUrl ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
                <p className="text-sm font-semibold text-blue-950">PDF link ready</p>
                <p className="mt-2 break-words text-sm leading-6 text-blue-800">
                  {signedUrlPath}
                </p>
                <a
                  className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-md bg-blue-700 px-5 text-base font-semibold text-white transition hover:bg-blue-800 sm:w-auto"
                  href={signedUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open / Download PDF
                </a>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6">
                <h2 className="text-lg font-semibold text-slate-950">PDF link unavailable</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pdfError ?? "No signed URL was generated."}
                </p>
              </div>
            )}
            {repairMessage ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {repairMessage}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader eyebrow="Indicators" title="Performance indicators" />
            {hasReviewedIndicators ? (
              <ul className="space-y-2 text-sm text-slate-600">
                {resource.performance_indicators?.map((indicator) => (
                  <li className="rounded-lg border border-slate-100 p-3" key={indicator}>
                    {indicator}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                Performance indicators pending review
              </p>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
