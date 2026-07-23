(function exposePlatformRegistry(globalScope) {
  function getAdapter(url = location.href) {
    return (globalScope.CodeAssistPlatformAdapters || []).find((adapter) => adapter.canHandle(url)) || null;
  }

  function getPageContext() {
    const adapter = getAdapter();
    if (!adapter) {
      return {
        supported: false,
        aiSupported: false,
        reason: "Open a supported LeetCode or Codeforces problem page."
      };
    }

    try {
      const metadata = adapter.extractProblemMetadata();
      const statement = adapter.extractProblemStatement();
      const code = adapter.extractEditorCode();
      return {
        supported: true,
        aiSupported: adapter.id === "leetcode",
        metadata,
        statement,
        code,
        warnings: {
          statementUnavailable: adapter.id === "leetcode" && !statement,
          codeUnavailable: adapter.id === "leetcode" && !code
        }
      };
    } catch {
      return {
        supported: true,
        aiSupported: adapter.id === "leetcode",
        reason: "This page changed before CodeAssist could read it. Refresh the page and try again."
      };
    }
  }

  globalScope.CodeAssistPlatforms = { getAdapter, getPageContext };
})(globalThis);
