"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceErrorState, ResourceLoadingState } from "@/components/resources/resource-states";
import { LearningEmptyCard, eventPath, masteryLabel, masteryTone } from "@/components/learn/learning-ui";
import { LearningService, type ConceptLearningData } from "@/lib/services/learning";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ConceptMastery, Json, QuestionAttempt, StructuredQuestion } from "@/lib/types";

type AttemptApiResponse = {
  attempt?: QuestionAttempt;
  error?: string;
  isCorrect?: boolean | null;
  mastery?: ConceptMastery | null;
};

function arrayFromJson(value: Json | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function choicesAsStrings(question: StructuredQuestion) {
  if (Array.isArray(question.choices)) {
    return question.choices
      .map((choice) => {
        if (typeof choice === "string") {
          return choice;
        }

        if (choice && typeof choice === "object" && "label" in choice) {
          const label = choice.label;
          return typeof label === "string" ? label : null;
        }

        return null;
      })
      .filter((choice): choice is string => Boolean(choice));
  }

  if (question.choices && typeof question.choices === "object") {
    const maybeOptions = (question.choices as { options?: Json }).options;
    return arrayFromJson(maybeOptions ?? null);
  }

  return [];
}

function matchingPairs(question: StructuredQuestion) {
  if (!question.choices || typeof question.choices !== "object" || Array.isArray(question.choices)) {
    return [];
  }

  const pairs = (question.choices as { pairs?: Json }).pairs;

  if (!Array.isArray(pairs)) {
    return [];
  }

  return pairs
    .map((pair) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) {
        return null;
      }

      const left = (pair as { left?: Json }).left;
      const options = (pair as { options?: Json }).options;

      return typeof left === "string" && Array.isArray(options)
        ? {
            left,
            options: options.filter((option): option is string => typeof option === "string"),
          }
        : null;
    })
    .filter((pair): pair is { left: string; options: string[] } => Boolean(pair));
}

function latestAttemptForQuestion(attempts: QuestionAttempt[], questionId: string) {
  return attempts.find((attempt) => attempt.question_id === questionId) ?? null;
}

function questionSection(question: StructuredQuestion) {
  if (question.question_type === "free_text" || question.ladder_stage === "explain") {
    return "explain";
  }

  if (question.ladder_stage === "apply") {
    return "scenario";
  }

  return "quick";
}

export function LearnConceptView({
  conceptId,
  eventCode,
}: {
  conceptId: string;
  eventCode: string;
}) {
  const [data, setData] = useState<ConceptLearningData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const [{ data: sessionData }, event] = await Promise.all([
        supabase.auth.getSession(),
        LearningService.getLearningEventByCode(eventCode),
      ]);

      if (!event?.is_pilot) {
        setData(null);
        return;
      }

      setData(
        await LearningService.getConceptLearningData(
          conceptId,
          event.id,
          sessionData.session?.user.id,
        ),
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load this concept.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, eventCode]);

  const groupedQuestions = useMemo(() => {
    const groups = {
      explain: [] as StructuredQuestion[],
      quick: [] as StructuredQuestion[],
      scenario: [] as StructuredQuestion[],
    };

    for (const question of data?.questions ?? []) {
      groups[questionSection(question)].push(question);
    }

    return groups;
  }, [data?.questions]);

  if (isLoading) {
    return <ResourceLoadingState />;
  }

  if (error) {
    return <ResourceErrorState message={error} onRetry={load} title="Unable to load concept" />;
  }

  if (!data) {
    return (
      <LearningEmptyCard title="This concept is not available.">
        <p>This event does not have an approved guided learning concept at this address.</p>
        <ButtonLink className="mt-4" href="/learn">Back to Learn</ButtonLink>
      </LearningEmptyCard>
    );
  }

  const { attempts, concept, event, mastery } = data;

  return (
    <>
      <PageHeader
        actions={<ButtonLink href={eventPath(event)}>Back to {event.code}</ButtonLink>}
        description="Work through the learning ladder: recognize, define, connect, apply, explain, and improve."
        eyebrow={`${event.code} concept`}
        title={concept.name}
      />

      <Card>
        <div className="flex flex-wrap gap-2">
          <Badge tone={masteryTone(mastery?.status)}>{masteryLabel(mastery?.status)}</Badge>
          {concept.instructional_area ? <Badge>{concept.instructional_area}</Badge> : null}
          {concept.cluster ? <Badge>{concept.cluster}</Badge> : null}
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Learn the key" title={concept.name} />
        <div className="grid gap-4 text-sm leading-6 text-slate-700">
          {concept.student_friendly_definition ? <p>{concept.student_friendly_definition}</p> : null}
          {concept.detailed_explanation ? <p>{concept.detailed_explanation}</p> : null}
          {concept.example ? (
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">Example</p>
              <p className="mt-1">{concept.example}</p>
            </div>
          ) : null}
          {concept.common_misconceptions ? (
            <div className="rounded-lg bg-amber-50 p-4 text-amber-900">
              <p className="font-semibold">Watch for</p>
              <p className="mt-1">{concept.common_misconceptions}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <QuestionSection
        attempts={attempts}
        empty="No approved quick checks are available for this concept yet."
        onSaved={load}
        questions={groupedQuestions.quick}
        title="Quick Checks"
      />

      <QuestionSection
        attempts={attempts}
        empty="No approved scenario question is available for this concept yet."
        onSaved={load}
        questions={groupedQuestions.scenario}
        title="Scenario/Application"
      />

      <QuestionSection
        attempts={attempts}
        empty="Explain how this concept could help a business make a better decision in a DECA roleplay scenario."
        onSaved={load}
        questions={groupedQuestions.explain}
        title="Explain"
      />

      <Card className="border-blue-100 bg-blue-50">
        <CardHeader eyebrow="Improve" title="Revision guidance" />
        <p className="text-sm leading-6 text-blue-900">
          AI feedback and revision scoring will be added in the next phase. For now, revise your answer to include a definition,
          explanation, scenario connection, and an above-and-beyond idea.
        </p>
      </Card>
    </>
  );
}

function QuestionSection({
  attempts,
  empty,
  onSaved,
  questions,
  title,
}: {
  attempts: QuestionAttempt[];
  empty: string;
  onSaved: () => void;
  questions: StructuredQuestion[];
  title: string;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      {questions.length === 0 ? (
        <p className="text-sm leading-6 text-slate-600">{empty}</p>
      ) : (
        <div className="grid gap-4">
          {questions.map((question) => (
            <QuestionCard
              attempt={latestAttemptForQuestion(attempts, question.id)}
              key={question.id}
              onSaved={onSaved}
              question={question}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function QuestionCard({
  attempt,
  onSaved,
  question,
}: {
  attempt: QuestionAttempt | null;
  onSaved: () => void;
  question: StructuredQuestion;
}) {
  const [answer, setAnswer] = useState<Json>(
    question.question_type === "multiple_select" ? [] : question.question_type === "matching" ? {} : "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const choices = choicesAsStrings(question);
  const pairs = matchingPairs(question);

  async function save() {
    setIsSaving(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        throw new Error(error?.message ?? "You must be signed in to save practice.");
      }

      const response = await fetch("/api/learn/question-attempts", {
        body: JSON.stringify({ answer, question_id: question.id }),
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as AttemptApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save this attempt.");
      }

      if (payload.isCorrect === true) {
        setMessage("Correct. Attempt saved.");
      } else if (payload.isCorrect === false) {
        setMessage("Attempt saved. Review the explanation and try again.");
      } else {
        setMessage("Response saved for practice.");
      }

      onSaved();
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Unable to save this attempt.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleMultiSelect(choice: string, checked: boolean) {
    const current = arrayFromJson(answer);
    setAnswer(checked ? [...current, choice] : current.filter((item) => item !== choice));
  }

  function updateMatching(left: string, value: string) {
    const current = answer && typeof answer === "object" && !Array.isArray(answer) ? answer : {};
    setAnswer({ ...current, [left]: value });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap gap-2">
        {question.ladder_stage ? <Badge tone="blue">{question.ladder_stage}</Badge> : null}
        <Badge>{question.question_type.replace(/_/g, " ")}</Badge>
        {attempt ? <Badge tone={attempt.is_correct ? "green" : attempt.is_correct === false ? "amber" : "blue"}>saved</Badge> : null}
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">{question.prompt}</p>

      <div className="mt-4 grid gap-3">
        {question.question_type === "multiple_choice" ? (
          choices.map((choice) => (
            <label className="flex items-center gap-3 text-sm text-slate-700" key={choice}>
              <input
                checked={answer === choice}
                className="h-4 w-4"
                onChange={() => setAnswer(choice)}
                type="radio"
              />
              {choice}
            </label>
          ))
        ) : question.question_type === "multiple_select" ? (
          choices.map((choice) => (
            <label className="flex items-center gap-3 text-sm text-slate-700" key={choice}>
              <input
                checked={arrayFromJson(answer).includes(choice)}
                className="h-4 w-4"
                onChange={(event) => toggleMultiSelect(choice, event.target.checked)}
                type="checkbox"
              />
              {choice}
            </label>
          ))
        ) : question.question_type === "matching" && pairs.length > 0 ? (
          pairs.map((pair) => (
            <label className="grid gap-2 text-sm font-semibold text-slate-800" key={pair.left}>
              {pair.left}
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => updateMatching(pair.left, event.target.value)}
                value={
                  answer && typeof answer === "object" && !Array.isArray(answer)
                    ? String((answer as Record<string, Json>)[pair.left] ?? "")
                    : ""
                }
              >
                <option value="">Choose a match</option>
                {pair.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))
        ) : question.question_type === "free_text" ? (
          <textarea
            className="min-h-32 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Write your DECA-ready explanation..."
            value={typeof answer === "string" ? answer : ""}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            This question format needs review before it can be answered here.
          </p>
        )}
      </div>

      {question.explanation ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          {question.explanation}
        </p>
      ) : null}

      {message ? <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p> : null}

      <button
        className="mt-4 min-h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
        disabled={isSaving}
        onClick={() => void save()}
        type="button"
      >
        {isSaving ? "Saving..." : "Save answer"}
      </button>
    </div>
  );
}
