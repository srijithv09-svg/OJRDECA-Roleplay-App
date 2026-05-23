import { AnalyticsBars } from "@/components/analytics/analytics-bars";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { recentActivity, upcomingEvents, weakAreas } from "@/lib/placeholder-data";

export function DashboardView() {
  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href="/roleplays" variant="primary">
              Practice roleplays
            </ButtonLink>
            <ButtonLink href="/exams">Open exams</ButtonLink>
          </>
        }
        description="Track preparation, find approved resources, and keep the next conference milestone visible."
        eyebrow="Student dashboard"
        title="Welcome back, Student Member"
      />

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="!border-blue-800 !bg-blue-700 !text-white">
          <p className="text-sm font-semibold text-blue-100">Current focus</p>
          <h2 className="mt-3 text-3xl font-bold">Marketing cluster exam readiness</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">
            Your recent practice shows strong customer relations work. Spend the next
            session on pricing strategy and financial analysis to lift your weakest
            indicators before the district benchmark.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["82%", "Average score"],
              ["14", "Resources reviewed"],
              ["6", "Day streak"],
            ].map(([value, label]) => (
              <div className="rounded-lg bg-white/10 p-4 ring-1 ring-white/20" key={label}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="mt-1 text-xs font-medium text-blue-100">{label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Countdown" title="Upcoming events" />
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <div
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 p-3"
                key={event.title}
              >
                <div>
                  <p className="font-semibold text-slate-950">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{event.date}</p>
                </div>
                <Badge tone={event.type === "Deadline" ? "amber" : "blue"}>
                  {event.daysAway} days
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader eyebrow="Streak" title="Study streak" />
          <p className="text-4xl font-bold text-blue-700">6 days</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You are one session away from matching your best practice week.
          </p>
        </Card>

        <Card>
          <CardHeader eyebrow="Activity" title="Recent activity" />
          <div className="space-y-3">
            {recentActivity.slice(0, 2).map((activity) => (
              <div key={activity.detail}>
                <p className="text-sm font-semibold text-slate-950">{activity.action}</p>
                <p className="text-sm text-slate-500">{activity.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader eyebrow="Needs work" title="Weak instructional areas" />
          <AnalyticsBars items={weakAreas} tone="amber" />
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "Run a roleplay round",
            description: "Open a case, time your prep, and rehearse a judge conversation.",
            href: "/roleplays",
          },
          {
            title: "Take a cluster exam",
            description: "Use a placeholder exam card as the future launch point for testing.",
            href: "/exams",
          },
          {
            title: "Review progress",
            description: "Scan score trends and choose your next practice target.",
            href: "/analytics",
          },
        ].map((action) => (
          <Card key={action.title}>
            <h2 className="text-lg font-semibold text-slate-950">{action.title}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
              {action.description}
            </p>
            <ButtonLink className="mt-5" href={action.href}>
              Open
            </ButtonLink>
          </Card>
        ))}
      </section>
    </>
  );
}
