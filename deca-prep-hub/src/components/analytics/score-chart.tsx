import { scoreSeries } from "@/lib/placeholder-data";

export function ScoreChart() {
  return (
    <div className="flex h-72 items-end gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
      {scoreSeries.map((point) => (
        <div className="flex h-full flex-1 flex-col justify-end gap-3" key={point.label}>
          <div
            className="min-h-6 rounded-t-md bg-blue-700"
            style={{ height: `${point.score}%` }}
            title={`${point.label}: ${point.score}%`}
          />
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-950">{point.score}%</p>
            <p className="mt-1 text-[11px] text-slate-500">{point.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
