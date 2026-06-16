import { LearnKeySetView } from "@/components/learn/learn-key-set-view";

type PageProps = {
  params: Promise<{ eventCode: string; keySetId: string }>;
};

export default async function LearnKeySetPage({ params }: PageProps) {
  const { eventCode, keySetId } = await params;

  return <LearnKeySetView eventCode={eventCode} keySetId={keySetId} />;
}
