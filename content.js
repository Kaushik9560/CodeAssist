chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getProblemContent") {
        sendResponse(extractProblemData());
    }
    return true;
});

function extractProblemData() {
    const url = window.location.href;
    const problemData = {
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
                'div[class*="description"]',
                'div[class*="problem-statement"]'
            ]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("geeksforgeeks.org")) {
            problemData.platform = "GeeksforGeeks";
            const element = findFirst([
                ".problems_problem_content__Xm_eO",
                ".problem-statement"
            ]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("codeforces.com")) {
            problemData.platform = "Codeforces";
            const element = document.querySelector(".problem-statement");
            hydrateProblemData(problemData, element);
        } else if (url.includes("hackerrank.com")) {
            problemData.platform = "HackerRank";
            const element = document.querySelector(".challenge-body-html");
            hydrateProblemData(problemData, element);
        } else if (url.includes("codechef.com")) {
            problemData.platform = "CodeChef";
            const element = findFirst(["#problem-statement", ".problem-statement"]);
            hydrateProblemData(problemData, element);
        } else if (url.includes("atcoder.jp")) {
            problemData.platform = "AtCoder";
            const root = document.querySelector("#task-statement");
            const element = root?.querySelector(".lang-en") || root;
            hydrateProblemData(problemData, element);
        }

        if (!problemData.content) {
            const selected = window.getSelection()?.toString().trim();
            if (selected && selected.length > 40) {
                problemData.content = selected;
                problemData.platform = problemData.platform || "Manual Selection";
            }
        }
    } catch (error) {
        console.error("Problem extraction failed:", error);
    }

    return problemData;
}

function hydrateProblemData(problemData, element) {
    if (!element) {
        return;
    }

    problemData.content = cleanText(element.innerText);
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

    const match = content.match(/constraints?[\s\S]{0,800}/i);
    return match ? cleanText(match[0]) : "";
}

function cleanText(value) {
    return String(value || "")
        .replace(/\u00a0/g, " ")
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
