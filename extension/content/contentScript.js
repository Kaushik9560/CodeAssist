(function initializeContentScript() {
  const registry = globalThis.CodeAssistPlatforms;
  if (!registry) return;

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== "GET_PAGE_CONTEXT") return false;
    sendResponse(registry.getPageContext());
    return false;
  });

  const adapter = registry.getAdapter();
  if (adapter) {
    adapter.observeRelevantPageEvents(() => {
      chrome.runtime.sendMessage({ type: "PAGE_CONTEXT_UPDATED" }, () => {
        void chrome.runtime.lastError;
      });
    });
  }
})();
