# CodeAssist

CodeAssist is a focused Chrome extension for competitive-programming practice. It keeps problem notes and revision status close to the page, and provides concise Gemini guidance without defaulting to full solutions.

## Features

- Detects problems on LeetCode, Codeforces, CodeChef, HackerRank, AtCoder, and GeeksforGeeks
- Requests focused hints, complexity analysis, approaches, or concept explanations from Gemini
- Saves status, difficulty, time spent, revision flags, tags, and notes locally
- Searches and filters a compact problem library
- Exports the library to Excel or JSON
- Supports English and Hinglish responses
- Tests the selected Gemini key and model directly from Settings

## Install locally

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.
4. Pin CodeAssist, then open a supported coding-problem page.
5. In CodeAssist → **Settings**, paste a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
6. Click **Test connection**, then **Save settings**.

When this unpacked extension is updated, click **Reload** on `chrome://extensions/`. CodeAssist can inject its content reader into an already-open supported tab; refreshing the problem page is still a useful first step if a site has changed its page structure.

## Gemini integration

The extension uses the Gemini Interactions REST API through the Manifest V3 background service worker. The default model is `gemini-3.6-flash`; additional model choices are available in Settings.

The response reader supports the current Interactions `steps[].content[]` schema as well as the legacy `outputs[]` shape. Requests time out after 45 seconds and return actionable messages for invalid keys, restricted keys, unavailable models, quota limits, safety blocks, and network failures.

## Privacy

- API settings, bookmarks, and notes are stored in `chrome.storage.local` on the current Chrome profile.
- The Gemini API key is not encrypted by the extension. Treat the Chrome profile as sensitive and apply appropriate restrictions to the key.
- A problem statement is sent directly to Google's Gemini API only after the user chooses an AI action or tests the connection.
- Gemini interactions are sent with `store: false`.

## Development

There is no build step. The extension uses Manifest V3, vanilla JavaScript, CSS, Chrome Storage, content scripts, and a background service worker.

Run the dependency-free checks with:

```bash
node --test tests/extension.test.js
node --check popup.js
node --check content.js
node --check background.js
```

The Excel library is vendored as `xlsx.full.min.js` and is loaded only when an Excel export is requested.
