const SUPPORTED_PROBLEM_HOSTS = new Set([
  "leetcode.com",
  "www.leetcode.com",
  "codeforces.com"
]);

export function isSafeHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafeProblemUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SUPPORTED_PROBLEM_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeBackendUrl(value) {
  const fallback = "http://localhost:8787";
  try {
    const url = new URL(String(value || fallback));
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (!localHttp) return fallback;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export function normalizeText(value, maximumLength = 20_000) {
  return String(value ?? "").trim().slice(0, maximumLength);
}
