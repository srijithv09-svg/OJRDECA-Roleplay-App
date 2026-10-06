import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ReferencePage() {
  return (
    <>
      <PageHeader
        eyebrow="Chapter library"
        title="Reference"
        description="Find uploaded performance indicators, cluster guides, exam blueprints, and supporting documents. Filter by cluster or search for a topic."
      />
      <ApprovedResourceLibraryView
        emptyLabel="reference documents"
        mode="reference"
      />
    </>
  );
}
