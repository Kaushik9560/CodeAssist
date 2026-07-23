function safeSpreadsheetValue(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function diagnosisRows(attempts) {
  return attempts
    .filter((attempt) => attempt.diagnosis)
    .map((attempt) => ({
      Problem: safeSpreadsheetValue(attempt.problemTitle),
      Platform: attempt.platform,
      "Primary Failure": attempt.diagnosis.primaryFailure.category,
      "Failure Detail": safeSpreadsheetValue(attempt.diagnosis.primaryFailure.explanation),
      "Understanding Score": attempt.diagnosis.understandingScore,
      "Implementation Score": attempt.diagnosis.implementationScore,
      "Hint Dependency": attempt.diagnosis.hintDependency,
      Confidence: attempt.diagnosis.confidence,
      "User Feedback": attempt.diagnosisFeedback?.value || ""
    }));
}

export function exportLearningData(state, xlsx = globalThis.XLSX) {
  if (!xlsx) throw new Error("Excel export library is unavailable.");
  if (!state.bookmarks.length && !state.attempts.length) {
    throw new Error("There is no CodeAssist data to export yet.");
  }

  const workbook = xlsx.utils.book_new();
  const bookmarkRows = state.bookmarks.map((bookmark) => ({
    Title: safeSpreadsheetValue(bookmark.title),
    Platform: bookmark.platform,
    "Custom Difficulty": safeSpreadsheetValue(bookmark.difficulty),
    Feedback: safeSpreadsheetValue(bookmark.feedback),
    Date: bookmark.date,
    URL: bookmark.url
  }));
  const attemptRows = state.attempts.map((attempt) => ({
    Problem: safeSpreadsheetValue(attempt.problemTitle),
    Platform: attempt.platform,
    Status: attempt.status,
    "Started At": attempt.startTimestamp,
    "Ended At": attempt.endTimestamp || "",
    "Duration Seconds": Math.round((attempt.elapsedTimeMs || 0) / 1000),
    "Highest Hint Level": attempt.highestHintLevelUsed,
    Language: safeSpreadsheetValue(attempt.language),
    Notes: safeSpreadsheetValue(attempt.userNotes)
  }));

  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(bookmarkRows), "Bookmarks");
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(attemptRows), "Attempts");
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(diagnosisRows(state.attempts)), "Diagnosis Summary");
  xlsx.writeFile(workbook, "CodeAssist_Learning_History.xlsx");
}

export { safeSpreadsheetValue };
