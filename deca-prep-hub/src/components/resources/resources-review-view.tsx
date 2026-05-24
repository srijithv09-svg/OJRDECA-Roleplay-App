"use client";

import { useState } from "react";
import { ResourceGrid } from "./resource-grid";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

const statuses = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
] as const;

export function ResourcesReviewView() {
  const [approvalStatus, setApprovalStatus] = useState<(typeof statuses)[number]["value"]>(
    "pending",
  );

  return (
    <>
      <PageHeader
        description="Development review queue for imported Supabase resources before they become visible on student-facing pages."
        eyebrow="Admin development"
        title="Resources"
      />

      <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60">
        {statuses.map((status) => (
          <button
            className={cn(
              "min-h-9 rounded-md px-4 text-sm font-semibold transition",
              approvalStatus === status.value
                ? "bg-blue-700 text-white"
                : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
            )}
            key={status.value}
            onClick={() => setApprovalStatus(status.value)}
            type="button"
          >
            {status.label}
          </button>
        ))}
      </div>

      <ResourceGrid
        actionLabel="Review resource"
        approvalStatus={approvalStatus}
        emptyLabel={`${approvalStatus} resources`}
      />
    </>
  );
}
