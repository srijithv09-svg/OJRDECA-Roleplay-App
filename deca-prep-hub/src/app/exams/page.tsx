import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ExamsPage() {
  return (
    <>
      <PageHeader
        description="Practice with uploaded cluster exams and review your results against saved answer keys."
        eyebrow="Exam library"
        title="Exam practice"
      />

      <ApprovedResourceLibraryView emptyLabel="exams" mode="exam" />
    </>
  );
}
