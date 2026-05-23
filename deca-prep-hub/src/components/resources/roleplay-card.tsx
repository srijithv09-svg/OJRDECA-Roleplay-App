import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import type { RoleplayResource } from "@/lib/types";

export function RoleplayCard({ roleplay }: { roleplay: RoleplayResource }) {
  const difficultyTone =
    roleplay.difficulty === "Advanced"
      ? "amber"
      : roleplay.difficulty === "Standard"
        ? "blue"
        : "green";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{roleplay.cluster}</Badge>
        <Badge tone={difficultyTone}>{roleplay.difficulty}</Badge>
        <Badge>{roleplay.year}</Badge>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{roleplay.title}</h2>
      <p className="mt-1 text-sm font-medium text-slate-500">{roleplay.event}</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="font-semibold text-slate-800">Instructional area</dt>
          <dd className="mt-1 text-slate-600">{roleplay.instructionalArea}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">Performance indicator</dt>
          <dd className="mt-1 text-slate-600">{roleplay.performanceIndicator}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-500">{roleplay.duration}</span>
        <ButtonLink href="/roleplays">Preview PDF</ButtonLink>
      </div>
    </article>
  );
}
