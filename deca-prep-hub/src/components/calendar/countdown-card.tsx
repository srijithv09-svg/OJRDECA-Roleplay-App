import { Badge } from "@/components/ui/badge";

export function CountdownCard({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: string;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">{label}</h2>
        <Badge tone={value < 30 ? "amber" : "blue"}>{target}</Badge>
      </div>
      <p className="mt-5 text-4xl font-bold text-blue-700">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">days remaining</p>
    </article>
  );
}
