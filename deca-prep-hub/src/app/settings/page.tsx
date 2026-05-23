import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        description="Frontend-only settings scaffold for profile, chapter membership, notifications, and integration readiness."
        eyebrow="Account"
        title="Settings"
      />

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Profile" title="Student profile" />
          <div className="grid gap-4">
            {[
              ["Name", "Student Member"],
              ["Email", "student@example.com"],
              ["Chapter", "Oak Junction Ridge DECA"],
              ["Primary cluster", "Marketing"],
            ].map(([label, value]) => (
              <label className="grid gap-2 text-sm font-semibold text-slate-800" key={label}>
                {label}
                <input
                  className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  defaultValue={value}
                  type="text"
                />
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Roadmap" title="Integration status" />
          <div className="space-y-3">
            {[
              ["Google authentication", "Planned"],
              ["Supabase profiles", "Planned"],
              ["Resource approvals", "UI ready"],
              ["OpenAI feedback", "Future"],
            ].map(([label, status]) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
                key={label}
              >
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <Badge tone={status === "UI ready" ? "green" : "blue"}>{status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
