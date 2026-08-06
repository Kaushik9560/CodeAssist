const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function loadBackground({ storage = {}, fetchImpl } = {}) {
    const listeners = [];
    const requests = [];
    const context = vm.createContext({
        AbortController,
        clearTimeout,
        console: { error() {} },
        setTimeout,
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        listeners.push(listener);
                    }
                }
            },
            storage: {
                local: {
                    async get() {
                        return storage;
                    }
                }
            }
        },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (fetchImpl) {
                return fetchImpl(url, options);
            }
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        status: "completed",
                        steps: [{
                            type: "model_output",
                            content: [{ type: "text", text: "A focused answer" }]
                        }]
                    };
                }
            };
        }
    });

    const source = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
    vm.runInContext(source, context, { filename: "background.js" });
    return { context, listeners, requests };
}

function evaluate(context, expression) {
    return vm.runInContext(expression, context);
}

function sendMessage(listener, request) {
    return new Promise((resolve) => {
        const keptOpen = listener(request, {}, resolve);
        assert.equal(keptOpen, true);
    });
}

test("manifest is valid and declares permissions used by the runtime", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.permissions.includes("storage"));
    assert.ok(manifest.permissions.includes("activeTab"));
    assert.ok(manifest.permissions.includes("scripting"));
    assert.ok(manifest.host_permissions.includes("https://generativelanguage.googleapis.com/*"));
    assert.equal(manifest.background.service_worker, "background.js");
});

test("popup IDs are unique and every direct JavaScript ID reference exists", () => {
    const html = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
    const script = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
    const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const referencedIds = [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);

    assert.equal(new Set(htmlIds).size, htmlIds.length);
    referencedIds.forEach((id) => assert.ok(htmlIds.includes(id), `Missing popup element #${id}`));
});

test("popup converts common Gemini LaTeX into readable Unicode", () => {
    const context = vm.createContext({ document: { addEventListener() {} }, console });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"), context);
    const output = vm.runInContext("normalizeMath(String.raw`Find $x \\ge n$, with $n \\le 100$ and $t \\neq 0$.`)", context);
    assert.equal(output, "Find x ≥ n, with n ≤ 100 and t ≠ 0.");
    assert.doesNotMatch(output, /[$\\]/);
});

test("current Interactions REST steps are converted to response text", () => {
    const { context } = loadBackground();
    const result = evaluate(context, `extractInteractionText({
        steps: [{
            type: "model_output",
            content: [
                { type: "text", text: "First section" },
                { type: "text", text: "Second section" }
            ]
        }]
    })`);
    assert.equal(result, "First section\n\nSecond section");
});

test("non-output steps are ignored", () => {
    const { context } = loadBackground();
    const result = evaluate(context, `extractInteractionText({
        steps: [
            { type: "thought", content: [{ type: "text", text: "private thought" }] },
            { type: "model_output", content: [{ type: "text", text: "visible answer" }] }
        ]
    })`);
    assert.equal(result, "visible answer");
});

test("legacy Interactions output shapes remain readable", () => {
    const { context } = loadBackground();
    assert.equal(
        evaluate(context, 'extractInteractionText({ outputs: [{ type: "text", text: "Legacy answer" }] })'),
        "Legacy answer"
    );
    assert.equal(
        evaluate(context, 'extractInteractionText({ output_text: "SDK-style answer" })'),
        "SDK-style answer"
    );
});

test("AI message flow sends a valid stateless Interactions request", async () => {
    const { listeners, requests } = loadBackground({
        storage: {
            apiKey: "test-key",
            geminiModel: "gemini-3.6-flash",
            responseLanguage: "english"
        }
    });

    const response = await sendMessage(listeners[0], {
        action: "getThinkingSteps",
        payload: {
            title: "Two Sum",
            platform: "LeetCode",
            content: "Find two values whose sum equals the target.",
            examples: [],
            constraints: "2 <= n <= 100"
        }
    });

    assert.equal(response.ok, true);
    assert.equal(response.text, "A focused answer");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(requests[0].options.headers["x-goog-api-key"], "test-key");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.model, "gemini-3.6-flash");
    assert.equal(body.store, false);
    assert.match(body.input, /Two Sum/);
    assert.match(body.input, /plain Unicode/);
    assert.match(body.input, /Never use LaTeX/);
});

test("connection test uses minimal thinking and a small output cap", async () => {
    const { listeners, requests } = loadBackground({
        storage: { apiKey: "previous-key", geminiModel: "gemini-3.6-flash" }
    });

    const response = await sendMessage(listeners[0], {
        action: "testGeminiConnection",
        payload: { apiKey: "entered-key", model: "gemini-3.5-flash-lite" }
    });
    assert.equal(response.ok, true);
    assert.equal(response.model, "gemini-3.5-flash-lite");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.model, "gemini-3.5-flash-lite");
    assert.equal(requests[0].options.headers["x-goog-api-key"], "entered-key");
    assert.equal(body.generation_config.max_output_tokens, 64);
    assert.equal(body.generation_config.thinking_level, "minimal");
});

test("an incomplete interaction with usable text returns the partial answer", async () => {
    const { listeners } = loadBackground({
        storage: { apiKey: "test-key", geminiModel: "gemini-3.6-flash" },
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() {
                return {
                    status: "incomplete",
                    steps: [{ type: "model_output", content: [{ type: "text", text: "Useful partial answer" }] }]
                };
            }
        })
    });

    const response = await sendMessage(listeners[0], {
        action: "getThinkingSteps",
        payload: {
            title: "Partial",
            platform: "LeetCode",
            content: "A sufficiently detailed problem statement.",
            examples: [],
            constraints: ""
        }
    });
    assert.equal(response.ok, true);
    assert.equal(response.text, "Useful partial answer");
});

test("errors nested inside interaction steps are surfaced", async () => {
    const { listeners } = loadBackground({
        storage: { apiKey: "test-key", geminiModel: "gemini-3.6-flash" },
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() {
                return {
                    status: "failed",
                    steps: [{ type: "model_output", error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }]
                };
            }
        })
    });

    const response = await sendMessage(listeners[0], { action: "testGeminiConnection" });
    assert.equal(response.ok, false);
    assert.match(response.error, /quota or rate limit/i);
});

test("invalid API keys become actionable user-facing errors", async () => {
    const { listeners } = loadBackground({
        storage: { apiKey: "bad-key", geminiModel: "gemini-3.6-flash" },
        fetchImpl: async () => ({
            ok: false,
            status: 400,
            async json() {
                return { error: { message: "API key not valid. Please pass a valid API key." } };
            }
        })
    });

    const response = await sendMessage(listeners[0], { action: "testGeminiConnection" });
    assert.equal(response.ok, false);
    assert.match(response.error, /invalid or expired/i);
});

test("unknown runtime messages are ignored", () => {
    const { listeners } = loadBackground();
    assert.equal(listeners[0]({ action: "unknown" }, {}, () => {}), false);
});
