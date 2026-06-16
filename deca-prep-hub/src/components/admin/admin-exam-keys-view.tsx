"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { isAdminRole } from "@/lib/auth";
import { getCurrentOwnProfile } from "@/lib/services/profiles";
import { ExamKeysService } from "@/lib/services/exam-keys";
import { ResourcesService } from "@/lib/services/resources";
import type {
  ExamAnswerKeyInput,
  ExamAnswerKeyRow,
  ExamCorrectAnswer,
  ExamKeyStatus,
  ExamResourceWithKeyStatus,
  Profile,
} from "@/lib/types";

type SelectOption = {
  label: string;
  value: string;
};

type KeyStatusFilter = "all" | ExamKeyStatus;

type KeyDraftRow = {
  clientId: string;
  originalQuestionNumber: number | null;
  question_number: string;
  correct_answer: ExamCorrectAnswer;
  instructional_area: string;
};

type ParsedAnswer = {
  question_number: number;
  correct_answer: ExamCorrectAnswer;
};

const answerOptions: ExamCorrectAnswer[] = ["A", "B", "C", "D", "E"];
const statusOptions: Array<{ label: string; value: KeyStatusFilter }> = [
  { label: "all", value: "all" },
  { label: "No key", value: "no-key" },
  { label: "Partial key", value: "partial" },
  { label: "Complete key", value: "complete" },
];

function optionize(values: Array<number | string | null | undefined>): SelectOption[] {
  return Array.from(new Set(values.filter(Boolean).map(String)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((value) => ({ label: value, value }));
}

function normalizeFilenameValue(value: string) {
  return value
    .replace(/^[a-f0-9]{16,}[_-]/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getUsefulOriginalFilename(resource: ExamResourceWithKeyStatus) {
  if (!resource.original_filename) {
    return null;
  }

  const normalizedFilename = normalizeFilenameValue(resource.original_filename);
  const normalizedTitle = normalizeFilenameValue(resource.title);

  if (!normalizedFilename || normalizedFilename === normalizedTitle) {
    return null;
  }

  return resource.original_filename;
}

function searchableText(resource: ExamResourceWithKeyStatus) {
  return [
    resource.title,
    resource.cluster,
    resource.event_name,
    resource.year,
    resource.original_filename,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getStatusLabel(status: ExamKeyStatus) {
  if (status === "complete") {
    return "Complete";
  }

  if (status === "partial") {
    return "Partial";
  }

  return "No Key";
}

function getStatusTone(status: ExamKeyStatus) {
  if (status === "complete") {
    return "green";
  }

  if (status === "partial") {
    return "amber";
  }

  return "slate";
}

function keyRowToDraft(row: ExamAnswerKeyRow): KeyDraftRow {
  return {
    clientId: row.id,
    originalQuestionNumber: row.question_number,
    question_number: String(row.question_number),
    correct_answer: row.correct_answer,
    instructional_area: row.instructional_area ?? "",
  };
}

function createBlankDraftRow(): KeyDraftRow {
  return {
    clientId: crypto.randomUUID(),
    originalQuestionNumber: null,
    question_number: "",
    correct_answer: "A",
    instructional_area: "",
  };
}

function parseBulkAnswers(value: string) {
  const parsedAnswers: ParsedAnswer[] = [];
  const errors: string[] = [];
  const seenQuestions = new Set<number>();

  value.split(/\r?\n/).forEach((line, index) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return;
    }

    const match = trimmedLine.match(/^(\d+)\s*[\.,]?\s*([A-Za-z])$/);

    if (!match) {
      errors.push(`Line ${index + 1}: use a question number and answer, such as "1 B".`);
      return;
    }

    const questionNumber = Number(match[1]);
    const answer = match[2].toUpperCase();

    if (!Number.isInteger(questionNumber) || questionNumber <= 0) {
      errors.push(`Line ${index + 1}: question number must be a positive integer.`);
      return;
    }

    if (!answerOptions.includes(answer as ExamCorrectAnswer)) {
      errors.push(`Line ${index + 1}: answer must be A, B, C, D, or E.`);
      return;
    }

    if (seenQuestions.has(questionNumber)) {
      errors.push(`Line ${index + 1}: question ${questionNumber} appears more than once.`);
      return;
    }

    seenQuestions.add(questionNumber);
    parsedAnswers.push({
      question_number: questionNumber,
      correct_answer: answer as ExamCorrectAnswer,
    });
  });

  return { errors, parsedAnswers };
}

function validateDraftRows(rows: KeyDraftRow[]): { errors: string[]; rows: ExamAnswerKeyInput[] } {
  const errors: string[] = [];
  const seenQuestions = new Set<number>();
  const nextRows: ExamAnswerKeyInput[] = [];

  rows.forEach((row, index) => {
    const questionNumber = Number(row.question_number);

    if (!Number.isInteger(questionNumber) || questionNumber <= 0) {
      errors.push(`Row ${index + 1}: question number must be a positive integer.`);
      return;
    }

    if (seenQuestions.has(questionNumber)) {
      errors.push(`Row ${index + 1}: question ${questionNumber} appears more than once.`);
      return;
    }

    seenQuestions.add(questionNumber);
    nextRows.push({
      question_number: questionNumber,
      correct_answer: row.correct_answer,
      instructional_area: row.instructional_area.trim() || null,
    });
  });

  nextRows.sort((a, b) => a.question_number - b.question_number);

  return { errors, rows: nextRows };
}

export function AdminExamKeysView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exams, setExams] = useState<ExamResourceWithKeyStatus[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamResourceWithKeyStatus | null>(null);
  const [originalRows, setOriginalRows] = useState<ExamAnswerKeyRow[]>([]);
  const [draftRows, setDraftRows] = useState<KeyDraftRow[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [search, setSearch] = useState("");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<KeyStatusFilter>("all");
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadExams() {
      let nextProfile: Profile | null = null;

      try {
        nextProfile = await getCurrentOwnProfile();

        if (!isActive) {
          return;
        }

        setProfile(nextProfile);
        setProfileError(null);
      } catch {
        if (!isActive) {
          return;
        }

        setProfile(null);
        setExams([]);
        setProfileError("Unable to verify account role.");
        setExamError(null);
        setIsLoading(false);
        return;
      }

      if (!isAdminRole(nextProfile?.role)) {
        setExams([]);
        setExamError(null);
        setIsLoading(false);
        return;
      }

      try {
        const nextExams = await ExamKeysService.getApprovedExamResourcesWithKeyStatus();

        if (!isActive) {
          return;
        }

        setExams(nextExams);
        setExamError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setExams([]);
        setExamError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load approved exams.",
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadExams();

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const clusterOptions = useMemo(() => optionize(exams.map((exam) => exam.cluster)), [exams]);
  const yearOptions = useMemo(() => optionize(exams.map((exam) => exam.year)), [exams]);

  const filteredExams = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return exams.filter((exam) => {
      const matchesSearch = !normalizedSearch || searchableText(exam).includes(normalizedSearch);
      const matchesCluster = clusterFilter === "all" || exam.cluster === clusterFilter;
      const matchesYear = yearFilter === "all" || String(exam.year) === yearFilter;
      const matchesStatus =
        statusFilter === "all" || exam.answer_key_status === statusFilter;

      return matchesSearch && matchesCluster && matchesYear && matchesStatus;
    });
  }, [clusterFilter, exams, search, statusFilter, yearFilter]);

  const parsedBulk = useMemo(() => parseBulkAnswers(bulkText), [bulkText]);

  function retryLoad() {
    setIsLoading(true);
    setProfileError(null);
    setExamError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  function updateExamStatus(resourceId: string, answerKeyCount: number) {
    setExams((currentExams) =>
      currentExams.map((exam) =>
        exam.id === resourceId
          ? {
              ...exam,
              answer_key_count: answerKeyCount,
              answer_key_status: ExamKeysService.getExamKeyStatus(answerKeyCount),
            }
          : exam,
      ),
    );

    setSelectedExam((currentExam) =>
      currentExam?.id === resourceId
        ? {
            ...currentExam,
            answer_key_count: answerKeyCount,
            answer_key_status: ExamKeysService.getExamKeyStatus(answerKeyCount),
          }
        : currentExam,
    );
  }

  async function openPdf(exam: ExamResourceWithKeyStatus) {
    setOpeningPdfId(exam.id);
    setExamError(null);

    try {
      const pdfLink = await ResourcesService.getResourcePdfLink(exam.id);
      window.open(pdfLink.signedUrl, "_blank", "noopener,noreferrer");
    } catch (caughtError) {
      setExamError(caughtError instanceof Error ? caughtError.message : "Unable to open PDF.");
    } finally {
      setOpeningPdfId(null);
    }
  }

  async function startManagingKey(exam: ExamResourceWithKeyStatus) {
    setSelectedExam(exam);
    setOriginalRows([]);
    setDraftRows([]);
    setBulkText("");
    setEditorError(null);
    setSuccessMessage(null);
    setIsEditorLoading(true);

    try {
      const rows = await ExamKeysService.getExamAnswerKey(exam.id);
      setOriginalRows(rows);
      setDraftRows(rows.map(keyRowToDraft));
    } catch (caughtError) {
      setEditorError(
        caughtError instanceof Error ? caughtError.message : "Unable to load answer key.",
      );
    } finally {
      setIsEditorLoading(false);
    }
  }

  function closeEditor() {
    setSelectedExam(null);
    setOriginalRows([]);
    setDraftRows([]);
    setBulkText("");
    setEditorError(null);
    setSuccessMessage(null);
  }

  function applyParsedAnswers() {
    setEditorError(null);
    setSuccessMessage(null);

    if (parsedBulk.errors.length > 0) {
      setEditorError("Fix bulk paste validation errors before applying parsed answers.");
      return;
    }

    if (parsedBulk.parsedAnswers.length === 0) {
      setEditorError("Paste at least one valid answer before applying.");
      return;
    }

    const existingByQuestion = new Map(
      draftRows.map((row) => [Number(row.question_number), row]),
    );

    for (const answer of parsedBulk.parsedAnswers) {
      const existingRow = existingByQuestion.get(answer.question_number);

      existingByQuestion.set(answer.question_number, {
        clientId: existingRow?.clientId ?? crypto.randomUUID(),
        originalQuestionNumber: existingRow?.originalQuestionNumber ?? null,
        question_number: String(answer.question_number),
        correct_answer: answer.correct_answer,
        instructional_area: existingRow?.instructional_area ?? "",
      });
    }

    setDraftRows(
      Array.from(existingByQuestion.values()).sort(
        (first, second) => Number(first.question_number) - Number(second.question_number),
      ),
    );
    setSuccessMessage(`Applied ${parsedBulk.parsedAnswers.length} parsed answers to the editor.`);
  }

  function updateDraftRow(clientId: string, patch: Partial<KeyDraftRow>) {
    setDraftRows((currentRows) =>
      currentRows.map((row) => (row.clientId === clientId ? { ...row, ...patch } : row)),
    );
    setSuccessMessage(null);
  }

  function deleteDraftRow(clientId: string) {
    setDraftRows((currentRows) => currentRows.filter((row) => row.clientId !== clientId));
    setSuccessMessage(null);
  }

  function addDraftRow() {
    setDraftRows((currentRows) => [...currentRows, createBlankDraftRow()]);
    setSuccessMessage(null);
  }

  async function saveAnswerKey() {
    if (!selectedExam) {
      return;
    }

    const validation = validateDraftRows(draftRows);

    if (validation.errors.length > 0) {
      setEditorError(validation.errors.join("\n"));
      setSuccessMessage(null);
      return;
    }

    setIsSaving(true);
    setEditorError(null);
    setSuccessMessage(null);

    try {
      const currentQuestionNumbers = new Set(
        validation.rows.map((row) => row.question_number),
      );
      const deletedQuestionNumbers = originalRows
        .map((row) => row.question_number)
        .filter((questionNumber) => !currentQuestionNumbers.has(questionNumber));

      await ExamKeysService.deleteExamAnswerKeyRows(selectedExam.id, deletedQuestionNumbers);
      await ExamKeysService.upsertExamAnswerKey(selectedExam.id, validation.rows);

      const nextRows = await ExamKeysService.getExamAnswerKey(selectedExam.id);
      setOriginalRows(nextRows);
      setDraftRows(nextRows.map(keyRowToDraft));
      updateExamStatus(selectedExam.id, nextRows.length);
      setSuccessMessage(`Saved ${nextRows.length} answer key rows.`);
    } catch (caughtError) {
      setEditorError(caughtError instanceof Error ? caughtError.message : "Unable to save key.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (profileError) {
    return (
      <ResourceErrorState
        message={profileError}
        onRetry={retryLoad}
        title="Unable to verify account role"
      />
    );
  }

  if (!isAdminRole(profile?.role)) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Admin only
        </p>
        <h1 className="mt-2 text-2xl font-bold text-red-950">Access Denied</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">
          You must be an admin to manage exam answer keys.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        actions={<ButtonLink href="/admin">Back to Admin</ButtonLink>}
        description="Create and maintain answer keys for approved exam PDFs before student grading is enabled."
        eyebrow="Admin"
        title="Exam answer keys"
      />

      {examError ? <ResourceErrorState message={examError} onRetry={retryLoad} /> : null}

      <Card>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_180px_180px]">
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Search
            <input
              className="h-11 rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, cluster, event, filename, year..."
              type="search"
              value={search}
            />
          </label>
          <FilterSelect
            label="Cluster"
            onChange={setClusterFilter}
            options={[{ label: "all", value: "all" }, ...clusterOptions]}
            value={clusterFilter}
          />
          <FilterSelect
            label="Year"
            onChange={setYearFilter}
            options={[{ label: "all", value: "all" }, ...yearOptions]}
            value={yearFilter}
          />
          <FilterSelect
            label="Key status"
            onChange={(value) => setStatusFilter(value as KeyStatusFilter)}
            options={statusOptions}
            value={statusFilter}
          />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Showing {filteredExams.length} of {exams.length} approved exams.
        </p>
      </Card>

      {filteredExams.length === 0 ? (
        <Card className="grid min-h-56 place-items-center text-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">No approved exams found</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
              Approved exam resources will appear here once they exist in Supabase and
              match the current filters.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredExams.map((exam) => (
            <ExamKeyCard
              exam={exam}
              isOpeningPdf={openingPdfId === exam.id}
              key={exam.id}
              onManage={() => void startManagingKey(exam)}
              onOpenPdf={() => void openPdf(exam)}
            />
          ))}
        </div>
      )}

      {selectedExam ? (
        <ExamKeyEditorModal
          bulkText={bulkText}
          draftRows={draftRows}
          editorError={editorError}
          exam={selectedExam}
          isEditorLoading={isEditorLoading}
          isSaving={isSaving}
          onAddRow={addDraftRow}
          onApplyParsed={applyParsedAnswers}
          onBulkTextChange={setBulkText}
          onClose={closeEditor}
          onDeleteRow={deleteDraftRow}
          onSave={() => void saveAnswerKey()}
          onUpdateRow={updateDraftRow}
          parsedAnswers={parsedBulk.parsedAnswers}
          parseErrors={parsedBulk.errors}
          successMessage={successMessage}
        />
      ) : null}
    </>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
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
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExamKeyCard({
  exam,
  isOpeningPdf,
  onManage,
  onOpenPdf,
}: {
  exam: ExamResourceWithKeyStatus;
  isOpeningPdf: boolean;
  onManage: () => void;
  onOpenPdf: () => void;
}) {
  const usefulOriginalFilename = getUsefulOriginalFilename(exam);

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <Badge tone={getStatusTone(exam.answer_key_status)}>
          {getStatusLabel(exam.answer_key_status)}
        </Badge>
        <Badge tone="blue">exam</Badge>
        <Badge>{exam.year ?? "Year TBD"}</Badge>
      </div>

      <h2 className="mt-4 text-lg font-semibold text-slate-950">{exam.title}</h2>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {[
          ["Cluster", exam.cluster],
          ["Year", exam.year],
          ["Answer key questions", exam.answer_key_count],
          ...(usefulOriginalFilename
            ? ([["Original filename", usefulOriginalFilename]] as const)
            : []),
        ].map(([label, value]) => (
          <div className="rounded-lg bg-slate-50 p-3" key={label}>
            <dt className="font-semibold text-slate-800">{label}</dt>
            <dd className="mt-1 break-words text-slate-600">
              {value === null || value === undefined || value === "" ? "Not available" : value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
          onClick={onManage}
          type="button"
        >
          Manage Key
        </button>
        <button
          className="min-h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-blue-300"
          disabled={isOpeningPdf}
          onClick={onOpenPdf}
          type="button"
        >
          {isOpeningPdf ? "Opening..." : "Open PDF"}
        </button>
      </div>
    </Card>
  );
}

function ExamKeyEditorModal({
  bulkText,
  draftRows,
  editorError,
  exam,
  isEditorLoading,
  isSaving,
  onAddRow,
  onApplyParsed,
  onBulkTextChange,
  onClose,
  onDeleteRow,
  onSave,
  onUpdateRow,
  parsedAnswers,
  parseErrors,
  successMessage,
}: {
  bulkText: string;
  draftRows: KeyDraftRow[];
  editorError: string | null;
  exam: ExamResourceWithKeyStatus;
  isEditorLoading: boolean;
  isSaving: boolean;
  onAddRow: () => void;
  onApplyParsed: () => void;
  onBulkTextChange: (value: string) => void;
  onClose: () => void;
  onDeleteRow: (clientId: string) => void;
  onSave: () => void;
  onUpdateRow: (clientId: string, patch: Partial<KeyDraftRow>) => void;
  parsedAnswers: ParsedAnswer[];
  parseErrors: string[];
  successMessage: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <form
        className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Answer key
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{exam.title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {exam.cluster ?? "Cluster TBD"} · {exam.year ?? "Year TBD"} ·{" "}
              {draftRows.length} saved rows in editor
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            <button
              className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
              disabled={isSaving || isEditorLoading}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save key"}
            </button>
          </div>
        </div>

        {isEditorLoading ? <ResourceLoadingState /> : null}

        {!isEditorLoading ? (
          <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardHeader eyebrow="Bulk paste" title="Paste answers" />
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Answer key text
                <textarea
                  className="min-h-52 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => onBulkTextChange(event.target.value)}
                  placeholder={"1 B\n2. D\n3,A"}
                  value={bulkText}
                />
              </label>

              <div className="mt-4 rounded-lg border border-slate-100 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  Parsed preview ({parsedAnswers.length})
                </p>
                {parseErrors.length > 0 ? (
                  <ul className="mt-3 grid gap-2 text-sm text-red-700">
                    {parseErrors.map((parseError) => (
                      <li className="rounded-md bg-red-50 p-2" key={parseError}>
                        {parseError}
                      </li>
                    ))}
                  </ul>
                ) : parsedAnswers.length > 0 ? (
                  <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-slate-100">
                    {parsedAnswers.slice(0, 20).map((answer) => (
                      <div
                        className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                        key={answer.question_number}
                      >
                        <span>Question {answer.question_number}</span>
                        <span className="font-semibold text-slate-950">
                          {answer.correct_answer}
                        </span>
                      </div>
                    ))}
                    {parsedAnswers.length > 20 ? (
                      <p className="px-3 py-2 text-sm text-slate-500">
                        + {parsedAnswers.length - 20} more
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Paste question-answer lines to preview them before adding them to the editor.
                  </p>
                )}
              </div>

              <button
                className="mt-4 min-h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-blue-300"
                disabled={parseErrors.length > 0 || parsedAnswers.length === 0}
                onClick={onApplyParsed}
                type="button"
              >
                Apply parsed answers
              </button>
            </Card>

            <Card>
              <CardHeader
                action={
                  <button
                    className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                    onClick={onAddRow}
                    type="button"
                  >
                    Add row
                  </button>
                }
                eyebrow="Manual edit"
                title="Answer rows"
              />

              {editorError ? (
                <div className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {editorError}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {successMessage}
                </div>
              ) : null}

              {draftRows.length === 0 ? (
                <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
                  <div>
                    <p className="font-semibold text-slate-950">No answer rows yet</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Paste answers or add rows manually to start this key.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                        <th className="py-3 pr-3">Question</th>
                        <th className="py-3 pr-3">Correct answer</th>
                        <th className="py-3 pr-3">Instructional area</th>
                        <th className="py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftRows.map((row) => (
                        <tr className="border-b border-slate-100 last:border-b-0" key={row.clientId}>
                          <td className="py-3 pr-3">
                            <input
                              className="h-10 w-28 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                              min={1}
                              onChange={(event) =>
                                onUpdateRow(row.clientId, {
                                  question_number: event.target.value,
                                })
                              }
                              type="number"
                              value={row.question_number}
                            />
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              className="h-10 rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                              onChange={(event) =>
                                onUpdateRow(row.clientId, {
                                  correct_answer: event.target.value as ExamCorrectAnswer,
                                })
                              }
                              value={row.correct_answer}
                            >
                              {answerOptions.map((answer) => (
                                <option key={answer} value={answer}>
                                  {answer}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-3">
                            <input
                              className="h-10 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                              onChange={(event) =>
                                onUpdateRow(row.clientId, {
                                  instructional_area: event.target.value,
                                })
                              }
                              placeholder="Optional"
                              value={row.instructional_area}
                            />
                          </td>
                          <td className="py-3 text-right">
                            <button
                              className="min-h-10 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                              onClick={() => onDeleteRow(row.clientId)}
                              type="button"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </form>
    </div>
  );
}
