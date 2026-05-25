import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function RoleplaysPage() {
  return (
    <>
      <PageHeader
        description="Browse approved roleplay resources by cluster, event, instructional area, indicator, difficulty, and year."
        eyebrow="Resource library"
        title="Roleplays"
      />

      <ApprovedResourceLibraryView emptyLabel="roleplays" mode="roleplay" />
    </>
  );
}
