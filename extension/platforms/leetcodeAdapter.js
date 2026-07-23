(function registerLeetCodeAdapter(globalScope) {
  const TITLE_SELECTORS = [
    "[data-cy='question-title']",
    "[data-testid='question-title']",
    "h1"
  ];
  const STATEMENT_SELECTORS = [
    "div[data-track-load='description_content']",
    "[data-testid='description-content']",
    "[data-cy='question-content']"
  ];
  const LANGUAGE_SELECTORS = [
    "[data-cy='lang-select']",
    "button[id^='headlessui-listbox-button']",
    "[aria-label*='language' i]"
  ];
  const CODE_SELECTORS = [
    ".monaco-editor textarea.inputarea",
    ".monaco-editor textarea",
    ".CodeMirror textarea",
    "textarea[data-cy*='code']",
    "[contenteditable='true'][role='textbox']"
  ];

  function firstElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function cleanTitle(rawTitle) {
    return String(rawTitle || "")
      .replace(/^\d+\.\s*/, "")
      .replace(/\s+-\s+LeetCode.*$/i, "")
      .trim();
  }

  function canonicalUrl() {
    const match = location.pathname.match(/^\/problems\/([^/]+)/i);
    return match ? `${location.origin}/problems/${match[1]}/` : location.href;
  }

  function detectDifficulty(statementElement) {
    const selectors = [
      "[data-difficulty]",
      "[diff]",
      "[class*='difficulty']"
    ];
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        const value = String(
          candidate.getAttribute("data-difficulty") ||
          candidate.getAttribute("diff") ||
          candidate.textContent || ""
        ).trim();
        const match = value.match(/\b(Easy|Medium|Hard)\b/i);
        if (match) return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
      }
    }

    const nearbyText = statementElement?.parentElement?.textContent || "";
    const match = nearbyText.slice(0, 500).match(/\b(Easy|Medium|Hard)\b/i);
    return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : "";
  }

  function extractEditorCode() {
    for (const selector of CODE_SELECTORS) {
      const candidate = document.querySelector(selector);
      if (!candidate) continue;
      const value = "value" in candidate ? candidate.value : candidate.textContent;
      if (String(value || "").trim()) {
        return String(value).trim();
      }
    }

    const renderedLines = document.querySelector(".monaco-editor .view-lines");
    const renderedCode = renderedLines?.textContent?.trim() || "";
    return renderedCode.length >= 10 ? renderedCode : "";
  }

  function extractLanguage() {
    const element = firstElement(LANGUAGE_SELECTORS);
    const raw = element?.value || element?.textContent || "";
    return String(raw).trim().split("\n")[0].slice(0, 50);
  }

  const adapter = {
    id: "leetcode",
    canHandle(url) {
      try {
        const parsed = new URL(url);
        return /(^|\.)leetcode\.com$/i.test(parsed.hostname) && /^\/problems\/[^/]+/i.test(parsed.pathname);
      } catch {
        return false;
      }
    },
    extractProblemMetadata() {
      const statementElement = firstElement(STATEMENT_SELECTORS);
      const titleElement = firstElement(TITLE_SELECTORS);
      const title = cleanTitle(titleElement?.textContent || document.title) || "LeetCode problem";
      return {
        title,
        url: canonicalUrl(),
        platform: "leetcode",
        difficulty: detectDifficulty(statementElement),
        language: extractLanguage()
      };
    },
    extractProblemStatement() {
      return firstElement(STATEMENT_SELECTORS)?.textContent?.trim() || "";
    },
    extractEditorCode,
    observeRelevantPageEvents(onChange) {
      let timerId;
      let previousUrl = location.href;
      const schedule = () => {
        clearTimeout(timerId);
        timerId = setTimeout(onChange, 700);
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true });
      const routeInterval = setInterval(() => {
        if (location.href !== previousUrl) {
          previousUrl = location.href;
          schedule();
        }
      }, 1_000);
      window.addEventListener("popstate", schedule);
      return () => {
        clearTimeout(timerId);
        clearInterval(routeInterval);
        observer.disconnect();
        window.removeEventListener("popstate", schedule);
      };
    }
  };

  globalScope.CodeAssistPlatformAdapters = globalScope.CodeAssistPlatformAdapters || [];
  globalScope.CodeAssistPlatformAdapters.push(adapter);
})(globalThis);
