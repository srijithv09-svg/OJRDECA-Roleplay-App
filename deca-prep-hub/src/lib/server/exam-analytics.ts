import type {
  AdminAnalyticsSummary,
  AnalyticsAreaSummary,
  AnalyticsAttemptSummary,
  ExamAttempt,
  ExamAttemptAnswer,
  MissedQuestionSummary,
  ResourceListItem,
  StudentAnalyticsSummary,
  SupabaseResourceType,
} from "@/lib/types";

const resourceTypes: SupabaseResourceType[] = ["roleplay", "exam", "reference", "unknown"];
const approvalStatuses = ["approved", "pending", "rejected"] as const;

function percentage(value: number) {
  return Number(value.toFixed(2));
}

function getAreaName(value: string | null | undefined) {
  return value?.trim() || "Uncategorized";
}

function getResourceTitle(resource: ResourceListItem | undefined) {
  return resource?.title ?? "Unknown exam";
}

function toAttemptSummary(
  attempt: ExamAttempt,
  resourcesById: Map<string, ResourceListItem>,
  userEmail?: string | null,
): AnalyticsAttemptSummary {
  const resource = resourcesById.get(attempt.resource_id);

  return {
    id: attempt.id,
    user_id: attempt.user_id,
    user_email: userEmail,
    resource_id: attempt.resource_id,
    resource_title: getResourceTitle(resource),
    cluster: resource?.cluster ?? null,
    score: attempt.score ?? 0,
    total_questions: attempt.total_questions ?? 0,
    percentage: attempt.percentage ?? 0,
    completed_at: attempt.completed_at,
  };
}

function buildAreaSummaries(
  answers: ExamAttemptAnswer[],
  mode: "strong" | "weak",
): AnalyticsAreaSummary[] {
  const areas = new Map<string, { correct_count: number; incorrect_count: number }>();

  for (const answer of answers) {
    if (mode === "strong" && !answer.is_correct) {
      continue;
    }

    if (mode === "weak" && answer.is_correct) {
      continue;
    }

    const area = getAreaName(answer.instructional_area);
    const current = areas.get(area) ?? { correct_count: 0, incorrect_count: 0 };

    if (answer.is_correct) {
      current.correct_count += 1;
    } else {
      current.incorrect_count += 1;
    }

    areas.set(area, current);
  }

  return Array.from(areas.entries())
    .map(([instructionalArea, counts]) => {
      const totalCount = counts.correct_count + counts.incorrect_count;

      return {
        instructional_area: instructionalArea,
        correct_count: counts.correct_count,
        incorrect_count: counts.incorrect_count,
        total_count: totalCount,
        percentage:
          totalCount > 0 ? percentage((counts.correct_count / totalCount) * 100) : 0,
      };
    })
    .sort((first, second) => {
      const firstCount = mode === "strong" ? first.correct_count : first.incorrect_count;
      const secondCount = mode === "strong" ? second.correct_count : second.incorrect_count;

      return secondCount - firstCount || first.instructional_area.localeCompare(second.instructional_area);
    });
}

export function buildStudentAnalytics({
  answers,
  attempts,
  resources,
}: {
  answers: ExamAttemptAnswer[];
  attempts: ExamAttempt[];
  resources: ResourceListItem[];
}): StudentAnalyticsSummary {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const sortedAttempts = [...attempts].sort(
    (first, second) =>
      new Date(second.completed_at ?? 0).getTime() -
      new Date(first.completed_at ?? 0).getTime(),
  );
  const attemptHistory = sortedAttempts.map((attempt) =>
    toAttemptSummary(attempt, resourcesById),
  );
  const percentages = attemptHistory.map((attempt) => attempt.percentage);
  const averageScore =
    percentages.length > 0
      ? percentage(percentages.reduce((total, value) => total + value, 0) / percentages.length)
      : 0;
  const missedQuestions: MissedQuestionSummary[] = answers
    .filter((answer) => !answer.is_correct)
    .map((answer) => {
      const attempt = attemptsById.get(answer.attempt_id);
      const resource = attempt ? resourcesById.get(attempt.resource_id) : undefined;

      return {
        attempt_id: answer.attempt_id,
        resource_id: attempt?.resource_id ?? "",
        resource_title: getResourceTitle(resource),
        question_number: answer.question_number,
        instructional_area: getAreaName(answer.instructional_area),
        completed_at: attempt?.completed_at ?? null,
      };
    })
    .sort(
      (first, second) =>
        new Date(second.completed_at ?? 0).getTime() -
        new Date(first.completed_at ?? 0).getTime(),
    );

  return {
    examsCompleted: attempts.length,
    averageScore,
    bestScore: percentages.length > 0 ? Math.max(...percentages) : null,
    mostRecentScore: attemptHistory[0]?.percentage ?? null,
    recentAttempts: attemptHistory.slice(0, 5),
    attemptHistory,
    weakAreas: buildAreaSummaries(answers, "weak").slice(0, 8),
    strongAreas: buildAreaSummaries(answers, "strong").slice(0, 8),
    missedQuestions: missedQuestions.slice(0, 20),
  };
}

export function buildAdminAnalytics({
  answers,
  attempts,
  profileCount,
  profileEmailsById,
  resources,
}: {
  answers: ExamAttemptAnswer[];
  attempts: ExamAttempt[];
  profileCount: number | null;
  profileEmailsById: Map<string, string | null>;
  resources: ResourceListItem[];
}): AdminAnalyticsSummary {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const percentages = attempts.map((attempt) => attempt.percentage ?? 0);
  const averageScore =
    percentages.length > 0
      ? percentage(percentages.reduce((total, value) => total + value, 0) / percentages.length)
      : 0;
  const examAttemptCounts = new Map<string, number>();

  for (const attempt of attempts) {
    examAttemptCounts.set(
      attempt.resource_id,
      (examAttemptCounts.get(attempt.resource_id) ?? 0) + 1,
    );
  }

  const resourceTypeCounts = Object.fromEntries(resourceTypes.map((type) => [type, 0])) as Record<
    SupabaseResourceType,
    number
  >;
  const approvalCounts = Object.fromEntries(approvalStatuses.map((status) => [status, 0])) as Record<
    "approved" | "pending" | "rejected",
    number
  >;

  for (const resource of resources) {
    if (resourceTypes.includes(resource.resource_type)) {
      resourceTypeCounts[resource.resource_type] += 1;
    }

    if (
      resource.approval_status === "approved" ||
      resource.approval_status === "pending" ||
      resource.approval_status === "rejected"
    ) {
      approvalCounts[resource.approval_status] += 1;
    }
  }

  const recentAttempts = [...attempts]
    .sort(
      (first, second) =>
        new Date(second.completed_at ?? 0).getTime() -
        new Date(first.completed_at ?? 0).getTime(),
    )
    .slice(0, 10)
    .map((attempt) =>
      toAttemptSummary(attempt, resourcesById, profileEmailsById.get(attempt.user_id) ?? null),
    );

  return {
    totalAttempts: attempts.length,
    averageScore,
    profileCount,
    profileCountUnavailable: profileCount === null,
    mostAttemptedExams: Array.from(examAttemptCounts.entries())
      .map(([resourceId, count]) => ({
        resource_id: resourceId,
        resource_title: getResourceTitle(resourcesById.get(resourceId)),
        attempts: count,
      }))
      .sort((first, second) => second.attempts - first.attempts)
      .slice(0, 8),
    weakAreas: buildAreaSummaries(answers, "weak").slice(0, 8),
    recentAttempts,
    resourceTypeCounts,
    approvalCounts,
  };
}
