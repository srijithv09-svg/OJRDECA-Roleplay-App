"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
  const progressPercentage =
    exam && exam.questionCount > 0 ? Math.round((answeredCount / exam.questionCount) * 100) : 0;

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
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:text-blue-300"
              disabled={openingPdf}
              onClick={() => void openPdf()}
              type="button"
            >
              {openingPdf ? "Opening..." : "Open PDF"}
            </button>
          </>
        }
        description="Enter your answers from the exam PDF. Unanswered questions count as incorrect."
        eyebrow="Take exam"
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

      <section className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader eyebrow="Progress" title="Answer entry" />
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{exam.resource.cluster ?? "Cluster TBD"}</Badge>
              <Badge>{exam.resource.year ?? "Year TBD"}</Badge>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">
                  {answeredCount} / {exam.questionCount} answered
                </span>
                <span className="text-slate-500">{progressPercentage}%</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-blue-700 transition-all"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">Question count</p>
              <p className="mt-1 text-slate-600">{exam.questionCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">Unanswered</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  unansweredCount > 0 ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {unansweredCount}
              </p>
              {unansweredCount > 0 ? (
                <button
                  className="mt-3 min-h-9 rounded-md border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                  onClick={scrollToFirstUnanswered}
                  type="button"
                >
                  Review unanswered
                </button>
              ) : null}
            </div>
            <button
              className="min-h-11 w-full rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
              disabled={isSubmitting}
              onClick={startSubmitReview}
              type="button"
            >
              {isSubmitting ? "Submitting..." : "Review and submit"}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Answers" title="Question grid" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {exam.questions.map((question) => {
              const selectedAnswer = answers[question.question_number];
              const shouldHighlightUnanswered = showUnansweredWarnings && !selectedAnswer;

              return (
                <div
                  className={`rounded-lg border p-3 shadow-sm transition ${
                    shouldHighlightUnanswered
                      ? "border-amber-300 bg-amber-50 ring-2 ring-amber-100"
                      : selectedAnswer
                        ? "border-emerald-100 bg-white"
                        : "border-slate-100 bg-white"
                  }`}
                  id={`question-${question.question_number}`}
                  key={question.question_number}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">
                      Question {question.question_number}
                    </p>
                    <Badge tone={selectedAnswer ? "green" : "amber"}>
                      {selectedAnswer ? "Answered" : "Needs answer"}
                    </Badge>
                  </div>
                  {shouldHighlightUnanswered ? (
                    <p className="mb-3 rounded-md bg-white px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      This question will be marked incorrect if left blank.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-5 gap-2">
                    {answerOptions.map((answer) => (
                      <button
                        className={`min-h-10 rounded-md border px-2 text-sm font-semibold transition ${
                          selectedAnswer === answer
                            ? "border-blue-700 bg-blue-700 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
                        }`}
                        aria-pressed={selectedAnswer === answer}
                        key={answer}
                        onClick={() => setQuestionAnswer(question.question_number, answer)}
                        type="button"
                      >
                        {answer}
                      </button>
                    ))}
                  </div>
                  <button
                    className="mt-3 min-h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                    onClick={() => setQuestionAnswer(question.question_number, undefined)}
                    type="button"
                  >
                    Clear answer
                  </button>
                </div>
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

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      role="dialog"
    >
      <Card className="w-full max-w-xl">
        <Badge tone={unansweredCount > 0 ? "amber" : "green"}>
          {unansweredCount > 0 ? "Review needed" : "Ready to grade"}
        </Badge>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">
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
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Keep editing
          </button>
          <button
            className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit final attempt"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function LinkButton({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
      href={href}
    >
      {children}
    </Link>
  );
}
