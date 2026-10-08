"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import {
  ExamAttemptsService,
  type ExamForTaking,
  type ExamSubmitAnswer,
} from "@/lib/services/exam-attempts";
import { ResourcesService } from "@/lib/services/resources";
import type { ExamCorrectAnswer } from "@/lib/types";

const answerOptions: ExamCorrectAnswer[] = ["A", "B", "C", "D", "E"];

export function ExamTakeView() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [exam, setExam] = useState<ExamForTaking | null>(null);
  const [answers, setAnswers] = useState<Record<number, ExamCorrectAnswer | undefined>>({});
  const [openingPdf, setOpeningPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const [showUnansweredWarnings, setShowUnansweredWarnings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadExam() {
      try {
        if (!id) {
          throw new Error("Missing exam id.");
        }

        const nextExam = await ExamAttemptsService.getExamForTaking(id);

        if (!isActive) {
          return;
        }

        setExam(nextExam);
        setAnswers({});
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Unable to load exam.");
        setExam(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadExam();

    return () => {
      isActive = false;
    };
  }, [id, reloadKey]);

  const answeredCount = useMemo(
    () => (exam ? exam.questions.filter((question) => answers[question.question_number]).length : 0),
    [answers, exam],
  );
  const unansweredCount = (exam?.questionCount ?? 0) - answeredCount;
  const unansweredQuestions = useMemo(
    () =>
      exam
        ? exam.questions
            .filter((question) => !answers[question.question_number])
            .map((question) => question.question_number)
        : [],
    [answers, exam],
  );

  function retryLoad() {
    setIsLoading(true);
    setError(null);
    setReloadKey((currentKey) => currentKey + 1);
  }

  function setQuestionAnswer(questionNumber: number, answer: ExamCorrectAnswer | undefined) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionNumber]: answer,
    }));
  }

  function scrollToFirstUnanswered() {
    const firstUnanswered = unansweredQuestions[0];

    if (!firstUnanswered) {
      return;
    }

    document
      .getElementById(`question-${firstUnanswered}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setShowUnansweredWarnings(true);
  }

  async function openPdf() {
    if (!id) {
      return;
    }

    setOpeningPdf(true);
    setError(null);

    try {
      const pdfLink = await ResourcesService.getResourcePdfLink(id);
      window.open(pdfLink.signedUrl, "_blank", "noopener,noreferrer");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to open PDF.");
    } finally {
      setOpeningPdf(false);
    }
  }

  function startSubmitReview() {
    setShowUnansweredWarnings(true);
    setIsConfirmingSubmit(true);
  }

  async function submitAttempt() {
    if (!id || !exam) {
      return;
    }

    const submittedAnswers: ExamSubmitAnswer[] = Object.entries(answers)
      .filter(([, answer]) => Boolean(answer))
      .map(([questionNumber, answer]) => ({
        question_number: Number(questionNumber),
        selected_answer: answer as ExamCorrectAnswer,
      }));

    setIsSubmitting(true);
    setIsConfirmingSubmit(false);
    setError(null);

    try {
      const result = await ExamAttemptsService.submitExamAttempt(id, submittedAnswers);
      router.push(`/exams/attempts/${result.attemptId}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to submit exam attempt.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error && !exam) {
    return <ResourceErrorState message={error} onRetry={retryLoad} />;
  }

  if (!exam) {
    return (
      <Card className="grid min-h-64 place-items-center text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">Exam unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This exam could not be loaded for answer entry.
          </p>
        </div>
      </Card>
    );
  }

  if (!exam.hasAnswerKey) {
    return (
      <>
        <PageHeader
          actions={<LinkButton href="/exams">Back to Exams</LinkButton>}
          description="This approved exam exists, but an answer key has not been created yet."
          eyebrow="Exam"
          title={exam.resource.title}
        />
        <Card className="grid min-h-64 place-items-center text-center">
          <div>
            <h1 className="text-lg font-semibold text-slate-950">
              This exam is not ready for grading yet.
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
              An admin needs to add an answer key before students can submit answers.
            </p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <LinkButton href={`/resources/${exam.resource.id}`}>Resource detail</LinkButton>
            <button
              className="ui-button ui-button-secondary"
              disabled={openingPdf}
              onClick={() => void openPdf()}
              type="button"
            >
              {openingPdf ? "Opening..." : "Open PDF"}
            </button>
          </>
        }
        description="Enter your answers from the exam PDF. Unanswered questions count as incorrect."
        eyebrow="Exam practice"
        title={exam.resource.title}
      />

      {error ? <ResourceErrorState message={error} onRetry={retryLoad} /> : null}

      {isConfirmingSubmit ? (
        <SubmitConfirmationDialog
          answeredCount={answeredCount}
          isSubmitting={isSubmitting}
          onCancel={() => setIsConfirmingSubmit(false)}
          onConfirm={() => void submitAttempt()}
          totalQuestions={exam.questionCount}
          unansweredQuestions={unansweredQuestions}
        />
      ) : null}

      <section className="grid items-start gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-24">
          <CardHeader title="Your progress" />
          <p className="text-sm text-[var(--muted)]">{[exam.resource.cluster, exam.resource.year].filter(Boolean).join(" · ")}</p>
          <div className="mt-5">
            <p className="text-sm font-semibold" role="status">{answeredCount} of {exam.questionCount} answered</p>
            <progress aria-label="Exam answers completed" className="exam-progress mt-3 w-full" max={exam.questionCount} value={answeredCount} />
            <p className="mt-2 text-sm text-[var(--muted)]">{unansweredCount} unanswered</p>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            {unansweredCount > 0 ? <button className="ui-button ui-button-secondary" onClick={scrollToFirstUnanswered} type="button">Review unanswered</button> : null}
            <button className="ui-button ui-button-primary" disabled={isSubmitting} onClick={startSubmitReview} type="button">
              {isSubmitting ? "Submitting..." : "Review and submit"}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Answer sheet" />
          <p className="mb-5 text-sm text-[var(--muted)]">Select one answer for each question in the PDF.</p>
          <div className="grid gap-x-6 gap-y-2 2xl:grid-cols-2">
            {exam.questions.map((question) => {
              const selectedAnswer = answers[question.question_number];
              const shouldHighlightUnanswered = showUnansweredWarnings && !selectedAnswer;
              return (
                <fieldset
                  className={`min-w-0 scroll-mt-36 border-b py-3 ${shouldHighlightUnanswered ? "border-amber-300" : "border-border"}`}
                  id={`question-${question.question_number}`}
                  key={question.question_number}
                >
                  <legend className="sr-only">Question {question.question_number}</legend>
                  <div className="flex flex-wrap items-center gap-3">
                    <span aria-hidden="true" className="w-7 shrink-0 text-sm font-semibold tabular-nums">{question.question_number}.</span>
                    <div className="flex flex-1 gap-1.5 sm:gap-2">
                      {answerOptions.map((answer) => (
                        <button
                          aria-label={`Question ${question.question_number}, answer ${answer}`}
                          aria-pressed={selectedAnswer === answer}
                          className={`ui-button min-w-10 flex-1 !px-2 sm:flex-none ${selectedAnswer === answer ? "ui-button-primary" : "ui-button-secondary"}`}
                          key={answer}
                          onClick={() => setQuestionAnswer(question.question_number, answer)}
                          type="button"
                        >{answer}</button>
                      ))}
                    </div>
                    <button
                      aria-label={`Clear answer for question ${question.question_number}`}
                      className="inline-flex min-h-10 items-center text-xs font-medium text-[var(--muted)] hover:text-primary disabled:opacity-40"
                      disabled={!selectedAnswer}
                      onClick={() => setQuestionAnswer(question.question_number, undefined)}
                      type="button"
                    >Clear</button>
                  </div>
                  {shouldHighlightUnanswered ? <p className="mt-2 text-xs text-amber-700">Unanswered — counts as incorrect.</p> : null}
                </fieldset>
              );
            })}
          </div>
        </Card>
      </section>
    </>
  );
}

function SubmitConfirmationDialog({
  answeredCount,
  isSubmitting,
  onCancel,
  onConfirm,
  totalQuestions,
  unansweredQuestions,
}: {
  answeredCount: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  totalQuestions: number;
  unansweredQuestions: number[];
}) {
  const unansweredCount = unansweredQuestions.length;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      aria-labelledby="submit-exam-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-md bg-card p-0 text-foreground"
      onCancel={onCancel}
      ref={dialogRef}
    >
      <Card className="w-full max-w-xl">
        <Badge tone={unansweredCount > 0 ? "amber" : "green"}>
          {unansweredCount > 0 ? "Review needed" : "Ready to grade"}
        </Badge>
        <h2 className="mt-4 text-xl font-semibold text-slate-950" id="submit-exam-title">
          Submit this exam for grading?
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          You answered {answeredCount} of {totalQuestions} questions. Once submitted,
          this attempt will be saved and included in your dashboard and analytics.
        </p>

        {unansweredCount > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              {unansweredCount} unanswered question{unansweredCount === 1 ? "" : "s"} will
              count as incorrect.
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Missing: {unansweredQuestions.slice(0, 18).join(", ")}
              {unansweredQuestions.length > 18 ? ", ..." : ""}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            All questions have an answer selected.
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="ui-button ui-button-secondary"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Keep editing
          </button>
          <button
            className="ui-button ui-button-primary"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit final attempt"}
          </button>
        </div>
      </Card>
    </dialog>
  );
}

function LinkButton({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="ui-button ui-button-secondary"
      href={href}
    >
      {children}
    </Link>
  );
}
