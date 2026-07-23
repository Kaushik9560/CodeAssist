import { canonicalizeProblemUrl, updateState } from "./storageService.js";
import { elapsedMilliseconds } from "../utils/time.js";
import { normalizeText } from "../utils/validation.js";

export const ATTEMPT_STATUSES = [
  "in_progress",
  "solved_independently",
  "solved_with_hints",
  "not_solved",
  "abandoned"
];

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${randomPart}`;
}

function findAttempt(draft, attemptId) {
  const attempt = draft.attempts.find((item) => item.id === attemptId);
  if (!attempt) throw new Error("This attempt is no longer available.");
  return attempt;
}

function applyContext(attempt, context = {}) {
  if (context.language !== undefined) attempt.language = normalizeText(context.language, 100);
  if (context.notes !== undefined) attempt.userNotes = normalizeText(context.notes, 10_000);
  if (context.failedInput !== undefined) attempt.failedInput = normalizeText(context.failedInput, 10_000);
  if (context.expectedOutput !== undefined) attempt.expectedOutput = normalizeText(context.expectedOutput, 10_000);
  if (context.actualOutput !== undefined) attempt.actualOutput = normalizeText(context.actualOutput, 10_000);
  attempt.updatedAt = nowIso();
}

function addSnapshot(attempt, context = {}, reason) {
  const code = normalizeText(context.code, 50_000);
  if (!code) return null;
  const snapshot = {
    id: makeId("snapshot"),
    code,
    language: normalizeText(context.language || attempt.language, 100),
    reason,
    capturedAt: nowIso()
  };
  attempt.codeSnapshots.push(snapshot);
  return snapshot;
}

export async function startAttempt(problem, adapter) {
  const canonicalUrl = canonicalizeProblemUrl(problem?.url);
  if (!canonicalUrl) throw new Error("A supported HTTPS problem is required to start an attempt.");
  let result;
  const state = await updateState((draft) => {
    if (draft.activeAttempt) {
      const active = findAttempt(draft, draft.activeAttempt);
      if (active.canonicalUrl === canonicalUrl) {
        result = { attempt: active, recovered: true };
        return;
      }
      const error = new Error(`An attempt for ${active.problemTitle} is already active.`);
      error.code = "ACTIVE_ATTEMPT_CONFLICT";
      throw error;
    }

    const timestamp = nowIso();
    const attempt = {
      id: makeId("attempt"),
      problemId: canonicalUrl,
      canonicalUrl,
      problemTitle: normalizeText(problem.title, 300) || "Untitled problem",
      problemStatement: normalizeText(problem.statement, 60_000),
      platform: problem.platform === "codeforces" ? "codeforces" : "leetcode",
      difficulty: normalizeText(problem.difficulty, 100),
      startTimestamp: timestamp,
      endTimestamp: null,
      elapsedTimeMs: 0,
      language: normalizeText(problem.language, 100),
      codeSnapshots: [],
      hintRequests: [],
      highestHintLevelUsed: 0,
      userNotes: "",
      failedInput: "",
      expectedOutput: "",
      actualOutput: "",
      status: "in_progress",
      diagnosis: null,
      diagnosisFeedback: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    draft.attempts.push(attempt);
    draft.activeAttempt = attempt.id;
    result = { attempt, recovered: false };
  }, adapter);
  return { ...result, state };
}

export async function updateAttemptContext(attemptId, context, adapter) {
  return updateState((draft) => {
    applyContext(findAttempt(draft, attemptId), context);
  }, adapter);
}

export async function captureCodeSnapshot(attemptId, context, reason = "manual", adapter) {
  let snapshot;
  const state = await updateState((draft) => {
    const attempt = findAttempt(draft, attemptId);
    applyContext(attempt, context);
    snapshot = addSnapshot(attempt, context, reason);
    if (!snapshot) throw new Error("Paste or extract some code before capturing a snapshot.");
  }, adapter);
  return { state, snapshot };
}

export async function recordHint(attemptId, level, response, context, adapter) {
  let hintRecord;
  const state = await updateState((draft) => {
    const attempt = findAttempt(draft, attemptId);
    const expectedLevel = attempt.highestHintLevelUsed + 1;
    if (level !== expectedLevel || level < 1 || level > 4) {
      throw new Error(`Request Hint Level ${expectedLevel} next.`);
    }
    applyContext(attempt, context);
    addSnapshot(attempt, context, `hint_level_${level}`);
    hintRecord = {
      id: makeId("hint"),
      level,
      requestedAt: nowIso(),
      response
    };
    attempt.hintRequests.push(hintRecord);
    attempt.highestHintLevelUsed = level;
    attempt.updatedAt = nowIso();
  }, adapter);
  return { state, hintRecord };
}

export async function saveDiagnosis(attemptId, diagnosis, context, adapter) {
  return updateState((draft) => {
    const attempt = findAttempt(draft, attemptId);
    applyContext(attempt, context);
    addSnapshot(attempt, context, "diagnosis");
    attempt.diagnosis = diagnosis;
    attempt.diagnosisFeedback = null;
    attempt.updatedAt = nowIso();
  }, adapter);
}

export async function saveDiagnosisFeedback(attemptId, feedback, adapter) {
  const allowed = new Set(["accurate", "partially_accurate", "inaccurate"]);
  if (!allowed.has(feedback)) throw new Error("Choose a valid feedback option.");
  return updateState((draft) => {
    const attempt = findAttempt(draft, attemptId);
    attempt.diagnosisFeedback = { value: feedback, recordedAt: nowIso() };
    attempt.updatedAt = nowIso();
  }, adapter);
}

export async function endAttempt(attemptId, status, context, adapter) {
  if (!ATTEMPT_STATUSES.includes(status) || status === "in_progress") {
    throw new Error("Choose how this attempt ended.");
  }
  let endedAttempt;
  const state = await updateState((draft) => {
    const attempt = findAttempt(draft, attemptId);
    applyContext(attempt, context);
    addSnapshot(attempt, context, "attempt_end");
    const endedAt = nowIso();
    attempt.status = status;
    attempt.endTimestamp = endedAt;
    attempt.elapsedTimeMs = elapsedMilliseconds(attempt.startTimestamp, endedAt);
    attempt.updatedAt = endedAt;
    if (draft.activeAttempt === attemptId) draft.activeAttempt = null;
    endedAttempt = attempt;
  }, adapter);
  return { state, attempt: endedAttempt };
}

export function getActiveAttemptFromState(state) {
  if (!state?.activeAttempt) return null;
  return state.attempts.find((attempt) => attempt.id === state.activeAttempt) || null;
}
