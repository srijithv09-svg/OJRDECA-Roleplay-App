import { AnalyticsBars } from "@/components/analytics/analytics-bars";
import { ScoreChart } from "@/components/analytics/score-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { strengths, weakAreas } from "@/lib/placeholder-data";

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        description="A frontend analytics scaffold for scores, progress trends, weak areas, strong areas, and future recommendations."
        eyebrow="Progress tracking"
        title="Analytics"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["82%", "Average score", "green"],
          ["9", "Practice exams", "blue"],
          ["18", "Roleplays reviewed", "blue"],
          ["+14%", "Score growth", "green"],
        ].map(([value, label, tone]) => (
          <Card key={label}>
            <Badge tone={tone as "blue" | "green"}>Current</Badge>
            <p className="mt-5 text-4xl font-bold text-slate-950">{value}</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">{label}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader eyebrow="Trend" title="Progress chart placeholder" />
          <ScoreChart />
        </Card>

        <Card>
          <CardHeader eyebrow="Recommendations" title="Next best resources" />
          <div className="space-y-3">
            {[
              "Pricing Strategy practice roleplay",
              "Finance Cluster Exam District Prep",
              "Operations Management indicator review",
            ].map((item) => (
              <div className="rounded-lg border border-slate-100 p-3" key={item}>
                <p className="text-sm font-semibold text-slate-950">{item}</p>
                <p className="mt-1 text-sm text-slate-500">Recommended from weak area trends.</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Strengths" title="Strong instructional areas" />
          <AnalyticsBars items={strengths} tone="green" />
        </Card>
        <Card>
          <CardHeader eyebrow="Weaknesses" title="Weak instructional areas" />
          <AnalyticsBars items={weakAreas} tone="amber" />
        </Card>
      </section>
    </>
  );
}
