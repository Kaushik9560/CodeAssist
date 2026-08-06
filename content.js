if (!globalThis.__codeAssistContentListenerRegistered) {
    globalThis.__codeAssistContentListenerRegistered = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request?.action !== "getProblemContent") {
            return false;
        }

        waitForProblemData()
            .then(sendResponse)
            .catch((error) => {
                console.error("Problem extraction failed:", error);
                sendResponse({ content: "", examples: [], constraints: "", platform: "", title: "" });
            });
        return true;
    });
}

async function waitForProblemData() {
    const attempts = 8;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const data = extractProblemData();
        if (data.content) {
            return data;
        }
        if (attempt < attempts - 1) {
            await delay(350);
        }
    }
    return extractProblemData();
}

function extractProblemData() {
    const url = window.location.href;
    const problemData = {
        title: "",
        content: "",
        examples: [],
        constraints: "",
        platform: ""
    };

    try {
        if (url.includes("leetcode.com")) {
            problemData.platform = "LeetCode";
            const element = findFirst([
                'div[data-track-load="description_content"]',
                '[data-testid="question-description"]',
                'div[class*="description-content"]',
                'div[class*="problem-statement"]'
            ]);
            problemData.title = textFromFirst([
                '[data-cy="question-title"]',
                '[data-testid="question-title"]',
                'div[class*="text-title-large"]'
            ]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("geeksforgeeks.org")) {
            problemData.platform = "GeeksforGeeks";
            const element = findFirst([
                '[class*="problems_problem_content"]',
                ".problem-statement",
                '[class*="problemStatement"]'
            ]);
            problemData.title = textFromFirst([
                'h1[class*="problem"]',
                ".problem-title",
                "main h1"
            ]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("codeforces.com")) {
            problemData.platform = "Codeforces";
            const element = document.querySelector(".problem-statement");
            problemData.title = textFromFirst([".problem-statement .title"]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("hackerrank.com")) {
            problemData.platform = "HackerRank";
            const element = findFirst([
                ".challenge-body-html",
                '[data-analytics="ChallengeStatement"]',
                ".problem-statement"
            ]);
            problemData.title = textFromFirst([
                ".challenge-view h1",
                '[data-analytics="ChallengeName"]',
                "main h1"
            ]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("codechef.com")) {
            problemData.platform = "CodeChef";
            const element = findFirst([
                "#problem-statement",
                ".problem-statement",
                '[class*="problem-statement"]'
            ]);
            problemData.title = textFromFirst([
                '[class*="problem__title"]',
                '[class*="problem-title"]',
                "main h1"
            ]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("atcoder.jp")) {
            problemData.platform = "AtCoder";
            const root = document.querySelector("#task-statement");
            const element = root?.querySelector(".lang-en") || root;
            problemData.title = textFromFirst([
                ".h2",
                ".contest-title",
                "title"
            ]);
            hydrateProblemData(problemData, element);
        }

        if (!problemData.content) {
            const selected = window.getSelection()?.toString().trim();
            if (selected && selected.length > 40) {
                problemData.content = cleanText(selected);
                problemData.platform = problemData.platform || "Manual selection";
            }
        }

        problemData.title = cleanProblemTitle(problemData.title, problemData.platform);
    } catch (error) {
        console.error("Problem extraction failed:", error);
    }

    return problemData;
}

function hydrateProblemData(problemData, element) {
    if (!element) {
        return;
    }

    problemData.content = cleanText(element.innerText).slice(0, 60_000);
    problemData.examples = [...element.querySelectorAll("pre")]
        .map((item) => cleanText(item.innerText))
        .filter(Boolean)
        .slice(0, 4);
    problemData.constraints = extractConstraints(problemData.content);
}

function extractConstraints(content) {
    if (!content) {
        return "";
    }

    const match = content.match(/constraints?\s*:?\s*([\s\S]{0,1600})/i);
    return match ? cleanText(match[0]) : "";
}

function cleanProblemTitle(value, platform) {
    return cleanText(value)
        .replace(/^\s*[A-Z0-9]+[.)]\s+/, "")
        .replace(new RegExp(`\\s*[|–—-]\\s*${escapeRegExp(platform)}.*$`, "i"), "")
        .trim()
        .slice(0, 300);
}

function cleanText(value) {
    return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/[\t ]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function findFirst(selectors) {
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
    }
    return null;
}

function textFromFirst(selectors) {
    const element = findFirst(selectors);
    return cleanText(element?.textContent || "");
}

function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
