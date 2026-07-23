const COMPLETED_STATUSES = new Set([
  "solved_independently",
  "solved_with_hints",
  "not_solved"
]);

export function calculateInsights(attempts) {
  const completed = attempts.filter((attempt) => COMPLETED_STATUSES.has(attempt.status));
  if (completed.length < 3) {
    return {
      reliable: false,
      completedCount: completed.length,
      message: "Complete more attempts to unlock reliable insights."
    };
  }

  const failureCounts = new Map();
  let totalDuration = 0;
  let totalHintLevel = 0;
  let independentSolves = 0;

  for (const attempt of completed) {
    const category = attempt.diagnosis?.primaryFailure?.category;
    if (category) failureCounts.set(category, (failureCounts.get(category) || 0) + 1);
    totalDuration += Number(attempt.elapsedTimeMs) || 0;
    totalHintLevel += Number(attempt.highestHintLevelUsed) || 0;
    if (attempt.status === "solved_independently") independentSolves += 1;
  }

  const mostFrequentFailure = [...failureCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] || "insufficient_evidence";
  const recentlyPractised = [...completed]
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .slice(0, 5)
    .map((attempt) => attempt.problemTitle);

  return {
    reliable: true,
    completedCount: completed.length,
    mostFrequentFailure,
    independentSolveRate: independentSolves / completed.length,
    averageDurationMs: totalDuration / completed.length,
    averageHighestHintLevel: totalHintLevel / completed.length,
    recentlyPractised
  };
}
