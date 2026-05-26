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

  async function submitAttempt() {
    if (!id || !exam) {
      return;
    }

    if (
      unansweredCount > 0 &&
      !window.confirm(
        `${unansweredCount} question${unansweredCount === 1 ? "" : "s"} unanswered. Submit anyway? Unanswered questions count as incorrect.`,
      )
    ) {
      return;
    }

    const submittedAnswers: ExamSubmitAnswer[] = Object.entries(answers)
      .filter(([, answer]) => Boolean(answer))
      .map(([questionNumber, answer]) => ({
        question_number: Number(questionNumber),
        selected_answer: answer as ExamCorrectAnswer,
      }));

    setIsSubmitting(true);
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
              <p className="mt-1 text-slate-600">{unansweredCount}</p>
            </div>
            <button
              className="min-h-11 w-full rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-blue-300"
              disabled={isSubmitting}
              onClick={() => void submitAttempt()}
              type="button"
            >
              {isSubmitting ? "Submitting..." : "Submit for grading"}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Answers" title="Question grid" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {exam.questions.map((question) => {
              const selectedAnswer = answers[question.question_number];

              return (
                <div
                  className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm"
                  key={question.question_number}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">
                      Question {question.question_number}
                    </p>
                    <Badge tone={selectedAnswer ? "green" : "amber"}>
                      {selectedAnswer ? "Answered" : "Unanswered"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {answerOptions.map((answer) => (
                      <button
                        className={`min-h-10 rounded-md border px-2 text-sm font-semibold transition ${
                          selectedAnswer === answer
                            ? "border-blue-700 bg-blue-700 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
                        }`}
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
