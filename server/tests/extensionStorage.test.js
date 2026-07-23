import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeProblemUrl,
  getState,
  migrateLegacyBookmarks,
  upsertBookmark
} from "../../extension/services/storageService.js";
import {
  getActiveAttemptFromState,
  recordHint,
  startAttempt
} from "../../extension/services/attemptService.js";
import { elapsedMilliseconds } from "../../extension/utils/time.js";

function memoryAdapter(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, structuredClone(data[key])]));
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    }
  };
}

const problem = {
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  platform: "leetcode",
  statement: "Given an array and a target, return the two matching indices.",
  difficulty: "Easy",
  language: "JavaScript"
};

describe("extension storage and migration", () => {
  it("migrates old bookmarks once without duplicates", () => {
    const legacy = [{
      title: "Two Sum",
      url: "https://leetcode.com/problems/two-sum/?envType=study-plan",
      platform: "LeetCode",
      difficulty: "Easy",
      feedback: "Hash map",
      date: "20/07/2026"
    }];
    const first = migrateLegacyBookmarks(undefined, legacy);
    const second = migrateLegacyBookmarks(first, legacy);
    expect(first.bookmarks).toHaveLength(1);
    expect(second.bookmarks).toHaveLength(1);
    expect(second.bookmarks[0]).toMatchObject({
      title: "Two Sum",
      difficulty: "Easy",
      feedback: "Hash map",
      date: "20/07/2026"
    });
  });

  it("prevents duplicate bookmarks by canonical URL", async () => {
    const adapter = memoryAdapter();
    await upsertBookmark({ ...problem, feedback: "first" }, adapter);
    const result = await upsertBookmark({ ...problem, url: `${problem.url}?source=tab`, feedback: "updated" }, adapter);
    expect(result.created).toBe(false);
    expect(result.state.bookmarks).toHaveLength(1);
    expect(result.state.bookmarks[0].feedback).toBe("updated");
  });

  it("validates and canonicalizes safe problem URLs", () => {
    expect(canonicalizeProblemUrl("javascript:alert(1)")).toBe("");
    expect(canonicalizeProblemUrl("http://leetcode.com/problems/two-sum/")).toBe("");
    expect(canonicalizeProblemUrl(`${problem.url}?x=1#top`)).toBe("https://leetcode.com/problems/two-sum");
  });
});

describe("attempt persistence", () => {
  it("recovers an active attempt and its timer after a restart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T10:00:00.000Z"));
    const adapter = memoryAdapter();
    const started = await startAttempt(problem, adapter);
    vi.advanceTimersByTime(61_000);
    const reloaded = await getState(adapter);
    const active = getActiveAttemptFromState(reloaded);
    expect(active.id).toBe(started.attempt.id);
    expect(elapsedMilliseconds(active.startTimestamp)).toBe(61_000);
    const recovered = await startAttempt(problem, adapter);
    expect(recovered.recovered).toBe(true);
    expect(recovered.state.attempts).toHaveLength(1);
    vi.useRealTimers();
  });

  it("stores code snapshots and sequential hint history", async () => {
    const adapter = memoryAdapter();
    const started = await startAttempt(problem, adapter);
    const hint = {
      level: 1,
      hint: "Constraint ko estimate karo.",
      focusArea: "complexity",
      questionForUser: "Brute force kitna slow hoga?",
      revealsFinalSolution: false
    };
    const result = await recordHint(started.attempt.id, 1, hint, {
      code: "function twoSum() {}",
      language: "JavaScript",
      notes: "Trying loops"
    }, adapter);
    const active = getActiveAttemptFromState(result.state);
    expect(active.hintRequests).toHaveLength(1);
    expect(active.codeSnapshots).toHaveLength(1);
    expect(active.highestHintLevelUsed).toBe(1);
  });
});
