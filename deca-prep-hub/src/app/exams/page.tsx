import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ExamsPage() {
  return (
    <>
      <PageHeader
        description="Find approved cluster exams by year and category."
        eyebrow="Exam library"
        title="Cluster exams"
      />

      <ApprovedResourceLibraryView emptyLabel="exams" mode="exam" />
    </>
  );
}
