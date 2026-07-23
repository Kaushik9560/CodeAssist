import { isSafeProblemUrl, normalizeBackendUrl, normalizeText } from "../utils/validation.js";

export const SCHEMA_VERSION = 5;
export const STATE_KEY = "codeAssistV5";
export const LEGACY_BOOKMARKS_KEY = "leetCodeBookmarks";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${randomPart}`;
}

export function createEmptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    bookmarks: [],
    attempts: [],
    activeAttempt: null,
    preferences: {
      responseLanguage: "hinglish",
      backendUrl: "http://localhost:8787"
    },
    migrations: {
      legacyBookmarksV5Completed: false,
      migratedAt: null
    }
  };
}

export function canonicalizeProblemUrl(value) {
  if (!isSafeProblemUrl(value)) return "";
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function normalizePlatform(value, url = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("codeforces") || url.includes("codeforces.com")) return "codeforces";
  return "leetcode";
}

function normalizeBookmark(bookmark) {
  const url = canonicalizeProblemUrl(bookmark?.url);
  if (!url) return null;
  const createdAt = bookmark?.createdAt || nowIso();
  return {
    id: normalizeText(bookmark?.id, 100) || makeId("bookmark"),
    title: normalizeText(bookmark?.title, 300) || "Untitled problem",
    url,
    platform: normalizePlatform(bookmark?.platform, url),
    difficulty: normalizeText(bookmark?.difficulty, 100),
    feedback: normalizeText(bookmark?.feedback, 10_000),
    date: normalizeText(bookmark?.date, 100) || new Date(createdAt).toLocaleDateString("en-GB"),
    createdAt,
    updatedAt: bookmark?.updatedAt || createdAt
  };
}

function normalizeCurrentState(value) {
  const empty = createEmptyState();
  if (!value || typeof value !== "object") return empty;
  return {
    ...empty,
    ...value,
    schemaVersion: SCHEMA_VERSION,
    bookmarks: Array.isArray(value.bookmarks) ? value.bookmarks.map(normalizeBookmark).filter(Boolean) : [],
    attempts: Array.isArray(value.attempts) ? value.attempts : [],
    activeAttempt: typeof value.activeAttempt === "string" ? value.activeAttempt : null,
    preferences: {
      ...empty.preferences,
      ...(value.preferences || {}),
      responseLanguage: value.preferences?.responseLanguage === "english" ? "english" : "hinglish",
      backendUrl: normalizeBackendUrl(value.preferences?.backendUrl)
    },
    migrations: {
      ...empty.migrations,
      ...(value.migrations || {})
    }
  };
}

export function migrateLegacyBookmarks(currentState, legacyBookmarks) {
  const state = normalizeCurrentState(currentState);
  if (state.migrations.legacyBookmarksV5Completed) return state;

  const seenUrls = new Set(state.bookmarks.map((bookmark) => bookmark.url));
  for (const legacyBookmark of Array.isArray(legacyBookmarks) ? legacyBookmarks : []) {
    const bookmark = normalizeBookmark(legacyBookmark);
    if (!bookmark || seenUrls.has(bookmark.url)) continue;
    state.bookmarks.push(bookmark);
    seenUrls.add(bookmark.url);
  }

  state.migrations = {
    legacyBookmarksV5Completed: true,
    migratedAt: nowIso()
  };
  return state;
}

export function createChromeStorageAdapter() {
  return {
    get(keys) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error("CodeAssist could not read local data."));
          else resolve(result);
        });
      });
    },
    set(values) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error("CodeAssist could not save local data."));
          else resolve();
        });
      });
    }
  };
}

function adapterOrDefault(adapter) {
  return adapter || createChromeStorageAdapter();
}

export async function initializeStorage(adapter) {
  const storage = adapterOrDefault(adapter);
  const values = await storage.get([STATE_KEY, LEGACY_BOOKMARKS_KEY]);
  const state = migrateLegacyBookmarks(values[STATE_KEY], values[LEGACY_BOOKMARKS_KEY]);
  await storage.set({ [STATE_KEY]: state });
  return state;
}

export async function getState(adapter) {
  return initializeStorage(adapter);
}

export async function updateState(mutator, adapter) {
  const storage = adapterOrDefault(adapter);
  const state = await initializeStorage(storage);
  const draft = structuredClone(state);
  await mutator(draft);
  draft.schemaVersion = SCHEMA_VERSION;
  await storage.set({ [STATE_KEY]: draft });
  return draft;
}

export async function upsertBookmark(input, adapter) {
  const normalized = normalizeBookmark(input);
  if (!normalized) throw new Error("Only supported HTTPS problem URLs can be bookmarked.");
  let created = false;
  let savedBookmark;
  const state = await updateState((draft) => {
    const existing = draft.bookmarks.find((bookmark) => bookmark.url === normalized.url);
    if (existing) {
      existing.title = normalized.title;
      existing.platform = normalized.platform;
      existing.difficulty = normalized.difficulty;
      existing.feedback = normalized.feedback;
      existing.date = normalized.date;
      existing.updatedAt = nowIso();
      savedBookmark = existing;
      return;
    }
    created = true;
    draft.bookmarks.push(normalized);
    savedBookmark = normalized;
  }, adapter);
  return { state, bookmark: savedBookmark, created };
}

export async function deleteBookmark(bookmarkId, adapter) {
  return updateState((draft) => {
    draft.bookmarks = draft.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
  }, adapter);
}

export async function updatePreferences(preferences, adapter) {
  return updateState((draft) => {
    if (preferences.responseLanguage) {
      draft.preferences.responseLanguage = preferences.responseLanguage === "english" ? "english" : "hinglish";
    }
    if (preferences.backendUrl) {
      draft.preferences.backendUrl = normalizeBackendUrl(preferences.backendUrl);
    }
  }, adapter);
}
