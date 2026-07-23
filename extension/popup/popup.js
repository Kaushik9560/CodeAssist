import { createApiClient } from "../services/apiClient.js";
import { canonicalizeProblemUrl, getState, upsertBookmark } from "../services/storageService.js";

const elements = {
  platform: document.querySelector("#platformBadge"),
  title: document.querySelector("#problemTitle"),
  pageMessage: document.querySelector("#pageMessage"),
  backend: document.querySelector("#backendStatus"),
  backendText: document.querySelector("#backendStatusText"),
  openCoach: document.querySelector("#openCoachButton"),
  quickBookmark: document.querySelector("#quickBookmarkButton"),
  status: document.querySelector("#popupStatus")
};

let activeTab = null;
let pageContext = null;
let appState = null;

function showStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
  elements.status.hidden = !message;
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error("The active browser tab is unavailable."));
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
    let platform;
    if (url.hostname.endsWith("leetcode.com") && url.pathname.startsWith("/problems/")) platform = "leetcode";
    if (url.hostname === "codeforces.com" && url.pathname.includes("/problem")) platform = "codeforces";
    if (!platform) return null;
    return {
      supported: true,
      aiSupported: platform === "leetcode",
      metadata: {
        title: String(tab.title || "Problem").split(" - ")[0],
        url: tab.url,
        platform,
        difficulty: "",
        language: ""
      },
      statement: "",
      code: ""
    };
  } catch {
    return null;
  }
}

function renderContext() {
  const metadata = pageContext?.metadata;
  if (!pageContext?.supported || !metadata) {
    elements.platform.textContent = "Unsupported page";
    elements.title.textContent = "No supported problem detected";
    elements.pageMessage.textContent = "Open a LeetCode or Codeforces problem, then reopen CodeAssist.";
    elements.quickBookmark.disabled = true;
    return;
  }

  elements.platform.textContent = metadata.platform;
  elements.title.textContent = metadata.title;
  elements.pageMessage.textContent = pageContext.aiSupported
    ? "Socratic coaching is ready in the Side Panel."
    : "Bookmark support is ready. Codeforces AI coaching is coming soon.";
  const currentUrl = canonicalizeProblemUrl(metadata.url);
  const existing = appState.bookmarks.find((bookmark) => bookmark.url === currentUrl);
  elements.quickBookmark.textContent = existing ? "Bookmarked" : "Quick bookmark";
  elements.quickBookmark.disabled = Boolean(existing);
}

async function checkBackend() {
  const client = createApiClient({ baseUrl: appState.preferences.backendUrl });
  try {
    await client.health();
    elements.backend.dataset.state = "online";
    elements.backendText.textContent = "Backend online";
  } catch {
    elements.backend.dataset.state = "offline";
    elements.backendText.textContent = "Backend offline";
  }
}

elements.openCoach.addEventListener("click", () => {
  if (!activeTab) {
    showStatus("No active browser tab is available.", "error");
    return;
  }
  chrome.sidePanel.open({ windowId: activeTab.windowId })
    .then(() => window.close())
    .catch(() => showStatus("Chrome could not open the Side Panel.", "error"));
});

elements.quickBookmark.addEventListener("click", async () => {
  const metadata = pageContext?.metadata;
  if (!metadata) return;
  elements.quickBookmark.disabled = true;
  try {
    const result = await upsertBookmark({
      ...metadata,
      feedback: "",
      date: new Date().toLocaleDateString("en-GB")
    });
    appState = result.state;
    elements.quickBookmark.textContent = "Bookmarked";
    showStatus("Problem saved locally.", "success");
  } catch (error) {
    elements.quickBookmark.disabled = false;
    showStatus(error.message, "error");
  }
});

async function initialize() {
  try {
    [appState, activeTab] = await Promise.all([getState(), queryActiveTab()]);
    pageContext = activeTab ? await requestPageContext(activeTab.id) : null;
    pageContext ||= inferBasicContext(activeTab);
    renderContext();
    void checkBackend();
  } catch (error) {
    elements.title.textContent = "CodeAssist could not initialize";
    elements.pageMessage.textContent = error.message;
    elements.quickBookmark.disabled = true;
    elements.backend.dataset.state = "offline";
    elements.backendText.textContent = "Check failed";
  }
}

void initialize();
