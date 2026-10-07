import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ReferencePage() {
  return (
    <>
      <PageHeader
        title="Reference"
        description="Performance indicators, cluster guides, exam blueprints, and supporting documents."
      />
      <ApprovedResourceLibraryView
        emptyLabel="reference documents"
        mode="reference"
      />
    </>
  );
}
