import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  AdminReadinessSummary,
  ConceptFeedbackAttempt,
  ConceptMastery,
  ConceptMasteryStatus,
  ExamAttempt,
  Json,
  Profile,
  ResourceListItem,
  RoleplayAttempt,
  StudentActivityReadinessSummary,
  StudentConceptMasteryReadiness,
  StudentExamReadinessSummary,
  StudentReadinessSummary,
  StudentRecommendedNextStep,
  StudentRoleplayFeedbackSummary,
} from "@/lib/types";

const masteryStatuses: ConceptMasteryStatus[] = [
  "not_started",
  "learning",
  "practicing",
  "almost_mastered",
  "mastered",
];

const masteryRank: Record<ConceptMasteryStatus, number> = {
  not_started: 0,
  learning: 1,
  practicing: 2,
  almost_mastered: 3,
  mastered: 4,
};

type EventRow = {
  id: string;
  code: string;
  name: string | null;
};

type ConceptRow = {
  id: string;
  name: string;
  slug: string | null;
};

type KeySetRow = {
  id: string;
};

function emptyMasteryCounts() {
  return Object.fromEntries(masteryStatuses.map((status) => [status, 0])) as Record<
    ConceptMasteryStatus,
    number
  >;
}

function percentage(value: number) {
  return Number(value.toFixed(2));
}

function average(values: Array<number | null | undefined>) {
  const numericValues = values.filter((value): value is number => typeof value === "number");

  if (numericValues.length === 0) {
    return null;
  }

  return percentage(
    numericValues.reduce((total, value) => total + value, 0) / numericValues.length,
  );
}

function countJsonStrings(values: Array<Json | null>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (typeof item !== "string") {
        continue;
      }

      const label = item.trim();

      if (label.length === 0) {
        continue;
      }

      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 6)
    .map(([label]) => label);
}

function toStudentRoleplayFeedbackSummary(
  attempt: RoleplayAttempt,
  resourcesById: Map<string, ResourceListItem>,
): StudentRoleplayFeedbackSummary {
  const resource = resourcesById.get(attempt.resource_id);

  return {
    id: attempt.id,
    resource_id: attempt.resource_id,
    resource_title: resource?.title ?? "Unknown roleplay",
    event_code: resource?.event_code ?? null,
    ai_overall_score: attempt.ai_overall_score,
    ai_feedback_status: attempt.ai_feedback_status,
    strengths: attempt.strengths,
    growth_areas: attempt.growth_areas,
    created_at: attempt.created_at,
    href: `/roleplays/attempts/${attempt.id}`,
  };
}

async function safeSection<T>(fallback: T, loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

async function loadMcsLearningCatalog() {
  const supabase = getSupabaseAdminClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,code,name")
    .eq("code", "MCS")
    .maybeSingle();

  if (eventError || !event) {
    throw new Error(eventError?.message ?? "MCS event is unavailable.");
  }

  const { data: keySets, error: keySetsError } = await supabase
    .from("key_sets")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "approved");

  if (keySetsError) {
    throw new Error(keySetsError.message);
  }

  const keySetRows = (keySets ?? []) as KeySetRow[];

  if (keySetRows.length === 0) {
    return { event: event as EventRow, keySets: keySetRows, concepts: [] as ConceptRow[] };
  }

  const { data: links, error: linksError } = await supabase
    .from("key_set_concepts")
    .select("concept_id")
    .in(
      "key_set_id",
      keySetRows.map((keySet) => keySet.id),
    );

  if (linksError) {
    throw new Error(linksError.message);
  }

  const conceptIds = Array.from(
    new Set((links ?? []).map((link) => link.concept_id).filter(Boolean)),
  );

  if (conceptIds.length === 0) {
    return { event: event as EventRow, keySets: keySetRows, concepts: [] as ConceptRow[] };
  }

  const { data: concepts, error: conceptsError } = await supabase
    .from("concepts")
    .select("id,name,slug")
    .eq("status", "approved")
    .in("id", conceptIds)
    .order("name", { ascending: true });

  if (conceptsError) {
    throw new Error(conceptsError.message);
  }

  return {
    event: event as EventRow,
    keySets: keySetRows,
    concepts: (concepts ?? []) as ConceptRow[],
  };
}

async function loadStudentConceptReadiness(
  userId: string,
): Promise<StudentConceptMasteryReadiness> {
  const supabase = getSupabaseAdminClient();
  const { event, keySets, concepts } = await loadMcsLearningCatalog();
  const masteryCounts = emptyMasteryCounts();

  if (concepts.length === 0) {
    return {
      status: "ok",
      eventCode: event.code,
      eventName: event.name,
      conceptCount: 0,
      keySetCount: keySets.length,
      masteryCounts,
      weakestConcepts: [],
    };
  }

  const { data: masteryRows, error: masteryError } = await supabase
    .from("concept_mastery")
    .select("*")
    .eq("user_id", userId)
    .in(
      "concept_id",
      concepts.map((concept) => concept.id),
    );

  if (masteryError) {
    throw new Error(masteryError.message);
  }

  const masteryByConceptId = new Map(
    ((masteryRows ?? []) as ConceptMastery[]).map((row) => [row.concept_id, row]),
  );

  const conceptStates = concepts.map((concept) => {
    const mastery = masteryByConceptId.get(concept.id);
    const status = mastery?.status ?? "not_started";
    masteryCounts[status] += 1;

    return {
      id: concept.id,
      name: concept.name,
      status,
      explain_score: mastery?.explain_score ?? null,
      improve_score: mastery?.improve_score ?? null,
      href: `/learn/mcs/concepts/${concept.id}`,
    };
  });

  return {
    status: "ok",
    eventCode: event.code,
    eventName: event.name,
    conceptCount: concepts.length,
    keySetCount: keySets.length,
    masteryCounts,
    weakestConcepts: conceptStates
      .sort(
        (first, second) =>
          masteryRank[first.status] - masteryRank[second.status] ||
          (first.explain_score ?? -1) - (second.explain_score ?? -1) ||
          first.name.localeCompare(second.name),
      )
      .slice(0, 5),
  };
}

async function loadStudentRecentConceptFeedback(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: feedbackRows, error } = await supabase
    .from("concept_feedback_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  const attempts = (feedbackRows ?? []) as ConceptFeedbackAttempt[];
  const conceptIds = Array.from(new Set(attempts.map((attempt) => attempt.concept_id)));
  const conceptsById = new Map<string, ConceptRow>();

  if (conceptIds.length > 0) {
    const { data: concepts, error: conceptsError } = await supabase
      .from("concepts")
      .select("id,name,slug")
      .in("id", conceptIds);

    if (conceptsError) {
      throw new Error(conceptsError.message);
    }

    for (const concept of (concepts ?? []) as ConceptRow[]) {
      conceptsById.set(concept.id, concept);
    }
  }

  return attempts.map((attempt) => ({
    id: attempt.id,
    concept_id: attempt.concept_id,
    concept_name: conceptsById.get(attempt.concept_id)?.name ?? "Unknown concept",
    score: attempt.score,
    revision_score: attempt.revision_score,
    status: attempt.status,
    has_revision: Boolean(attempt.revised_response),
    created_at: attempt.created_at,
    href: `/learn/mcs/concepts/${attempt.concept_id}`,
  }));
}

async function loadStudentRecentRoleplayFeedback(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: attempts, error } = await supabase
    .from("roleplay_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  const attemptRows = (attempts ?? []) as RoleplayAttempt[];
  const resourceIds = Array.from(new Set(attemptRows.map((attempt) => attempt.resource_id)));
  const resourcesById = new Map<string, ResourceListItem>();

  if (resourceIds.length > 0) {
    const { data: resources, error: resourcesError } = await supabase
      .from("resources")
      .select("*")
      .in("id", resourceIds);

    if (resourcesError) {
      throw new Error(resourcesError.message);
    }

    for (const resource of (resources ?? []) as ResourceListItem[]) {
      resourcesById.set(resource.id, resource);
    }
  }

  return attemptRows.map((attempt) => toStudentRoleplayFeedbackSummary(attempt, resourcesById));
}

async function loadStudentExamReadiness(userId: string): Promise<StudentExamReadinessSummary> {
  const supabase = getSupabaseAdminClient();
  const { data: attempts, error } = await supabase
    .from("exam_attempts")
    .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const attemptRows = (attempts ?? []) as ExamAttempt[];
  const resourceIds = Array.from(new Set(attemptRows.map((attempt) => attempt.resource_id)));
  const resourcesById = new Map<string, ResourceListItem>();

  if (resourceIds.length > 0) {
    const { data: resources, error: resourcesError } = await supabase
      .from("resources")
      .select("*")
      .in("id", resourceIds);

    if (resourcesError) {
      throw new Error(resourcesError.message);
    }

    for (const resource of (resources ?? []) as ResourceListItem[]) {
      resourcesById.set(resource.id, resource);
    }
  }

  const scores = attemptRows.map((attempt) => attempt.percentage ?? 0);

  return {
    status: "ok",
    attemptsCount: attemptRows.length,
    averageScore:
      scores.length > 0 ? percentage(scores.reduce((total, score) => total + score, 0) / scores.length) : 0,
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    mostRecentScore: attemptRows[0]?.percentage ?? null,
    trend: attemptRows.slice(0, 8).map((attempt) => ({
      id: attempt.id,
      resource_title: resourcesById.get(attempt.resource_id)?.title ?? "Unknown exam",
      percentage: attempt.percentage ?? 0,
      completed_at: attempt.completed_at,
    })),
  };
}

async function loadStudentActivity(userId: string): Promise<StudentActivityReadinessSummary> {
  const supabase = getSupabaseAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [questionAttempts, conceptFeedback, roleplayAttempts, examAttempts] = await Promise.all([
    supabase
      .from("question_attempts")
      .select("created_at", { count: "exact", head: false })
      .eq("user_id", userId)
      .gte("created_at", since),
    supabase
      .from("concept_feedback_attempts")
      .select("created_at", { count: "exact", head: false })
      .eq("user_id", userId)
      .gte("created_at", since),
    supabase
      .from("roleplay_attempts")
      .select("created_at", { count: "exact", head: false })
      .eq("user_id", userId)
      .gte("created_at", since),
    supabase
      .from("exam_attempts")
      .select("completed_at", { count: "exact", head: false })
      .eq("user_id", userId)
      .gte("completed_at", since),
  ]);

  const errors = [questionAttempts.error, conceptFeedback.error, roleplayAttempts.error, examAttempts.error].filter(
    Boolean,
  );

  if (errors[0]) {
    throw new Error(errors[0].message);
  }

  const dates = [
    ...(questionAttempts.data ?? []).map((row) => row.created_at),
    ...(conceptFeedback.data ?? []).map((row) => row.created_at),
    ...(roleplayAttempts.data ?? []).map((row) => row.created_at),
    ...(examAttempts.data ?? []).map((row) => row.completed_at),
  ].filter((value): value is string => Boolean(value));

  return {
    recentQuestionAttempts: questionAttempts.count ?? 0,
    recentConceptFeedback: conceptFeedback.count ?? 0,
    recentRoleplayAttempts: roleplayAttempts.count ?? 0,
    recentExamAttempts: examAttempts.count ?? 0,
    lastPracticedAt:
      dates.length > 0
        ? dates.sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0]
        : null,
  };
}

function getStudentRecommendedNextStep({
  exam,
  learning,
  recentConceptFeedback,
  recentRoleplayFeedback,
}: Pick<
  StudentReadinessSummary,
  "exam" | "learning" | "recentConceptFeedback" | "recentRoleplayFeedback"
>): StudentRecommendedNextStep {
  const revisionCandidate = recentConceptFeedback.items.find(
    (item) => !item.has_revision && item.status === "feedback_given",
  );

  if (revisionCandidate) {
    return {
      title: "Revise your latest concept response",
      description: `Use the feedback on ${revisionCandidate.concept_name} to submit a stronger revision.`,
      href: revisionCandidate.href,
      reason: "A saved feedback attempt is waiting for a revision.",
    };
  }

  const nextConcept = learning.weakestConcepts.find((concept) => concept.status !== "mastered");

  if (nextConcept) {
    return {
      title: `Practice ${nextConcept.name}`,
      description: "Build the next MCS concept before adding more roleplay pressure.",
      href: nextConcept.href,
      reason: `Current status: ${nextConcept.status.replaceAll("_", " ")}.`,
    };
  }

  if (recentRoleplayFeedback.items.length === 0) {
    return {
      title: "Try a roleplay practice attempt",
      description: "Use an approved roleplay to turn concept work into a judge-style response.",
      href: "/roleplays",
      reason: "No roleplay practice attempts are saved yet.",
    };
  }

  const roleplayWithGrowth = recentRoleplayFeedback.items.find((item) => {
    return Array.isArray(item.growth_areas) && item.growth_areas.length > 0;
  });

  if (roleplayWithGrowth) {
    return {
      title: "Follow up on your latest roleplay feedback",
      description: "Review growth areas and make another attempt with a stronger scenario connection.",
      href: roleplayWithGrowth.href,
      reason: "Recent AI practice feedback included growth areas.",
    };
  }

  if (exam.attemptsCount === 0) {
    return {
      title: "Take an exam practice set",
      description: "Add an exam score so your prep plan can spot question patterns.",
      href: "/exams",
      reason: "No exam attempts are saved yet.",
    };
  }

  return {
    title: "Continue guided learning",
    description: "Keep reinforcing MCS concepts and rotate in roleplay and exam practice.",
    href: "/learn/mcs",
    reason: "Your current activity has the main practice streams started.",
  };
}

export async function buildStudentReadinessSummary(
  userId: string,
): Promise<StudentReadinessSummary> {
  const learningFallback: StudentConceptMasteryReadiness = {
    status: "unavailable",
    error: "Learning progress unavailable.",
    eventCode: "MCS",
    eventName: null,
    conceptCount: 0,
    keySetCount: 0,
    masteryCounts: emptyMasteryCounts(),
    weakestConcepts: [],
  };
  const examFallback: StudentExamReadinessSummary = {
    status: "unavailable",
    error: "Exam analytics unavailable.",
    attemptsCount: 0,
    averageScore: 0,
    bestScore: null,
    mostRecentScore: null,
    trend: [],
  };
  const activityFallback: StudentActivityReadinessSummary = {
    recentQuestionAttempts: 0,
    recentConceptFeedback: 0,
    recentRoleplayAttempts: 0,
    recentExamAttempts: 0,
    lastPracticedAt: null,
  };

  const [learning, recentConceptFeedback, recentRoleplayFeedback, exam, activity] =
    await Promise.all([
      safeSection(learningFallback, () => loadStudentConceptReadiness(userId)),
      safeSection([], () => loadStudentRecentConceptFeedback(userId)),
      safeSection([], () => loadStudentRecentRoleplayFeedback(userId)),
      safeSection(examFallback, () => loadStudentExamReadiness(userId)),
      safeSection(activityFallback, () => loadStudentActivity(userId)),
    ]);

  const summaryWithoutStep = {
    generatedAt: new Date().toISOString(),
    learning,
    recentConceptFeedback: {
      status: "ok" as const,
      items: recentConceptFeedback,
    },
    recentRoleplayFeedback: {
      status: "ok" as const,
      items: recentRoleplayFeedback,
    },
    exam,
    activity: {
      status: "ok" as const,
      summary: activity,
    },
  };

  return {
    ...summaryWithoutStep,
    recommendedNextStep: getStudentRecommendedNextStep(summaryWithoutStep),
  };
}

async function loadAdminStudentActivity() {
  const supabase = getSupabaseAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,email,role,created_at,updated_at");

  if (error) {
    throw new Error(error.message);
  }

  const profileRows = (profiles ?? []) as Profile[];
  const studentProfiles = profileRows.filter((profile) => profile.role === "student");
  const activityResults = await Promise.all([
    supabase.from("question_attempts").select("user_id").gte("created_at", since),
    supabase.from("concept_feedback_attempts").select("user_id").gte("created_at", since),
    supabase.from("roleplay_attempts").select("user_id").gte("created_at", since),
    supabase.from("exam_attempts").select("user_id").gte("completed_at", since),
  ]);
  const firstError = activityResults.find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const activeUserIds = new Set<string>();

  for (const result of activityResults) {
    for (const row of result.data ?? []) {
      if (row.user_id) {
        activeUserIds.add(row.user_id);
      }
    }
  }

  return {
    status: "ok" as const,
    totalProfiles: profileRows.length,
    totalStudents: studentProfiles.length,
    activeLast7Days: activeUserIds.size,
    studentsWithRecentAttempts: studentProfiles.filter((profile) => activeUserIds.has(profile.id)).length,
    inactiveStudents: studentProfiles
      .filter((profile) => !activeUserIds.has(profile.id))
      .slice(0, 8)
      .map((profile) => ({ id: profile.id, email: profile.email })),
  };
}

async function loadAdminLearningProgress() {
  const supabase = getSupabaseAdminClient();
  const { concepts } = await loadMcsLearningCatalog();
  const conceptIds = concepts.map((concept) => concept.id);
  const masteryCounts = emptyMasteryCounts();
  const [masteryResult, feedbackResult] = await Promise.all([
    conceptIds.length > 0
      ? supabase.from("concept_mastery").select("*").in("concept_id", conceptIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("concept_feedback_attempts").select("id,status,revised_response"),
  ]);

  if (masteryResult.error) {
    throw new Error(masteryResult.error.message);
  }

  if (feedbackResult.error) {
    throw new Error(feedbackResult.error.message);
  }

  const masteryRows = (masteryResult.data ?? []) as ConceptMastery[];
  const conceptNamesById = new Map(concepts.map((concept) => [concept.id, concept.name]));
  const grouped = new Map<string, ConceptMastery[]>();

  for (const row of masteryRows) {
    masteryCounts[row.status] += 1;
    grouped.set(row.concept_id, [...(grouped.get(row.concept_id) ?? []), row]);
  }

  const weakestConcepts = Array.from(grouped.entries())
    .map(([conceptId, rows]) => ({
      id: conceptId,
      name: conceptNamesById.get(conceptId) ?? "Unknown concept",
      studentsPracticing: rows.filter((row) => row.status !== "mastered").length,
      averageExplainScore: average(rows.map((row) => row.explain_score)),
      averageImproveScore: average(rows.map((row) => row.improve_score)),
    }))
    .sort(
      (first, second) =>
        second.studentsPracticing - first.studentsPracticing ||
        (first.averageExplainScore ?? -1) - (second.averageExplainScore ?? -1) ||
        first.name.localeCompare(second.name),
    )
    .slice(0, 6);

  const feedbackRows = (feedbackResult.data ?? []) as Array<{
    id: string;
    status: string;
    revised_response: string | null;
  }>;

  return {
    status: "ok" as const,
    masteryCounts,
    conceptFeedbackAttempts: feedbackRows.length,
    completedRevisions: feedbackRows.filter((row) => Boolean(row.revised_response)).length,
    weakestConcepts,
  };
}

async function loadAdminRoleplayProgress() {
  const supabase = getSupabaseAdminClient();
  const { data: attempts, error } = await supabase
    .from("roleplay_attempts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const attemptRows = (attempts ?? []) as RoleplayAttempt[];
  const resourceIds = Array.from(new Set(attemptRows.map((attempt) => attempt.resource_id)));
  const resourcesById = new Map<string, ResourceListItem>();

  if (resourceIds.length > 0) {
    const { data: resources, error: resourcesError } = await supabase
      .from("resources")
      .select("*")
      .in("id", resourceIds);

    if (resourcesError) {
      throw new Error(resourcesError.message);
    }

    for (const resource of (resources ?? []) as ResourceListItem[]) {
      resourcesById.set(resource.id, resource);
    }
  }

  const scoredAttempts = attemptRows.filter((attempt) => typeof attempt.ai_overall_score === "number");

  return {
    status: "ok" as const,
    attemptsCount: attemptRows.length,
    feedbackCompletedCount: attemptRows.filter((attempt) => attempt.ai_feedback_status === "complete").length,
    averageAiScore: average(scoredAttempts.map((attempt) => attempt.ai_overall_score)),
    commonGrowthAreas: countJsonStrings(attemptRows.map((attempt) => attempt.growth_areas)),
    recentFeedback: attemptRows
      .filter((attempt) => attempt.ai_feedback_status === "complete" || attempt.ai_overall_score !== null)
      .slice(0, 5)
      .map((attempt) => toStudentRoleplayFeedbackSummary(attempt, resourcesById)),
  };
}

async function loadAdminExamProgress() {
  const supabase = getSupabaseAdminClient();
  const { data: attempts, error } = await supabase
    .from("exam_attempts")
    .select("id,user_id,resource_id,score,total_questions,percentage,completed_at")
    .order("completed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const attemptRows = (attempts ?? []) as ExamAttempt[];
  const resourceIds = Array.from(new Set(attemptRows.map((attempt) => attempt.resource_id)));
  const userIds = Array.from(new Set(attemptRows.map((attempt) => attempt.user_id)));
  const resourcesById = new Map<string, ResourceListItem>();
  const emailsById = new Map<string, string | null>();

  if (resourceIds.length > 0) {
    const { data: resources, error: resourcesError } = await supabase
      .from("resources")
      .select("*")
      .in("id", resourceIds);

    if (resourcesError) {
      throw new Error(resourcesError.message);
    }

    for (const resource of (resources ?? []) as ResourceListItem[]) {
      resourcesById.set(resource.id, resource);
    }
  }

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,email")
      .in("id", userIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of profiles ?? []) {
      emailsById.set(profile.id, profile.email);
    }
  }

  return {
    status: "ok" as const,
    attemptsCount: attemptRows.length,
    averageScore: average(attemptRows.map((attempt) => attempt.percentage)),
    recentExams: attemptRows.slice(0, 6).map((attempt) => ({
      id: attempt.id,
      user_email: emailsById.get(attempt.user_id) ?? null,
      resource_title: resourcesById.get(attempt.resource_id)?.title ?? "Unknown exam",
      percentage: attempt.percentage ?? 0,
      completed_at: attempt.completed_at,
    })),
  };
}

async function countTableRows(table: string, column: string, value: string) {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function loadAdminContentReviewQueue() {
  const [
    pendingResources,
    jobsNeedingReview,
    questionsNeedingReview,
    roleplaysNeedingReview,
    performanceIndicatorsNeedingReview,
    answerKeysNeedingReview,
    rubricsNeedingReview,
  ] = await Promise.all([
    countTableRows("resources", "approval_status", "pending"),
    countTableRows("ai_extraction_jobs", "status", "needs_review"),
    countTableRows("questions", "status", "needs_review"),
    countTableRows("roleplay_scenarios", "status", "needs_review"),
    countTableRows("roleplay_performance_indicators", "status", "needs_review"),
    countTableRows("ai_extracted_answer_keys", "status", "needs_review"),
    countTableRows("rubrics", "status", "needs_review"),
  ]);

  return {
    status: "ok" as const,
    pendingResources,
    jobsNeedingReview,
    questionsNeedingReview,
    roleplaysNeedingReview,
    performanceIndicatorsNeedingReview,
    answerKeysNeedingReview,
    rubricsNeedingReview,
  };
}

export async function buildAdminReadinessSummary(): Promise<AdminReadinessSummary> {
  const [studentActivity, learningProgress, roleplayProgress, examProgress, contentReviewQueue] =
    await Promise.all([
      safeSection<AdminReadinessSummary["studentActivity"]>(
        {
          status: "unavailable" as const,
          error: "Student activity unavailable.",
          totalProfiles: 0,
          totalStudents: 0,
          activeLast7Days: 0,
          studentsWithRecentAttempts: 0,
          inactiveStudents: [],
        },
        loadAdminStudentActivity,
      ),
      safeSection<AdminReadinessSummary["learningProgress"]>(
        {
          status: "unavailable" as const,
          error: "Learning progress unavailable.",
          masteryCounts: emptyMasteryCounts(),
          conceptFeedbackAttempts: 0,
          completedRevisions: 0,
          weakestConcepts: [],
        },
        loadAdminLearningProgress,
      ),
      safeSection<AdminReadinessSummary["roleplayProgress"]>(
        {
          status: "unavailable" as const,
          error: "Roleplay practice data unavailable.",
          attemptsCount: 0,
          feedbackCompletedCount: 0,
          averageAiScore: null,
          commonGrowthAreas: [],
          recentFeedback: [],
        },
        loadAdminRoleplayProgress,
      ),
      safeSection<AdminReadinessSummary["examProgress"]>(
        {
          status: "unavailable" as const,
          error: "Exam analytics unavailable.",
          attemptsCount: 0,
          averageScore: null,
          recentExams: [],
        },
        loadAdminExamProgress,
      ),
      safeSection<AdminReadinessSummary["contentReviewQueue"]>(
        {
          status: "unavailable" as const,
          error: "Content review queue unavailable.",
          pendingResources: 0,
          jobsNeedingReview: 0,
          questionsNeedingReview: 0,
          roleplaysNeedingReview: 0,
          performanceIndicatorsNeedingReview: 0,
          answerKeysNeedingReview: 0,
          rubricsNeedingReview: 0,
        },
        loadAdminContentReviewQueue,
      ),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    studentActivity,
    learningProgress,
    roleplayProgress,
    examProgress,
    contentReviewQueue,
  };
}
