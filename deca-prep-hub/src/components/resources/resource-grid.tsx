"use client";

import { useEffect, useState } from "react";
import { ResourceEmptyState, ResourceErrorState, ResourceLoadingState } from "./resource-states";
import { SupabaseResourceCard } from "./supabase-resource-card";
import { ResourcesService } from "@/lib/services/resources";
import type { ResourceListItem, SupabaseResourceType } from "@/lib/types";

export function ResourceGrid({
  resourceType,
  emptyLabel,
  actionLabel,
  href,
}: {
  resourceType: SupabaseResourceType;
  emptyLabel: string;
  actionLabel: string;
  href: string;
}) {
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResources() {
      try {
        const nextResources =
          resourceType === "roleplay"
            ? await ResourcesService.listApprovedRoleplays()
            : await ResourcesService.listApprovedExams();

        if (!isActive) {
          return;
        }

        console.log(`[ResourceGrid] Renderable ${resourceType} resources:`, nextResources);
        setResources(nextResources);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        console.error(`[ResourceGrid] Failed to load ${resourceType} resources:`, caughtError);
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
  }, [reloadKey, resourceType]);

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

  if (resources.length === 0) {
    return <ResourceEmptyState label={emptyLabel} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {resources.map((resource) => (
        <SupabaseResourceCard
          actionLabel={actionLabel}
          href={href}
          key={resource.id}
          resource={resource}
        />
      ))}
    </div>
  );
}
