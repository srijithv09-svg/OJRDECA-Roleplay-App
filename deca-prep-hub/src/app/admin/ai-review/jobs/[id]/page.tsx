import { AiReviewView } from "@/components/admin/ai-review-view";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminAiReviewJobPage({ params }: PageProps) {
  const { id } = await params;

  return <AiReviewView jobId={id} mode="jobs" />;
}
