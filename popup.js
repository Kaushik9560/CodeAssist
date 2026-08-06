document.addEventListener("DOMContentLoaded", () => init().catch(fatal));

async function init() {
    const BOOKMARKS = "problemBookmarks";
    const LEGACY_BOOKMARKS = "leetCodeBookmarks";
    const DEFAULT_MODEL = "gemini-3.6-flash";
    const $ = (id) => document.getElementById(id);
    const ui = {
        headerNote: $("headerNote"), status: $("status"), problemTitle: $("problemTitle"),
        problemMeta: $("problemMeta"), problemSubtext: $("problemSubtext"),
        form: $("bookmarkForm"), saveBtn: $("saveBtn"), difficulty: $("difficulty"),
        notes: $("feedback"), time: $("timeTaken"), problemStatus: $("status-select"),
        revision: $("needsRevision"), tagInput: $("tagInput"), tags: $("tagContainer"),
        aiSection: $("ai-section"), aiOutput: $("aiOutput"), aiResult: $("aiResult"),
        aiTitle: $("aiResultTitle"), copyAi: $("copyAiBtn"), retryAi: $("retryAiBtn"),
        apiKey: $("apiKey"), model: $("geminiModel"), language: $("responseLanguage"),
        apiStatus: $("apiStatus"), testApi: $("testApiBtn"), toggleKey: $("toggleApiKeyBtn"),
        list: $("bookmarksList"), search: $("librarySearch"),
        platformFilter: $("platformFilter"), statusFilter: $("statusFilter"),
        total: $("totalProblems"), solved: $("solvedCount"), revisionCount: $("revisionCount"),
        platformStats: $("platformStats"), tagStats: $("tagStats")
    };
    const actions = {
        getHintsBtn: ["getThinkingSteps", "Hints"],
        getComplexityBtn: ["getComplexityAnalysis", "Complexity"],
        getApproachesBtn: ["getApproaches", "Approaches"],
        getConceptBtn: ["explainConcept", "Concepts"]
    };
    const sites = [
        [/leetcode\.com\/problems\//i, "LeetCode"],
        [/codeforces\.com\/(?:problemset\/problem|contest\/[^/]+\/problem)\//i, "Codeforces"],
        [/codechef\.com\/(?:problems|[^/]+\/problems)\//i, "CodeChef"],
        [/hackerrank\.com\/challenges\//i, "HackerRank"],
        [/atcoder\.jp\/contests\/[^/]+\/tasks\//i, "AtCoder"],
        [/geeksforgeeks\.org\/problems\//i, "GeeksforGeeks"]
    ];
    const state = { tags: [], bookmarks: [], tab: null, problem: null, lastAction: null, aiText: "", busy: false };

    await migrateBookmarks();
    await loadSettings();
    bindEvents();
    activateTab("tab-problem");
    await Promise.all([detectProblem(), refreshLibrary()]);

    async function migrateBookmarks() {
        const data = await chrome.storage.local.get({ [BOOKMARKS]: null, [LEGACY_BOOKMARKS]: [] });
        if (data[BOOKMARKS] === null) {
            await chrome.storage.local.set({ [BOOKMARKS]: Array.isArray(data[LEGACY_BOOKMARKS]) ? data[LEGACY_BOOKMARKS] : [] });
        }
    }

    async function loadSettings() {
        const data = await chrome.storage.local.get(["apiKey", "geminiModel", "responseLanguage"]);
        ui.apiKey.value = data.apiKey || "";
        ui.apiKey.type = "password";
        ui.toggleKey.textContent = "Show";
        ui.toggleKey.setAttribute("aria-pressed", "false");
        const model = [...ui.model.options].some((option) => option.value === data.geminiModel)
            ? data.geminiModel : DEFAULT_MODEL;
        ui.model.value = model;
        ui.language.value = data.responseLanguage || "english";
        if (data.geminiModel && data.geminiModel !== model) await chrome.storage.local.set({ geminiModel: model });
        connection(data.apiKey ? "saved" : "missing");
        apiMessage(data.apiKey ? "Key saved. Test it to verify the connection." : "Add a Gemini API key to enable help.");
    }

    function bindEvents() {
        const tabs = [...document.querySelectorAll(".tab-btn")];
        tabs.forEach((button, index) => {
            button.addEventListener("click", () => activateTab(button.dataset.tab));
            button.addEventListener("keydown", (event) => {
                if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                const next = tabs[(index + step + tabs.length) % tabs.length];
                activateTab(next.dataset.tab);
                next.focus();
            });
        });

        ui.form.addEventListener("submit", saveProblem);
        ui.tagInput.addEventListener("keydown", (event) => {
            if (!["Enter", ","].includes(event.key)) return;
            event.preventDefault();
            addTag(ui.tagInput.value);
        });
        ui.tags.addEventListener("click", (event) => {
            const button = event.target.closest("[data-tag]");
            if (!button) return;
            state.tags = state.tags.filter((tag) => tag !== decodeURIComponent(button.dataset.tag));
            renderTags();
        });

        Object.entries(actions).forEach(([id, [action, label]]) => {
            $(id).addEventListener("click", () => askGemini(action, label));
        });
        ui.copyAi.addEventListener("click", copyAnswer);
        ui.retryAi.addEventListener("click", () => state.lastAction && askGemini(...state.lastAction));

        $("saveApiBtn").addEventListener("click", saveSettings);
        ui.testApi.addEventListener("click", testConnection);
        ui.toggleKey.addEventListener("click", toggleKey);
        [ui.apiKey, ui.model, ui.language].forEach((control) => control.addEventListener("change", () => {
            connection(ui.apiKey.value.trim() ? "saved" : "missing");
            apiMessage("Settings changed. Save or test the connection.");
        }));

        [ui.platformFilter, ui.statusFilter].forEach((filter) => filter.addEventListener("change", renderBookmarks));
        ui.search.addEventListener("input", renderBookmarks);
        ui.list.addEventListener("click", deleteProblem);
        $("exportBtn").addEventListener("click", exportExcel);
        $("exportJsonBtn").addEventListener("click", exportJson);
        $("clearAllBtn").addEventListener("click", clearData);
    }

    function activateTab(id) {
        document.querySelectorAll(".tab-btn").forEach((button) => {
            const active = button.dataset.tab === id;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });
        document.querySelectorAll(".tab-content").forEach((panel) => {
            const active = panel.id === id;
            panel.classList.toggle("active", active);
            panel.hidden = !active;
        });
        window.scrollTo(0, 0);
    }

    async function saveSettings() {
        const apiKey = ui.apiKey.value.trim();
        if (!apiKey) return apiMessage("Enter an API key first.", "error");
        await chrome.storage.local.set({ apiKey, geminiModel: ui.model.value, responseLanguage: ui.language.value });
        connection("saved");
        apiMessage("Settings saved. Test the connection when the key changes.", "success");
        toast("Gemini settings saved.");
    }

    async function testConnection() {
        const apiKey = ui.apiKey.value.trim();
        if (!apiKey) return apiMessage("Enter an API key first.", "error");
        const label = ui.testApi.textContent;
        ui.testApi.disabled = true;
        ui.testApi.textContent = "Testing…";
        apiMessage("Checking the key and model…", "loading");
        try {
            const result = await chrome.runtime.sendMessage({
                action: "testGeminiConnection",
                payload: { apiKey, model: ui.model.value }
            });
            if (!result?.ok) throw new Error(result?.error || "Connection failed.");
            connection("connected");
            apiMessage(`Connected to ${modelName(result.model || ui.model.value)}. Save settings to use it.`, "success");
        } catch (error) {
            connection("error");
            apiMessage(errorText(error), "error");
        } finally {
            ui.testApi.disabled = false;
            ui.testApi.textContent = label;
        }
    }

    function toggleKey() {
        const visible = ui.apiKey.type === "password";
        ui.apiKey.type = visible ? "text" : "password";
        ui.toggleKey.textContent = visible ? "Hide" : "Show";
        ui.toggleKey.setAttribute("aria-pressed", String(visible));
    }

    function connection(status) {
        ui.headerNote.dataset.state = status;
        ui.headerNote.className = `connection-state ${status === "connected" ? "is-connected" : status === "error" ? "is-error" : ""}`.trim();
        ui.headerNote.textContent = ({ connected: "Gemini connected", saved: "Key saved", error: "Connection issue" })[status] || "Setup required";
    }

    function apiMessage(message, type = "") {
        ui.apiStatus.className = `api-status ${type}`.trim();
        ui.apiStatus.textContent = message;
    }

    async function detectProblem() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = tab?.url && sites.find(([pattern]) => pattern.test(tab.url));
        if (!site) {
            state.tab = null;
            ui.problemTitle.textContent = "Open a coding problem";
            ui.problemSubtext.textContent = "Supported: LeetCode, Codeforces, CodeChef, HackerRank, AtCoder, and GeeksforGeeks.";
            ui.problemMeta.innerHTML = '<span class="badge">No problem detected</span>';
            ui.form.hidden = true;
            ui.aiSection.hidden = true;
            return;
        }

        state.tab = {
            id: tab.id,
            url: normalizeUrl(tab.url),
            platform: site[1],
            title: cleanTitle(tab.title, site[1], tab.url)
        };
        ui.form.hidden = false;
        ui.aiSection.hidden = false;
        ui.problemTitle.textContent = state.tab.title;
        ui.problemSubtext.textContent = "Ask for a nudge, then save the insight you want to remember.";
        problemBadges("unsolved");
        aiState("idle");

        try {
            state.problem = await readProblem(tab.id);
            if (state.problem?.title) {
                state.tab.title = state.problem.title;
                ui.problemTitle.textContent = state.tab.title;
            }
        } catch (error) {
            console.info("Problem text will be retried on request:", error);
        }

        const saved = (await getBookmarks()).find((item) => normalizeUrl(item.url) === state.tab.url);
        saved ? loadProblem(saved) : resetForm();
    }

    async function readProblem(tabId) {
        try {
            return await chrome.tabs.sendMessage(tabId, { action: "getProblemContent" });
        } catch {
            try {
                await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
                return await chrome.tabs.sendMessage(tabId, { action: "getProblemContent" });
            } catch {
                throw new Error("Could not read this page. Refresh the problem page and retry.");
            }
        }
    }

    function problemBadges(status) {
        ui.problemMeta.innerHTML = `<span class="badge">${escapeHtml(state.tab.platform)}</span><span class="badge ${status}">${statusLabel(status)}</span>`;
    }

    function loadProblem(item) {
        const status = ["unsolved", "attempted", "solved"].includes(item.status) ? item.status : "unsolved";
        setDifficulty(item.difficulty);
        ui.notes.value = item.feedback || "";
        ui.time.value = item.timeTaken || "";
        ui.problemStatus.value = status;
        ui.revision.checked = Boolean(item.needsRevision);
        state.tags = [...new Set(item.tags || [])];
        renderTags();
        problemBadges(status);
        saveMode("update");
    }

    function resetForm() {
        ui.form.reset();
        ui.difficulty.querySelector("[data-legacy]")?.remove();
        ui.problemStatus.value = "unsolved";
        state.tags = [];
        renderTags();
        if (state.tab) problemBadges("unsolved");
        saveMode("save");
    }

    function setDifficulty(value) {
        ui.difficulty.querySelector("[data-legacy]")?.remove();
        const match = [...ui.difficulty.options].find((option) => option.value.toLowerCase() === String(value || "").toLowerCase());
        if (match || !value) return void (ui.difficulty.value = match?.value || "");
        const option = new Option(value, value);
        option.dataset.legacy = "true";
        ui.difficulty.add(option);
        ui.difficulty.value = value;
    }

    function saveMode(mode) {
        ui.saveBtn.dataset.mode = mode;
        ui.saveBtn.textContent = mode === "update" ? "Update problem" : "Save problem";
    }

    function addTag(raw) {
        const tag = String(raw || "").replace(/,$/, "").trim();
        ui.tagInput.value = "";
        if (!tag || state.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
        state.tags.push(tag);
        renderTags();
    }

    function renderTags() {
        ui.tags.innerHTML = state.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}<button type="button" data-tag="${encodeURIComponent(tag)}" aria-label="Remove ${escapeHtml(tag)}">×</button></span>`).join("");
    }

    async function saveProblem(event) {
        event.preventDefault();
        if (!state.tab) return toast("Open a supported problem first.", true);
        addTag(ui.tagInput.value);
        const minutes = ui.time.value.trim();
        if (minutes && !/^\d+$/.test(minutes)) return toast("Enter time as minutes.", true);
        const items = await getBookmarks();
        const old = items.find((item) => normalizeUrl(item.url) === state.tab.url);
        const item = {
            title: state.tab.title, url: state.tab.url, platform: state.tab.platform,
            status: ui.problemStatus.value, difficulty: ui.difficulty.value,
            timeTaken: minutes, needsRevision: ui.revision.checked,
            tags: [...state.tags], feedback: ui.notes.value.trim(),
            createdAt: old?.createdAt || old?.date || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await setBookmarks(old
            ? items.map((saved) => normalizeUrl(saved.url) === state.tab.url ? item : saved)
            : [...items, item]);
        problemBadges(item.status);
        saveMode("update");
        await refreshLibrary();
        toast(old ? "Problem updated." : "Problem saved.");
    }

    async function refreshLibrary() {
        state.bookmarks = await getBookmarks();
        ui.total.textContent = state.bookmarks.length;
        ui.solved.textContent = state.bookmarks.filter((item) => item.status === "solved").length;
        ui.revisionCount.textContent = state.bookmarks.filter((item) => item.needsRevision).length;
        renderBookmarks();
        renderInsights();
    }

    function renderBookmarks() {
        const query = ui.search.value.trim().toLowerCase();
        const items = state.bookmarks
            .filter((item) => ui.platformFilter.value === "all" || item.platform === ui.platformFilter.value)
            .filter((item) => ui.statusFilter.value === "all" || (item.status || "unsolved") === ui.statusFilter.value)
            .filter((item) => !query || [item.title, item.feedback, item.difficulty, ...(item.tags || [])]
                .some((value) => String(value || "").toLowerCase().includes(query)))
            .sort((a, b) => new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0));

        if (!items.length) {
            ui.list.innerHTML = `<div class="empty-state"><strong>${state.bookmarks.length ? "No matches" : "Your library is empty"}</strong><span>${state.bookmarks.length ? "Try another search or filter." : "Save a problem to start your revision queue."}</span></div>`;
            return;
        }

        ui.list.innerHTML = items.map((item) => {
            const status = ["solved", "attempted"].includes(item.status) ? item.status : "unsolved";
            const meta = [item.difficulty, item.timeTaken && `${item.timeTaken} min`].filter(Boolean).join(" · ");
            const tags = (item.tags || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
            return `<article class="bookmark-item">
                <div class="bookmark-content">
                    <div class="bookmark-topline"><span class="badge">${escapeHtml(item.platform || "Unknown")}</span><span class="badge ${status}">${statusLabel(status)}</span>${item.needsRevision ? '<span class="badge revision">Revision</span>' : ""}</div>
                    <h4><a class="bookmark-link" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Untitled problem")}</a></h4>
                    ${meta ? `<p class="bookmark-meta">${escapeHtml(meta)}</p>` : ""}
                    ${item.feedback ? `<p class="bookmark-notes">${escapeHtml(item.feedback)}</p>` : ""}
                    ${tags ? `<div class="bookmark-tags">${tags}</div>` : ""}
                </div>
                <button class="bookmark-delete" type="button" data-delete="${encodeURIComponent(normalizeUrl(item.url))}" aria-label="Delete ${escapeHtml(item.title || "problem")}">×</button>
            </article>`;
        }).join("");
    }

    async function deleteProblem(event) {
        const button = event.target.closest("[data-delete]");
        if (!button || !confirm("Delete this saved problem?")) return;
        const url = decodeURIComponent(button.dataset.delete);
        await setBookmarks((await getBookmarks()).filter((item) => normalizeUrl(item.url) !== url));
        if (state.tab?.url === url) resetForm();
        await refreshLibrary();
        toast("Saved problem deleted.");
    }

    function renderInsights() {
        if (!state.bookmarks.length) {
            ui.platformStats.innerHTML = '<div class="empty-state compact-empty">Practice patterns will appear here.</div>';
            ui.tagStats.innerHTML = "";
            return;
        }
        const platforms = countBy(state.bookmarks.map((item) => item.platform || "Unknown"));
        ui.platformStats.innerHTML = Object.entries(platforms).sort((a, b) => b[1] - a[1]).map(([name, count]) => {
            const percent = Math.round(count / state.bookmarks.length * 100);
            return `<div class="progress-row"><div class="progress-label"><span>${escapeHtml(name)}</span><span>${count} · ${percent}%</span></div><div class="progress-bar"><span style="width:${percent}%"></span></div></div>`;
        }).join("");
        const tags = countBy(state.bookmarks.flatMap((item) => item.tags || []));
        ui.tagStats.innerHTML = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 12)
            .map(([tag, count]) => `<span class="tag">${escapeHtml(tag)} ${count}</span>`).join("");
    }

    async function askGemini(action, label) {
        if (state.busy || !state.tab) return;
        const { apiKey } = await chrome.storage.local.get("apiKey");
        if (!apiKey?.trim()) {
            aiState("error", "Gemini setup required", "Add an API key in Settings first.");
            activateTab("tab-settings");
            return ui.apiKey.focus();
        }
        state.busy = true;
        state.lastAction = [action, label];
        setAiButtons(true);
        aiState("loading", `Preparing ${label}`);
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id || normalizeUrl(tab.url) !== state.tab.url) throw new Error("The active tab changed. Reopen CodeAssist on the problem.");
            state.problem = await readProblem(tab.id);
            if (!state.problem?.content) throw new Error("The problem statement is not ready. Wait a moment and retry.");
            if (state.problem.title) {
                state.tab.title = state.problem.title;
                ui.problemTitle.textContent = state.tab.title;
            }
            const result = await chrome.runtime.sendMessage({
                action,
                payload: {
                    title: state.tab.title, platform: state.tab.platform, content: state.problem.content,
                    examples: state.problem.examples || [], constraints: state.problem.constraints || ""
                }
            });
            if (!result?.ok) throw new Error(result?.error || "Gemini returned no response.");
            state.aiText = normalizeMath(result.text);
            connection("connected");
            aiState("success", label, state.aiText);
        } catch (error) {
            aiState("error", "Could not get a response", errorText(error));
        } finally {
            state.busy = false;
            setAiButtons(false);
        }
    }

    function aiState(type, title = "Ready when you are", message = "") {
        ui.aiResult.dataset.state = type;
        ui.aiOutput.setAttribute("aria-busy", String(type === "loading"));
        ui.copyAi.hidden = type !== "success";
        ui.retryAi.hidden = type !== "error" || !state.lastAction;
        ui.aiTitle.textContent = title;
        if (type === "success") return void (ui.aiResult.innerHTML = renderAnswer(message));
        if (type === "loading") return void (ui.aiResult.innerHTML = '<div class="ai-message"><span class="spinner"></span><div><strong>Reading the problem</strong><p>Preparing focused guidance…</p></div></div>');
        if (type === "error") return void (ui.aiResult.innerHTML = `<div class="ai-message ai-error"><b>!</b><div><strong>Request failed</strong><p>${escapeHtml(message)}</p></div></div>`);
        state.aiText = "";
        ui.aiTitle.textContent = "Ready when you are";
        ui.aiResult.innerHTML = '<div class="ai-message"><b>✦</b><div><strong>Choose the help you need</strong><p>Concise guidance without a full solution dump.</p></div></div>';
    }

    function renderAnswer(text) {
        const lines = text.replace(/\r/g, "").split("\n");
        let html = "", list = "", code = false;
        const closeList = () => { if (list) { html += `</${list}>`; list = ""; } };
        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith("```")) { closeList(); html += code ? "</code></pre>" : "<pre><code>"; code = !code; continue; }
            if (code) { html += `${escapeHtml(raw)}\n`; continue; }
            if (!line) { closeList(); continue; }
            const heading = line.match(/^#{1,4}\s+(.+)$/) || line.match(/^\*\*([^*]+)\*\*:?$/);
            if (heading || (line.endsWith(":") && line.length < 65)) {
                closeList(); html += `<h4>${inline(heading?.[1] || line.slice(0, -1))}</h4>`; continue;
            }
            const bullet = line.match(/^[-*•]\s+(.+)$/), number = line.match(/^\d+[.)]\s+(.+)$/);
            if (bullet || number) {
                const type = bullet ? "ul" : "ol";
                if (list !== type) { closeList(); list = type; html += `<${type}>`; }
                html += `<li>${inline(bullet?.[1] || number[1])}</li>`; continue;
            }
            closeList(); html += `<p>${inline(line)}</p>`;
        }
        closeList();
        if (code) html += "</code></pre>";
        return html;
    }

    function inline(value) {
        return escapeHtml(value)
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/`([^`]+)`/g, "<code>$1</code>");
    }

    function setAiButtons(disabled) {
        Object.keys(actions).forEach((id) => { $(id).disabled = disabled; });
    }

    async function copyAnswer() {
        try {
            await navigator.clipboard.writeText(state.aiText);
            toast("Gemini response copied.");
        } catch { toast("Could not copy the response.", true); }
    }

    async function exportExcel() {
        if (!state.bookmarks.length) return toast("No saved problems to export.", true);
        const button = $("exportBtn"), label = button.textContent;
        button.disabled = true;
        button.textContent = "Preparing…";
        try {
            await loadXlsx();
            const rows = state.bookmarks.map((item) => [
                { v: item.title, l: { Target: item.url } }, item.platform, item.status || "unsolved",
                item.difficulty || "", item.timeTaken || "", (item.tags || []).join(", "),
                item.feedback || "", new Date(item.updatedAt || item.createdAt || item.date).toLocaleDateString()
            ]);
            const sheet = XLSX.utils.aoa_to_sheet([["Title", "Platform", "Status", "Difficulty", "Time", "Tags", "Notes", "Updated"], ...rows]);
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, sheet, "Problems");
            XLSX.writeFile(book, "codeassist-bookmarks.xlsx");
        } catch { toast("Excel export failed. Try JSON instead.", true); }
        finally { button.disabled = false; button.textContent = label; }
    }

    function loadXlsx() {
        if (globalThis.XLSX) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = chrome.runtime.getURL("xlsx.full.min.js");
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function exportJson() {
        if (!state.bookmarks.length) return toast("No saved problems to back up.", true);
        const url = URL.createObjectURL(new Blob([JSON.stringify(state.bookmarks, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "codeassist-backup.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function clearData() {
        if (!confirm("Clear saved problems, notes, and Gemini settings?")) return;
        await chrome.storage.local.clear();
        await migrateBookmarks();
        resetForm();
        aiState("idle");
        await loadSettings();
        await refreshLibrary();
        toast("All local CodeAssist data was cleared.");
    }

    async function getBookmarks() {
        const data = await chrome.storage.local.get({ [BOOKMARKS]: [] });
        return Array.isArray(data[BOOKMARKS]) ? data[BOOKMARKS] : [];
    }
    function setBookmarks(items) {
        return chrome.storage.local.set({ [BOOKMARKS]: items });
    }

    function toast(message, error = false) {
        ui.status.hidden = false;
        ui.status.className = `status-banner ${error ? "error" : "success"}`;
        ui.status.textContent = message;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { ui.status.hidden = true; }, 3200);
    }

    function normalizeUrl(raw) {
        try {
            const url = new URL(raw);
            url.hash = "";
            url.search = "";
            const leetcode = url.hostname.endsWith("leetcode.com") && url.pathname.match(/^(\/problems\/[^/]+\/)/);
            if (leetcode) url.pathname = leetcode[1];
            return url.toString();
        } catch { return String(raw || ""); }
    }

    function safeUrl(raw) {
        try { const url = new URL(raw); return url.protocol === "https:" ? escapeHtml(url.toString()) : "#"; }
        catch { return "#"; }
    }

    function cleanTitle(title, platform, url) {
        const clean = String(title || "").replace(/\s+[|–—-]\s+(LeetCode|Codeforces|CodeChef|HackerRank|AtCoder|GeeksforGeeks).*$/i, "").trim();
        if (clean && clean.toLowerCase() !== platform.toLowerCase()) return clean;
        try { return new URL(url).pathname.split("/").filter(Boolean).pop().replace(/[-_]/g, " "); }
        catch { return "Coding problem"; }
    }

    function errorText(error) {
        const message = String(error?.message || error || "Unexpected error.");
        if (/receiving end|establish connection/i.test(message)) return "Refresh the problem page and retry.";
        if (/failed to fetch|networkerror/i.test(message)) return "Could not reach Gemini. Check your connection.";
        return message;
    }

    function countBy(values) {
        return values.reduce((counts, value) => {
            counts[value] = (counts[value] || 0) + 1;
            return counts;
        }, {});
    }
    function statusLabel(status) {
        return status === "solved" ? "Solved" : status === "attempted" ? "Attempted" : "Not solved";
    }
    function modelName(model) {
        return String(model).replace(/^models\//, "").split("-")
            .map((part) => ({ gemini: "Gemini", flash: "Flash", lite: "Lite", latest: "Latest" })[part] || part).join(" ");
    }
    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }
}

function fatal(error) {
    console.error("CodeAssist failed to initialize:", error);
    const status = document.getElementById("status");
    if (status) {
        status.hidden = false;
        status.className = "status-banner error";
        status.textContent = "CodeAssist could not start. Reload the extension.";
    }
}

function normalizeMath(value) {
    let text = String(value || "")
        .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
        .replace(/\$([^$\n]+)\$/g, "$1")
        .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
        .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)")
        .replace(/\\text\s*\{([^{}]*)\}/g, "$1");
    const symbols = {
        "\\geq": "≥", "\\ge": "≥", "\\leq": "≤", "\\le": "≤", "\\neq": "≠",
        "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\infty": "∞",
        "\\in": "∈", "\\notin": "∉", "\\mid": "∣", "\\sum": "Σ", "\\prod": "Π",
        "\\rightarrow": "→", "\\Rightarrow": "⇒", "\\log": "log", "\\min": "min", "\\max": "max"
    };
    for (const [latex, symbol] of Object.entries(symbols)) text = text.replaceAll(latex, symbol);
    return text
        .replace(/\\(?:left|right)/g, "")
        .replace(/\\[()[\]]/g, "")
        .replace(/\\[,;:!]/g, " ")
        .replace(/\\_/g, "_")
        .replace(/\\([A-Za-z]+)/g, "$1")
        .replace(/\{([^{}\n]+)\}/g, "$1")
        .replace(/\$/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}
