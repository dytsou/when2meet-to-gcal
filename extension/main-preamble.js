// SPDX-License-Identifier: GPL-3.0-or-later
// This file runs in the page's MAIN world. It intentionally has no Chrome API access.
(function () {
  "use strict";

  const messages = Object.freeze({
    "zh-TW": Object.freeze({
      "aria.panel": "when2meet → Google 日曆",
      "aria.expand": "展開 when2meet → Google 日曆",
      "title.openPanel": "開啟面板（可拖曳移動）",
      "title.drag": "拖曳移動",
      "aria.minimize": "最小化面板",
      "title.minimize": "最小化",
      "aria.meetingDuration": "會議時長",
      "label.custom": "自訂",
      "label.durationMinutes": "{minutes} 分鐘",
      "label.effectiveDurationPrefix": "實際時長：",
      "label.snappedGrid": "（已對齊 {step} 分鐘網格）",
      "label.include30": "包含 :30 開始時間",
      "label.include1545": "包含 :15 / :45 開始時間",
      "status.noWindow": "沒有任何時段能讓所有人完整參加 {minutes} 分鐘。",
      "status.tied": "最高分同為 {score} 人，請選擇一個時段：",
      "status.scoreFree": "{label} · {score} 人可參加",
      "status.best": "最佳時段：{label} · {score} 人可參加",
      "status.previewLabel": "預覽：",
      "status.timezoneBlocked": "無法判斷格線顯示時區，已停用開啟 Google 日曆。",
      "status.selectTied": "請從清單或格線時間選擇同分時段，才能開啟 Google 日曆。",
      "button.openCalendar": "開啟 Google 日曆",
      "notice.popupBlocked": "彈出視窗遭到封鎖，請允許此網站的彈出視窗後再試一次。",
      "error.missingPageGlobals": "找不到頁面資料",
      "error.expectedGlobals": "頁面缺少必要的時段資料",
      "error.peopleNamesIdsMismatch": "參與者名稱與 ID 數量不一致",
      "error.availableTimesMismatch": "可用時段與時間欄位數量不一致",
      "error.noTimeSlots": "頁面上沒有可用的時間欄位",
      "error.invalidTimestamps": "時間欄位包含無效的時間戳記",
      "error.noSlotsToVerify": "沒有可用時段可與行事曆格線比對",
      "error.gridStructureChanged": "無法將時間欄位對應到 GroupTime 格線，頁面結構可能已變更",
    }),
  });

  const browserLocales = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) browserLocales.push(...navigator.languages);
    if (navigator.language) browserLocales.push(navigator.language);
  }
  const isTraditionalChinese = browserLocales.some((value) => {
    const locale = String(value).toLowerCase().replace(/_/g, "-");
    return locale === "zh-tw" || locale === "zh-hk" || locale === "zh-mo" || locale === "zh-hant" || locale.startsWith("zh-hant-");
  });
  const locale = isTraditionalChinese ? "zh-TW" : "en";
  const formatMessage = (template, values) =>
    String(template).replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
    );

  globalThis.__w2m2gcalExtension = true;
  globalThis.__w2m2gcalLocale = locale;
  globalThis.__w2m2gcalI18n = (key, fallback, values = {}) =>
    formatMessage(messages[locale]?.[key] ?? fallback, values);

  const VERSION = 1;
  const REQUEST_EVENT = "w2m2gcal:storage-request";
  const RESPONSE_EVENT = "w2m2gcal:storage-response";
  const REQUEST_TIMEOUT_MS = 150;
  const REQUEST_ATTEMPTS = 2;
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

  function samePreference(key, left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (key === "w2m2gcal.panelPos") return left.left === right.left && left.top === right.top;
    if (key === "w2m2gcal.panelMinPos") return left.left === right.left && left.bottom === right.bottom;
    return false;
  }

  let requestCounter = 0;
  const pending = new Map();
  const cache = new Map(Object.entries(defaults).map(([key, value]) => [key, clone(value)]));
  const persisted = new Map();

  function nextRequestId() {
    requestCounter += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${requestCounter}`;
    return `w2m2gcal-${random}`;
  }

  function send(operation, key, value) {
    return new Promise((resolve, reject) => {
      const requestId = nextRequestId();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Preference bridge did not respond"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { operation, key, resolve, timer });
      const detail = { version: VERSION, requestId, operation, key };
      if (operation === "write") detail.value = clone(value);
      window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail }));
    });
  }

  window.addEventListener(RESPONSE_EVENT, (event) => {
    const detail = event?.detail;
    if (
      !detail ||
      typeof detail !== "object" ||
      detail.version !== VERSION ||
      typeof detail.requestId !== "string" ||
      typeof detail.operation !== "string" ||
      typeof detail.key !== "string"
    ) {
      return;
    }
    const request = pending.get(detail.requestId);
    if (!request || request.operation !== detail.operation || request.key !== detail.key) return;
    const value = normalize(detail.key, detail.value);
    if (value === INVALID) return;
    clearTimeout(request.timer);
    pending.delete(detail.requestId);
    request.resolve(clone(value));
  });

  async function readPreference(key) {
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
      try {
        return { value: await send("read", key), persisted: true };
      } catch {
        // The bridge may register after this MAIN-world script. Retry once, then use defaults.
      }
    }
    return { value: clone(defaults[key]), persisted: false };
  }

  async function writePreference(key, value) {
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
      try {
        await send("write", key, value);
        return true;
      } catch {
        // A page navigation can end a write; a best-effort retry keeps the panel responsive.
      }
    }
    return false;
  }

  globalThis.GM_getValue = (key, fallback) => (cache.has(key) ? clone(cache.get(key)) : fallback);
  globalThis.GM_setValue = (key, value) => {
    const normalized = normalize(key, value);
    if (normalized === INVALID) return;
    if (samePreference(key, cache.get(key), normalized) && samePreference(key, persisted.get(key), normalized)) {
      return;
    }
    cache.set(key, clone(normalized));
    void writePreference(key, normalized).then((wasPersisted) => {
      if (wasPersisted && samePreference(key, cache.get(key), normalized)) {
        persisted.set(key, clone(normalized));
      }
    });
  };

  globalThis.__w2m2gcalStorageReady = Promise.all(
    Object.keys(defaults).map(async (key) => [key, await readPreference(key)]),
  ).then((values) => {
    for (const [key, result] of values) {
      cache.set(key, clone(result.value));
      if (result.persisted) persisted.set(key, clone(result.value));
    }
  });
})();
