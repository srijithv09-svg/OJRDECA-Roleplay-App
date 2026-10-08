"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
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

    if (!Number.isInteger(questionNumber) || questionNumber <= 0 || questionNumber > 100) {
      errors.push(`Line ${index + 1}: question number must be between 1 and 100.`);
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

    if (!Number.isInteger(questionNumber) || questionNumber <= 0 || questionNumber > 100) {
      errors.push(`Row ${index + 1}: question number must be between 1 and 100.`);
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
  const [isExtracting, setIsExtracting] = useState(false);
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

  function updateExamStatus(resourceId: string, rows: ExamAnswerKeyRow[]) {
    const answerKeyCount = rows.length;
    const questionNumbers = rows.map((row) => row.question_number);
    setExams((currentExams) =>
      currentExams.map((exam) =>
        exam.id === resourceId
          ? {
              ...exam,
              answer_key_count: answerKeyCount,
              answer_key_status: ExamKeysService.getExamKeyStatus(questionNumbers),
            }
          : exam,
      ),
    );

    setSelectedExam((currentExam) =>
      currentExam?.id === resourceId
        ? {
            ...currentExam,
            answer_key_count: answerKeyCount,
            answer_key_status: ExamKeysService.getExamKeyStatus(questionNumbers),
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
    if (isSaving || isExtracting || isEditorLoading) return;
    setSelectedExam(null);
    setOriginalRows([]);
    setDraftRows([]);
    setBulkText("");
    setEditorError(null);
    setSuccessMessage(null);
  }

  async function extractPdfKey() {
    if (!selectedExam || isExtracting || isSaving) return;
    setIsExtracting(true);
    setEditorError(null);
    setSuccessMessage(null);

    try {
      const preview = await ExamKeysService.extractExamAnswerKey(selectedExam.id);
      setBulkText(preview.rows.map((row) => `${row.question_number}. ${row.correct_answer}`).join("\n"));
      setSuccessMessage(preview.notice);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to read the answer key.");
    } finally {
      setIsExtracting(false);
    }
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
    if (!selectedExam || isSaving || isExtracting || isEditorLoading) {
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

      await ExamKeysService.upsertExamAnswerKey(selectedExam.id, validation.rows);
      await ExamKeysService.deleteExamAnswerKeyRows(selectedExam.id, deletedQuestionNumbers);

      const nextRows = await ExamKeysService.getExamAnswerKey(selectedExam.id);
      setOriginalRows(nextRows);
      setDraftRows(nextRows.map(keyRowToDraft));
      updateExamStatus(selectedExam.id, nextRows);
      const complete = ExamKeysService.getExamKeyStatus(nextRows.map((row) => row.question_number)) === "complete";
      setSuccessMessage(complete
        ? "Saved all 100 answers. This exam is ready for student practice."
        : `Saved ${nextRows.length} answers. Complete questions 1–100 to enable grading.`);
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
        description="Read the printed answer key from an approved exam, review it, and save to enable grading."
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
              Upload and approve an exam to prepare its answer key, or adjust your filters.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
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
          isExtracting={isExtracting}
          isSaving={isSaving}
          onAddRow={addDraftRow}
          onApplyParsed={applyParsedAnswers}
          onBulkTextChange={setBulkText}
          onClose={closeEditor}
          onDeleteRow={deleteDraftRow}
          onExtract={() => void extractPdfKey()}
          onOpenPdf={() => void openPdf(selectedExam)}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{exam.title}</h2>
            <Badge tone={getStatusTone(exam.answer_key_status)}>{getStatusLabel(exam.answer_key_status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {exam.cluster ?? "Cluster not set"} · {exam.year ?? "Year not set"} · {exam.answer_key_count}/100 answers
          </p>
          {usefulOriginalFilename ? <p className="mt-1 break-all text-xs text-[var(--muted)]">{usefulOriginalFilename}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="ui-button ui-button-secondary" disabled={isOpeningPdf} onClick={onOpenPdf} type="button">
            {isOpeningPdf ? "Opening…" : "Open PDF"}
          </button>
          <button className="ui-button ui-button-primary" onClick={onManage} type="button">Manage key</button>
        </div>
      </div>
    </Card>
  );
}

function ExamKeyEditorModal({
  bulkText, draftRows, editorError, exam, isEditorLoading, isExtracting, isSaving,
  onAddRow, onApplyParsed, onBulkTextChange, onClose, onDeleteRow, onExtract, onOpenPdf,
  onSave, onUpdateRow, parsedAnswers, parseErrors, successMessage,
}: {
  bulkText: string;
  draftRows: KeyDraftRow[];
  editorError: string | null;
  exam: ExamResourceWithKeyStatus;
  isEditorLoading: boolean;
  isExtracting: boolean;
  isSaving: boolean;
  onAddRow: () => void;
  onApplyParsed: () => void;
  onBulkTextChange: (value: string) => void;
  onClose: () => void;
  onDeleteRow: (clientId: string) => void;
  onExtract: () => void;
  onOpenPdf: () => void;
  onSave: () => void;
  onUpdateRow: (clientId: string, patch: Partial<KeyDraftRow>) => void;
  parsedAnswers: ParsedAnswer[];
  parseErrors: string[];
  successMessage: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isBusy = isEditorLoading || isExtracting || isSaving;
  const isComplete = ExamKeysService.getExamKeyStatus(draftRows.map((row) => Number(row.question_number))) === "complete";

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      returnFocusTarget?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      aria-labelledby="answer-key-title"
      className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-6xl overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); if (!isBusy) onClose(); }}
      ref={dialogRef}
    >
      <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Answer key</p>
            <h2 className="mt-1 text-lg font-semibold" id="answer-key-title">{exam.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{draftRows.length}/100 answers in editor · {isComplete ? "Ready to save" : "Complete questions 1–100 to enable grading"}</p>
          </div>
          <div className="flex gap-2">
            <button className="ui-button ui-button-secondary" disabled={isBusy} onClick={onClose} type="button">Close</button>
            <button className="ui-button ui-button-primary" disabled={isBusy} type="submit">{isSaving ? "Saving…" : "Save key"}</button>
          </div>
        </div>
        <div className="p-5">
          {isEditorLoading ? <ResourceLoadingState /> : null}
          {editorError ? <div className="mb-4 whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{editorError}</div> : null}
          {successMessage ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{successMessage}</div> : null}
          {!isEditorLoading ? (
            <fieldset className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" disabled={isBusy}>
              <div className="min-w-0 space-y-5">
                <section className="rounded-md border border-border p-4" aria-labelledby="read-key-heading">
                  <h3 className="font-semibold" id="read-key-heading">1. Read the printed key</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Copy the 100 answers printed in this exam PDF into a preview. Review them before applying and saving.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="ui-button ui-button-primary" onClick={onExtract} type="button">{isExtracting ? "Reading PDF…" : "Extract from PDF"}</button>
                    <button className="ui-button ui-button-secondary" onClick={onOpenPdf} type="button">Open PDF</button>
                  </div>
                </section>
                <section className="rounded-md border border-border p-4" aria-labelledby="preview-key-heading">
                  <h3 className="font-semibold" id="preview-key-heading">2. Review and apply</h3>
                  <label className="ui-label mt-3">
                    Preview or paste answers
                    <textarea className="ui-field min-h-36 font-mono" onChange={(event) => onBulkTextChange(event.target.value)} placeholder={"1 B\n2. D\n3,A"} value={bulkText} />
                  </label>
                  <p className="mt-2 text-xs text-[var(--muted)]">One question and answer per line. Applying replaces matching answers in the editor; other rows stay as they are.</p>
                  {parseErrors.length > 0 ? (
                    <ul className="mt-3 max-h-40 list-inside list-disc overflow-y-auto text-sm text-red-700" role="alert">{parseErrors.map((error) => <li key={error}>{error}</li>)}</ul>
                  ) : parsedAnswers.length > 0 ? (
                    <div className="mt-3 grid max-h-44 grid-cols-5 gap-1 overflow-y-auto text-xs" aria-label="Parsed answer preview">
                      {parsedAnswers.map((answer) => <span className="rounded bg-card-muted p-1.5 text-center" key={answer.question_number}>{answer.question_number}. <strong>{answer.correct_answer}</strong></span>)}
                    </div>
                  ) : null}
                  <button className="ui-button ui-button-secondary mt-3" disabled={parseErrors.length > 0 || parsedAnswers.length === 0} onClick={onApplyParsed} type="button">Apply {parsedAnswers.length || "preview"} answers</button>
                </section>
              </div>
              <section className="min-w-0 rounded-md border border-border p-4" aria-labelledby="edit-key-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold" id="edit-key-heading">3. Edit and save</h3>
                  <button className="ui-button ui-button-secondary" onClick={onAddRow} type="button">Add answer</button>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Partial keys can be saved. Grading opens when all 100 answers are present.</p>
                {draftRows.length === 0 ? (
                  <p className="mt-5 rounded-md bg-card-muted p-5 text-sm text-[var(--muted)]">No answers yet. Extract the printed key, paste answers, or add them manually.</p>
                ) : (
                  <div className="mt-4 max-h-[55vh] overflow-auto">
                    <table className="w-full min-w-[420px] text-left text-sm">
                      <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-xs text-[var(--muted)]"><th className="py-2 pr-2">Question</th><th className="py-2 pr-2">Answer</th><th className="py-2 pr-2">Area (optional)</th><th><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>{draftRows.map((row, index) => (
                        <tr className="border-b border-border last:border-0" key={row.clientId}>
                          <td className="py-2 pr-2"><input aria-label={`Question number, row ${index + 1}`} className="ui-field w-20" max={100} min={1} onChange={(event) => onUpdateRow(row.clientId, { question_number: event.target.value })} type="number" value={row.question_number} /></td>
                          <td className="py-2 pr-2"><select aria-label={`Answer for question ${row.question_number || index + 1}`} className="ui-field w-20" onChange={(event) => onUpdateRow(row.clientId, { correct_answer: event.target.value as ExamCorrectAnswer })} value={row.correct_answer}>{answerOptions.map((answer) => <option key={answer} value={answer}>{answer}</option>)}</select></td>
                          <td className="py-2 pr-2"><input aria-label={`Instructional area for question ${row.question_number || index + 1}`} className="ui-field" onChange={(event) => onUpdateRow(row.clientId, { instructional_area: event.target.value })} placeholder="Optional" value={row.instructional_area} /></td>
                          <td className="py-2 text-right"><button aria-label={`Remove question ${row.question_number || index + 1}`} className="ui-button ui-button-danger" onClick={() => onDeleteRow(row.clientId)} type="button">Remove</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            </fieldset>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}
