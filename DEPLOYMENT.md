# CodeAssist V5 Deployment

CodeAssist has two deployment targets:

1. The Express backend runs as an HTTPS web service.
2. The Manifest V3 extension is distributed through the Chrome Web Store.

## Deploy the backend on Render

Push the repository to GitHub, then create a Render Web Service with:

```text
Root Directory: server
Build Command: npm ci
Start Command: npm start
Health Check Path: /health
```

Configure these Render environment variables:

```dotenv
NODE_ENV=production
GEMINI_API_KEY=your_server_side_key
GEMINI_MODEL=gemini-3.5-flash-lite
AI_TIMEOUT_MS=30000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=30
REQUEST_LIMIT=512kb
EXTENSION_ORIGIN=
```

Do not set `PORT`; Render supplies it. Verify the deployed service:

```powershell
Invoke-RestMethod https://your-service.onrender.com/health
```

## Configure the production extension

Add the exact backend origin to `extension/manifest.json`:

```json
"https://your-service.onrender.com/*"
```

Update `normalizeBackendUrl` in `extension/utils/validation.js` to accept HTTPS production URLs while retaining local HTTP for development:

```javascript
const localHttp =
  url.protocol === "http:" &&
  ["localhost", "127.0.0.1"].includes(url.hostname);
const remoteHttps = url.protocol === "https:";

if (!localHttp && !remoteHttps) return fallback;
```

Replace the default `http://localhost:8787` values in extension source with the deployed HTTPS origin:

```powershell
rg -n "http://localhost:8787" extension
```

Keep host permissions narrow. Add only the backend hostname used by this build.

## Package the extension

From the project root:

```powershell
Compress-Archive -Path .\extension\* -DestinationPath .\CodeAssist-V5.zip -Force
```

The generated ZIP must contain `manifest.json` at its root.

## Publish through Chrome Web Store

1. Register a Chrome Web Store developer account and enable two-step verification.
2. Upload `CodeAssist-V5.zip` as a new dashboard item.
3. Complete the Store Listing, Privacy, Distribution, and Test Instructions sections.
4. Use Private or Unlisted visibility for initial testing.
5. Copy the assigned extension ID.
6. Set Render `EXTENSION_ORIGIN=chrome-extension://<extension-id>`.
7. Redeploy the backend and test hints and diagnosis from the store build.
8. Submit the item for review.

The privacy disclosure should explain that problem statements, code, notes, and failed-test evidence are sent to the configured backend and Gemini only after an explicit hint or diagnosis request. Bookmarks, attempts, preferences, and reports are stored locally in `chrome.storage.local`.

## Production checks

```text
GET /health returns 200
The extension backend indicator shows Online
Hint Level 1 returns a validated response
Hint levels cannot be skipped
Diagnosis is stored in History
No API key exists in the extension ZIP
Only the production HTTPS API host is permitted
EXTENSION_ORIGIN matches the published extension ID
Gemini quota and billing alerts are configured
```

Browser CORS is not a replacement for API authentication. Keep rate limits conservative, configure provider quota limits, monitor usage, and add stronger abuse controls before supporting a large public audience.
