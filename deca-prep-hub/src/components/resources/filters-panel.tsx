import { clusters } from "@/lib/placeholder-data";

export function FiltersPanel({
  title,
  filters,
}: {
  title: string;
  filters?: Array<{ label: string; options: string[] }>;
}) {
  const filterGroups =
    filters ??
    [
      { label: "Cluster", options: clusters },
      { label: "Difficulty", options: ["Intro", "Standard", "Advanced"] },
      { label: "Year", options: ["2026", "2025", "2024", "2023"] },
    ];

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-5 space-y-5">
        {filterGroups.map((group) => (
          <fieldset key={group.label}>
            <legend className="text-sm font-semibold text-slate-800">{group.label}</legend>
            <div className="mt-3 space-y-2">
              {group.options.map((option) => (
                <label className="flex items-center gap-3 text-sm text-slate-600" key={option}>
                  <input
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    type="checkbox"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </aside>
  );
}
