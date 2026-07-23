import { isSafeProblemUrl } from "./validation.js";

export function clearElement(element) {
  element.replaceChildren();
}

export function createElement(tagName, options = {}, documentRef = document) {
  const element = documentRef.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.type) element.type = options.type;
  if (options.title) element.title = options.title;
  if (options.disabled !== undefined) element.disabled = Boolean(options.disabled);
  return element;
}

export function createSafeProblemLink(label, url, documentRef = document) {
  if (!isSafeProblemUrl(url)) {
    return createElement("span", { text: label }, documentRef);
  }
  const anchor = createElement("a", { text: label }, documentRef);
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

export function setStatus(element, message = "", tone = "neutral") {
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = !message;
}

export function appendLabeledValue(parent, label, value, documentRef = document) {
  const row = createElement("div", { className: "detail-row" }, documentRef);
  row.append(
    createElement("span", { className: "detail-label", text: label }, documentRef),
    createElement("span", { className: "detail-value", text: value || "Not available" }, documentRef)
  );
  parent.append(row);
  return row;
}
