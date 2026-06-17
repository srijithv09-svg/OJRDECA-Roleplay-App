"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { isAdminRole } from "@/lib/auth";
import {
  AdminContentService,
  type AdminContentStudioData,
} from "@/lib/services/admin-content";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import type {
  Concept,
  DecaEvent,
  Json,
  KeySet,
  Profile,
  ReviewableContentStatus,
  StructuredQuestion,
  StudyResource,
} from "@/lib/types";

type StudioTab = "concepts" | "modules" | "questions" | "resources" | "review";
type KeySetForm = {
  description: string;
  event_id: string;
  id: string;
  sort_order: string;
  status: string;
  title: string;
};
type ConceptForm = {
  cluster: string;
  common_misconceptions: string;
  detailed_explanation: string;
  example: string;
  id: string;
  instructional_area: string;
  key_set_ids: string[];
  name: string;
  slug: string;
  status: string;
  student_friendly_definition: string;
};
type QuestionForm = {
  id?: string;
  concept_id: string;
  correct_answer_text: string;
  difficulty: string;
  event_id: string;
  explanation: string;
  ladder_stage: string;
  matching_rows: string;
  options_text: string;
  prompt: string;
  question_type: string;
  scenario_context: string;
  status: ReviewableContentStatus;
};
type StudyResourceForm = {
  concept_id: string;
  content: string;
  description: string;
  event_id: string;
  id: string;
  key_set_id: string;
  resource_kind: string;
  status: ReviewableContentStatus;
  title: string;
  url: string;
};

const tabs: Array<{ id: StudioTab; label: string }> = [
  { id: "modules", label: "Modules / Key Sets" },
  { id: "concepts", label: "Concepts" },
  { id: "questions", label: "Questions" },
  { id: "resources", label: "Self-Study Resources" },
  { id: "review", label: "Review Queue" },
];

const questionTypes = ["multiple_choice", "multiple_select", "matching", "free_text"];
const ladderStages = ["recognize", "define", "connect", "apply", "explain", "improve"];
const reviewStatuses: ReviewableContentStatus[] = [
  "draft",
  "needs_review",
  "approved",
  "archived",
  "rejected",
];
const learningStatuses = ["draft", "approved", "archived"];

function statusTone(status: string) {
  if (status === "approved") {
    return "green" as const;
  }

  if (status === "needs_review" || status === "draft") {
    return "amber" as const;
  }

  return "slate" as const;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayFromJson(value: Json | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function choicesFromQuestion(question: StructuredQuestion) {
  if (Array.isArray(question.choices)) {
    return question.choices
      .map((choice) => {
        if (typeof choice === "string") {
          return choice;
        }

        if (choice && typeof choice === "object" && "label" in choice) {
          return typeof choice.label === "string" ? choice.label : null;
        }

        return null;
      })
      .filter((choice): choice is string => Boolean(choice));
  }

  if (question.choices && typeof question.choices === "object") {
    return arrayFromJson((question.choices as { options?: Json }).options ?? null);
  }

  return [];
}

function matchingRowsFromQuestion(question: StructuredQuestion) {
  const pairs =
    question.choices && typeof question.choices === "object" && !Array.isArray(question.choices)
      ? (question.choices as { pairs?: Json }).pairs
      : null;
  const answers =
    question.correct_answer && typeof question.correct_answer === "object" && !Array.isArray(question.correct_answer)
      ? (question.correct_answer as Record<string, Json>)
      : {};

  if (!Array.isArray(pairs)) {
    return "";
  }

  return pairs
    .map((pair) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) {
        return null;
      }

      const left = (pair as { left?: Json }).left;
      const options = (pair as { options?: Json }).options;

      if (typeof left !== "string" || !Array.isArray(options)) {
        return null;
      }

      return `${left} | ${String(answers[left] ?? "")} | ${options.join("; ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

function questionToForm(question?: StructuredQuestion): QuestionForm {
  return {
    id: question?.id,
    concept_id: question?.concept_id ?? "",
    correct_answer_text: Array.isArray(question?.correct_answer)
      ? question.correct_answer.join("\n")
      : typeof question?.correct_answer === "string"
        ? question.correct_answer
        : "",
    difficulty: question?.difficulty ?? "",
    event_id: question?.event_id ?? "",
    explanation: question?.explanation ?? "",
    ladder_stage: question?.ladder_stage ?? "recognize",
    matching_rows: question ? matchingRowsFromQuestion(question) : "",
    options_text: choicesFromQuestion(question ?? ({} as StructuredQuestion)).join("\n"),
    prompt: question?.prompt ?? "",
    question_type: question?.question_type ?? "multiple_choice",
    scenario_context: "",
    status: question?.status ?? "draft",
  };
}

function buildQuestionPayload(form: QuestionForm) {
  let choices: Json | null = null;
  let correctAnswer: Json | null = null;
  const prompt = form.scenario_context
    ? `Scenario: ${form.scenario_context}\n\n${form.prompt}`
    : form.prompt;

  if (form.question_type === "multiple_choice") {
    choices = lines(form.options_text);
    correctAnswer = form.correct_answer_text.trim();
  } else if (form.question_type === "multiple_select") {
    choices = lines(form.options_text);
    correctAnswer = lines(form.correct_answer_text);
  } else if (form.question_type === "matching") {
    const answerMap: Record<string, string> = {};
    const pairs = lines(form.matching_rows).map((row) => {
      const [left = "", correct = "", options = ""] = row.split("|").map((part) => part.trim());
      const optionList = options
        ? options.split(";").map((option) => option.trim()).filter(Boolean)
        : [correct].filter(Boolean);

      if (left && correct) {
        answerMap[left] = correct;
      }

      return { left, options: optionList.includes(correct) ? optionList : [correct, ...optionList] };
    });
    choices = { pairs };
    correctAnswer = answerMap;
  } else {
    choices = null;
    correctAnswer = form.correct_answer_text.trim() ? form.correct_answer_text.trim() : null;
  }

  return {
    ...form,
    choices,
    correct_answer: correctAnswer,
    prompt,
  };
}

function conceptKeySetIds(data: AdminContentStudioData, conceptId: string) {
  return data.keySetConcepts
    .filter((link) => link.concept_id === conceptId)
    .map((link) => link.key_set_id);
}

function eventLabel(event: DecaEvent) {
  return `${event.code} - ${event.name}${event.is_pilot ? " (pilot)" : ""}`;
}

function moduleVisible(keySet: KeySet) {
  return keySet.status === "approved";
}

function conceptVisible(concept: Concept, data: AdminContentStudioData) {
  const linkedApprovedModule = data.keySetConcepts.some((link) => {
    return (
      link.concept_id === concept.id &&
      data.keySets.some((keySet) => keySet.id === link.key_set_id && keySet.status === "approved")
    );
  });

  return concept.status === "approved" && linkedApprovedModule;
}

function questionVisible(question: StructuredQuestion, data: AdminContentStudioData) {
  return (
    question.status === "approved" &&
    Boolean(question.event_id) &&
    Boolean(question.concept_id) &&
    data.concepts.some((concept) => concept.id === question.concept_id && concept.status === "approved")
  );
}

function TextField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string | number;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <input
        className="h-10 rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  placeholder,
  rows = 4,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <textarea
        className="rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </label>
  );
}

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <select
        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

export function AdminContentView() {
  const [activeTab, setActiveTab] = useState<StudioTab>("modules");
  const [data, setData] = useState<AdminContentStudioData | null>(null);
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keySetForm, setKeySetForm] = useState({
    description: "",
    event_id: "",
    id: "",
    sort_order: "0",
    status: "draft",
    title: "",
  });
  const [conceptForm, setConceptForm] = useState({
    cluster: "",
    common_misconceptions: "",
    detailed_explanation: "",
    example: "",
    id: "",
    instructional_area: "",
    key_set_ids: [] as string[],
    name: "",
    slug: "",
    status: "draft",
    student_friendly_definition: "",
  });
  const [questionForm, setQuestionForm] = useState<QuestionForm>(questionToForm());
  const [resourceForm, setResourceForm] = useState({
    concept_id: "",
    content: "",
    description: "",
    event_id: "",
    id: "",
    key_set_id: "",
    resource_kind: "note",
    status: "draft" as ReviewableContentStatus,
    title: "",
    url: "",
  });

  async function load() {
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const [nextProfile, nextData] = await Promise.all([
        getCurrentOwnProfile(),
        AdminContentService.getContentStudioData(),
      ]);
      setProfile(nextProfile);
      setData(nextData);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load Learning Content Studio.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredKeySets = useMemo(() => {
    return (data?.keySets ?? []).filter((keySet) => {
      return (
        (!eventFilter || keySet.event_id === eventFilter) &&
        (statusFilter === "all" || keySet.status === statusFilter)
      );
    });
  }, [data?.keySets, eventFilter, statusFilter]);

  const filteredConcepts = useMemo(() => {
    return (data?.concepts ?? []).filter((concept) => {
      const linkedEvent = !eventFilter || data?.keySetConcepts.some((link) => {
        return (
          link.concept_id === concept.id &&
          data.keySets.some((keySet) => keySet.id === link.key_set_id && keySet.event_id === eventFilter)
        );
      });
      return linkedEvent && (statusFilter === "all" || concept.status === statusFilter);
    });
  }, [data, eventFilter, statusFilter]);

  const filteredQuestions = useMemo(() => {
    return (data?.questions ?? []).filter((question) => {
      return (
        (!eventFilter || question.event_id === eventFilter) &&
        (statusFilter === "all" || question.status === statusFilter)
      );
    });
  }, [data?.questions, eventFilter, statusFilter]);

  async function save(action: Parameters<typeof AdminContentService.mutate>[0], payload: Record<string, unknown>, success: string) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextData = await AdminContentService.mutate(action, payload);
      setData(nextData);
      setMessage(success);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save content.");
    } finally {
      setIsSaving(false);
    }
  }

  function editKeySet(keySet: KeySet) {
    setActiveTab("modules");
    setKeySetForm({
      description: keySet.description ?? "",
      event_id: keySet.event_id,
      id: keySet.id,
      sort_order: String(keySet.sort_order),
      status: keySet.status,
      title: keySet.title,
    });
  }

  function editConcept(concept: Concept) {
    if (!data) {
      return;
    }

    setActiveTab("concepts");
    setConceptForm({
      cluster: concept.cluster ?? "",
      common_misconceptions: concept.common_misconceptions ?? "",
      detailed_explanation: concept.detailed_explanation ?? "",
      example: concept.example ?? "",
      id: concept.id,
      instructional_area: concept.instructional_area ?? "",
      key_set_ids: conceptKeySetIds(data, concept.id),
      name: concept.name,
      slug: concept.slug,
      status: concept.status,
      student_friendly_definition: concept.student_friendly_definition ?? "",
    });
  }

  function editQuestion(question: StructuredQuestion) {
    setActiveTab("questions");
    setQuestionForm(questionToForm(question));
  }

  function editStudyResource(resource: StudyResource) {
    setActiveTab("resources");
    setResourceForm({
      concept_id: resource.concept_id ?? "",
      content: resource.content ?? "",
      description: resource.description ?? "",
      event_id: resource.event_id ?? "",
      id: resource.id,
      key_set_id: resource.key_set_id ?? "",
      resource_kind: resource.resource_kind,
      status: resource.status,
      title: resource.title,
      url: resource.url ?? "",
    });
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error && !data) {
    return <ResourceErrorState message={error} onRetry={load} title="Unable to load content studio" />;
  }

  if (!isAdminRole(profile?.role)) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Admin only
        </p>
        <h1 className="mt-2 text-2xl font-bold text-red-950">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          You must be an admin or advisor to manage learning content.
        </p>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const eventById = new Map(data.events.map((event) => [event.id, event]));
  const keySetById = new Map(data.keySets.map((keySet) => [keySet.id, keySet]));
  const conceptById = new Map(data.concepts.map((concept) => [concept.id, concept]));

  return (
    <>
      <PageHeader
        actions={<ButtonLink href="/admin">Back to Admin</ButtonLink>}
        description="Create and review modules, concepts, questions, and study resources before students see them."
        eyebrow="Admin"
        title="Learning Content Studio"
      />

      <Card className="border-blue-100 bg-blue-50">
        <p className="text-sm leading-6 text-blue-900">
          MCS is the first active pilot, but this studio supports future DECA pathways across events and clusters.
          Students only see approved modules, concepts, questions, and study resources.
        </p>
      </Card>

      {error ? <ResourceErrorState message={error} onRetry={load} title="Content studio warning" /> : null}
      {message ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-900">{message}</p>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-5">
        {tabs.map((tab) => (
          <button
            className={`min-h-11 rounded-md border px-3 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader eyebrow="Filters" title="Studio view" />
          <div className="grid gap-4">
            <SelectField label="Event" onChange={setEventFilter} value={eventFilter}>
              <option value="">All canonical events</option>
              {data.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {eventLabel(event)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Status" onChange={setStatusFilter} value={statusFilter}>
              <option value="all">All statuses</option>
              {reviewStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </SelectField>
            <div className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">Review queue</p>
              <p>{data.reviewQueue.questionsNeedsReview} questions need review</p>
              <p>{data.reviewQueue.studyResourcesNeedsReview} study resources need review</p>
              <p>{data.reviewQueue.keySetsDraft} draft modules</p>
              <p>{data.reviewQueue.conceptsDraft} draft concepts</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          {activeTab === "modules" ? (
            <ModulesSection
              data={data}
              eventById={eventById}
              filteredKeySets={filteredKeySets}
              form={keySetForm}
              isSaving={isSaving}
              onEdit={editKeySet}
              onFormChange={setKeySetForm}
              onSave={() =>
                save(
                  "saveKeySet",
                  keySetForm,
                  keySetForm.id ? "Module updated." : "Module created.",
                )
              }
            />
          ) : null}

          {activeTab === "concepts" ? (
            <ConceptsSection
              data={data}
              filteredConcepts={filteredConcepts}
              form={conceptForm}
              isSaving={isSaving}
              keySetById={keySetById}
              onEdit={editConcept}
              onFormChange={setConceptForm}
              onSave={() =>
                save(
                  "saveConcept",
                  conceptForm,
                  conceptForm.id ? "Concept updated." : "Concept created.",
                )
              }
            />
          ) : null}

          {activeTab === "questions" ? (
            <QuestionsSection
              conceptById={conceptById}
              data={data}
              eventById={eventById}
              filteredQuestions={filteredQuestions}
              form={questionForm}
              isSaving={isSaving}
              onDuplicate={(question) => save("duplicateQuestion", { id: question.id }, "Question duplicated as draft.")}
              onEdit={editQuestion}
              onFormChange={setQuestionForm}
              onSave={() =>
                save(
                  "saveQuestion",
                  buildQuestionPayload(questionForm),
                  questionForm.id ? "Question updated." : "Question created.",
                )
              }
            />
          ) : null}

          {activeTab === "resources" ? (
            <StudyResourcesSection
              conceptById={conceptById}
              data={data}
              eventById={eventById}
              form={resourceForm}
              isSaving={isSaving}
              keySetById={keySetById}
              onEdit={editStudyResource}
              onFormChange={setResourceForm}
              onSave={() =>
                save(
                  "saveStudyResource",
                  resourceForm,
                  resourceForm.id ? "Study resource updated." : "Study resource created.",
                )
              }
            />
          ) : null}

          {activeTab === "review" ? (
            <ReviewQueueSection
              conceptById={conceptById}
              data={data}
              eventById={eventById}
              onEditConcept={editConcept}
              onEditKeySet={editKeySet}
              onEditQuestion={editQuestion}
              onEditStudyResource={editStudyResource}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

function ModulesSection({
  data,
  eventById,
  filteredKeySets,
  form,
  isSaving,
  onEdit,
  onFormChange,
  onSave,
}: {
  data: AdminContentStudioData;
  eventById: Map<string, DecaEvent>;
  filteredKeySets: KeySet[];
  form: KeySetForm;
  isSaving: boolean;
  onEdit: (keySet: KeySet) => void;
  onFormChange: (form: KeySetForm) => void;
  onSave: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader eyebrow="Module editor" title={form.id ? "Edit module" : "Create module"} />
        <div className="grid gap-4 lg:grid-cols-2">
          <SelectField label="Event" onChange={(value) => onFormChange({ ...form, event_id: value })} value={form.event_id}>
            <option value="">Choose event</option>
            {data.events.map((event) => (
              <option key={event.id} value={event.id}>{eventLabel(event)}</option>
            ))}
          </SelectField>
          <TextField label="Sort order" onChange={(value) => onFormChange({ ...form, sort_order: value })} type="number" value={form.sort_order} />
          <TextField label="Module title" onChange={(value) => onFormChange({ ...form, title: value })} value={form.title} />
          <SelectField label="Status" onChange={(value) => onFormChange({ ...form, status: value })} value={form.status}>
            {learningStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
          </SelectField>
          <div className="lg:col-span-2">
            <TextAreaField label="Description" onChange={(value) => onFormChange({ ...form, description: value })} value={form.description} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white disabled:bg-blue-300" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving..." : form.id ? "Save module" : "Create module"}
          </button>
          <button className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700" onClick={() => onFormChange({ description: "", event_id: "", id: "", sort_order: "0", status: "draft", title: "" })} type="button">
            New module
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Modules" title="Key sets by event" />
        <div className="grid gap-3">
          {filteredKeySets.length === 0 ? <p className="text-sm text-slate-600">No modules match these filters.</p> : null}
          {filteredKeySets.map((keySet) => (
            <div className="rounded-lg border border-slate-100 p-4" key={keySet.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone(keySet.status)}>{formatStatus(keySet.status)}</Badge>
                    <Badge tone={moduleVisible(keySet) ? "green" : "amber"}>{moduleVisible(keySet) ? "Student-visible" : "Hidden from students"}</Badge>
                  </div>
                  <h3 className="mt-3 font-semibold text-slate-950">{keySet.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{eventById.get(keySet.event_id)?.code ?? "No event"} · {data.keySetConcepts.filter((link) => link.key_set_id === keySet.id).length} concepts</p>
                </div>
                <button className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => onEdit(keySet)} type="button">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ConceptsSection({
  data,
  filteredConcepts,
  form,
  isSaving,
  keySetById,
  onEdit,
  onFormChange,
  onSave,
}: {
  data: AdminContentStudioData;
  filteredConcepts: Concept[];
  form: ConceptForm;
  isSaving: boolean;
  keySetById: Map<string, KeySet>;
  onEdit: (concept: Concept) => void;
  onFormChange: (form: ConceptForm) => void;
  onSave: () => void;
}) {
  function toggleKeySet(keySetId: string, checked: boolean) {
    onFormChange({
      ...form,
      key_set_ids: checked
        ? [...form.key_set_ids, keySetId]
        : form.key_set_ids.filter((id) => id !== keySetId),
    });
  }

  return (
    <>
      <Card>
        <CardHeader eyebrow="Concept editor" title={form.id ? "Edit concept" : "Create concept"} />
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Concept name" onChange={(value) => onFormChange({ ...form, name: value })} value={form.name} />
          <TextField label="Slug" onChange={(value) => onFormChange({ ...form, slug: value })} value={form.slug} />
          <TextField label="Cluster" onChange={(value) => onFormChange({ ...form, cluster: value })} value={form.cluster} />
          <TextField label="Instructional area" onChange={(value) => onFormChange({ ...form, instructional_area: value })} value={form.instructional_area} />
          <SelectField label="Status" onChange={(value) => onFormChange({ ...form, status: value })} value={form.status}>
            {learningStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
          </SelectField>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Assign to modules</p>
            <div className="mt-3 grid gap-2">
              {data.keySets.map((keySet) => (
                <label className="flex items-center gap-2 text-sm text-slate-700" key={keySet.id}>
                  <input checked={form.key_set_ids.includes(keySet.id)} onChange={(event) => toggleKeySet(keySet.id, event.target.checked)} type="checkbox" />
                  {keySet.title}
                </label>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2">
            <TextAreaField label="Student-friendly definition" onChange={(value) => onFormChange({ ...form, student_friendly_definition: value })} value={form.student_friendly_definition} />
          </div>
          <TextAreaField label="Detailed explanation" onChange={(value) => onFormChange({ ...form, detailed_explanation: value })} value={form.detailed_explanation} />
          <TextAreaField label="Example" onChange={(value) => onFormChange({ ...form, example: value })} value={form.example} />
          <div className="lg:col-span-2">
            <TextAreaField label="Common misconceptions" onChange={(value) => onFormChange({ ...form, common_misconceptions: value })} value={form.common_misconceptions} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white disabled:bg-blue-300" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving..." : form.id ? "Save concept" : "Create concept"}
          </button>
          <button className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700" onClick={() => onFormChange({ cluster: "", common_misconceptions: "", detailed_explanation: "", example: "", id: "", instructional_area: "", key_set_ids: [], name: "", slug: "", status: "draft", student_friendly_definition: "" })} type="button">
            New concept
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Concepts" title="Concept library" />
        <div className="grid gap-3">
          {filteredConcepts.map((concept) => {
            const linkedModules = conceptKeySetIds(data, concept.id).map((id) => keySetById.get(id)?.title).filter(Boolean);
            return (
              <div className="rounded-lg border border-slate-100 p-4" key={concept.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={statusTone(concept.status)}>{formatStatus(concept.status)}</Badge>
                      <Badge tone={conceptVisible(concept, data) ? "green" : "amber"}>{conceptVisible(concept, data) ? "Student-visible" : "Hidden from students"}</Badge>
                    </div>
                    <h3 className="mt-3 font-semibold text-slate-950">{concept.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{linkedModules.join(", ") || "No module assigned"}</p>
                  </div>
                  <button className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => onEdit(concept)} type="button">Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function QuestionsSection({
  conceptById,
  data,
  eventById,
  filteredQuestions,
  form,
  isSaving,
  onDuplicate,
  onEdit,
  onFormChange,
  onSave,
}: {
  conceptById: Map<string, Concept>;
  data: AdminContentStudioData;
  eventById: Map<string, DecaEvent>;
  filteredQuestions: StructuredQuestion[];
  form: QuestionForm;
  isSaving: boolean;
  onDuplicate: (question: StructuredQuestion) => void;
  onEdit: (question: StructuredQuestion) => void;
  onFormChange: (form: QuestionForm) => void;
  onSave: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader eyebrow="Question editor" title={form.id ? "Edit question" : "Create question"} />
        <div className="grid gap-4 lg:grid-cols-2">
          <SelectField label="Event" onChange={(value) => onFormChange({ ...form, event_id: value })} value={form.event_id}>
            <option value="">Choose event</option>
            {data.events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
          </SelectField>
          <SelectField label="Concept" onChange={(value) => onFormChange({ ...form, concept_id: value })} value={form.concept_id}>
            <option value="">Choose concept</option>
            {data.concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name}</option>)}
          </SelectField>
          <SelectField label="Question type" onChange={(value) => onFormChange({ ...form, question_type: value })} value={form.question_type}>
            {questionTypes.map((type) => <option key={type} value={type}>{formatStatus(type)}</option>)}
          </SelectField>
          <SelectField label="Ladder stage" onChange={(value) => onFormChange({ ...form, ladder_stage: value })} value={form.ladder_stage}>
            {ladderStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </SelectField>
          <SelectField label="Status" onChange={(value) => onFormChange({ ...form, status: value as ReviewableContentStatus })} value={form.status}>
            {reviewStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
          </SelectField>
          <TextField label="Difficulty" onChange={(value) => onFormChange({ ...form, difficulty: value })} value={form.difficulty} />
          <div className="lg:col-span-2">
            <TextAreaField label="Scenario context (optional)" onChange={(value) => onFormChange({ ...form, scenario_context: value })} rows={3} value={form.scenario_context} />
          </div>
          <div className="lg:col-span-2">
            <TextAreaField label="Prompt" onChange={(value) => onFormChange({ ...form, prompt: value })} rows={4} value={form.prompt} />
          </div>
          {form.question_type === "matching" ? (
            <div className="lg:col-span-2">
              <TextAreaField
                label="Matching rows"
                onChange={(value) => onFormChange({ ...form, matching_rows: value })}
                placeholder="Term | Correct match | Correct match; Distractor; Another option"
                rows={6}
                value={form.matching_rows}
              />
            </div>
          ) : form.question_type === "free_text" ? (
            <>
              <TextAreaField label="Sample strong answer" onChange={(value) => onFormChange({ ...form, correct_answer_text: value })} value={form.correct_answer_text} />
              <TextAreaField label="Grading focus / explanation" onChange={(value) => onFormChange({ ...form, explanation: value })} value={form.explanation} />
            </>
          ) : (
            <>
              <TextAreaField label="Options (one per line)" onChange={(value) => onFormChange({ ...form, options_text: value })} value={form.options_text} />
              <TextAreaField label={form.question_type === "multiple_select" ? "Correct options (one per line)" : "Correct answer"} onChange={(value) => onFormChange({ ...form, correct_answer_text: value })} value={form.correct_answer_text} />
              <div className="lg:col-span-2">
                <TextAreaField label="Explanation" onChange={(value) => onFormChange({ ...form, explanation: value })} value={form.explanation} />
              </div>
            </>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white disabled:bg-blue-300" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving..." : form.id ? "Save question" : "Create question"}
          </button>
          <button className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700" onClick={() => onFormChange(questionToForm())} type="button">
            New question
          </button>
          <button className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900" disabled type="button">
            Draft with AI (Phase 9.5)
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Questions" title="Question library" />
        <div className="grid gap-3">
          {filteredQuestions.map((question) => (
            <div className="rounded-lg border border-slate-100 p-4" key={question.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone(question.status)}>{formatStatus(question.status)}</Badge>
                    <Badge>{formatStatus(question.question_type)}</Badge>
                    <Badge tone={questionVisible(question, data) ? "green" : "amber"}>{questionVisible(question, data) ? "Student-visible" : "Hidden from students"}</Badge>
                  </div>
                  <h3 className="mt-3 font-semibold text-slate-950">{question.prompt}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {eventById.get(question.event_id ?? "")?.code ?? "No event"} · {conceptById.get(question.concept_id ?? "")?.name ?? "No concept"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => onEdit(question)} type="button">Edit</button>
                  <button className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => onDuplicate(question)} type="button">Duplicate</button>
                  {question.status === "approved" && question.event_id && question.concept_id ? (
                    <Link className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" href={`/learn/${eventById.get(question.event_id)?.code.toLowerCase()}/concepts/${question.concept_id}`}>
                      Preview as student
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function StudyResourcesSection({
  conceptById,
  data,
  eventById,
  form,
  isSaving,
  keySetById,
  onEdit,
  onFormChange,
  onSave,
}: {
  conceptById: Map<string, Concept>;
  data: AdminContentStudioData;
  eventById: Map<string, DecaEvent>;
  form: StudyResourceForm;
  isSaving: boolean;
  keySetById: Map<string, KeySet>;
  onEdit: (resource: StudyResource) => void;
  onFormChange: (form: StudyResourceForm) => void;
  onSave: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader eyebrow="Study resource editor" title={form.id ? "Edit resource" : "Add study resource"} />
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Title" onChange={(value) => onFormChange({ ...form, title: value })} value={form.title} />
          <TextField label="Kind" onChange={(value) => onFormChange({ ...form, resource_kind: value })} value={form.resource_kind} />
          <SelectField label="Event" onChange={(value) => onFormChange({ ...form, event_id: value })} value={form.event_id}>
            <option value="">No event</option>
            {data.events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
          </SelectField>
          <SelectField label="Module" onChange={(value) => onFormChange({ ...form, key_set_id: value })} value={form.key_set_id}>
            <option value="">No module</option>
            {data.keySets.map((keySet) => <option key={keySet.id} value={keySet.id}>{keySet.title}</option>)}
          </SelectField>
          <SelectField label="Concept" onChange={(value) => onFormChange({ ...form, concept_id: value })} value={form.concept_id}>
            <option value="">No concept</option>
            {data.concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name}</option>)}
          </SelectField>
          <SelectField label="Status" onChange={(value) => onFormChange({ ...form, status: value as ReviewableContentStatus })} value={form.status}>
            {reviewStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
          </SelectField>
          <div className="lg:col-span-2">
            <TextField label="URL" onChange={(value) => onFormChange({ ...form, url: value })} value={form.url} />
          </div>
          <TextAreaField label="Description" onChange={(value) => onFormChange({ ...form, description: value })} value={form.description} />
          <TextAreaField label="Note / content" onChange={(value) => onFormChange({ ...form, content: value })} value={form.content} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white disabled:bg-blue-300" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving..." : form.id ? "Save resource" : "Add resource"}
          </button>
          <button className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700" onClick={() => onFormChange({ concept_id: "", content: "", description: "", event_id: "", id: "", key_set_id: "", resource_kind: "note", status: "draft", title: "", url: "" })} type="button">
            New resource
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Resources" title="Supplemental study resources" />
        <div className="grid gap-3">
          {data.studyResources.map((resource) => (
            <div className="rounded-lg border border-slate-100 p-4" key={resource.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone(resource.status)}>{formatStatus(resource.status)}</Badge>
                    <Badge>{resource.resource_kind}</Badge>
                    <Badge tone={resource.status === "approved" ? "green" : "amber"}>{resource.status === "approved" ? "Student-visible" : "Hidden from students"}</Badge>
                  </div>
                  <h3 className="mt-3 font-semibold text-slate-950">{resource.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {eventById.get(resource.event_id ?? "")?.code ?? "No event"} · {keySetById.get(resource.key_set_id ?? "")?.title ?? "No module"} · {conceptById.get(resource.concept_id ?? "")?.name ?? "No concept"}
                  </p>
                </div>
                <button className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => onEdit(resource)} type="button">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ReviewQueueSection({
  conceptById,
  data,
  eventById,
  onEditConcept,
  onEditKeySet,
  onEditQuestion,
  onEditStudyResource,
}: {
  conceptById: Map<string, Concept>;
  data: AdminContentStudioData;
  eventById: Map<string, DecaEvent>;
  onEditConcept: (concept: Concept) => void;
  onEditKeySet: (keySet: KeySet) => void;
  onEditQuestion: (question: StructuredQuestion) => void;
  onEditStudyResource: (resource: StudyResource) => void;
}) {
  const draftKeySets = data.keySets.filter((keySet) => keySet.status === "draft");
  const draftConcepts = data.concepts.filter((concept) => concept.status === "draft");
  const reviewQuestions = data.questions.filter((question) => question.status === "needs_review" || question.status === "draft");
  const reviewResources = data.studyResources.filter((resource) => resource.status === "needs_review" || resource.status === "draft");

  return (
    <>
      <Card>
        <CardHeader eyebrow="Review queue" title="Content waiting for human approval" />
        <div className="grid gap-3 md:grid-cols-4">
          <QueueStat label="Draft modules" value={draftKeySets.length} />
          <QueueStat label="Draft concepts" value={draftConcepts.length} />
          <QueueStat label="Questions" value={reviewQuestions.length} />
          <QueueStat label="Study resources" value={reviewResources.length} />
        </div>
      </Card>
      <Card>
        <CardHeader eyebrow="Questions" title="Questions needing review" />
        <div className="grid gap-3">
          {reviewQuestions.map((question) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3" key={question.id}>
              <div>
                <Badge tone={statusTone(question.status)}>{formatStatus(question.status)}</Badge>
                <p className="mt-2 font-semibold text-slate-950">{question.prompt}</p>
                <p className="mt-1 text-sm text-slate-500">{eventById.get(question.event_id ?? "")?.code ?? "No event"} · {conceptById.get(question.concept_id ?? "")?.name ?? "No concept"}</p>
              </div>
              <button className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => onEditQuestion(question)} type="button">Review</button>
            </div>
          ))}
        </div>
      </Card>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Modules" title="Draft modules" />
          {draftKeySets.map((keySet) => (
            <button className="mb-3 block w-full rounded-lg border border-slate-100 p-3 text-left" key={keySet.id} onClick={() => onEditKeySet(keySet)} type="button">
              <span className="font-semibold text-slate-950">{keySet.title}</span>
            </button>
          ))}
        </Card>
        <Card>
          <CardHeader eyebrow="Concepts" title="Draft concepts" />
          {draftConcepts.map((concept) => (
            <button className="mb-3 block w-full rounded-lg border border-slate-100 p-3 text-left" key={concept.id} onClick={() => onEditConcept(concept)} type="button">
              <span className="font-semibold text-slate-950">{concept.name}</span>
            </button>
          ))}
        </Card>
      </section>
      <Card>
        <CardHeader eyebrow="Study resources" title="Resources needing review" />
        {reviewResources.map((resource) => (
          <button className="mb-3 block w-full rounded-lg border border-slate-100 p-3 text-left" key={resource.id} onClick={() => onEditStudyResource(resource)} type="button">
            <span className="font-semibold text-slate-950">{resource.title}</span>
          </button>
        ))}
      </Card>
    </>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
    </div>
  );
}
