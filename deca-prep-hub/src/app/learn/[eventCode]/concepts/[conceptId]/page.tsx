import { LearnConceptView } from "@/components/learn/learn-concept-view";

type PageProps = {
  params: Promise<{ conceptId: string; eventCode: string }>;
};

export default async function LearnConceptPage({ params }: PageProps) {
  const { conceptId, eventCode } = await params;

  return <LearnConceptView conceptId={conceptId} eventCode={eventCode} />;
}
