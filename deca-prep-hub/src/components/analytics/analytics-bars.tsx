import { cn } from "@/lib/utils";

export function AnalyticsBars({
  items,
  tone = "blue",
}: {
  items: Array<{ label: string; score: number }>;
  tone?: "blue" | "green" | "amber";
}) {
  const barColor =
    tone === "green" ? "bg-emerald-600" : tone === "amber" ? "bg-amber-500" : "bg-blue-700";

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-2 flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-950">{item.score}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className={cn("h-2 rounded-full", barColor)}
              style={{ width: `${item.score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
