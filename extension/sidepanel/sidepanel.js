import { createApiClient } from "../services/apiClient.js";
import {
  captureCodeSnapshot,
  endAttempt,
  getActiveAttemptFromState,
  recordHint,
  saveDiagnosis,
  saveDiagnosisFeedback,
  startAttempt,
  updateAttemptContext
} from "../services/attemptService.js";
import { exportLearningData } from "../services/exportService.js";
import {
  deleteBookmark,
  getState,
  STATE_KEY,
  updatePreferences,
  upsertBookmark
} from "../services/storageService.js";
import { appendLabeledValue, clearElement, createElement, createSafeProblemLink, setStatus } from "../utils/dom.js";
import { calculateInsights } from "../utils/insights.js";
import { elapsedMilliseconds, formatDate, formatDuration } from "../utils/time.js";

const HINT_LEVELS = [
  { level: 1, title: "Clarifying Question" },
  { level: 2, title: "Constraint or Key Observation" },
  { level: 3, title: "Pattern Direction" },
  { level: 4, title: "Algorithm Skeleton or Pseudocode" }
];

const FAILURE_CATEGORIES = [
  "problem_understanding",
  "pattern_recognition",
  "algorithm_design",
  "implementation",
  "edge_cases",
  "complexity",
  "communication",
  "insufficient_evidence"
];

const STATUS_LABELS = {
  in_progress: "In progress",
  solved_independently: "Solved independently",
  solved_with_hints: "Solved with hints",
  not_solved: "Not solved",
  abandoned: "Abandoned"
};

const elements = Object.fromEntries([
  "backendIndicator", "backendIndicatorText", "currentPlatform", "currentDifficulty",
  "currentProblemTitle", "contextNotice", "coachEmptyState", "coachContent",
  "attemptStateText", "attemptTimer", "startAttemptButton", "responseLanguage",
  "hintLadder", "hintResults", "backendUrlInput", "saveBackendUrlButton",
  "attemptEmptyState", "attemptContent", "attemptLanguage", "attemptCode",
  "codeExtractionState", "captureCodeButton", "attemptNotes", "failedInput",
  "expectedOutput", "actualOutput", "analyzeAttemptButton", "diagnosisPanel",
  "diagnosisResult", "diagnosisFeedback", "attemptEndStatus", "endAttemptButton",
  "insightsSummary", "statusFilter", "failureFilter", "platformFilter", "hintsFilter",
  "historyList", "historyDetail", "bookmarkEditor", "bookmarkEditorTitle",
  "bookmarkDifficulty", "bookmarkNotes", "saveBookmarkButton", "exportButton",
  "bookmarksList", "globalStatus"
].map((id) => [id, document.getElementById(id)]));

let appState;
let activeTab;
let pageContext;
let apiClient;
let timerInterval;
let statusTimeout;
let loadedAttemptId;
let hintRequestInFlight = false;

function activeAttempt() {
  return getActiveAttemptFromState(appState);
}

function prettyToken(value) {
  return String(value || "Not available")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function showGlobalStatus(message, tone = "neutral", duration = 4_000) {
  clearTimeout(statusTimeout);
  setStatus(elements.globalStatus, message, tone);
  if (duration) {
    statusTimeout = setTimeout(() => setStatus(elements.globalStatus), duration);
  }
}

function setButtonBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error("No active browser tab is available."));
      else resolve(tabs[0] || null);
    });
  });
}

function requestPageContext(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTEXT" }, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response || null);
    });
  });
}

function inferBasicContext(tab) {
  if (!tab?.url) return null;
  try {
    const url = new URL(tab.url);
    const isLeetCode = url.hostname.endsWith("leetcode.com") && /^\/problems\//.test(url.pathname);
    const isCodeforces = url.hostname === "codeforces.com" && /\/problem/.test(url.pathname);
    if (!isLeetCode && !isCodeforces) return null;
    const platform = isLeetCode ? "leetcode" : "codeforces";
    return {
      supported: true,
      aiSupported: isLeetCode,
      metadata: {
        title: String(tab.title || "Problem").split(" - ")[0],
        url: tab.url,
        platform,
        difficulty: "",
        language: ""
      },
      statement: "",
      code: "",
      warnings: { statementUnavailable: isLeetCode, codeUnavailable: isLeetCode }
    };
  } catch {
    return null;
  }
}

function currentAttemptContext() {
  return {
    code: elements.attemptCode.value,
    language: elements.attemptLanguage.value,
    notes: elements.attemptNotes.value,
    failedInput: elements.failedInput.value,
    expectedOutput: elements.expectedOutput.value,
    actualOutput: elements.actualOutput.value
  };
}

function renderProblemContext() {
  const metadata = pageContext?.metadata;
  const supported = Boolean(pageContext?.supported && metadata);
  elements.currentPlatform.textContent = supported ? metadata.platform : "No problem";
  elements.currentDifficulty.textContent = supported ? metadata.difficulty || "" : "";
  elements.currentProblemTitle.textContent = supported ? metadata.title : "Open a supported problem page";

  if (!supported) {
    elements.contextNotice.textContent = "LeetCode coaching and Codeforces bookmarks are supported.";
  } else if (!pageContext.aiSupported) {
    elements.contextNotice.textContent = "Codeforces bookmarks are available. AI coaching for Codeforces is coming soon.";
  } else if (pageContext.warnings?.statementUnavailable) {
    elements.contextNotice.textContent = "Problem detected, but its statement could not be extracted. Refresh LeetCode and try again.";
  } else if (pageContext.warnings?.codeUnavailable) {
    elements.contextNotice.textContent = "Problem ready. Editor code was not accessible, so manual paste is available.";
  } else {
    elements.contextNotice.textContent = "Problem context is ready for Socratic coaching.";
  }

  const coachAvailable = supported && pageContext.aiSupported;
  elements.coachEmptyState.hidden = coachAvailable;
  elements.coachContent.hidden = !coachAvailable;
  if (!coachAvailable) {
    const heading = elements.coachEmptyState.querySelector("h3");
    const copy = elements.coachEmptyState.querySelector("p:last-child");
    if (supported) {
      heading.textContent = "Codeforces coaching is coming soon";
      copy.textContent = "Bookmark this problem now. V5 does not claim reliable Codeforces statement or editor extraction.";
    } else {
      heading.textContent = "Open a LeetCode problem";
      copy.textContent = "The coach reads problem context only after you open a supported page.";
    }
  }
}

function refreshTimer() {
  clearInterval(timerInterval);
  const attempt = activeAttempt();
  if (!attempt) {
    elements.attemptTimer.textContent = "00:00";
    return;
  }
  const update = () => {
    elements.attemptTimer.textContent = formatDuration(elapsedMilliseconds(attempt.startTimestamp));
  };
  update();
  timerInterval = setInterval(update, 1_000);
}

function loadAttemptForm(attempt) {
  if (!attempt || loadedAttemptId === attempt.id) return;
  loadedAttemptId = attempt.id;
  const latestSnapshot = attempt.codeSnapshots.at(-1);
  elements.attemptLanguage.value = attempt.language || pageContext?.metadata?.language || "";
  elements.attemptCode.value = latestSnapshot?.code || pageContext?.code || "";
  elements.attemptNotes.value = attempt.userNotes || "";
  elements.failedInput.value = attempt.failedInput || "";
  elements.expectedOutput.value = attempt.expectedOutput || "";
  elements.actualOutput.value = attempt.actualOutput || "";
}

function renderAttempt() {
  const attempt = activeAttempt();
  elements.startAttemptButton.disabled = Boolean(attempt) || !pageContext?.aiSupported;
  elements.startAttemptButton.textContent = attempt ? "Attempt Active" : "Start Attempt";
  elements.attemptStateText.textContent = attempt
    ? `${attempt.problemTitle} · ${attempt.codeSnapshots.length} snapshots`
    : "No attempt started";
  elements.attemptEmptyState.hidden = Boolean(attempt);
  elements.attemptContent.hidden = !attempt;
  elements.codeExtractionState.textContent = pageContext?.code
    ? "Editor code detected"
    : "Manual paste available";
  loadAttemptForm(attempt);
  refreshTimer();
  renderHintLadder();
  renderHintResults();
  renderCurrentDiagnosis();
}

function renderHintLadder() {
  clearElement(elements.hintLadder);
  const attempt = activeAttempt();
  const highest = attempt?.highestHintLevelUsed || 0;
  for (const definition of HINT_LEVELS) {
    const used = definition.level <= highest;
    const unlocked = Boolean(attempt) && definition.level === highest + 1 && !hintRequestInFlight;
    const button = createElement("button", { className: "hint-button", type: "button", disabled: !unlocked });
    button.dataset.used = String(used);
    button.append(
      createElement("span", { className: "hint-level", text: `L${definition.level}` }),
      createElement("span", { text: definition.title }),
      createElement("span", { className: "hint-state", text: used ? "Used" : unlocked ? "Ready" : "Locked" })
    );
    button.addEventListener("click", () => void requestHint(definition.level, button));
    elements.hintLadder.append(button);
  }
}

function renderHintResults() {
  clearElement(elements.hintResults);
  const attempt = activeAttempt();
  if (!attempt?.hintRequests.length) {
    elements.hintResults.append(createElement("p", {
      className: "muted-copy",
      text: attempt
        ? "Request Level 1 when you are genuinely stuck. Each response is saved in this attempt."
        : "Start an attempt, then request Level 1 when you are genuinely stuck."
    }));
    return;
  }

  for (const record of attempt.hintRequests) {
    const card = createElement("article", { className: "hint-card" });
    const head = createElement("div", { className: "hint-card-head" });
    head.append(
      createElement("strong", { text: `Level ${record.level}` }),
      createElement("span", { className: "small-status", text: prettyToken(record.response.focusArea) })
    );
    card.append(
      head,
      createElement("p", { text: record.response.hint }),
      createElement("p", { className: "coach-question", text: record.response.questionForUser })
    );
    elements.hintResults.append(card);
  }
}

function appendListBlock(parent, title, items, className) {
  const block = createElement("div", { className: "diagnosis-block" });
  block.append(createElement("h4", { text: title }));
  const list = createElement("ul", { className });
  for (const item of items?.length ? items : ["No evidence was available."]) {
    list.append(createElement("li", { text: item }));
  }
  block.append(list);
  parent.append(block);
}

function renderDiagnosisInto(target, diagnosis) {
  clearElement(target);
  if (!diagnosis) return;
  const weakness = createElement("div", { className: "diagnosis-block" });
  weakness.append(
    createElement("h4", { text: "Main weakness" }),
    createElement("p", { text: `${prettyToken(diagnosis.primaryFailure.category)}: ${diagnosis.primaryFailure.explanation}` })
  );
  target.append(weakness);
  appendListBlock(target, "Evidence", diagnosis.primaryFailure.evidence, "evidence-list");
  appendListBlock(target, "Strengths", diagnosis.strengths, "strength-list");

  const dependency = createElement("div", { className: "diagnosis-block" });
  dependency.append(
    createElement("h4", { text: "Hint dependency" }),
    createElement("p", { text: prettyToken(diagnosis.hintDependency) })
  );
  target.append(dependency);

  const scores = createElement("div", { className: "score-grid" });
  for (const [label, value] of [
    ["Understanding", `${diagnosis.understandingScore}/10`],
    ["Implementation", `${diagnosis.implementationScore}/10`]
  ]) {
    const score = createElement("div", { className: "score-card" });
    score.append(createElement("span", { text: label }), createElement("strong", { text: value }));
    scores.append(score);
  }
  target.append(scores);

  const next = createElement("div", { className: "diagnosis-block" });
  next.append(
    createElement("h4", { text: "Recommended next step" }),
    createElement("p", { text: diagnosis.nextAction }),
    createElement("p", { className: "muted-copy", text: `Practice type: ${diagnosis.recommendedPracticeType}` })
  );
  target.append(next);
}

function renderCurrentDiagnosis() {
  const attempt = activeAttempt();
  elements.diagnosisPanel.hidden = !attempt?.diagnosis;
  clearElement(elements.diagnosisFeedback);
  if (!attempt?.diagnosis) return;
  renderDiagnosisInto(elements.diagnosisResult, attempt.diagnosis);
  for (const [value, label] of [
    ["accurate", "Accurate"],
    ["partially_accurate", "Partially accurate"],
    ["inaccurate", "Inaccurate"]
  ]) {
    const button = createElement("button", { className: "feedback-button", type: "button", text: label });
    button.dataset.selected = String(attempt.diagnosisFeedback?.value === value);
    button.addEventListener("click", () => void submitDiagnosisFeedback(value));
    elements.diagnosisFeedback.append(button);
  }
}

function addInsight(label, value) {
  const card = createElement("div", { className: "insight-card" });
  card.append(createElement("span", { text: label }), createElement("strong", { text: value }));
  elements.insightsSummary.append(card);
}

function renderInsights() {
  clearElement(elements.insightsSummary);
  const insights = calculateInsights(appState.attempts);
  if (!insights.reliable) {
    elements.insightsSummary.append(createElement("p", { className: "low-data", text: insights.message }));
    return;
  }
  addInsight("Most frequent failure", prettyToken(insights.mostFrequentFailure));
  addInsight("Independent solve rate", `${Math.round(insights.independentSolveRate * 100)}%`);
  addInsight("Average duration", formatDuration(insights.averageDurationMs));
  addInsight("Average highest hint", insights.averageHighestHintLevel.toFixed(1));
  addInsight("Recently practised", insights.recentlyPractised.join(", ") || "None");
}

function matchesHistoryFilters(attempt) {
  const failure = attempt.diagnosis?.primaryFailure?.category || "";
  if (elements.statusFilter.value && attempt.status !== elements.statusFilter.value) return false;
  if (elements.failureFilter.value && failure !== elements.failureFilter.value) return false;
  if (elements.platformFilter.value && attempt.platform !== elements.platformFilter.value) return false;
  if (elements.hintsFilter.value === "with" && !attempt.highestHintLevelUsed) return false;
  if (elements.hintsFilter.value === "without" && attempt.highestHintLevelUsed) return false;
  return true;
}

function renderHistory() {
  renderInsights();
  clearElement(elements.historyList);
  const attempts = [...appState.attempts]
    .filter(matchesHistoryFilters)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  if (!attempts.length) {
    elements.historyList.append(createElement("div", { className: "empty-state", text: "No attempts match these filters." }));
    return;
  }

  for (const attempt of attempts) {
    const card = createElement("article", { className: "list-card" });
    const head = createElement("div", { className: "list-card-head" });
    head.append(
      createElement("h4", { text: attempt.problemTitle }),
      createElement("span", { className: "status-pill", text: STATUS_LABELS[attempt.status] || prettyToken(attempt.status) })
    );
    const meta = createElement("div", { className: "list-card-meta" });
    meta.append(
      createElement("span", { text: prettyToken(attempt.platform) }),
      createElement("span", { text: formatDate(attempt.createdAt) }),
      createElement("span", { text: formatDuration(attempt.elapsedTimeMs || elapsedMilliseconds(attempt.startTimestamp)) }),
      createElement("span", { text: `Highest hint: ${attempt.highestHintLevelUsed || 0}` }),
      createElement("span", { text: `Failure: ${prettyToken(attempt.diagnosis?.primaryFailure?.category || "Not analyzed")}` })
    );
    if (attempt.diagnosis) {
      meta.append(createElement("span", {
        text: `Scores: ${attempt.diagnosis.understandingScore}/10 · ${attempt.diagnosis.implementationScore}/10`
      }));
    }
    const actions = createElement("div", { className: "list-card-actions" });
    const reportButton = createElement("button", { type: "button", text: "View report" });
    reportButton.addEventListener("click", () => renderHistoryDetail(attempt));
    actions.append(reportButton);
    if (!attempt.diagnosis && attempt.status !== "in_progress") {
      const analyzeButton = createElement("button", { type: "button", text: "Analyze saved attempt" });
      analyzeButton.addEventListener("click", () => void analyzeSavedAttempt(attempt, analyzeButton));
      actions.append(analyzeButton);
    }
    card.append(head, meta, actions);
    elements.historyList.append(card);
  }
}

function renderHistoryDetail(attempt) {
  clearElement(elements.historyDetail);
  elements.historyDetail.hidden = false;
  elements.historyDetail.append(createElement("h3", { text: attempt.problemTitle }));
  appendLabeledValue(elements.historyDetail, "Status", STATUS_LABELS[attempt.status]);
  appendLabeledValue(elements.historyDetail, "Duration", formatDuration(attempt.elapsedTimeMs || elapsedMilliseconds(attempt.startTimestamp)));
  appendLabeledValue(elements.historyDetail, "Highest hint", String(attempt.highestHintLevelUsed || 0));
  appendLabeledValue(elements.historyDetail, "Snapshots", String(attempt.codeSnapshots.length));
  appendLabeledValue(elements.historyDetail, "Notes", attempt.userNotes);
  appendLabeledValue(elements.historyDetail, "Failed input", attempt.failedInput);
  if (attempt.diagnosis) {
    const report = createElement("div", { className: "diagnosis-block" });
    report.append(createElement("h4", { text: "AI diagnosis" }));
    elements.historyDetail.append(report);
    renderDiagnosisInto(report, attempt.diagnosis);
    appendLabeledValue(elements.historyDetail, "Diagnosis feedback", prettyToken(attempt.diagnosisFeedback?.value));
    const feedback = createElement("div", { className: "feedback-row" });
    for (const [value, label] of [
      ["accurate", "Accurate"],
      ["partially_accurate", "Partially accurate"],
      ["inaccurate", "Inaccurate"]
    ]) {
      const button = createElement("button", { className: "feedback-button", type: "button", text: label });
      button.dataset.selected = String(attempt.diagnosisFeedback?.value === value);
      button.addEventListener("click", () => void submitHistoryDiagnosisFeedback(attempt.id, value));
      feedback.append(button);
    }
    elements.historyDetail.append(feedback);
    elements.historyDetail.append(createElement("p", {
      className: "ai-notice",
      text: "AI-generated learning feedback. Verify important technical conclusions."
    }));
  }
  elements.historyDetail.scrollIntoView({ block: "start" });
}

function renderBookmarkEditor() {
  const metadata = pageContext?.metadata;
  elements.bookmarkEditor.hidden = !pageContext?.supported || !metadata;
  if (!metadata) return;
  const normalizedUrl = metadata.url.replace(/\/$/, "");
  const existing = appState.bookmarks.find((bookmark) => bookmark.url.replace(/\/$/, "") === normalizedUrl);
  elements.bookmarkEditorTitle.textContent = metadata.title;
  elements.bookmarkDifficulty.value = existing?.difficulty || metadata.difficulty || "";
  elements.bookmarkNotes.value = existing?.feedback || "";
  elements.saveBookmarkButton.textContent = existing ? "Update Bookmark" : "Save Bookmark";
}

function renderBookmarks() {
  renderBookmarkEditor();
  clearElement(elements.bookmarksList);
  const bookmarks = [...appState.bookmarks].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  if (!bookmarks.length) {
    elements.bookmarksList.append(createElement("div", { className: "empty-state", text: "No bookmarks yet." }));
    return;
  }

  for (const bookmark of bookmarks) {
    const card = createElement("article", { className: "list-card" });
    const head = createElement("div", { className: "list-card-head" });
    const title = createElement("h4");
    title.append(createSafeProblemLink(bookmark.title, bookmark.url));
    head.append(title, createElement("span", { className: "status-pill", text: prettyToken(bookmark.platform) }));
    const meta = createElement("div", { className: "list-card-meta" });
    meta.append(
      createElement("span", { text: bookmark.difficulty || "No custom difficulty" }),
      createElement("span", { text: bookmark.date || formatDate(bookmark.createdAt) })
    );
    if (bookmark.feedback) card.append(head, meta, createElement("p", { className: "muted-copy", text: bookmark.feedback }));
    else card.append(head, meta);
    const actions = createElement("div", { className: "list-card-actions" });
    const deleteButton = createElement("button", { className: "delete-action", type: "button", text: "Delete" });
    deleteButton.addEventListener("click", () => void removeBookmark(bookmark.id));
    actions.append(deleteButton);
    card.append(actions);
    elements.bookmarksList.append(card);
  }
}

function renderAll() {
  elements.responseLanguage.value = appState.preferences.responseLanguage;
  elements.backendUrlInput.value = appState.preferences.backendUrl;
  renderProblemContext();
  renderAttempt();
  renderHistory();
  renderBookmarks();
}

async function refreshPageContext() {
  try {
    activeTab = await queryActiveTab();
    pageContext = activeTab ? await requestPageContext(activeTab.id) : null;
    pageContext ||= inferBasicContext(activeTab);
    renderAll();
  } catch (error) {
    pageContext = null;
    renderAll();
    showGlobalStatus(error.message, "error");
  }
}

async function checkBackend() {
  apiClient?.abortAll();
  apiClient = createApiClient({ baseUrl: appState.preferences.backendUrl });
  elements.backendIndicator.dataset.state = "checking";
  elements.backendIndicatorText.textContent = "Checking";
  try {
    await apiClient.health();
    elements.backendIndicator.dataset.state = "online";
    elements.backendIndicatorText.textContent = "Online";
  } catch {
    elements.backendIndicator.dataset.state = "offline";
    elements.backendIndicatorText.textContent = "Offline";
  }
}

async function beginAttempt() {
  if (!pageContext?.aiSupported || !pageContext.metadata) return;
  if (!pageContext.statement) {
    showGlobalStatus("The LeetCode statement could not be read. Refresh the problem page before starting.", "error");
    return;
  }
  setButtonBusy(elements.startAttemptButton, true, "Starting...");
  try {
    const result = await startAttempt({
      ...pageContext.metadata,
      statement: pageContext.statement
    });
    appState = result.state;
    loadedAttemptId = null;
    renderAll();
    showGlobalStatus(result.recovered ? "Active attempt recovered." : "Attempt started. Timer is now running.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error", 6_000);
  } finally {
    setButtonBusy(elements.startAttemptButton, false);
    renderAttempt();
  }
}

function hintPayload(level, attempt, context) {
  return {
    problem: {
      title: attempt.problemTitle,
      statement: attempt.problemStatement,
      url: attempt.canonicalUrl,
      platform: attempt.platform
    },
    attempt: {
      code: context.code,
      language: context.language,
      notes: context.notes,
      failedInput: context.failedInput,
      expectedOutput: context.expectedOutput,
      actualOutput: context.actualOutput
    },
    hintLevel: level,
    previousHints: attempt.hintRequests.map((record) => record.response),
    responseLanguage: appState.preferences.responseLanguage
  };
}

async function requestHint(level, button) {
  const attempt = activeAttempt();
  if (!attempt || hintRequestInFlight) return;
  hintRequestInFlight = true;
  setButtonBusy(button, true, "Thinking...");
  renderHintLadder();
  try {
    const context = currentAttemptContext();
    const response = await apiClient.requestHint(hintPayload(level, attempt, context));
    const result = await recordHint(attempt.id, level, response.data, context);
    appState = result.state;
    renderAll();
    showGlobalStatus(`Hint Level ${level} saved.`, "success");
  } catch (error) {
    showGlobalStatus(error.message, "error", 6_000);
  } finally {
    hintRequestInFlight = false;
    setButtonBusy(button, false);
    renderHintLadder();
  }
}

function diagnosisPayload(attempt, context) {
  return {
    problem: {
      title: attempt.problemTitle,
      statement: attempt.problemStatement,
      url: attempt.canonicalUrl,
      platform: attempt.platform
    },
    attempt: {
      code: context.code,
      language: context.language,
      durationMs: attempt.elapsedTimeMs || elapsedMilliseconds(attempt.startTimestamp),
      hintLevelsUsed: attempt.hintRequests.map((record) => record.level),
      notes: context.notes,
      failedInput: context.failedInput,
      expectedOutput: context.expectedOutput,
      actualOutput: context.actualOutput,
      codeSnapshots: attempt.codeSnapshots.slice(-8),
      finalStatus: attempt.status
    },
    responseLanguage: appState.preferences.responseLanguage
  };
}

async function analyzeAttempt() {
  const attempt = activeAttempt();
  if (!attempt) return;
  setButtonBusy(elements.analyzeAttemptButton, true, "Analyzing evidence...");
  try {
    const context = currentAttemptContext();
    const response = await apiClient.requestDiagnosis(diagnosisPayload(attempt, context));
    appState = await saveDiagnosis(attempt.id, response.data, context);
    renderAll();
    elements.diagnosisPanel.scrollIntoView({ block: "start" });
    showGlobalStatus("Diagnosis saved to this attempt.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error", 6_000);
  } finally {
    setButtonBusy(elements.analyzeAttemptButton, false);
  }
}

async function analyzeSavedAttempt(attempt, button) {
  const latestSnapshot = attempt.codeSnapshots.at(-1);
  const context = {
    code: latestSnapshot?.code || "",
    language: latestSnapshot?.language || attempt.language,
    notes: attempt.userNotes,
    failedInput: attempt.failedInput,
    expectedOutput: attempt.expectedOutput,
    actualOutput: attempt.actualOutput
  };
  setButtonBusy(button, true, "Analyzing...");
  try {
    const response = await apiClient.requestDiagnosis(diagnosisPayload(attempt, context));
    appState = await saveDiagnosis(attempt.id, response.data, context);
    renderAll();
    const updated = appState.attempts.find((item) => item.id === attempt.id);
    renderHistoryDetail(updated);
    showGlobalStatus("Diagnosis saved to the history report.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error", 6_000);
  } finally {
    setButtonBusy(button, false);
  }
}

async function submitDiagnosisFeedback(value) {
  const attempt = activeAttempt();
  if (!attempt) return;
  try {
    appState = await saveDiagnosisFeedback(attempt.id, value);
    renderCurrentDiagnosis();
    renderHistory();
    showGlobalStatus("Diagnosis feedback saved locally.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  }
}

async function submitHistoryDiagnosisFeedback(attemptId, value) {
  try {
    appState = await saveDiagnosisFeedback(attemptId, value);
    renderHistory();
    const updated = appState.attempts.find((attempt) => attempt.id === attemptId);
    renderHistoryDetail(updated);
    showGlobalStatus("Diagnosis feedback saved locally.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  }
}

async function captureCode() {
  const attempt = activeAttempt();
  if (!attempt) return;
  setButtonBusy(elements.captureCodeButton, true, "Capturing...");
  try {
    const result = await captureCodeSnapshot(attempt.id, currentAttemptContext());
    appState = result.state;
    renderAll();
    showGlobalStatus("Code snapshot captured.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  } finally {
    setButtonBusy(elements.captureCodeButton, false);
  }
}

async function finishAttempt() {
  const attempt = activeAttempt();
  if (!attempt) return;
  setButtonBusy(elements.endAttemptButton, true, "Ending...");
  try {
    const result = await endAttempt(attempt.id, elements.attemptEndStatus.value, currentAttemptContext());
    appState = result.state;
    loadedAttemptId = null;
    renderAll();
    showGlobalStatus("Attempt ended and saved in History.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  } finally {
    setButtonBusy(elements.endAttemptButton, false);
  }
}

async function saveCurrentBookmark() {
  const metadata = pageContext?.metadata;
  if (!metadata) return;
  setButtonBusy(elements.saveBookmarkButton, true, "Saving...");
  try {
    const result = await upsertBookmark({
      ...metadata,
      difficulty: elements.bookmarkDifficulty.value,
      feedback: elements.bookmarkNotes.value,
      date: new Date().toLocaleDateString("en-GB")
    });
    appState = result.state;
    renderBookmarks();
    showGlobalStatus(result.created ? "Bookmark saved." : "Bookmark updated.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  } finally {
    setButtonBusy(elements.saveBookmarkButton, false);
  }
}

async function removeBookmark(bookmarkId) {
  try {
    appState = await deleteBookmark(bookmarkId);
    renderBookmarks();
    showGlobalStatus("Bookmark deleted.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  }
}

async function saveBackendUrl() {
  setButtonBusy(elements.saveBackendUrlButton, true, "Saving...");
  try {
    appState = await updatePreferences({ backendUrl: elements.backendUrlInput.value });
    elements.backendUrlInput.value = appState.preferences.backendUrl;
    await checkBackend();
    showGlobalStatus("Backend URL saved. Localhost and 127.0.0.1 are supported by this build.", "success");
  } catch (error) {
    showGlobalStatus(error.message, "error");
  } finally {
    setButtonBusy(elements.saveBackendUrlButton, false);
  }
}

function initializeFilterOptions() {
  for (const [value, label] of Object.entries(STATUS_LABELS)) {
    elements.statusFilter.append(new Option(label, value));
  }
  for (const category of FAILURE_CATEGORIES) {
    elements.failureFilter.append(new Option(prettyToken(category), category));
  }
}

function bindEvents() {
  document.querySelectorAll(".section-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".section-tab").forEach((candidate) => candidate.classList.toggle("is-active", candidate === tab));
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === tab.dataset.view));
    });
  });
  elements.startAttemptButton.addEventListener("click", () => void beginAttempt());
  elements.captureCodeButton.addEventListener("click", () => void captureCode());
  elements.analyzeAttemptButton.addEventListener("click", () => void analyzeAttempt());
  elements.endAttemptButton.addEventListener("click", () => void finishAttempt());
  elements.saveBookmarkButton.addEventListener("click", () => void saveCurrentBookmark());
  elements.saveBackendUrlButton.addEventListener("click", () => void saveBackendUrl());
  elements.exportButton.addEventListener("click", () => {
    try {
      exportLearningData(appState);
      showGlobalStatus("Excel export created with bookmarks, attempts, and diagnosis sheets.", "success");
    } catch (error) {
      showGlobalStatus(error.message, "error");
    }
  });
  elements.responseLanguage.addEventListener("change", async () => {
    try {
      appState = await updatePreferences({ responseLanguage: elements.responseLanguage.value });
      showGlobalStatus("Coach language updated.", "success");
    } catch (error) {
      showGlobalStatus(error.message, "error");
    }
  });
  for (const filter of [elements.statusFilter, elements.failureFilter, elements.platformFilter, elements.hintsFilter]) {
    filter.addEventListener("change", renderHistory);
  }
  for (const input of [elements.attemptLanguage, elements.attemptCode, elements.attemptNotes, elements.failedInput, elements.expectedOutput, elements.actualOutput]) {
    input.addEventListener("change", () => {
      const attempt = activeAttempt();
      if (attempt) void updateAttemptContext(attempt.id, currentAttemptContext()).catch(() => {
        showGlobalStatus("Draft context could not be saved. Try again.", "error");
      });
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "PAGE_CONTEXT_UPDATED") void refreshPageContext();
  });
  chrome.tabs.onActivated.addListener(() => void refreshPageContext());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.status === "complete" || changeInfo.url)) void refreshPageContext();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STATE_KEY]?.newValue) {
      appState = changes[STATE_KEY].newValue;
      renderAll();
    }
  });
  window.addEventListener("pagehide", () => {
    apiClient?.abortAll();
    clearInterval(timerInterval);
  });
}

async function initialize() {
  initializeFilterOptions();
  bindEvents();
  try {
    appState = await getState();
    activeTab = await queryActiveTab();
    pageContext = activeTab ? await requestPageContext(activeTab.id) : null;
    pageContext ||= inferBasicContext(activeTab);
    apiClient = createApiClient({ baseUrl: appState.preferences.backendUrl });
    renderAll();
    void checkBackend();
  } catch (error) {
    appState ||= { bookmarks: [], attempts: [], preferences: { responseLanguage: "hinglish", backendUrl: "http://localhost:8787" } };
    pageContext = null;
    renderAll();
    showGlobalStatus(error.message || "CodeAssist could not initialize.", "error", 0);
  }
}

void initialize();
