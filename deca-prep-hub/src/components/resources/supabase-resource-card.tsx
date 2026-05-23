import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import type { ResourceListItem } from "@/lib/types";

export function SupabaseResourceCard({
  resource,
  actionLabel,
  href,
}: {
  resource: ResourceListItem;
  actionLabel: string;
  href: string;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{resource.cluster ?? "Unassigned cluster"}</Badge>
        <Badge>{resource.year ?? "Year TBD"}</Badge>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{resource.title}</h2>
      <p className="mt-1 text-sm font-medium text-slate-500">
        {resource.event_name ?? "Event not assigned"}
      </p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="font-semibold text-slate-800">Instructional area</dt>
          <dd className="mt-1 text-slate-600">
            {resource.instructional_area ?? "Not tagged yet"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">Cluster</dt>
          <dd className="mt-1 text-slate-600">{resource.cluster ?? "Not assigned"}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-500">
          {resource.resource_type === "roleplay" ? "Roleplay" : "Exam"} resource
        </span>
        <ButtonLink href={href}>{actionLabel}</ButtonLink>
      </div>
    </article>
  );
}
