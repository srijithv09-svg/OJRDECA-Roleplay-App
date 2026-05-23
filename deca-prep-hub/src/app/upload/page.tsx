import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const uploadFields: Array<{ label: string; options: string[] }> = [
  { label: "Resource type", options: ["Roleplay", "Exam", "Instructional guide"] },
  { label: "Cluster", options: ["Marketing", "Finance", "Hospitality", "Management"] },
  { label: "Difficulty", options: ["Intro", "Standard", "Advanced"] },
  { label: "Year", options: ["2026", "2025", "2024", "2023"] },
];

export default function UploadPage() {
  return (
    <>
      <PageHeader
        description="Admin-only resource intake UI for future Supabase Storage uploads, scraper imports, and approval workflows."
        eyebrow="Admin tools"
        title="Resource upload"
      />

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader eyebrow="Manual import" title="Upload resource" />
          <form className="grid gap-5">
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Resource title
              <input
                className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Example: Marketing Cluster Exam Set A"
                type="text"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              {uploadFields.map(({ label, options }) => (
                <label className="grid gap-2 text-sm font-semibold text-slate-800" key={label}>
                  {label}
                  <select className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                    {options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Performance indicators
              <textarea
                className="min-h-28 rounded-md border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Paste indicators or notes for future tagging."
              />
            </label>

            <label className="grid min-h-40 place-items-center rounded-lg border border-dashed border-blue-300 bg-blue-50 p-6 text-center">
              <input className="sr-only" type="file" />
              <span className="text-sm font-semibold text-blue-800">Select PDF resource</span>
              <span className="mt-1 text-sm text-blue-700">
                UI only. Storage integration comes later.
              </span>
            </label>

            <button
              className="h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
              type="button"
            >
              Save draft resource
            </button>
          </form>
        </Card>

        <Card>
          <CardHeader eyebrow="Approval queue" title="Future workflow" />
          <div className="space-y-3">
            {[
              "Upload PDF and metadata",
              "Tag by cluster, event, year, and indicator",
              "Mark resource as pending approval",
              "Publish only after admin review",
            ].map((step, index) => (
              <div className="flex gap-3 rounded-lg border border-slate-100 p-3" key={step}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-blue-700 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <p className="text-sm font-medium leading-6 text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
