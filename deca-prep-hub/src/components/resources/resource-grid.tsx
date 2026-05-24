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
  approvalStatus = "approved",
}: {
  resourceType?: SupabaseResourceType;
  emptyLabel: string;
  actionLabel: string;
  approvalStatus?: string;
}) {
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadResources() {
      try {
        const nextResources = await ResourcesService.listResources({
          approvalStatus,
          resourceType,
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
  }, [approvalStatus, reloadKey, resourceType]);

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
          key={resource.id}
          resource={resource}
        />
      ))}
    </div>
  );
}
