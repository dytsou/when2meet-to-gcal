// SPDX-License-Identifier: GPL-3.0-or-later
// This isolated-world content script is the only extension component that uses chrome.storage.
(function () {
  "use strict";

  const VERSION = 1;
  const REQUEST_EVENT = "w2m2gcal:storage-request";
  const RESPONSE_EVENT = "w2m2gcal:storage-response";
  // <preference-schema>
  const INVALID = Symbol("invalid preference");
  const defaults = Object.freeze({
    "w2m2gcal.durationMinutes": 60,
    "w2m2gcal.panelPos": null,
    "w2m2gcal.panelMinimized": false,
    "w2m2gcal.panelMinPos": null,
    "w2m2gcal.include30Starts": true,
    "w2m2gcal.include15_45Starts": true,
  });
  const isPosition = (value, secondKey) =>
    value &&
    typeof value === "object" &&
    Object.keys(value).length === 2 &&
    Number.isFinite(value.left) &&
    value.left >= 0 &&
    value.left <= 100000 &&
    Number.isFinite(value[secondKey]) &&
    value[secondKey] >= 0 &&
    value[secondKey] <= 100000;

  function normalize(key, value) {
    switch (key) {
      case "w2m2gcal.durationMinutes":
        return Number.isFinite(value) && value > 0 && value <= 10080 ? value : INVALID;
      case "w2m2gcal.panelPos":
        return value === null || isPosition(value, "top") ? (value === null ? null : { left: value.left, top: value.top }) : INVALID;
      case "w2m2gcal.panelMinimized":
      case "w2m2gcal.include30Starts":
      case "w2m2gcal.include15_45Starts":
        return typeof value === "boolean" ? value : INVALID;
      case "w2m2gcal.panelMinPos":
        return value === null || isPosition(value, "bottom")
          ? value === null
            ? null
            : { left: value.left, bottom: value.bottom }
          : INVALID;
      default:
        return INVALID;
    }
  }

  function clone(value) {
    return value && typeof value === "object" ? { ...value } : value;
  }
  // </preference-schema>

  function requestIsValid(detail) {
    return (
      detail &&
      typeof detail === "object" &&
      detail.version === VERSION &&
      typeof detail.requestId === "string" &&
      /^w2m2gcal-[A-Za-z0-9-]{8,160}$/.test(detail.requestId) &&
      (detail.operation === "read" || detail.operation === "write") &&
      typeof detail.key === "string" &&
      Object.prototype.hasOwnProperty.call(defaults, detail.key)
    );
  }

  function respond(request, value) {
    window.dispatchEvent(
      new CustomEvent(RESPONSE_EVENT, {
        detail: {
          version: VERSION,
          requestId: request.requestId,
          operation: request.operation,
          key: request.key,
          value: clone(value),
        },
      }),
    );
  }

  window.addEventListener(REQUEST_EVENT, async (event) => {
    const request = event?.detail;
    if (!requestIsValid(request) || typeof chrome === "undefined" || !chrome.storage?.local) return;

    if (request.operation === "write") {
      const value = normalize(request.key, request.value);
      if (value === INVALID) return;
      try {
        await chrome.storage.local.set({ [request.key]: clone(value) });
        respond(request, value);
      } catch {
        // MAIN-world code falls back to its in-memory preference after the bounded retry window.
      }
      return;
    }

    try {
      const stored = await chrome.storage.local.get(request.key);
      const value = normalize(request.key, stored?.[request.key]);
      respond(request, value === INVALID ? defaults[request.key] : value);
    } catch {
      respond(request, defaults[request.key]);
    }
  });
})();
