import { ApprovedResourceLibraryView } from "@/components/resources/approved-resource-library-view";
import { PageHeader } from "@/components/ui/page-header";

export default function RoleplaysPage() {
  return (
    <>
      <PageHeader
        description="Choose a scenario, prepare your response, and save notes or a recording."
        title="Roleplay practice"
      />

      <ApprovedResourceLibraryView emptyLabel="roleplays" mode="roleplay" />
    </>
  );
}
