# CodeAssist

CodeAssist is a Chrome extension for coding-practice platforms such as LeetCode, Codeforces, CodeChef, HackerRank, AtCoder, and GeeksforGeeks.

It helps you:

- save problems from the current page
- add notes, tags, difficulty, and time spent
- track solved and revision items
- export saved data to Excel or JSON
- get concise Gemini-based hints, complexity guidance, approaches, and concept explanations

## Tech

- Chrome Extension Manifest V3
- Vanilla JavaScript
- Chrome Storage API
- Content Scripts
- Background Service Worker
- Gemini API

## Project Structure

- `manifest.json`: extension configuration
- `popup.html`, `style.css`, `popup.js`: popup UI and logic
- `content.js`: extracts problem content from supported sites
- `background.js`: handles Gemini API requests
- `icons/`: extension icons

## Local Setup

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select this project folder
5. Open the extension popup and add your Gemini API key in Settings

## Notes

- The extension stores data locally in Chrome storage.
- Gemini responses are intentionally kept concise to support learning instead of giving full code by default.
