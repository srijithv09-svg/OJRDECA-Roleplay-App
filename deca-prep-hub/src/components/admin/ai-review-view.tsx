"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { isAdminRole } from "@/lib/auth";
import {
  AiReviewService,
  stringifyJson,
  type AiReviewData,
  type AnswerKeyReviewUpdate,
  type QuestionReviewUpdate,
  type RoleplayReviewUpdate,
  type RubricReviewUpdate,
} from "@/lib/services/ai-review";
import { getCurrentProfile } from "@/lib/services/profiles";
import type {
  AiExtractedAnswerKey,
  AiExtractionJob,
  Concept,
  DecaEvent,
  Profile,
  ReviewableContentStatus,
  RoleplayScenario,
  Rubric,
  RubricCriterion,
  StructuredQuestion,
} from "@/lib/types";

type AiReviewMode = "answer-keys" | "jobs" | "overview" | "questions" | "roleplays" | "rubrics";
type EditableItem =
  | { kind: "answer_key"; value: AiExtractedAnswerKey }
  | { kind: "question"; value: StructuredQuestion }
  | { kind: "roleplay"; value: RoleplayScenario }
  | { criteria: RubricCriterion[]; kind: "rubric"; value: Rubric };

const statusOptions: Array<"all" | ReviewableContentStatus> = [
  "all",
  "needs_review",
  "draft",
  "approved",
  "rejected",
  "archived",
];
const jobStatusOptions: Array<"all" | AiExtractionJob["status"]> = [
  "all",
  "processing",
  "completed",
  "needs_review",
  "failed",
  "approved",
  "rejected",
];
const jobTypeOptions: Array<"all" | AiExtractionJob["job_type"]> = [
  "all",
  "resource_classification",
  "exam_extraction",
  "answer_key_extraction",
  "roleplay_extraction",
  "rubric_extraction",
  "concept_feedback",
  "roleplay_transcript_grading",
];
const reviewLinks = [
  { href: "/admin/ai-review", label: "Jobs" },
  { href: "/admin/ai-review/questions", label: "Questions" },
  { href: "/admin/ai-review/answer-keys", label: "Answer keys" },
  { href: "/admin/ai-review/roleplays", label: "Roleplays" },
  { href: "/admin/ai-review/rubrics", label: "Rubrics" },
];

function getStatusTone(status?: string | null) {
  if (status === "approved" || status === "completed") return "green";
  if (status === "needs_review" || status === "processing" || status === "draft") return "amber";
  if (status === "failed" || status === "rejected") return "slate";
  return "blue";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function formatPercent(value?: number | null) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Not available";
}

function resourceLabel(resources: AiReviewData["resources"], id?: string | null) {
  const resource = resources.find((item) => item.id === id);
  return resource?.title ?? resource?.original_filename ?? "Unknown resource";
}

function eventLabel(events: DecaEvent[], id?: string | null) {
  const event = events.find((item) => item.id === id);
  return event ? `${event.code} - ${event.name}` : "No event";
}

function conceptLabel(concepts: Concept[], id?: string | null) {
  return concepts.find((concept) => concept.id === id)?.name ?? "No concept";
}

function filterByStatus<T extends { status: string | null }>(rows: T[], status: string) {
  return status === "all" ? rows : rows.filter((row) => row.status === status);
}

function parseJsonField(value: string, label: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

export function AiReviewView({ jobId, mode = "overview" }: { jobId?: string; mode?: AiReviewMode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<AiReviewData | null>(null);
  const [editingItem, setEditingItem] = useState<EditableItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const nextProfile = await getCurrentProfile();

        if (!isActive) return;
        setProfile(nextProfile);

        if (!isAdminRole(nextProfile?.role)) {
          setData(null);
          setError(null);
          return;
        }

        const nextData = await AiReviewService.getAiReviewData();

        if (!isActive) return;
        setData(nextData);
        setError(null);
      } catch (caughtError) {
        if (!isActive) return;
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load AI review.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const normalizedSearch = search.trim().toLowerCase();
  const selectedJob = useMemo(
    () => data?.jobs.find((job) => job.id === jobId) ?? null,
    [data?.jobs, jobId],
  );
  const resources = useMemo(() => data?.resources ?? [], [data?.resources]);
  const filteredJobs = useMemo(() => {
    const jobs = data?.jobs ?? [];

    return jobs.filter((job) => {
      const matchesStatus = jobStatusFilter === "all" || job.status === jobStatusFilter;
      const matchesType = jobTypeFilter === "all" || job.job_type === jobTypeFilter;
      const matchesResource = resourceFilter === "all" || job.resource_id === resourceFilter;
      const matchesSearch =
        !normalizedSearch ||
        [job.job_type, job.status, job.error_message, resourceLabel(resources, job.resource_id)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesType && matchesResource && matchesSearch;
    });
  }, [data?.jobs, jobStatusFilter, jobTypeFilter, normalizedSearch, resourceFilter, resources]);

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }

  async function saveQuestion(id: string, updates: QuestionReviewUpdate) {
    setIsSaving(true);
    setError(null);

    try {
      await AiReviewService.updateExtractedQuestion(id, updates);
      setEditingItem(null);
      retryLoad();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update question.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveRoleplay(id: string, updates: RoleplayReviewUpdate) {
    setIsSaving(true);
    setError(null);

    try {
      await AiReviewService.updateExtractedRoleplayScenario(id, updates);
      setEditingItem(null);
      retryLoad();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update roleplay.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAnswerKey(id: string, updates: AnswerKeyReviewUpdate) {
    setIsSaving(true);
    setError(null);

    try {
      await AiReviewService.updateExtractedAnswerKey(id, updates);
      setEditingItem(null);
      retryLoad();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update answer key.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveRubric(id: string, updates: RubricReviewUpdate) {
    setIsSaving(true);
    setError(null);

    try {
      await AiReviewService.updateRubric(id, updates);
      setEditingItem(null);
      retryLoad();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update rubric.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <ResourceLoadingState />;

  if (!isAdminRole(profile?.role)) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Admin only</p>
        <h1 className="mt-2 text-2xl font-bold text-red-950">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          You must be an admin or advisor to review AI-extracted content.
        </p>
      </Card>
    );
  }

  if (!data) {
    return <ResourceErrorState message={error ?? "Unable to load AI review data."} onRetry={retryLoad} />;
  }

  const pendingQuestions = data.questions.filter((question) => question.status === "needs_review").length;
  const pendingRoleplays = data.roleplays.filter((roleplay) => roleplay.status === "needs_review").length;
  const pendingAnswerKeys = data.answerKeys.filter((key) => key.status === "needs_review").length;
  const pendingRubrics = data.rubrics.filter((rubric) => rubric.status === "needs_review").length;

  return (
    <>
      <PageHeader
        description="Review Gemini extraction jobs and approve, reject, archive, or edit draft AI content before student use."
        eyebrow="Admin"
        title="AI Review"
      />

      <ReviewNavigation activeMode={mode} />
      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}

      {mode === "overview" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total jobs" value={data.jobs.length} />
            <MetricCard label="Jobs needing review" value={data.jobs.filter((job) => job.status === "needs_review").length} />
            <MetricCard label="Failed jobs" value={data.jobs.filter((job) => job.status === "failed").length} />
            <MetricCard label="Completed jobs" value={data.jobs.filter((job) => job.status === "completed").length} />
            <MetricCard label="Questions to review" value={pendingQuestions} />
            <MetricCard label="Answer keys to review" value={pendingAnswerKeys} />
            <MetricCard label="Roleplays to review" value={pendingRoleplays} />
            <MetricCard label="Rubrics to review" value={pendingRubrics} />
          </div>
          <JobFilters
            jobStatusFilter={jobStatusFilter}
            jobTypeFilter={jobTypeFilter}
            onJobStatusFilterChange={setJobStatusFilter}
            onJobTypeFilterChange={setJobTypeFilter}
            onResourceFilterChange={setResourceFilter}
            onSearchChange={setSearch}
            resourceFilter={resourceFilter}
            resources={resources}
            search={search}
          />
          <JobList jobs={filteredJobs} resources={resources} />
        </>
      ) : null}

      {mode === "jobs" ? (
        <JobDetail
          answerKeys={data.answerKeys}
          job={selectedJob}
          questions={data.questions}
          resources={resources}
          roleplays={data.roleplays}
          rubricCriteria={data.rubricCriteria}
          rubrics={data.rubrics}
        />
      ) : null}

      {mode === "questions" ? (
        <QuestionReviewSection
          concepts={data.concepts}
          events={data.events}
          onEdit={(question) => setEditingItem({ kind: "question", value: question })}
          questions={filterByStatus(data.questions, statusFilter)}
          resources={resources}
          setStatusFilter={setStatusFilter}
          statusFilter={statusFilter}
        />
      ) : null}

      {mode === "roleplays" ? (
        <RoleplayReviewSection
          events={data.events}
          onEdit={(roleplay) => setEditingItem({ kind: "roleplay", value: roleplay })}
          resources={resources}
          roleplays={filterByStatus(data.roleplays, statusFilter)}
          setStatusFilter={setStatusFilter}
          statusFilter={statusFilter}
        />
      ) : null}

      {mode === "answer-keys" ? (
        <AnswerKeyReviewSection
          answerKeys={filterByStatus(data.answerKeys, statusFilter)}
          onEdit={(answerKey) => setEditingItem({ kind: "answer_key", value: answerKey })}
          resources={resources}
          setStatusFilter={setStatusFilter}
          statusFilter={statusFilter}
        />
      ) : null}

      {mode === "rubrics" ? (
        <RubricReviewSection
          events={data.events}
          onEdit={(rubric) =>
            setEditingItem({
              criteria: data.rubricCriteria.filter((criterion) => criterion.rubric_id === rubric.id),
              kind: "rubric",
              value: rubric,
            })
          }
          resources={resources}
          rubricCriteria={data.rubricCriteria}
          rubrics={filterByStatus(data.rubrics, statusFilter)}
          setStatusFilter={setStatusFilter}
          statusFilter={statusFilter}
        />
      ) : null}

      {editingItem ? (
        <ReviewEditorModal
          concepts={data.concepts}
          editingItem={editingItem}
          events={data.events}
          isSaving={isSaving}
          onClose={() => setEditingItem(null)}
          onSaveAnswerKey={saveAnswerKey}
          onSaveQuestion={saveQuestion}
          onSaveRoleplay={saveRoleplay}
          onSaveRubric={saveRubric}
          resources={resources}
        />
      ) : null}
    </>
  );
}

function ReviewNavigation({ activeMode }: { activeMode: AiReviewMode }) {
  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        {reviewLinks.map((link) => {
          const isActive =
            (activeMode === "overview" && link.href === "/admin/ai-review") ||
            link.href.endsWith(activeMode);

          return (
            <Link
              className={
                isActive
                  ? "min-h-10 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
                  : "min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              }
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </Card>
  );
}

function ReviewStatusFilter({
  setStatusFilter,
  statusFilter,
}: {
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  return (
    <Card>
      <label className="grid max-w-xs gap-2 text-sm font-semibold text-slate-800">
        Status
        <select
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
    </Card>
  );
}

function JobFilters({
  jobStatusFilter,
  jobTypeFilter,
  onJobStatusFilterChange,
  onJobTypeFilterChange,
  onResourceFilterChange,
  onSearchChange,
  resourceFilter,
  resources,
  search,
}: {
  jobStatusFilter: string;
  jobTypeFilter: string;
  onJobStatusFilterChange: (value: string) => void;
  onJobTypeFilterChange: (value: string) => void;
  onResourceFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  resourceFilter: string;
  resources: AiReviewData["resources"];
  search: string;
}) {
  return (
    <Card>
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          Search
          <input
            className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search jobs, resources, errors..."
            value={search}
          />
        </label>
        <SelectField label="Job status" onChange={onJobStatusFilterChange} options={jobStatusOptions} value={jobStatusFilter} />
        <SelectField label="Job type" onChange={onJobTypeFilterChange} options={jobTypeOptions} value={jobTypeFilter} />
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          Resource
          <select
            className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => onResourceFilterChange(event.target.value)}
            value={resourceFilter}
          >
            <option value="all">all</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.title}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <select
        className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function JobList({ jobs, resources }: { jobs: AiExtractionJob[]; resources: AiReviewData["resources"] }) {
  if (jobs.length === 0) {
    return <EmptyCard message="No AI extraction jobs match the current filters." title="No jobs found" />;
  }

  return (
    <div className="grid gap-4">
      {jobs.map((job) => (
        <Card key={job.id}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={getStatusTone(job.status)}>{job.status}</Badge>
                <Badge tone="blue">{job.job_type}</Badge>
                <Badge>{formatPercent(job.confidence_score)}</Badge>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">
                {resourceLabel(resources, job.resource_id)}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Created {formatDate(job.created_at)} · Completed {formatDate(job.completed_at)}
              </p>
              {job.error_message ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {job.error_message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                href={`/admin/ai-review/jobs/${job.id}`}
              >
                Job detail
              </Link>
              {job.job_type === "exam_extraction" ? <ReviewLink href="/admin/ai-review/questions" /> : null}
              {job.job_type === "answer_key_extraction" ? <ReviewLink href="/admin/ai-review/answer-keys" /> : null}
              {job.job_type === "roleplay_extraction" ? <ReviewLink href="/admin/ai-review/roleplays" /> : null}
              {job.job_type === "rubric_extraction" ? <ReviewLink href="/admin/ai-review/rubrics" /> : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ReviewLink({ href }: { href: string }) {
  return (
    <Link
      className="min-h-10 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
      href={href}
    >
      Review content
    </Link>
  );
}

function JobDetail({
  answerKeys,
  job,
  questions,
  resources,
  roleplays,
  rubricCriteria,
  rubrics,
}: {
  answerKeys: AiExtractedAnswerKey[];
  job: AiExtractionJob | null;
  questions: StructuredQuestion[];
  resources: AiReviewData["resources"];
  roleplays: RoleplayScenario[];
  rubricCriteria: RubricCriterion[];
  rubrics: Rubric[];
}) {
  if (!job) return <EmptyCard message="This job was not found or is no longer available." title="Job not found" />;

  const linkedQuestions = questions.filter((question) => question.source_resource_id === job.resource_id);
  const linkedRoleplays = roleplays.filter((roleplay) => roleplay.resource_id === job.resource_id);
  const linkedAnswerKeys = answerKeys.filter((key) => key.ai_extraction_job_id === job.id);
  const linkedRubrics = rubrics.filter((rubric) => rubric.ai_extraction_job_id === job.id);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader eyebrow="Extraction job" title={job.job_type} />
        <div className="flex flex-wrap gap-2">
          <Badge tone={getStatusTone(job.status)}>{job.status}</Badge>
          <Badge>{formatPercent(job.confidence_score)}</Badge>
          <Badge>{resourceLabel(resources, job.resource_id)}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          <Detail label="Created" value={formatDate(job.created_at)} />
          <Detail label="Completed" value={formatDate(job.completed_at)} />
          <Detail label="Model" value={job.model ?? "Not available"} />
          <Detail label="Storage path" value={job.input_storage_path ?? "Not available"} />
        </dl>
        {job.error_message ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {job.error_message}
          </p>
        ) : null}
      </Card>
      <Card>
        <CardHeader eyebrow="Linked records" title="Extracted content" />
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Questions" value={linkedQuestions.length} />
          <MetricCard label="Answer keys" value={linkedAnswerKeys.length} />
          <MetricCard label="Roleplays" value={linkedRoleplays.length} />
          <MetricCard label="Rubrics" value={linkedRubrics.length} />
        </div>
        {linkedRubrics.length > 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Rubric criteria:{" "}
            {rubricCriteria.filter((criterion) => linkedRubrics.some((rubric) => rubric.id === criterion.rubric_id)).length}
          </p>
        ) : null}
      </Card>
      <JsonDetails label="Validated output JSON" value={job.validated_output_json} />
      <JsonDetails label="Raw output JSON" value={job.raw_output_json} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <dt className="font-semibold text-slate-800">{label}</dt>
      <dd className="mt-1 break-words text-slate-600">{value}</dd>
    </div>
  );
}

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{label}</summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-50">
          {JSON.stringify(value ?? null, null, 2)}
        </pre>
      </details>
    </Card>
  );
}

function EmptyCard({ message, title }: { message: string; title: string }) {
  return (
    <Card className="grid min-h-52 place-items-center text-center">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      </div>
    </Card>
  );
}

function QuestionReviewSection({
  concepts,
  events,
  onEdit,
  questions,
  resources,
  setStatusFilter,
  statusFilter,
}: {
  concepts: Concept[];
  events: DecaEvent[];
  onEdit: (question: StructuredQuestion) => void;
  questions: StructuredQuestion[];
  resources: AiReviewData["resources"];
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <ReviewStatusFilter setStatusFilter={setStatusFilter} statusFilter={statusFilter} />
      {questions.length === 0 ? <EmptyCard message="No extracted questions match this status." title="No questions found" /> : null}
      <div className="grid gap-4">
        {questions.map((question) => (
          <Card key={question.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={getStatusTone(question.status)}>{question.status}</Badge>
                  <Badge tone="blue">AI-extracted</Badge>
                  {question.admin_reviewed ? <Badge tone="green">Admin Reviewed</Badge> : <Badge>Needs Review</Badge>}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">{question.prompt}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {resourceLabel(resources, question.source_resource_id)} · {eventLabel(events, question.event_id)} · {conceptLabel(concepts, question.concept_id)}
                </p>
              </div>
              <button className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white" onClick={() => onEdit(question)} type="button">
                Review
              </button>
            </div>
            <pre className="mt-4 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {stringifyJson(question.choices)}
            </pre>
          </Card>
        ))}
      </div>
    </>
  );
}

function RoleplayReviewSection({
  events,
  onEdit,
  resources,
  roleplays,
  setStatusFilter,
  statusFilter,
}: {
  events: DecaEvent[];
  onEdit: (roleplay: RoleplayScenario) => void;
  resources: AiReviewData["resources"];
  roleplays: RoleplayScenario[];
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <ReviewStatusFilter setStatusFilter={setStatusFilter} statusFilter={statusFilter} />
      {roleplays.length === 0 ? <EmptyCard message="No extracted roleplays match this status." title="No roleplays found" /> : null}
      <div className="grid gap-4">
        {roleplays.map((roleplay) => (
          <Card key={roleplay.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={getStatusTone(roleplay.status)}>{roleplay.status}</Badge>
                  <Badge tone="blue">AI-extracted</Badge>
                  {roleplay.admin_reviewed ? <Badge tone="green">Admin Reviewed</Badge> : <Badge>Needs Review</Badge>}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">{roleplay.title ?? "Untitled roleplay"}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {resourceLabel(resources, roleplay.resource_id)} · {eventLabel(events, roleplay.event_id)}
                </p>
              </div>
              <button className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white" onClick={() => onEdit(roleplay)} type="button">
                Review
              </button>
            </div>
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-700">{roleplay.scenario_text ?? "No scenario text"}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

function AnswerKeyReviewSection({
  answerKeys,
  onEdit,
  resources,
  setStatusFilter,
  statusFilter,
}: {
  answerKeys: AiExtractedAnswerKey[];
  onEdit: (answerKey: AiExtractedAnswerKey) => void;
  resources: AiReviewData["resources"];
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">
          AI-suggested practice keys are not official exam answer keys until a future explicit conversion/review flow promotes them.
        </p>
      </Card>
      <ReviewStatusFilter setStatusFilter={setStatusFilter} statusFilter={statusFilter} />
      {answerKeys.length === 0 ? <EmptyCard message="No extracted answer keys match this status." title="No answer keys found" /> : null}
      <div className="grid gap-4">
        {answerKeys.map((answerKey) => {
          const answers = Array.isArray(answerKey.answers) ? answerKey.answers : [];

          return (
            <Card key={answerKey.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={getStatusTone(answerKey.status)}>{answerKey.status}</Badge>
                    <Badge tone="amber">Practice Key</Badge>
                    <Badge>Not Official</Badge>
                    {answerKey.admin_reviewed ? <Badge tone="green">Admin Reviewed</Badge> : null}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">{answerKey.title ?? "Untitled answer key"}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {resourceLabel(resources, answerKey.resource_id)} · {answerKey.detected_event_code ?? "No event"} · {answerKey.detected_year ?? "No year"} · {answers.length} answers
                  </p>
                </div>
                <button className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white" onClick={() => onEdit(answerKey)} type="button">
                  Review
                </button>
              </div>
              <pre className="mt-4 max-h-44 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(answers.slice(0, 20), null, 2)}
              </pre>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function RubricReviewSection({
  events,
  onEdit,
  resources,
  rubricCriteria,
  rubrics,
  setStatusFilter,
  statusFilter,
}: {
  events: DecaEvent[];
  onEdit: (rubric: Rubric) => void;
  resources: AiReviewData["resources"];
  rubricCriteria: RubricCriterion[];
  rubrics: Rubric[];
  setStatusFilter: (status: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <ReviewStatusFilter setStatusFilter={setStatusFilter} statusFilter={statusFilter} />
      {rubrics.length === 0 ? <EmptyCard message="No extracted rubrics match this status." title="No rubrics found" /> : null}
      <div className="grid gap-4">
        {rubrics.map((rubric) => {
          const criteria = rubricCriteria.filter((criterion) => criterion.rubric_id === rubric.id);

          return (
            <Card key={rubric.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={getStatusTone(rubric.status)}>{rubric.status}</Badge>
                    <Badge tone="blue">AI-extracted</Badge>
                    {rubric.admin_reviewed ? <Badge tone="green">Admin Reviewed</Badge> : <Badge>Needs Review</Badge>}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">{rubric.title ?? "Untitled rubric"}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {resourceLabel(resources, rubric.resource_id)} · {eventLabel(events, rubric.event_id)} · {criteria.length} criteria
                  </p>
                </div>
                <button className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white" onClick={() => onEdit(rubric)} type="button">
                  Review
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ReviewEditorModal({
  concepts,
  editingItem,
  events,
  isSaving,
  onClose,
  onSaveAnswerKey,
  onSaveQuestion,
  onSaveRoleplay,
  onSaveRubric,
  resources,
}: {
  concepts: Concept[];
  editingItem: EditableItem;
  events: DecaEvent[];
  isSaving: boolean;
  onClose: () => void;
  onSaveAnswerKey: (id: string, updates: AnswerKeyReviewUpdate) => Promise<void>;
  onSaveQuestion: (id: string, updates: QuestionReviewUpdate) => Promise<void>;
  onSaveRoleplay: (id: string, updates: RoleplayReviewUpdate) => Promise<void>;
  onSaveRubric: (id: string, updates: RubricReviewUpdate) => Promise<void>;
  resources: AiReviewData["resources"];
}) {
  const [error, setError] = useState<string | null>(null);

  if (editingItem.kind === "question") {
    return (
      <QuestionEditor
        concepts={concepts}
        error={error}
        events={events}
        isSaving={isSaving}
        onClose={onClose}
        onError={setError}
        onSave={onSaveQuestion}
        question={editingItem.value}
      />
    );
  }

  if (editingItem.kind === "roleplay") {
    return (
      <RoleplayEditor
        error={error}
        events={events}
        isSaving={isSaving}
        onClose={onClose}
        onError={setError}
        onSave={onSaveRoleplay}
        roleplay={editingItem.value}
      />
    );
  }

  if (editingItem.kind === "answer_key") {
    return (
      <AnswerKeyEditor
        answerKey={editingItem.value}
        error={error}
        isSaving={isSaving}
        onClose={onClose}
        onError={setError}
        onSave={onSaveAnswerKey}
        resources={resources}
      />
    );
  }

  return (
    <RubricEditor
      criteria={editingItem.criteria}
      error={error}
      events={events}
      isSaving={isSaving}
      onClose={onClose}
      onError={setError}
      onSave={onSaveRubric}
      rubric={editingItem.value}
    />
  );
}

function ModalShell({
  children,
  error,
  isSaving,
  onClose,
  title,
}: {
  children: React.ReactNode;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Review</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
          </div>
          <button className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
        <fieldset disabled={isSaving}>{children}</fieldset>
      </div>
    </div>
  );
}

function StatusActions({
  onSubmit,
}: {
  onSubmit: (status: ReviewableContentStatus) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      {(["needs_review", "approved", "rejected", "archived"] as ReviewableContentStatus[]).map((status) => (
        <button
          className={
            status === "approved"
              ? "min-h-10 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white"
              : "min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          }
          key={status}
          onClick={() => onSubmit(status)}
          type="button"
        >
          {status === "approved" ? "Approve" : status}
        </button>
      ))}
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const textAreaClass =
  "min-h-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function QuestionEditor({
  concepts,
  error,
  events,
  isSaving,
  onClose,
  onError,
  onSave,
  question,
}: {
  concepts: Concept[];
  error: string | null;
  events: DecaEvent[];
  isSaving: boolean;
  onClose: () => void;
  onError: (error: string | null) => void;
  onSave: (id: string, updates: QuestionReviewUpdate) => Promise<void>;
  question: StructuredQuestion;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [choices, setChoices] = useState(stringifyJson(question.choices));
  const [questionType, setQuestionType] = useState(question.question_type);
  const [ladderStage, setLadderStage] = useState(question.ladder_stage ?? "");
  const [eventId, setEventId] = useState(question.event_id ?? "");
  const [conceptId, setConceptId] = useState(question.concept_id ?? "");
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [difficulty, setDifficulty] = useState(question.difficulty ?? "");

  function submit(status: ReviewableContentStatus) {
    try {
      onError(null);
      void onSave(question.id, {
        choices: parseJsonField(choices, "Choices"),
        concept_id: conceptId || null,
        difficulty: difficulty || null,
        event_id: eventId || null,
        explanation: explanation || null,
        ladder_stage: (ladderStage || null) as QuestionReviewUpdate["ladder_stage"],
        prompt,
        question_type: questionType,
        status,
      });
    } catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : "Unable to save question.");
    }
  }

  return (
    <ModalShell error={error} isSaving={isSaving} onClose={onClose} title="Extracted question">
      <div className="grid gap-4">
        <Field label="Prompt">
          <textarea className={textAreaClass} onChange={(event) => setPrompt(event.target.value)} value={prompt} />
        </Field>
        <Field label="Choices JSON">
          <textarea className={textAreaClass} onChange={(event) => setChoices(event.target.value)} value={choices} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Question type"><input className={inputClass} onChange={(event) => setQuestionType(event.target.value)} value={questionType} /></Field>
          <Field label="Ladder stage"><input className={inputClass} onChange={(event) => setLadderStage(event.target.value)} value={ladderStage} /></Field>
          <Field label="Event">
            <select className={inputClass} onChange={(event) => setEventId(event.target.value)} value={eventId}>
              <option value="">No event</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.code} - {event.name}</option>)}
            </select>
          </Field>
          <Field label="Concept">
            <select className={inputClass} onChange={(event) => setConceptId(event.target.value)} value={conceptId}>
              <option value="">No concept</option>
              {concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name}</option>)}
            </select>
          </Field>
          <Field label="Difficulty"><input className={inputClass} onChange={(event) => setDifficulty(event.target.value)} value={difficulty} /></Field>
          <Field label="Explanation"><input className={inputClass} onChange={(event) => setExplanation(event.target.value)} value={explanation} /></Field>
        </div>
      </div>
      <StatusActions onSubmit={submit} />
    </ModalShell>
  );
}

function RoleplayEditor({
  error,
  events,
  isSaving,
  onClose,
  onError,
  onSave,
  roleplay,
}: {
  error: string | null;
  events: DecaEvent[];
  isSaving: boolean;
  onClose: () => void;
  onError: (error: string | null) => void;
  onSave: (id: string, updates: RoleplayReviewUpdate) => Promise<void>;
  roleplay: RoleplayScenario;
}) {
  const [draft, setDraft] = useState({
    business_context: roleplay.business_context ?? "",
    event_id: roleplay.event_id ?? "",
    instructional_area: roleplay.instructional_area ?? "",
    judge_role: roleplay.judge_role ?? "",
    participant_role: roleplay.participant_role ?? "",
    scenario_text: roleplay.scenario_text ?? "",
    task: roleplay.task ?? "",
    title: roleplay.title ?? "",
  });
  const [performanceIndicators, setPerformanceIndicators] = useState(stringifyJson(roleplay.performance_indicators));

  function submit(status: ReviewableContentStatus) {
    try {
      onError(null);
      void onSave(roleplay.id, {
        ...draft,
        event_id: draft.event_id || null,
        performance_indicators: parseJsonField(performanceIndicators, "Performance indicators"),
        status,
      });
    } catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : "Unable to save roleplay.");
    }
  }

  return (
    <ModalShell error={error} isSaving={isSaving} onClose={onClose} title="Extracted roleplay">
      <div className="grid gap-4">
        <Field label="Title"><input className={inputClass} onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} /></Field>
        <Field label="Event">
          <select className={inputClass} onChange={(event) => setDraft({ ...draft, event_id: event.target.value })} value={draft.event_id}>
            <option value="">No event</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.code} - {event.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Participant role"><input className={inputClass} onChange={(event) => setDraft({ ...draft, participant_role: event.target.value })} value={draft.participant_role} /></Field>
          <Field label="Judge role"><input className={inputClass} onChange={(event) => setDraft({ ...draft, judge_role: event.target.value })} value={draft.judge_role} /></Field>
          <Field label="Instructional area"><input className={inputClass} onChange={(event) => setDraft({ ...draft, instructional_area: event.target.value })} value={draft.instructional_area} /></Field>
          <Field label="Task"><input className={inputClass} onChange={(event) => setDraft({ ...draft, task: event.target.value })} value={draft.task} /></Field>
        </div>
        <Field label="Business context"><textarea className={textAreaClass} onChange={(event) => setDraft({ ...draft, business_context: event.target.value })} value={draft.business_context} /></Field>
        <Field label="Scenario text"><textarea className={textAreaClass} onChange={(event) => setDraft({ ...draft, scenario_text: event.target.value })} value={draft.scenario_text} /></Field>
        <Field label="Performance indicators JSON"><textarea className={textAreaClass} onChange={(event) => setPerformanceIndicators(event.target.value)} value={performanceIndicators} /></Field>
      </div>
      <StatusActions onSubmit={submit} />
    </ModalShell>
  );
}

function AnswerKeyEditor({
  answerKey,
  error,
  isSaving,
  onClose,
  onError,
  onSave,
  resources,
}: {
  answerKey: AiExtractedAnswerKey;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onError: (error: string | null) => void;
  onSave: (id: string, updates: AnswerKeyReviewUpdate) => Promise<void>;
  resources: AiReviewData["resources"];
}) {
  const [title, setTitle] = useState(answerKey.title ?? "");
  const [detectedEventCode, setDetectedEventCode] = useState(answerKey.detected_event_code ?? "");
  const [detectedYear, setDetectedYear] = useState(answerKey.detected_year?.toString() ?? "");
  const [possibleExamResourceId, setPossibleExamResourceId] = useState(answerKey.possible_exam_resource_id ?? "");
  const [answers, setAnswers] = useState(stringifyJson(answerKey.answers));

  function submit(status: ReviewableContentStatus) {
    try {
      onError(null);
      void onSave(answerKey.id, {
        answers: parseJsonField(answers, "Answers"),
        detected_event_code: detectedEventCode || null,
        detected_year: detectedYear ? Number(detectedYear) : null,
        possible_exam_resource_id: possibleExamResourceId || null,
        status,
        title: title || null,
      });
    } catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : "Unable to save answer key.");
    }
  }

  return (
    <ModalShell error={error} isSaving={isSaving} onClose={onClose} title="AI-suggested practice key">
      <Card className="mb-4 border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">This is not an official exam answer key.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className={inputClass} onChange={(event) => setTitle(event.target.value)} value={title} /></Field>
        <Field label="Detected event code"><input className={inputClass} onChange={(event) => setDetectedEventCode(event.target.value)} value={detectedEventCode} /></Field>
        <Field label="Detected year"><input className={inputClass} onChange={(event) => setDetectedYear(event.target.value)} type="number" value={detectedYear} /></Field>
        <Field label="Possible official exam resource">
          <select className={inputClass} onChange={(event) => setPossibleExamResourceId(event.target.value)} value={possibleExamResourceId}>
            <option value="">No match</option>
            {resources.filter((resource) => resource.resource_type === "exam").map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Answers JSON"><textarea className={textAreaClass} onChange={(event) => setAnswers(event.target.value)} value={answers} /></Field>
        </div>
      </div>
      <StatusActions onSubmit={submit} />
    </ModalShell>
  );
}

function RubricEditor({
  criteria,
  error,
  events,
  isSaving,
  onClose,
  onError,
  onSave,
  rubric,
}: {
  criteria: RubricCriterion[];
  error: string | null;
  events: DecaEvent[];
  isSaving: boolean;
  onClose: () => void;
  onError: (error: string | null) => void;
  onSave: (id: string, updates: RubricReviewUpdate) => Promise<void>;
  rubric: Rubric;
}) {
  const [title, setTitle] = useState(rubric.title ?? "");
  const [rubricType, setRubricType] = useState(rubric.rubric_type ?? "");
  const [eventId, setEventId] = useState(rubric.event_id ?? "");
  const [criteriaJson, setCriteriaJson] = useState(stringifyJson(criteria));

  function submit(status: ReviewableContentStatus) {
    try {
      onError(null);
      void onSave(rubric.id, {
        criteria: parseJsonField(criteriaJson, "Criteria"),
        event_id: eventId || null,
        rubric_type: rubricType || null,
        status,
        title: title || null,
      });
    } catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : "Unable to save rubric.");
    }
  }

  return (
    <ModalShell error={error} isSaving={isSaving} onClose={onClose} title="Extracted rubric">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className={inputClass} onChange={(event) => setTitle(event.target.value)} value={title} /></Field>
        <Field label="Rubric type"><input className={inputClass} onChange={(event) => setRubricType(event.target.value)} value={rubricType} /></Field>
        <Field label="Event">
          <select className={inputClass} onChange={(event) => setEventId(event.target.value)} value={eventId}>
            <option value="">No event</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.code} - {event.name}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Criteria JSON"><textarea className={textAreaClass} onChange={(event) => setCriteriaJson(event.target.value)} value={criteriaJson} /></Field>
        </div>
      </div>
      <StatusActions onSubmit={submit} />
    </ModalShell>
  );
}
