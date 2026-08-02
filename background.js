const ACTION_PROMPTS = {
    getThinkingSteps: {
        label: "Hints",
        instructions: `Give a concise problem-solving guide without writing the final code.
Use short sections:
- Problem summary
- Key observations
- First step to try
- One subtle hint
Keep it practical and under 220 words.`
    },
    getComplexityAnalysis: {
        label: "Complexity",
        instructions: `Explain the likely optimal time and space complexity.
Use short sections:
- Best target complexity
- Why that complexity fits
- Trade-offs with simpler approaches
Keep it precise and under 220 words.`
    },
    getApproaches: {
        label: "Approaches",
        instructions: `List 3 sensible approaches from brute force to optimal.
For each one include:
- Idea
- Time complexity
- When it becomes useful
Do not include full code. Keep it compact.`
    },
    explainConcept: {
        label: "Concepts",
        instructions: `Explain the core algorithmic ideas needed for this problem.
Use short sections:
- Main concept
- Why it applies here
- What to watch for
- Similar patterns to practice
Keep it clear, friendly, and under 220 words.`
    }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!ACTION_PROMPTS[request.action]) {
        return false;
    }

    handleGeminiRequest(request.action, request.payload)
        .then((text) => sendResponse({ ok: true, text }))
        .catch((error) => {
            console.error("Gemini request failed:", error);
            sendResponse({ ok: false, error: error.message || "Gemini request failed." });
        });

    return true;
});

async function handleGeminiRequest(action, payload) {
    const settings = await chrome.storage.local.get(["apiKey", "geminiModel", "responseLanguage"]);
    const apiKey = settings.apiKey?.trim();
    const model = settings.geminiModel || "gemini-3.6-flash";
    const responseLanguage = settings.responseLanguage || "english";

    if (!apiKey) {
        throw new Error("Add your Gemini API key in Settings before using AI help.");
    }

    const prompt = buildPrompt(action, payload, responseLanguage);
    return callGeminiInteractionsApi({ apiKey, model, prompt });
}

function buildPrompt(action, payload, responseLanguage) {
    const languageNote = responseLanguage === "hinglish"
        ? "Write in natural Hinglish with technical terms kept clear."
        : "Write in clear English.";
    const config = ACTION_PROMPTS[action];
    const examples = Array.isArray(payload.examples) && payload.examples.length
        ? payload.examples.slice(0, 3).join("\n\n")
        : "No example blocks extracted.";

    return `You are helping with a competitive programming problem inside a browser extension.
${languageNote}
Do not write full code unless explicitly asked.
Do not be verbose.

Problem title: ${payload.title}
Platform: ${payload.platform}

Problem statement:
${payload.content}

Examples:
${examples}

Constraints:
${payload.constraints || "Not separately extracted."}

Task:
${config.instructions}`;
}

async function callGeminiInteractionsApi({ apiKey, model, prompt }) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
            model,
            input: prompt,
            store: false
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error?.message || `Gemini API error (${response.status})`);
    }

    const text = extractInteractionText(data);
    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    return text.trim();
}

function extractInteractionText(data) {
    if (typeof data.output_text === "string" && data.output_text.trim()) {
        return data.output_text;
    }

    const steps = Array.isArray(data.steps) ? data.steps : [];
    for (const step of steps) {
        const candidates = step?.model_output?.content?.parts || step?.content?.parts || [];
        const text = candidates.map((part) => part?.text).filter(Boolean).join("\n");
        if (text.trim()) {
            return text;
        }
    }

    return "";
}
