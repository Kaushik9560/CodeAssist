import { initializeStorage } from "../services/storageService.js";

async function initialize() {
  try {
    await initializeStorage();
  } catch {
    console.error("CodeAssist storage initialization failed.");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CODEASSIST_INITIALIZE") {
    return false;
  }

  initialize()
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false, error: "Local data could not be initialized." }));
  return true;
});

void initialize();
