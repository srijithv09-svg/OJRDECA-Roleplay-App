import { ExamCard } from "@/components/resources/exam-card";
import { FiltersPanel } from "@/components/resources/filters-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { clusters, examResources } from "@/lib/placeholder-data";

export default function ExamsPage() {
  return (
    <>
      <PageHeader
        description="Find cluster exams by year and category. These static cards are ready to connect to approved Supabase resources later."
        eyebrow="Exam library"
        title="Cluster exams"
      />

      <section className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <FiltersPanel
          filters={[
            { label: "Cluster", options: clusters },
            { label: "Year", options: ["2025", "2024", "2023", "2022"] },
            { label: "Status", options: ["Approved", "Review-ready"] },
          ]}
          title="Cluster filters"
        />
        <div className="space-y-4">
          <SearchField placeholder="Search exams, clusters, years..." />
          <div className="grid gap-4 xl:grid-cols-2">
            {examResources.map((exam) => (
              <ExamCard exam={exam} key={exam.id} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
