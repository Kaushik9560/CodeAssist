document.addEventListener("DOMContentLoaded", async () => {
    const STORAGE_KEY = "problemBookmarks";
    const LEGACY_STORAGE_KEY = "leetCodeBookmarks";
    const DEFAULT_MODEL = "gemini-3.6-flash";
    const SUPPORTED_SITES = [
        { match: "leetcode.com/problems/", platform: "LeetCode", split: " - " },
        { match: "codeforces.com/problemset/problem/", platform: "Codeforces", split: " - " },
        { match: "codechef.com/problems/", platform: "CodeChef", split: " | " },
        { match: "hackerrank.com/challenges/", platform: "HackerRank", split: " | " },
        { match: "atcoder.jp/contests/", platform: "AtCoder", split: " - " },
        { match: "geeksforgeeks.org/problems/", platform: "GeeksforGeeks", split: " | " }
    ];

    const elements = {
        headerNote: document.getElementById("headerNote"),
        problemTitle: document.getElementById("problemTitle"),
        problemMeta: document.getElementById("problemMeta"),
        problemSubtext: document.getElementById("problemSubtext"),
        bookmarkForm: document.getElementById("bookmarkForm"),
        statusBanner: document.getElementById("status"),
        difficulty: document.getElementById("difficulty"),
        feedback: document.getElementById("feedback"),
        timeTaken: document.getElementById("timeTaken"),
        statusSelect: document.getElementById("status-select"),
        needsRevision: document.getElementById("needsRevision"),
        saveBtn: document.getElementById("saveBtn"),
        tagInput: document.getElementById("tagInput"),
        tagContainer: document.getElementById("tagContainer"),
        bookmarksList: document.getElementById("bookmarksList"),
        platformFilter: document.getElementById("platformFilter"),
        statusFilter: document.getElementById("statusFilter"),
        totalProblems: document.getElementById("totalProblems"),
        solvedCount: document.getElementById("solvedCount"),
        revisionCount: document.getElementById("revisionCount"),
        platformStats: document.getElementById("platformStats"),
        tagStats: document.getElementById("tagStats"),
        aiSection: document.getElementById("ai-section"),
        aiResult: document.getElementById("aiResult"),
        apiKey: document.getElementById("apiKey"),
        geminiModel: document.getElementById("geminiModel"),
        responseLanguage: document.getElementById("responseLanguage")
    };

    const tabButtons = [...document.querySelectorAll(".tab-btn")];
    const tabContents = [...document.querySelectorAll(".tab-content")];

    let currentTags = [];
    let currentTabInfo = null;
    let bookmarksCache = [];

    await migrateLegacyBookmarks();
    await loadSettings();
    bindTabs();
    bindTagEvents();
    bindFilters();
    bindAiButtons();
    bindActionButtons();
    await detectCurrentProblem();
    await refreshLibraryView();

    async function migrateLegacyBookmarks() {
        const data = await chrome.storage.local.get({
            [STORAGE_KEY]: null,
            [LEGACY_STORAGE_KEY]: []
        });

        if (data[STORAGE_KEY] === null && data[LEGACY_STORAGE_KEY].length) {
            await chrome.storage.local.set({ [STORAGE_KEY]: data[LEGACY_STORAGE_KEY] });
        }
    }

    async function loadSettings() {
        const data = await chrome.storage.local.get(["apiKey", "geminiModel", "responseLanguage"]);
        elements.apiKey.value = data.apiKey || "";
        elements.geminiModel.value = data.geminiModel || DEFAULT_MODEL;
        elements.responseLanguage.value = data.responseLanguage || "english";
        elements.headerNote.textContent = data.apiKey ? "Gemini connected" : "Add Gemini API key";
    }

    function bindTabs() {
        tabButtons.forEach((button) => {
            button.addEventListener("click", () => {
                tabButtons.forEach((tab) => tab.classList.remove("active"));
                tabContents.forEach((content) => content.classList.remove("active"));
                button.classList.add("active");
                document.getElementById(button.dataset.tab).classList.add("active");
            });
        });
    }

    function bindTagEvents() {
        elements.tagInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") {
                return;
            }

            event.preventDefault();
            const value = elements.tagInput.value.trim();
            if (!value || currentTags.includes(value)) {
                elements.tagInput.value = "";
                return;
            }

            currentTags.push(value);
            elements.tagInput.value = "";
            renderTags();
        });

        elements.tagContainer.addEventListener("click", (event) => {
            const tag = event.target.dataset.tag;
            if (!tag) {
                return;
            }

            currentTags = currentTags.filter((item) => item !== tag);
            renderTags();
        });
    }

    function bindFilters() {
        [elements.platformFilter, elements.statusFilter].forEach((filter) => {
            filter.addEventListener("change", () => {
                renderBookmarks();
            });
        });
    }

    function bindAiButtons() {
        const mapping = {
            getHintsBtn: "getThinkingSteps",
            getComplexityBtn: "getComplexityAnalysis",
            getApproachesBtn: "getApproaches",
            getConceptBtn: "explainConcept"
        };

        Object.entries(mapping).forEach(([id, action]) => {
            document.getElementById(id).addEventListener("click", async () => {
                await requestAiHelp(action);
            });
        });
    }

    function bindActionButtons() {
        elements.bookmarkForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            await saveCurrentProblem();
        });

        document.getElementById("saveApiBtn").addEventListener("click", async () => {
            const apiKey = elements.apiKey.value.trim();
            const geminiModel = elements.geminiModel.value;
            const responseLanguage = elements.responseLanguage.value;

            if (!apiKey) {
                showStatus("Enter a Gemini API key first.", true);
                return;
            }

            await chrome.storage.local.set({ apiKey, geminiModel, responseLanguage });
            elements.headerNote.textContent = "Gemini connected";
            showStatus("Gemini settings saved.");
        });

        document.getElementById("clearAllBtn").addEventListener("click", async () => {
            if (!confirm("This will clear saved problems and local settings. Continue?")) {
                return;
            }

            await chrome.storage.local.clear();
            currentTags = [];
            renderTags();
            await loadSettings();
            await refreshLibraryView();
            showStatus("Local extension data cleared.");
        });

        document.getElementById("exportBtn").addEventListener("click", exportExcel);
        document.getElementById("exportJsonBtn").addEventListener("click", exportJson);

        elements.bookmarksList.addEventListener("click", async (event) => {
            const deleteButton = event.target.closest("[data-delete-url]");
            if (!deleteButton) {
                return;
            }

            const targetUrl = deleteButton.dataset.deleteUrl;
            if (!confirm("Delete this saved problem?")) {
                return;
            }

            const bookmarks = await getBookmarks();
            const updated = bookmarks.filter((item) => item.url !== targetUrl);
            await setBookmarks(updated);
            await refreshLibraryView();
            showStatus("Saved problem deleted.");
        });
    }

    async function detectCurrentProblem() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const match = tab?.url
            ? SUPPORTED_SITES.find((item) => tab.url.includes(item.match))
            : null;

        if (!match || !tab) {
            currentTabInfo = null;
            elements.problemTitle.textContent = "Unsupported page";
            elements.problemMeta.innerHTML = '<span class="badge">Open LeetCode, Codeforces, CodeChef, HackerRank, AtCoder, or GeeksforGeeks</span>';
            elements.problemSubtext.textContent = "The assistant works on supported coding-problem pages only.";
            elements.bookmarkForm.hidden = true;
            elements.aiSection.hidden = true;
            return;
        }

        const titleParts = tab.title.split(match.split);
        const cleanedTitle = match.platform === "Codeforces" && titleParts.length > 1
            ? titleParts[1]
            : titleParts[0];

        currentTabInfo = {
            title: cleanedTitle.trim(),
            url: tab.url,
            platform: match.platform
        };

        elements.problemTitle.textContent = currentTabInfo.title;
        elements.problemSubtext.textContent = "Keep a clean record of your approach, then ask Gemini only for the help you need.";
        renderProblemMeta("unsolved");

        const bookmarks = await getBookmarks();
        const existing = bookmarks.find((item) => item.url === currentTabInfo.url);
        if (existing) {
            loadBookmark(existing);
        } else {
            setSaveMode("save");
        }
    }

    function renderProblemMeta(status) {
        const badges = [`<span class="badge">${currentTabInfo.platform}</span>`];
        if (status === "solved") {
            badges.push('<span class="badge solved">Solved</span>');
        } else if (status === "attempted") {
            badges.push('<span class="badge attempted">Attempted</span>');
        }
        elements.problemMeta.innerHTML = badges.join("");
    }

    function loadBookmark(bookmark) {
        elements.difficulty.value = bookmark.difficulty || "";
        elements.feedback.value = bookmark.feedback || "";
        elements.timeTaken.value = bookmark.timeTaken || "";
        elements.statusSelect.value = bookmark.status || "unsolved";
        elements.needsRevision.checked = Boolean(bookmark.needsRevision);
        currentTags = [...(bookmark.tags || [])];
        renderTags();
        renderProblemMeta(bookmark.status);
        setSaveMode("update");
    }

    function setSaveMode(mode) {
        elements.saveBtn.dataset.mode = mode;
        elements.saveBtn.textContent = mode === "update" ? "Update problem" : "Save problem";
    }

    function renderTags() {
        elements.tagContainer.innerHTML = "";
        currentTags.forEach((tag) => {
            const item = document.createElement("span");
            item.className = "tag";
            item.innerHTML = `${escapeHtml(tag)} <button type="button" data-tag="${escapeAttribute(tag)}" aria-label="Remove ${escapeAttribute(tag)}">x</button>`;
            elements.tagContainer.appendChild(item);
        });
    }

    async function saveCurrentProblem() {
        if (!currentTabInfo) {
            showStatus("Open a supported problem page first.", true);
            return;
        }

        const bookmarks = await getBookmarks();
        const mode = elements.saveBtn.dataset.mode || "save";
        const existing = bookmarks.find((item) => item.url === currentTabInfo.url);
        const createdAt = existing?.createdAt || new Date().toISOString();

        const record = {
            ...currentTabInfo,
            difficulty: elements.difficulty.value.trim(),
            feedback: elements.feedback.value.trim(),
            timeTaken: elements.timeTaken.value.trim(),
            status: elements.statusSelect.value,
            needsRevision: elements.needsRevision.checked,
            tags: currentTags,
            createdAt,
            updatedAt: new Date().toISOString()
        };

        const updatedBookmarks = mode === "update"
            ? bookmarks.map((item) => item.url === currentTabInfo.url ? record : item)
            : [...bookmarks, record];

        await setBookmarks(updatedBookmarks);
        renderProblemMeta(record.status);
        setSaveMode("update");
        await refreshLibraryView();
        showStatus(mode === "update" ? "Problem updated." : "Problem saved.");
    }

    async function refreshLibraryView() {
        bookmarksCache = await getBookmarks();
        updateStats();
        renderBookmarks();
        renderInsights();
    }

    function updateStats() {
        elements.totalProblems.textContent = String(bookmarksCache.length);
        elements.solvedCount.textContent = String(bookmarksCache.filter((item) => item.status === "solved").length);
        elements.revisionCount.textContent = String(bookmarksCache.filter((item) => item.needsRevision).length);
    }

    function renderBookmarks() {
        const platformValue = elements.platformFilter.value;
        const statusValue = elements.statusFilter.value;

        let filtered = [...bookmarksCache];
        if (platformValue !== "all") {
            filtered = filtered.filter((item) => item.platform === platformValue);
        }
        if (statusValue !== "all") {
            filtered = filtered.filter((item) => item.status === statusValue);
        }

        filtered.sort((a, b) => new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0));
        elements.bookmarksList.innerHTML = "";

        if (!filtered.length) {
            elements.bookmarksList.innerHTML = '<div class="empty-state">No saved problems match these filters yet.</div>';
            return;
        }

        filtered.forEach((bookmark) => {
            const item = document.createElement("article");
            item.className = "bookmark-item";
            item.innerHTML = `
                <div>
                    <h4><a class="bookmark-link" href="${escapeAttribute(bookmark.url)}" target="_blank" rel="noreferrer">${escapeHtml(bookmark.title)}</a></h4>
                    <p class="bookmark-meta">${escapeHtml(bookmark.platform)}${bookmark.difficulty ? ` | ${escapeHtml(bookmark.difficulty)}` : ""}${bookmark.timeTaken ? ` | ${escapeHtml(bookmark.timeTaken)} min` : ""}</p>
                    <p class="bookmark-notes">${escapeHtml(bookmark.feedback || "No notes yet.")}</p>
                </div>
                <div class="bookmark-actions">
                    <span class="badge ${bookmark.status === "solved" ? "solved" : bookmark.status === "attempted" ? "attempted" : ""}">${formatStatus(bookmark.status)}</span>
                    <button class="btn btn-danger" type="button" data-delete-url="${escapeAttribute(bookmark.url)}">Delete</button>
                </div>
            `;
            elements.bookmarksList.appendChild(item);
        });
    }

    function renderInsights() {
        elements.platformStats.innerHTML = "";
        elements.tagStats.innerHTML = "";

        if (!bookmarksCache.length) {
            elements.platformStats.innerHTML = '<div class="empty-state">Save a few problems to see your platform mix.</div>';
            return;
        }

        const platformCounts = bookmarksCache.reduce((accumulator, item) => {
            accumulator[item.platform] = (accumulator[item.platform] || 0) + 1;
            return accumulator;
        }, {});

        Object.entries(platformCounts).forEach(([platform, count]) => {
            const percent = Math.round((count / bookmarksCache.length) * 100);
            const row = document.createElement("div");
            row.className = "progress-row";
            row.innerHTML = `
                <div class="progress-label">
                    <span>${escapeHtml(platform)}</span>
                    <span>${count} - ${percent}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%"></div>
                </div>
            `;
            elements.platformStats.appendChild(row);
        });

        const tagCounts = bookmarksCache.reduce((accumulator, item) => {
            (item.tags || []).forEach((tag) => {
                accumulator[tag] = (accumulator[tag] || 0) + 1;
            });
            return accumulator;
        }, {});

        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
        if (!sortedTags.length) {
            elements.tagStats.innerHTML = '<div class="empty-state">No tags yet.</div>';
            return;
        }

        sortedTags.forEach(([tag, count]) => {
            const chip = document.createElement("span");
            chip.className = "tag";
            chip.textContent = `${tag} ${count}`;
            elements.tagStats.appendChild(chip);
        });
    }

    async function requestAiHelp(action) {
        if (!currentTabInfo) {
            showStatus("Open a supported problem page first.", true);
            return;
        }

        elements.aiResult.textContent = "Reading the problem and asking Gemini...";

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const problemData = await chrome.tabs.sendMessage(tab.id, { action: "getProblemContent" });

            if (!problemData?.content) {
                throw new Error("Could not read the problem statement from this page.");
            }

            const response = await chrome.runtime.sendMessage({
                action,
                payload: {
                    title: currentTabInfo.title,
                    platform: currentTabInfo.platform,
                    content: problemData.content,
                    examples: problemData.examples || [],
                    constraints: problemData.constraints || ""
                }
            });

            if (!response?.ok) {
                throw new Error(response?.error || "Gemini did not return a usable response.");
            }

            elements.aiResult.textContent = response.text;
        } catch (error) {
            elements.aiResult.textContent = error.message;
        }
    }

    async function exportExcel() {
        const bookmarks = await getBookmarks();
        if (!bookmarks.length) {
            showStatus("No saved problems to export.", true);
            return;
        }

        const rows = bookmarks.map((item) => [
            { v: item.title, l: { Target: item.url } },
            item.platform,
            item.status || "unsolved",
            item.difficulty || "",
            item.timeTaken || "",
            (item.tags || []).join(", "),
            item.feedback || "",
            new Date(item.updatedAt || item.createdAt || item.date).toLocaleDateString()
        ]);

        const sheet = XLSX.utils.aoa_to_sheet([[
            "Title",
            "Platform",
            "Status",
            "Difficulty",
            "Time Spent",
            "Tags",
            "Notes",
            "Last Updated"
        ]]);
        XLSX.utils.sheet_add_aoa(sheet, rows, { origin: "A2" });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Problems");
        XLSX.writeFile(workbook, "codeassist-bookmarks.xlsx");
    }

    async function exportJson() {
        const bookmarks = await getBookmarks();
        if (!bookmarks.length) {
            showStatus("No saved problems to back up.", true);
            return;
        }

        const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "codeassist-backup.json";
        anchor.click();
        URL.revokeObjectURL(url);
    }

    async function getBookmarks() {
        const data = await chrome.storage.local.get({
            [STORAGE_KEY]: [],
            [LEGACY_STORAGE_KEY]: []
        });
        return data[STORAGE_KEY].length ? data[STORAGE_KEY] : data[LEGACY_STORAGE_KEY];
    }

    async function setBookmarks(bookmarks) {
        await chrome.storage.local.set({
            [STORAGE_KEY]: bookmarks,
            [LEGACY_STORAGE_KEY]: bookmarks
        });
    }

    function showStatus(message, isError = false) {
        elements.statusBanner.hidden = false;
        elements.statusBanner.textContent = message;
        elements.statusBanner.className = `status-banner ${isError ? "error" : "success"}`;
        window.clearTimeout(showStatus.timer);
        showStatus.timer = window.setTimeout(() => {
            elements.statusBanner.hidden = true;
        }, 2800);
    }

    function formatStatus(status) {
        if (status === "solved") {
            return "Solved";
        }
        if (status === "attempted") {
            return "Attempted";
        }
        return "Not solved";
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function escapeAttribute(value) {
        return escapeHtml(value);
    }
});
