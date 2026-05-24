import { FiltersPanel } from "@/components/resources/filters-panel";
import { ResourceGrid } from "@/components/resources/resource-grid";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";

const roleplayFilters = [
  {
    label: "Cluster",
    options: ["Marketing", "Finance", "Hospitality", "Management", "Entrepreneurship"],
  },
  {
    label: "Event",
    options: ["Principles", "Series", "Team Decision Making", "Consulting"],
  },
  {
    label: "Instructional area",
    options: ["Customer Relations", "Operations", "Business Growth", "Information Management"],
  },
  {
    label: "Difficulty",
    options: ["Intro", "Standard", "Advanced"],
  },
  {
    label: "Year",
    options: ["2025", "2024", "2023"],
  },
];

export default function RoleplaysPage() {
  return (
    <>
      <PageHeader
        description="Browse approved roleplay resources by cluster, event, instructional area, indicator, difficulty, and year."
        eyebrow="Resource library"
        title="Roleplays"
      />

      <section className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <FiltersPanel filters={roleplayFilters} title="Filters" />
        <div className="space-y-4">
          <SearchField placeholder="Search roleplays, indicators, events..." />
          <ResourceGrid
            actionLabel="Preview PDF"
            emptyLabel="roleplays"
            resourceType="roleplay"
          />
        </div>
      </section>
    </>
  );
}
