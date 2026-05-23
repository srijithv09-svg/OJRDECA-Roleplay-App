import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import type { ExamResource } from "@/lib/types";

export function ExamCard({ exam }: { exam: ExamResource }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{exam.cluster}</Badge>
        <Badge tone={exam.status === "Approved" ? "green" : "amber"}>{exam.status}</Badge>
        <Badge>{exam.year}</Badge>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">{exam.title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-2xl font-bold text-slate-950">{exam.questionCount}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Questions</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-2xl font-bold text-slate-950">{exam.averageScore}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Avg score</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href="/exams" variant="primary">
          View exam
        </ButtonLink>
        <ButtonLink href="/exams">Download</ButtonLink>
      </div>
    </article>
  );
}
