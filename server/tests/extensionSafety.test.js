import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createElement, createSafeProblemLink } from "../../extension/utils/dom.js";
import { calculateInsights } from "../../extension/utils/insights.js";

describe("safe extension rendering", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "\"'><svg onload=alert(1)>"
  ])("renders an XSS-like title as plain text", (title) => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const element = createElement("div", { text: title }, dom.window.document);
    dom.window.document.body.append(element);
    expect(element.textContent).toBe(title);
    expect(element.children).toHaveLength(0);
    expect(dom.window.document.querySelector("script, img, svg")).toBeNull();
  });

  it("does not create links for unsafe URLs", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const element = createSafeProblemLink("Unsafe", "javascript:alert(1)", dom.window.document);
    expect(element.tagName).toBe("SPAN");
  });
});

describe("local insights", () => {
  it("hides percentages when fewer than three attempts are complete", () => {
    const result = calculateInsights([{
      status: "solved_independently",
      problemTitle: "Two Sum",
      elapsedTimeMs: 1000,
      highestHintLevelUsed: 0,
      updatedAt: new Date().toISOString()
    }]);
    expect(result.reliable).toBe(false);
    expect(result.message).toBe("Complete more attempts to unlock reliable insights.");
    expect(result.independentSolveRate).toBeUndefined();
  });
});
