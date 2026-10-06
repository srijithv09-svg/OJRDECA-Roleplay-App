import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function RoleplaysPage() {
  return (
    <>
      <PageHeader
        description="Choose an uploaded scenario, prepare your response, and save notes or a recording."
        eyebrow="Resource library"
        title="Roleplay practice"
      />

      <ApprovedResourceLibraryView emptyLabel="roleplays" mode="roleplay" />
    </>
  );
}
