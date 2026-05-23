import { CountdownCard } from "@/components/calendar/countdown-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { countdowns, upcomingEvents } from "@/lib/placeholder-data";

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        description="Keep district, state, ICDC, and chapter deadlines visible while students plan practice sessions."
        eyebrow="DECA calendar"
        title="Competition timeline"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {countdowns.map((countdown) => (
          <CountdownCard key={countdown.label} {...countdown} />
        ))}
      </section>

      <Card>
        <CardHeader eyebrow="Schedule" title="Upcoming events" />
        <div className="divide-y divide-slate-100">
          {upcomingEvents.map((event) => (
            <div
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              key={event.title}
            >
              <div>
                <p className="font-semibold text-slate-950">{event.title}</p>
                <p className="mt-1 text-sm text-slate-500">{event.date}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={event.type === "Deadline" ? "amber" : "blue"}>{event.type}</Badge>
                <Badge>{event.daysAway} days away</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
