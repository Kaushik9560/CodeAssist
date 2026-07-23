(function registerCodeforcesAdapter(globalScope) {
  function cleanTitle(rawTitle) {
    return String(rawTitle || "")
      .replace(/^Problem\s+-\s+/i, "")
      .replace(/\s+-\s+Codeforces.*$/i, "")
      .trim();
  }

  const adapter = {
    id: "codeforces",
    canHandle(url) {
      try {
        const parsed = new URL(url);
        return parsed.hostname === "codeforces.com" && (
          /^\/problemset\/problem\/\d+\/[A-Za-z0-9]+/i.test(parsed.pathname) ||
          /^\/contest\/\d+\/problem\/[A-Za-z0-9]+/i.test(parsed.pathname)
        );
      } catch {
        return false;
      }
    },
    extractProblemMetadata() {
      const titleElement = document.querySelector(".problem-statement .title");
      return {
        title: cleanTitle(titleElement?.textContent || document.title) || "Codeforces problem",
        url: location.href.split("#")[0].split("?")[0],
        platform: "codeforces",
        difficulty: "",
        language: ""
      };
    },
    extractProblemStatement() {
      return document.querySelector(".problem-statement")?.textContent?.trim() || "";
    },
    extractEditorCode() {
      return "";
    },
    observeRelevantPageEvents(onChange) {
      window.addEventListener("popstate", onChange);
      return () => window.removeEventListener("popstate", onChange);
    }
  };

  globalScope.CodeAssistPlatformAdapters = globalScope.CodeAssistPlatformAdapters || [];
  globalScope.CodeAssistPlatformAdapters.push(adapter);
})(globalThis);
