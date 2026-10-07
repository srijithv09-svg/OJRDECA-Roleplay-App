import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ExamsPage() {
  return (
    <>
      <PageHeader
        description="Choose a cluster exam. Enter your answers and review your score."
        title="Exam practice"
      />

      <ApprovedResourceLibraryView emptyLabel="exams" mode="exam" />
    </>
  );
}
