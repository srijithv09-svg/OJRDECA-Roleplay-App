import { LearnEventView } from "@/components/learn/learn-event-view";

type PageProps = {
  params: Promise<{ eventCode: string }>;
};

export default async function LearnEventPage({ params }: PageProps) {
  const { eventCode } = await params;

  return <LearnEventView eventCode={eventCode} />;
}
