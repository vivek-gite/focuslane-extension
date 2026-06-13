const extensionApi =
  globalThis.browser?.runtime?.id ? globalThis.browser :
  globalThis.chrome?.runtime?.id ? globalThis.chrome :
  null;

const MODE_PRESETS = {
  minimal: {
    shortsBlocked: true,
    commentsHidden: true,
    hideHomeFeed: false,
    hideWatchSidebar: false,
    hideEndScreens: false,
    hideInfoCards: false,
    hideExplore: false,
    hidePlayables: false,
    hideCommunityPosts: false,
    hideLiveChat: false,
    hideNotifications: false,
    forceAutoplayOff: false,
    endGuard: false,
    visualMode: "normal",
    intentGate: false
  },
  study: {
    shortsBlocked: true,
    commentsHidden: true,
    hideHomeFeed: false,
    hideWatchSidebar: true,
    hideEndScreens: true,
    hideInfoCards: true,
    hideExplore: false,
    hidePlayables: true,
    hideCommunityPosts: true,
    hideLiveChat: true,
    hideNotifications: true,
    forceAutoplayOff: true,
    endGuard: false,
    visualMode: "dim",
    intentGate: false
  },
  strict: {
    shortsBlocked: true,
    commentsHidden: true,
    hideHomeFeed: true,
    hideWatchSidebar: true,
    hideEndScreens: true,
    hideInfoCards: true,
    hideExplore: true,
    hidePlayables: true,
    hideCommunityPosts: true,
    hideLiveChat: true,
    hideNotifications: true,
    forceAutoplayOff: true,
    endGuard: false,
    visualMode: "title-only",
    intentGate: false
  }
};

const DEFAULT_SETTINGS = {
  settingsVersion: 2,
  focusMode: "minimal",
  shortsBlocked: true,
  commentsHidden: true,
  hideHomeFeed: false,
  hideWatchSidebar: false,
  hideEndScreens: false,
  hideInfoCards: false,
  hideExplore: false,
  hidePlayables: false,
  hideCommunityPosts: false,
  hideLiveChat: false,
  hideNotifications: false,
  forceAutoplayOff: false,
  endGuard: false,
  endGuardCloseTab: false,
  visualMode: "normal",
  dislikeCountEnabled: false,
  filterEnabled: false,
  aiFilterRule: "",
  aiAllowChannels: "",
  aiBlockChannels: "",
  aiAllowKeywords: "",
  aiBlockKeywords: "",
  aiHideConfidenceThreshold: 0.75,
  sponsorBlockEnabled: false,
  sponsorSkipMode: "auto",
  scheduleEnabled: false,
  scheduleStart: "09:00",
  scheduleEnd: "17:00",
  scheduleDays: [1, 2, 3, 4, 5],
  pomodoroEnabled: false,
  pomodoroFocusMinutes: 25,
  pomodoroBreakMinutes: 5,
  learningStackEnabled: false
};

const DEFAULT_RUNTIME_STATE = {
  unlockUntil: 0,
  intentUntil: 0,
  pomodoroPhase: "focus",
  pomodoroStartedAt: 0,
  learningSessionActive: false,
  learningSessionFindMore: false,
  learningSessionQueue: [],
  learningSessionCurrentId: "",
  aiPreferenceVersion: 0
};

const AI_FILTER_MIN_WORDS = 1;

const SHORTS_SELECTORS = [
  "ytd-reel-shelf-renderer",
  "ytm-shorts-lockup-view-model-v2",
  "ytm-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model-v2",
  "ytd-rich-shelf-renderer"
];

const VIDEO_RENDERERS = [
  "ytd-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-playlist-video-renderer",
  "ytm-video-with-context-renderer"
];

const SURFACE_SELECTORS = {
  homeFeed: [
    "ytd-browse[page-subtype='home'] ytd-rich-grid-renderer",
    "ytd-browse[page-subtype='home'] #contents.ytd-rich-grid-renderer",
    "ytd-browse[page-subtype='home'] ytd-rich-section-renderer"
  ],
  watchSidebar: [
    "ytd-watch-flexy #secondary",
    "ytd-watch-next-secondary-results-renderer",
    "ytd-watch-flexy ytd-item-section-renderer#sections"
  ],
  explore: [
    "a[href='/feed/explore']",
    "a[href='/feed/trending']",
    "a[href='/gaming']",
    "a[href='/live']"
  ],
  playables: [
    "a[href*='/playables']"
  ],
  communityPosts: [
    "ytd-backstage-post-thread-renderer",
    "ytd-post-renderer"
  ],
  liveChat: [
    "ytd-live-chat-frame",
    "ytd-watch-flexy #chat",
    "yt-live-chat-app"
  ],
  notifications: [
    "ytd-notification-topbar-button-renderer",
    "a[href='/feed/notifications']"
  ]
};

let settings = Object.assign({}, DEFAULT_SETTINGS);
let runtimeState = Object.assign({}, DEFAULT_RUNTIME_STATE);
let applyTimer = null;
let aiDebounceTimer = null;
let lastAiRuleHash = "";
let lastAiFilterSignature = "";
let lastMinuteBucket = 0;
let endGuardCloseTimer = null;
let currentVideoForEndGuard = null;
let isApplying = false;
let lastAutoplayClickAt = 0;
let lastShortsLinkScanAt = 0;
let lastAiFilterScanAt = 0;
let aiRequestInFlight = false;
let learningPanelExpanded = false;
let lastLearningButtonScanAt = 0;
let currentVideoForLearning = null;
let lastLearningProgressSaveAt = 0;
let learningToastTimer = null;
let sponsorVideo = null;
let sponsorVideoId = "";
let sponsorSegments = [];
let sponsorFetchInFlight = false;
let sponsorSegmentsLoaded = false;
let skippedSponsorSegments = new Set();
let promptedSponsorSegments = new Set();
let sponsorNoticeTimer = null;
let dislikeVideoId = "";
let dislikeCountValue = null;
let dislikeFetchInFlight = false;
let dislikeCountLoaded = false;
let dislikeCountRecorded = false;
let dislikeLocalAdjustment = 0;
let dislikeLastSelected = false;
let dislikeSelectedInitialized = false;

const hiddenReasons = new WeakMap();
const countedReasons = new WeakMap();
const managedElements = new Set();
const classifiedVideos = new Map();

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function hasUsableAiFilterRule(value) {
  return countWords(value) >= AI_FILTER_MIN_WORDS;
}

function isAiFilterActive(effective) {
  return !effective.focusRelaxed && hasUsableAiFilterRule(effective.aiFilterRule);
}

function parseList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function textIncludesAny(text, terms) {
  const normalized = String(text || "").toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function normalizeAiMetadataText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sendStats(delta) {
  extensionApi.runtime.sendMessage({ type: "INCREMENT_STATS", delta }).catch(() => {});
}

function rememberAiFilteredVideos(videos, filterRule) {
  const payload = (Array.isArray(videos) ? videos : [])
    .filter((video) => video?.id && video?.title)
    .map((video) => ({
      id: video.id,
      title: video.title,
      channel: video.channel || "",
      description: video.description || "",
      confidence: Number(video.confidence) || 0,
      reason: video.reason || ""
    }));
  if (!payload.length) return;
  extensionApi.runtime.sendMessage({
    type: "RECORD_AI_FILTERED_VIDEOS",
    videos: payload,
    filterRule
  }).catch(() => {});
}

function recordCount(statKey, count) {
  if (!count) return;
  const estimates = {
    shortsBlocked: 0.5,
    recommendationsHidden: 0.05,
    aiFiltered: 0.25
  };
  const delta = { [statKey]: count };
  if (statKey === "aiFiltered") {
    delta.videosFiltered = count;
  }
  if (estimates[statKey]) {
    delta.estimatedMinutesSaved = Number((count * estimates[statKey]).toFixed(2));
  }
  sendStats(delta);
}

function getReasonSet(el) {
  let reasons = hiddenReasons.get(el);
  if (!reasons) {
    reasons = new Set();
    hiddenReasons.set(el, reasons);
  }
  return reasons;
}

function getCountedSet(el) {
  let reasons = countedReasons.get(el);
  if (!reasons) {
    reasons = new Set();
    countedReasons.set(el, reasons);
  }
  return reasons;
}

function applyElementVisibility(el) {
  const reasons = hiddenReasons.get(el);
  if (reasons && reasons.size > 0) {
    el.style.setProperty("display", "none", "important");
    el.dataset.focuslaneHiddenReasons = Array.from(reasons).join(",");
  } else {
    el.style.removeProperty("display");
    delete el.dataset.focuslaneHiddenReasons;
  }
}

function setHidden(el, reason, hidden) {
  if (!el || !(el instanceof Element)) return false;
  const reasons = getReasonSet(el);
  const hadReason = reasons.has(reason);

  if (hidden) {
    if (hadReason) return false;
    reasons.add(reason);
    managedElements.add(el);
    applyElementVisibility(el);

    const counted = getCountedSet(el);
    if (!counted.has(reason)) {
      counted.add(reason);
      return true;
    }
    return false;
  }

  if (hadReason) {
    reasons.delete(reason);
    applyElementVisibility(el);
  }
  return false;
}

function clearReason(reason) {
  for (const el of Array.from(managedElements)) {
    if (!el.isConnected) {
      managedElements.delete(el);
      continue;
    }
    setHidden(el, reason, false);
  }
}

function hideMatches(selectors, reason, statKey) {
  let count = 0;
  selectors.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        if (setHidden(el, reason, true)) count++;
      });
    } catch (_err) {
      // A few YouTube selectors use newer CSS. Skip quietly on older engines.
    }
  });
  if (statKey && count > 0) recordCount(statKey, count);
}

function hideLinkedContainers(linkSelector, reason, closestSelector, statKey) {
  let count = 0;
  document.querySelectorAll(linkSelector).forEach((link) => {
    const target = link.closest(closestSelector) || link;
    if (setHidden(target, reason, true)) count++;
  });
  if (statKey && count > 0) recordCount(statKey, count);
}

function upsertStyle(id, css) {
  let el = document.getElementById(id);
  if (!css) {
    if (el && el.textContent) el.textContent = "";
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    (document.head || document.documentElement).appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

function mergeEffectiveSettings(rawSettings) {
  const base = Object.assign({}, DEFAULT_SETTINGS, rawSettings || {});
  if (base.focusMode === "custom") return base;
  const preset = MODE_PRESETS[base.focusMode] || MODE_PRESETS.minimal;
  return Object.assign({}, base, preset);
}

function parseTimeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Math.min(23, Number(match[1]));
  const minutes = Math.min(59, Number(match[2]));
  return hours * 60 + minutes;
}

function isScheduleActive(rawSettings) {
  if (!rawSettings.scheduleEnabled) return true;
  const days = Array.isArray(rawSettings.scheduleDays) ? rawSettings.scheduleDays : [];
  const now = new Date();
  if (!days.includes(now.getDay())) return false;

  const start = parseTimeToMinutes(rawSettings.scheduleStart);
  const end = parseTimeToMinutes(rawSettings.scheduleEnd);
  if (start === null || end === null || start === end) return true;

  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function normalizePomodoroState() {
  if (!settings.pomodoroEnabled) return false;

  const now = Date.now();
  let changed = false;
  let phase = runtimeState.pomodoroPhase === "break" ? "break" : "focus";
  let startedAt = Number(runtimeState.pomodoroStartedAt) || 0;

  if (!startedAt) {
    startedAt = now;
    changed = true;
  }

  let elapsed = now - startedAt;
  let duration = getPomodoroDurationMs(phase);

  while (elapsed >= duration && duration > 0) {
    elapsed -= duration;
    phase = phase === "focus" ? "break" : "focus";
    startedAt = now - elapsed;
    duration = getPomodoroDurationMs(phase);
    changed = true;
  }

  if (phase !== runtimeState.pomodoroPhase || startedAt !== runtimeState.pomodoroStartedAt) {
    runtimeState.pomodoroPhase = phase;
    runtimeState.pomodoroStartedAt = startedAt;
    changed = true;
  }

  if (changed) {
    extensionApi.storage.local.set({
      pomodoroPhase: runtimeState.pomodoroPhase,
      pomodoroStartedAt: runtimeState.pomodoroStartedAt
    });
  }
  return runtimeState.pomodoroPhase === "break";
}

function getPomodoroDurationMs(phase) {
  const focus = Math.max(1, Number(settings.pomodoroFocusMinutes) || 25);
  const rest = Math.max(1, Number(settings.pomodoroBreakMinutes) || 5);
  return (phase === "break" ? rest : focus) * 60 * 1000;
}

function isTemporarilyUnlocked() {
  return Number(runtimeState.unlockUntil) > Date.now();
}

function getActiveSettings() {
  const scheduled = isScheduleActive(settings);
  const breakActive = normalizePomodoroState();
  const unlocked = isTemporarilyUnlocked();
  const effective = mergeEffectiveSettings(settings);

  if (!scheduled || breakActive || unlocked) {
    return Object.assign({}, effective, MODE_PRESETS.minimal, {
      shortsBlocked: effective.shortsBlocked,
      commentsHidden: effective.commentsHidden,
      filterEnabled: false,
      endGuardCloseTab: false,
      focusRelaxed: true,
      focusRelaxedReason: unlocked ? "unlock" : breakActive ? "break" : "schedule"
    });
  }

  return effective;
}

function isShortsElement(el) {
  if (!el) return false;
  if (el.matches?.(SHORTS_SELECTORS.join(","))) return true;
  return Boolean(el.querySelector?.('a[href^="/shorts"], a[href*="/shorts/"]'));
}

function applyShorts(effective) {
  if (!effective.shortsBlocked) {
    upsertStyle("focuslane-shorts-style", "");
    clearReason("shorts");
    return;
  }

  upsertStyle("focuslane-shorts-style", `
    ytd-reel-shelf-renderer,
    ytm-shorts-lockup-view-model-v2,
    ytm-shorts-lockup-view-model,
    ytd-rich-shelf-renderer,
    a[href='/shorts'],
    a[href^='/shorts/'] {
      display: none !important;
      visibility: hidden !important;
    }
  `);

  const now = Date.now();
  if (now - lastShortsLinkScanAt < 2500) return;
  lastShortsLinkScanAt = now;

  let count = 0;
  document.querySelectorAll("a[href='/shorts'], a[href^='/shorts/']").forEach((link) => {
    const target = link.closest(
      "ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer"
    ) || link;
    if (setHidden(target, "shorts", true)) count++;
  });

  if (count > 0) recordCount("shortsBlocked", count);
}

function applyDistractionSurfaces(effective) {
  const cssParts = [];

  if (effective.hideHomeFeed) {
    cssParts.push(`
      ytd-browse[page-subtype='home'] ytd-rich-grid-renderer,
      ytd-browse[page-subtype='home'] #contents.ytd-rich-grid-renderer,
      ytd-browse[page-subtype='home'] ytd-rich-section-renderer {
        display: none !important;
      }
    `);
  }

  if (effective.hideWatchSidebar) {
    cssParts.push(`
      ytd-watch-flexy #secondary,
      ytd-watch-next-secondary-results-renderer,
      ytd-watch-flexy ytd-item-section-renderer#sections {
        display: none !important;
      }
      ytd-watch-flexy[theater] #primary,
      ytd-watch-flexy #primary {
        max-width: 1100px !important;
      }
    `);
  }

  if (effective.hideExplore) {
    cssParts.push(`
      a[href='/feed/explore'],
      a[href='/feed/trending'],
      a[href='/gaming'],
      a[href='/live'] {
        display: none !important;
      }
    `);
  }

  if (effective.hidePlayables) {
    cssParts.push(`
      a[href*='/playables'] {
        display: none !important;
      }
    `);
  }

  if (effective.hideCommunityPosts) {
    cssParts.push(`
      ytd-backstage-post-thread-renderer,
      ytd-post-renderer {
        display: none !important;
      }
    `);
  }

  if (effective.hideLiveChat) {
    cssParts.push(`
      ytd-live-chat-frame,
      ytd-watch-flexy #chat,
      yt-live-chat-app {
        display: none !important;
      }
    `);
  }

  if (effective.hideNotifications) {
    cssParts.push(`
      ytd-notification-topbar-button-renderer,
      a[href='/feed/notifications'] {
        display: none !important;
      }
    `);
  }

  upsertStyle("focuslane-surfaces-style", cssParts.join("\n"));
}

function applyComments(effective) {
  const css = effective.commentsHidden ? `
    ytd-watch-flexy #comments,
    ytd-watch-flexy ytd-comments,
    ytd-watch-flexy #comment-teaser,
    #below #comments,
    #below ytd-comments,
    ytd-comments,
    ytd-comment-thread-renderer,
    ytd-comments-header-renderer,
    ytd-comment-replies-renderer,
    ytd-comment-renderer,
    ytm-comment-section-renderer,
    ytm-comment-thread-renderer,
    ytd-engagement-panel-section-list-renderer[target-id="comment-item-section"],
    ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"],
    #comment-teaser,
    ytd-watch-metadata #comment-teaser,
    #structured-description ~ #comments {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
    }
  ` : "";
  upsertStyle("focuslane-comments-style", css);
}

function applyPlayerChrome(effective) {
  const css = `
    ${effective.hideEndScreens ? `
      .ytp-endscreen-content,
      .ytp-ce-element,
      .ytp-videowall-still,
      .html5-endscreen {
        display: none !important;
        visibility: hidden !important;
      }
    ` : ""}
    ${effective.hideInfoCards ? `
      .ytp-cards-button,
      .ytp-cards-teaser,
      .ytp-cards-teaser-box,
      .ytp-cards-dialog {
        display: none !important;
        visibility: hidden !important;
      }
    ` : ""}
  `;
  upsertStyle("focuslane-player-style", css.trim());
}

function applyVisualMode(effective) {
  const visual = effective.visualMode || "normal";
  const thumbnailSelector = [
    "ytd-rich-item-renderer ytd-thumbnail img",
    "ytd-video-renderer ytd-thumbnail img",
    "ytd-compact-video-renderer ytd-thumbnail img",
    "ytm-video-with-context-renderer ytm-thumbnail img"
  ].join(", ");

  const cssParts = [];
  if (visual === "dim") {
    cssParts.push(`
      ${thumbnailSelector} {
        opacity: 0.42 !important;
        filter: saturate(0.35) contrast(0.9) !important;
      }
      ${thumbnailSelector}:hover {
        opacity: 0.9 !important;
        filter: none !important;
      }
    `);
  } else if (visual === "blur") {
    cssParts.push(`
      ${thumbnailSelector} {
        filter: blur(10px) saturate(0.4) !important;
        opacity: 0.65 !important;
      }
      ${thumbnailSelector}:hover {
        filter: none !important;
        opacity: 1 !important;
      }
    `);
  } else if (visual === "title-only") {
    cssParts.push(`
      ytd-rich-item-renderer ytd-thumbnail,
      ytd-video-renderer ytd-thumbnail,
      ytd-compact-video-renderer ytd-thumbnail,
      ytm-video-with-context-renderer ytm-thumbnail {
        display: none !important;
      }
      ytd-rich-item-renderer #dismissible,
      ytd-video-renderer #dismissible,
      ytd-compact-video-renderer #dismissible {
        min-height: auto !important;
      }
    `);
  }

  upsertStyle("focuslane-visual-style", cssParts.join("\n"));
}

function forceAutoplayOff(effective) {
  if (!effective.forceAutoplayOff) return;
  const now = Date.now();
  if (now - lastAutoplayClickAt < 2500) return;
  const candidates = [
    ".ytp-autonav-toggle-button[aria-checked='true']",
    "button.ytp-autonav-toggle-button[aria-checked='true']",
    "button[aria-label*='Autoplay is on']",
    "button[aria-label*='autoplay is on']"
  ];
  for (const selector of candidates) {
    const button = document.querySelector(selector);
    if (button && button instanceof HTMLElement) {
      lastAutoplayClickAt = now;
      button.click();
      return;
    }
  }
}

function extractVideoId(el) {
  const links = el.querySelectorAll("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}

function extractTitle(el) {
  const selectors = [
    "#video-title",
    "a#video-title-link",
    "#video-title-link yt-formatted-string",
    "h3 a",
    "h3 yt-formatted-string",
    "[id='video-title']",
    "yt-formatted-string.ytd-rich-grid-media",
    "#title yt-formatted-string"
  ];
  for (const selector of selectors) {
    const titleEl = el.querySelector(selector);
    if (titleEl) {
      const text = (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
      if (text) return text;
    }
  }
  const ariaLabel = (el.querySelector("#dismissible") || el).getAttribute("aria-label");
  return ariaLabel ? ariaLabel.trim() : "";
}

function extractChannel(el) {
  const selectors = [
    "ytd-channel-name a",
    "#channel-name a",
    ".ytd-channel-name a",
    "yt-formatted-string#text a",
    "a.yt-core-attributed-string__link[href^='/@']",
    "a.yt-lockup-metadata-view-model-wiz__metadata-text[href^='/@']",
    "a.yt-simple-endpoint[href^='/@']",
    "a.yt-simple-endpoint[href^='/channel/']"
  ];
  for (const selector of selectors) {
    const channelEl = el.querySelector(selector);
    if (channelEl) {
      const text = (
        channelEl.textContent ||
        channelEl.getAttribute("title") ||
        channelEl.getAttribute("aria-label") ||
        ""
      ).trim();
      if (text) return text;
    }
  }
  const ariaLabel = (el.querySelector("#dismissible") || el).getAttribute("aria-label") || "";
  const byMatch = ariaLabel.match(/\sby\s(.+?)\s(?:\d|No views|Streamed|Premiered|Updated|New\b)/i);
  if (byMatch?.[1]) return byMatch[1].trim();
  return "";
}

function extractDescription(el) {
  const selectors = [
    "#description-text",
    "yt-formatted-string#description-text",
    "yt-attributed-string#description-text",
    "#metadata-snippet",
    "#metadata-snippet-container",
    "yt-formatted-string.metadata-snippet-text",
    ".metadata-snippet-text",
    ".yt-lockup-metadata-view-model-wiz__metadata"
  ];
  for (const selector of selectors) {
    const descriptionEl = el.querySelector(selector);
    if (descriptionEl) {
      const text = normalizeAiMetadataText(descriptionEl.getAttribute("title") || descriptionEl.textContent || "");
      if (text) return text;
    }
  }
  return "";
}

function getLearningQueue() {
  return Array.isArray(runtimeState.learningSessionQueue) ? runtimeState.learningSessionQueue : [];
}

function getCurrentWatchVideoId() {
  if (location.pathname !== "/watch") return "";
  return new URLSearchParams(location.search).get("v") || "";
}

function getVideoIdFromUrl(url) {
  if (!url) return "";
  if (url.pathname === "/watch") return url.searchParams.get("v") || "";
  const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  if (url.hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
  }
  return "";
}

function getYouTubePath(target) {
  try {
    const url = new URL(target, location.href);
    if (!isYouTubeNavigationUrl(url)) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_err) {
    return "";
  }
}

function navigateWithinYouTube(target) {
  const path = getYouTubePath(target);
  if (!path) {
    location.href = target;
    return;
  }

  const current = `${location.pathname}${location.search}${location.hash}`;
  if (path === current) {
    scheduleApply(120, true);
    return;
  }

  const escapedPath = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const existing = document.querySelector(`a[href="${escapedPath}"]`);
  if (existing instanceof HTMLElement) {
    existing.click();
    scheduleApply(350, true);
    return;
  }

  const link = document.createElement("a");
  link.href = path;
  link.setAttribute("href", path);
  link.className = "yt-simple-endpoint focuslane-soft-nav";
  link.tabIndex = -1;
  link.style.cssText = "position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none;";
  (document.body || document.documentElement).appendChild(link);
  link.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0
  }));
  setTimeout(() => link.remove(), 0);
  setTimeout(() => {
    const next = `${location.pathname}${location.search}${location.hash}`;
    if (next !== path) {
      history.pushState(history.state || {}, "", path);
      const event = typeof PopStateEvent === "function" ?
        new PopStateEvent("popstate", { state: history.state }) :
        new Event("popstate");
      window.dispatchEvent(event);
      scheduleApply(350, true);
    }
  }, 120);
}

function getWatchTitle() {
  const selectors = [
    "ytd-watch-metadata h1 yt-formatted-string",
    "ytd-watch-metadata h1",
    "h1.title",
    "h1"
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = (el?.textContent || "").trim();
    if (text) return text;
  }
  return document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
}

function getWatchChannel() {
  const selectors = [
    "ytd-watch-metadata ytd-channel-name a",
    "ytd-video-owner-renderer ytd-channel-name a",
    "#owner ytd-channel-name a",
    "#channel-name a"
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = (el?.textContent || "").trim();
    if (text) return text;
  }
  return "";
}

function extractThumbnail(el, id) {
  const thumbnail = el?.querySelector?.("ytd-thumbnail img, ytm-thumbnail img, img[src*='ytimg.com/vi']");
  const src = thumbnail?.getAttribute("src") || thumbnail?.getAttribute("data-thumb") || "";
  if (src && !src.startsWith("data:")) return src;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

function buildLearningItemFromCard(el) {
  const id = extractVideoId(el);
  if (!id) return null;
  return {
    id,
    title: extractTitle(el) || "Untitled video",
    url: `/watch?v=${id}`,
    channel: extractChannel(el),
    thumbnail: extractThumbnail(el, id),
    addedAt: Date.now(),
    completedAt: 0,
    progress: 0
  };
}

function buildLearningItemFromCurrentVideo() {
  const id = getCurrentWatchVideoId();
  if (!id) return null;
  return {
    id,
    title: getWatchTitle() || "Current video",
    url: `/watch?v=${id}`,
    channel: getWatchChannel(),
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    addedAt: Date.now(),
    completedAt: 0,
    progress: 0
  };
}

function isVideoQueued(id) {
  return getLearningQueue().some((item) => item.id === id);
}

function getIncompleteLearningItems() {
  return getLearningQueue().filter((item) => !item.completedAt);
}

function isLearningSessionComplete() {
  const queue = getLearningQueue();
  return queue.length > 0 && queue.every((item) => item.completedAt);
}

function persistLearningState(updates) {
  Object.assign(runtimeState, updates);
  extensionApi.storage.local.set(updates).catch(() => {});
}

function saveLearningQueue(queue, extra = {}) {
  persistLearningState(Object.assign({ learningSessionQueue: queue }, extra));
}

function addLearningVideo(item, options = {}) {
  if (!item || !item.id) return false;

  const queue = getLearningQueue().slice();
  const existingIndex = queue.findIndex((video) => video.id === item.id);
  const updates = {};

  if (existingIndex === -1) {
    queue.push(item);
    sendStats({ learningVideosAdded: 1 });
  } else {
    queue[existingIndex] = Object.assign({}, queue[existingIndex], {
      title: queue[existingIndex].title || item.title,
      channel: queue[existingIndex].channel || item.channel,
      thumbnail: queue[existingIndex].thumbnail || item.thumbnail
    });
  }

  if (!runtimeState.learningSessionCurrentId) updates.learningSessionCurrentId = item.id;
  if (options.activate) updates.learningSessionActive = true;
  if (options.current) updates.learningSessionCurrentId = item.id;
  if (options.leaveFindMore === false) updates.learningSessionFindMore = false;

  saveLearningQueue(queue, updates);
  learningPanelExpanded = true;
  renderLearningStackPanel();
  scheduleApply(120, true);
  return existingIndex === -1;
}

function startLearningSession() {
  const next = getIncompleteLearningItems()[0] || getLearningQueue()[0];
  if (!next) return;
  persistLearningState({
    learningSessionActive: true,
    learningSessionFindMore: false,
    learningSessionCurrentId: next.id
  });
  navigateToLearningVideo(next.id);
}

function resumeLearningQueue() {
  const next = getIncompleteLearningItems()[0];
  if (!next) return;
  persistLearningState({
    learningSessionActive: true,
    learningSessionFindMore: false,
    learningSessionCurrentId: next.id
  });
  navigateToLearningVideo(next.id);
}

function navigateToLearningVideo(id) {
  const item = getLearningQueue().find((video) => video.id === id);
  if (!item) return;
  navigateWithinYouTube(item.url || `/watch?v=${id}`);
}

function moveLearningVideo(id, direction) {
  const queue = getLearningQueue().slice();
  const index = queue.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= queue.length) return;
  const [item] = queue.splice(index, 1);
  queue.splice(nextIndex, 0, item);
  saveLearningQueue(queue);
  renderLearningStackPanel();
}

function removeLearningVideo(id) {
  const queue = getLearningQueue();
  const item = queue.find((video) => video.id === id);
  if (runtimeState.learningSessionActive && item && !item.completedAt) return;
  const nextQueue = queue.filter((video) => video.id !== id);
  const nextCurrent = runtimeState.learningSessionCurrentId === id ? (nextQueue[0]?.id || "") : runtimeState.learningSessionCurrentId;
  saveLearningQueue(nextQueue, { learningSessionCurrentId: nextCurrent });
  renderLearningStackPanel();
}

function markLearningVideoDone(id, progress = 1) {
  const queue = getLearningQueue().slice();
  const index = queue.findIndex((item) => item.id === id);
  if (index === -1) return false;

  const wasComplete = Boolean(queue[index].completedAt);
  if (wasComplete) return false;
  queue[index] = Object.assign({}, queue[index], {
    progress: Math.max(queue[index].progress || 0, progress),
    completedAt: queue[index].completedAt || Date.now()
  });

  const updates = {};
  const next = queue.find((item) => !item.completedAt);
  if (!next) {
    updates.learningSessionFindMore = false;
  } else if (runtimeState.learningSessionCurrentId === id) {
    updates.learningSessionCurrentId = next.id;
  }

  saveLearningQueue(queue, updates);
  if (!wasComplete) sendStats({ learningVideosCompleted: 1 });
  renderLearningStackPanel();
  scheduleApply(120, true);
  return true;
}

function updateLearningVideoProgress(id, progress, complete = false) {
  const queue = getLearningQueue().slice();
  const index = queue.findIndex((item) => item.id === id);
  if (index === -1) return;
  if (queue[index].completedAt) return;

  const nextProgress = Math.max(queue[index].progress || 0, Math.min(1, progress || 0));
  if (complete || nextProgress >= 0.9) {
    markLearningVideoDone(id, nextProgress);
    return;
  }

  queue[index] = Object.assign({}, queue[index], { progress: nextProgress });
  saveLearningQueue(queue);
  renderLearningStackPanel();
}

function endLearningSession() {
  if (!isLearningSessionComplete()) return;
  sendStats({ learningSessionsCompleted: 1 });
  persistLearningState({
    learningSessionActive: false,
    learningSessionFindMore: false,
    learningSessionQueue: [],
    learningSessionCurrentId: ""
  });
  learningPanelExpanded = false;
  removeLearningGate();
  applyLearningSessionLocks();
  renderLearningStackPanel();
}

function setLearningFindMore(enabled) {
  persistLearningState({ learningSessionFindMore: Boolean(enabled) });
  if (enabled && !isLearningDiscoveryRoute()) {
    navigateWithinYouTube("/feed/subscriptions");
  } else {
    scheduleApply(120, true);
  }
}

function hasHiddenReason(el) {
  const reasons = hiddenReasons.get(el);
  return Boolean(reasons && reasons.size > 0);
}

function getAiCacheKey(video, filterRule) {
  const id = typeof video === "string" ? video : video?.id;
  const metadataHash = typeof video === "string" ? "" : hashString([
    normalizeAiMetadataText(video?.title),
    normalizeAiMetadataText(video?.channel),
    normalizeAiMetadataText(video?.description)
  ].join("\n"));
  return `${hashString(filterRule)}:${id}:${metadataHash}`;
}

function applyAiFilter(effective) {
  const rule = (effective.aiFilterRule || "").trim();
  const ruleHash = hashString(rule);
  const active = isAiFilterActive(effective);
  if (lastAiRuleHash && lastAiRuleHash !== ruleHash) {
    classifiedVideos.clear();
  }
  lastAiRuleHash = ruleHash;

  const signature = JSON.stringify({
    active,
    ruleHash,
    allowChannels: effective.aiAllowChannels || "",
    blockChannels: effective.aiBlockChannels || "",
    allowKeywords: effective.aiAllowKeywords || "",
    blockKeywords: effective.aiBlockKeywords || "",
    threshold: Number(effective.aiHideConfidenceThreshold) || 0.75,
    preferenceVersion: Number(runtimeState.aiPreferenceVersion) || 0
  });

  if (!active) {
    if (lastAiFilterSignature) clearReason("ai-filter");
    lastAiFilterSignature = "";
    return;
  }

  if (signature !== lastAiFilterSignature) {
    clearReason("ai-filter");
    lastAiFilterSignature = signature;
  }

  const now = Date.now();
  if (aiRequestInFlight || now - lastAiFilterScanAt < 2500) return;
  lastAiFilterScanAt = now;

  const unclassified = [];
  const cachedFilteredVideos = [];
  let cachedHidden = 0;

  document.querySelectorAll(VIDEO_RENDERERS.join(",")).forEach((el) => {
    if (isShortsElement(el) || hasHiddenReason(el)) return;

    const id = extractVideoId(el);
    const title = extractTitle(el);
    if (!id || !title) return;
    const video = {
      id,
      title,
      channel: extractChannel(el),
      description: extractDescription(el),
      element: el
    };

    const cacheKey = getAiCacheKey(video, rule);
    if (classifiedVideos.has(cacheKey)) {
      if (classifiedVideos.get(cacheKey) === false && setHidden(el, "ai-filter", true)) {
        cachedHidden++;
        cachedFilteredVideos.push(video);
      }
      return;
    }

    unclassified.push(video);
  });

  if (cachedHidden > 0) {
    recordCount("aiFiltered", cachedHidden);
    rememberAiFilteredVideos(cachedFilteredVideos, rule);
  }
  if (!unclassified.length) return;

  if (aiDebounceTimer) clearTimeout(aiDebounceTimer);
  aiDebounceTimer = setTimeout(() => classifyBatch(unclassified, rule), 900);
}

async function classifyBatch(videos, filterRule) {
  aiRequestInFlight = true;
  const batchSize = 15;
  try {
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      try {
        const response = await extensionApi.runtime.sendMessage({
          type: "CLASSIFY_VIDEOS",
          titles: batch.map((video) => ({
            id: video.id,
            title: video.title,
            channel: video.channel || "",
            description: video.description || ""
          })),
          filterRule
        });

        if (!response || !response.results) continue;
        let count = 0;
        const filteredVideos = [];
        for (const item of batch) {
          const decision = response.decisions?.[item.id] || {};
          const relevant = response.results[item.id] === true;
          classifiedVideos.set(getAiCacheKey(item, filterRule), relevant);
          if (!relevant && item.element.isConnected && setHidden(item.element, "ai-filter", true)) {
            count++;
            filteredVideos.push(Object.assign({}, item, {
              confidence: Number(decision.confidence) || 0,
              reason: decision.reason || ""
            }));
          }
        }
        if (count > 0) {
          recordCount("aiFiltered", count);
          rememberAiFilteredVideos(filteredVideos, filterRule);
        }
      } catch (_err) {
        return;
      }
    }
  } finally {
    aiRequestInFlight = false;
  }
}

function isHomeRoute() {
  return location.pathname === "/" || location.pathname === "/feed/recommended";
}

function isExploreRoute() {
  return [
    "/feed/explore",
    "/feed/trending",
    "/gaming",
    "/live"
  ].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
}

function isPlayablesRoute() {
  return location.pathname.includes("/playables");
}

function shouldShowIntentGate(effective) {
  if (!effective.intentGate || Number(runtimeState.intentUntil) > Date.now()) return false;
  return isHomeRoute() || (effective.hideExplore && isExploreRoute()) || (effective.hidePlayables && isPlayablesRoute());
}

function applyRouteExperience(effective) {
  if (shouldShowIntentGate(effective)) {
    renderIntentGate(effective);
    removePageNotice();
    return;
  }

  removeIntentGate();

  if (effective.hideHomeFeed && isHomeRoute()) {
    renderPageNotice("Home feed hidden", "Search for what you came to watch, or open subscriptions.");
  } else if (effective.hideExplore && isExploreRoute()) {
    renderPageNotice("Explore hidden", "Trending and explore pages are quiet in this focus mode.");
  } else if (effective.hidePlayables && isPlayablesRoute()) {
    renderPageNotice("Playables hidden", "Games are paused while focus mode is active.");
  } else {
    removePageNotice();
  }
}

function renderBaseOverlayCss() {
  upsertStyle("focuslane-overlay-style", `
    .focuslane-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(255, 255, 255, 0.96);
      color: #17171c;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .focuslane-panel {
      width: min(420px, calc(100vw - 32px));
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 18px 60px rgba(17, 24, 39, 0.12);
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .focuslane-panel h2 {
      font-size: 18px;
      line-height: 1.2;
      margin: 0;
      font-weight: 650;
      letter-spacing: 0;
    }
    .focuslane-panel p {
      margin: 0;
      color: #60606c;
      font-size: 13px;
      line-height: 1.45;
    }
    .focuslane-panel input {
      width: 100%;
      border: 1px solid #d9d9dd;
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
      font-size: 13px;
      outline: none;
    }
    .focuslane-panel input:focus {
      border-color: #17171c;
    }
    .focuslane-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .focuslane-actions button {
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      padding: 8px 12px;
      background: #fff;
      color: #17171c;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .focuslane-actions button.primary {
      background: #17171c;
      color: #fff;
      border-color: #17171c;
    }
    .focuslane-actions button:hover {
      border-color: #17171c;
    }
  `);
}

function ensureLearningStackStyles() {
  upsertStyle("focuslane-learning-style", `
    .focuslane-stack-panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483645;
      width: 340px;
      max-width: calc(100vw - 28px);
      max-height: min(620px, calc(100vh - 36px));
      background: #ffffff;
      color: #17171c;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 18px 60px rgba(17, 24, 39, 0.16);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      overflow: hidden;
    }
    .focuslane-stack-panel.collapsed {
      width: auto;
      min-width: 230px;
    }
    .focuslane-stack-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid #f0f0f2;
      background: #fff;
    }
    .focuslane-stack-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .focuslane-stack-title strong {
      font-size: 13px;
      font-weight: 700;
    }
    .focuslane-stack-title span {
      font-size: 11px;
      color: #70707a;
      white-space: nowrap;
    }
    .focuslane-stack-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      max-height: 520px;
      overflow: auto;
    }
    .focuslane-stack-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .focuslane-stack-button,
    .focuslane-stack-card-button {
      border: 1px solid #e5e7eb;
      background: #fff;
      color: #17171c;
      border-radius: 999px;
      padding: 7px 10px;
      font: inherit;
      font-size: 11px;
      font-weight: 650;
      cursor: pointer;
    }
    .focuslane-stack-button.primary {
      background: #17171c;
      border-color: #17171c;
      color: #fff;
    }
    .focuslane-stack-button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .focuslane-stack-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .focuslane-stack-row {
      display: grid;
      grid-template-columns: 46px 1fr;
      gap: 8px;
      padding: 8px;
      border: 1px solid #f0f0f2;
      border-radius: 8px;
      background: #fafafa;
    }
    .focuslane-stack-thumb {
      width: 46px;
      height: 34px;
      object-fit: cover;
      border-radius: 6px;
      background: #e5e7eb;
    }
    .focuslane-stack-row-body {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }
    .focuslane-stack-row-title {
      font-size: 11px;
      line-height: 1.25;
      font-weight: 650;
      color: #17171c;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .focuslane-stack-row-meta {
      font-size: 10px;
      color: #80808a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .focuslane-stack-progress {
      height: 4px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
    }
    .focuslane-stack-progress span {
      display: block;
      height: 100%;
      background: #17171c;
      width: 0;
    }
    .focuslane-stack-row-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .focuslane-stack-row-actions button {
      border: 1px solid #e5e7eb;
      background: #fff;
      border-radius: 999px;
      padding: 4px 7px;
      font: inherit;
      font-size: 10px;
      cursor: pointer;
    }
    .focuslane-stack-card-button {
      position: absolute;
      right: 8px;
      top: 8px;
      z-index: 20;
      padding: 5px 8px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    }
    ytd-video-renderer,
    ytd-compact-video-renderer,
    ytd-grid-video-renderer,
    ytd-rich-item-renderer,
    ytd-playlist-video-renderer,
    ytm-video-with-context-renderer {
      position: relative !important;
    }
    .focuslane-watch-stack-button {
      margin-left: 8px;
    }
    .focuslane-learning-toast {
      position: fixed;
      right: 18px;
      bottom: 84px;
      z-index: 2147483646;
      max-width: min(320px, calc(100vw - 28px));
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #17171c;
      color: #fff;
      box-shadow: 0 12px 36px rgba(17, 24, 39, 0.2);
      padding: 10px 12px;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.35;
    }
  `);
}

function renderLearningToast(message) {
  ensureLearningStackStyles();
  let toast = document.getElementById("focuslane-learning-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "focuslane-learning-toast";
    toast.className = "focuslane-learning-toast";
    document.documentElement.appendChild(toast);
  }
  toast.textContent = message;
  if (learningToastTimer) clearTimeout(learningToastTimer);
  learningToastTimer = setTimeout(() => {
    toast.remove();
    learningToastTimer = null;
  }, 2400);
}

function ensureSponsorBlockStyles() {
  upsertStyle("focuslane-sponsor-style", `
    .html5-video-player,
    #movie_player {
      position: relative !important;
    }
    .focuslane-sponsor-notice {
      position: absolute;
      right: 16px;
      bottom: 64px;
      z-index: 2147483644;
      max-width: min(320px, calc(100% - 32px));
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 10px;
      background: rgba(23, 23, 28, 0.92);
      color: #fff;
      box-shadow: 0 12px 36px rgba(17, 24, 39, 0.22);
      padding: 10px 12px;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.35;
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.35s ease, transform 0.35s ease;
    }
    .focuslane-sponsor-notice.focuslane-sponsor-notice-fixed {
      position: fixed;
      right: 18px;
      bottom: 18px;
      max-width: min(320px, calc(100vw - 28px));
    }
    .focuslane-sponsor-notice.is-hiding {
      opacity: 0;
      transform: translateY(8px);
    }
    .focuslane-sponsor-notice strong {
      display: block;
      margin-bottom: 3px;
      font-size: 12px;
      font-weight: 700;
    }
    .focuslane-sponsor-notice span {
      display: block;
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
      line-height: 1.35;
    }
    .focuslane-sponsor-notice button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid #fff;
      border-radius: 999px;
      background: #fff;
      color: #17171c;
      padding: 8px 13px;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
    }
    .focuslane-sponsor-skip-icon {
      position: relative;
      display: inline-block;
      width: 13px;
      height: 13px;
      flex: 0 0 auto;
    }
    .focuslane-sponsor-skip-icon::before {
      content: "";
      position: absolute;
      left: 0;
      top: 1px;
      width: 0;
      height: 0;
      border-top: 5.5px solid transparent;
      border-bottom: 5.5px solid transparent;
      border-left: 8px solid #17171c;
    }
    .focuslane-sponsor-skip-icon::after {
      content: "";
      position: absolute;
      right: 1px;
      top: 1px;
      width: 2px;
      height: 11px;
      border-radius: 1px;
      background: #17171c;
    }
    .ytp-progress-bar {
      position: relative !important;
    }
    .focuslane-sponsor-marker-layer {
      position: absolute;
      inset: 0;
      z-index: 38;
      pointer-events: none;
      overflow: hidden;
    }
    .focuslane-sponsor-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      min-width: 2px;
      border-radius: 1px;
      background: rgba(0, 212, 0, 0.95);
      box-shadow: 0 0 4px rgba(0, 212, 0, 0.75);
    }
  `);
}

function ensureDislikeCountStyles() {
  upsertStyle("focuslane-dislike-style", `
    #focuslane-dislike-count {
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 14px;
      font-weight: 500;
      line-height: 36px;
      color: var(--yt-spec-text-primary, #f1f1f1);
      white-space: nowrap;
      pointer-events: none;
      padding-left: 6px;
      padding-right: 16px;
    }
    #focuslane-dislike-count.is-loading,
    #focuslane-dislike-count.is-unavailable {
      opacity: 0.55;
    }
    /* Hide dislike icon when count is shown */
    .focuslane-dislike-icon-hidden {
      display: none !important;
    }
    button:has(#focuslane-dislike-count) > :not(#focuslane-dislike-count) {
      display: none !important;
    }
  `);
}

function removeDislikeCount() {
  const el = document.getElementById("focuslane-dislike-count");
  document.querySelectorAll(".focuslane-dislike-button-with-count").forEach((button) => {
    button.classList.remove("focuslane-dislike-button-with-count");
  });
  document.querySelectorAll(".focuslane-dislike-icon-hidden").forEach((icon) => {
    icon.classList.remove("focuslane-dislike-icon-hidden");
  });
  if (el) el.remove();
}

function formatDislikeCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return "";
  if (count < 1000) return String(Math.round(count));
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: count < 10000 ? 1 : 0
  }).format(count);
}

function getDislikeButton() {
  const selectors = [
    "dislike-button-view-model button",
    "segmented-like-dislike-button-view-model dislike-button-view-model button",
    "ytd-watch-metadata dislike-button-view-model button",
    "ytd-watch-metadata segmented-dislike-button-view-model button",
    "segmented-dislike-button-view-model button",
    "#segmented-dislike-button button",
    "button[aria-label^='Dislike' i]",
    "button[aria-label*='dislike this video' i]",
    "button[title='Dislike' i]"
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button instanceof HTMLElement && button.offsetParent !== null) return button;
  }
  return null;
}

function getLikeButton() {
  const selectors = [
    "like-button-view-model button",
    "segmented-like-dislike-button-view-model like-button-view-model button",
    "ytd-watch-metadata like-button-view-model button",
    "ytd-watch-metadata segmented-like-button-view-model button",
    "segmented-like-button-view-model button",
    "#segmented-like-button button",
    "button[aria-label^='Like' i]",
    "button[aria-label='Like this video' i]",
    "button[title='Like' i]"
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button instanceof HTMLElement && button.offsetParent !== null) return button;
  }
  return null;
}

function isDislikeButtonSelected(button) {
  const ariaPressed = button?.getAttribute?.("aria-pressed");
  if (ariaPressed === "true") return true;
  if (ariaPressed === "false") return false;

  const label = `${button?.getAttribute?.("aria-label") || ""} ${button?.getAttribute?.("title") || ""}`.toLowerCase();
  return label.includes("remove dislike") || label.includes("disliked");
}

function getAdjustedDislikeCount() {
  if (dislikeCountValue === null) return null;
  return Math.max(0, dislikeCountValue + dislikeLocalAdjustment);
}

function syncDislikeSelectedState(button) {
  const selected = isDislikeButtonSelected(button);
  if (!dislikeSelectedInitialized) {
    dislikeLastSelected = selected;
    dislikeSelectedInitialized = true;
  }
}

function setLocalDislikeSelected(selected, wasSelected = dislikeSelectedInitialized ? dislikeLastSelected : false) {
  if (selected === dislikeLastSelected && dislikeSelectedInitialized) return;
  dislikeSelectedInitialized = true;
  dislikeLastSelected = selected;
  dislikeLocalAdjustment += selected ? 1 : (wasSelected ? -1 : 0);
  renderDislikeCount();
}

function bindDislikeButtonClick(button) {
  if (button.dataset.focuslaneDislikeClickBound === "true") return;
  button.dataset.focuslaneDislikeClickBound = "true";
  button.addEventListener("click", () => {
    const wasSelected = dislikeSelectedInitialized ? dislikeLastSelected : isDislikeButtonSelected(button);
    setLocalDislikeSelected(!wasSelected, wasSelected);
  });
}

function bindLikeButtonClick() {
  const button = getLikeButton();
  if (!button || button.dataset.focuslaneLikeClickBound === "true") return;
  button.dataset.focuslaneLikeClickBound = "true";
  button.addEventListener("click", () => {
    const wasSelected = dislikeSelectedInitialized ? dislikeLastSelected : isDislikeButtonSelected(getDislikeButton());
    if (!wasSelected) return;
    setLocalDislikeSelected(false, wasSelected);
  });
}

function getDislikeCountTarget(button) {
  // Hide the icon inside the button
  const icon = button.querySelector("yt-icon");
  if (icon) icon.classList.add("focuslane-dislike-icon-hidden");
  button.classList.add("focuslane-dislike-button-with-count");
  bindDislikeButtonClick(button);
  syncDislikeSelectedState(button);

  let countEl = document.getElementById("focuslane-dislike-count");
  if (countEl && countEl.parentElement === button) return countEl;
  if (countEl) countEl.remove();
  countEl = document.createElement("span");
  countEl.id = "focuslane-dislike-count";
  countEl.title = "Estimated dislikes from Return YouTube Dislike";
  button.appendChild(countEl);
  return countEl;
}

function renderDislikeCount() {
  if (!settings.dislikeCountEnabled) {
    removeDislikeCount();
    return;
  }

  const button = getDislikeButton();
  if (!button) return;

  ensureDislikeCountStyles();
  const countEl = getDislikeCountTarget(button);
  bindLikeButtonClick();

  countEl.classList.toggle("is-loading", dislikeFetchInFlight && !dislikeCountLoaded);
  countEl.classList.toggle("is-unavailable", dislikeCountLoaded && dislikeCountValue === null);
  countEl.textContent = dislikeCountLoaded ?
    (dislikeCountValue === null ? "-" : formatDislikeCount(getAdjustedDislikeCount())) :
    "...";

  if (dislikeCountLoaded && dislikeCountValue !== null && !dislikeCountRecorded) {
    dislikeCountRecorded = true;
    sendStats({ dislikeCountsShown: 1 });
  }
}

function hideSponsorNotice() {
  const notice = document.getElementById("focuslane-sponsor-notice");
  if (!notice) return;
  notice.classList.add("is-hiding");
  setTimeout(() => notice.remove(), 380);
}

function scheduleSponsorNoticeFade() {
  if (sponsorNoticeTimer) clearTimeout(sponsorNoticeTimer);
  sponsorNoticeTimer = setTimeout(() => {
    hideSponsorNotice();
    sponsorNoticeTimer = null;
  }, 5000);
}

function getSponsorNoticeHost() {
  return document.querySelector(".html5-video-player") ||
    document.getElementById("movie_player");
}

function renderSponsorNotice(segment, mode = "skipped") {
  ensureSponsorBlockStyles();
  const host = getSponsorNoticeHost();
  let notice = document.getElementById("focuslane-sponsor-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "focuslane-sponsor-notice";
    notice.className = "focuslane-sponsor-notice";
  }

  if (host) {
    if (notice.parentElement !== host) host.appendChild(notice);
    notice.classList.remove("focuslane-sponsor-notice-fixed");
  } else {
    if (notice.parentElement !== document.documentElement) document.documentElement.appendChild(notice);
    notice.classList.add("focuslane-sponsor-notice-fixed");
  }

  notice.classList.remove("is-hiding");

  notice.replaceChildren();
  if (mode === "ask") {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sponsorAction = "skip";
    button.append(document.createTextNode("Skip sponsor "));

    const icon = document.createElement("span");
    icon.className = "focuslane-sponsor-skip-icon";
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      skipSponsorSegment(segment);
    });
    notice.appendChild(button);
  } else {
    const title = document.createElement("strong");
    title.textContent = "Skipped sponsor segment";

    const detail = document.createElement("span");
    const seconds = Math.max(1, Math.round((Number(segment.end) || 0) - (Number(segment.start) || 0)));
    detail.textContent = `${seconds}s skipped automatically.`;

    notice.append(title, detail);
  }

  scheduleSponsorNoticeFade();
}

function removeSponsorMarkers() {
  document.getElementById("focuslane-sponsor-marker-layer")?.remove();
}

function renderSponsorMarkers() {
  if (!settings.sponsorBlockEnabled || !sponsorVideo || !sponsorSegments.length) {
    removeSponsorMarkers();
    return;
  }

  const duration = Number(sponsorVideo.duration);
  if (!duration || !Number.isFinite(duration)) {
    removeSponsorMarkers();
    return;
  }

  const progressBar = document.querySelector(".ytp-progress-bar");
  if (!progressBar) return;

  ensureSponsorBlockStyles();
  let layer = document.getElementById("focuslane-sponsor-marker-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "focuslane-sponsor-marker-layer";
    layer.className = "focuslane-sponsor-marker-layer";
    progressBar.appendChild(layer);
  } else if (layer.parentElement !== progressBar) {
    progressBar.appendChild(layer);
  }

  const signature = JSON.stringify({
    duration: Math.round(duration * 10),
    segments: sponsorSegments.map((segment) => [
      Math.round(Number(segment.start) * 10),
      Math.round(Number(segment.end) * 10)
    ])
  });
  if (layer.dataset.signature === signature) return;
  layer.dataset.signature = signature;
  const markers = document.createDocumentFragment();
  sponsorSegments.forEach((segment) => {
    const start = Math.max(0, Number(segment.start) || 0);
    const end = Math.min(duration, Math.max(start, Number(segment.end) || 0));
    if (end <= start) return;
    const left = Math.max(0, Math.min(100, (start / duration) * 100));
    const width = Math.max(0.18, Math.min(100 - left, ((end - start) / duration) * 100));

    const marker = document.createElement("span");
    marker.className = "focuslane-sponsor-marker";
    marker.style.left = `${left}%`;
    marker.style.width = `${width}%`;
    markers.appendChild(marker);
  });
  layer.replaceChildren(markers);
}

function removeLearningStackPanel() {
  const panel = document.getElementById("focuslane-learning-stack");
  if (panel) panel.remove();
}

function removeLearningStackButtons() {
  document.querySelectorAll(".focuslane-stack-card-button").forEach((el) => el.remove());
  const watchBtn = document.getElementById("focuslane-watch-stack-button");
  if (watchBtn) watchBtn.remove();
}

function createLearningActionButton(action, label, options = {}) {
  const button = document.createElement("button");
  button.dataset.learningAction = action;
  button.textContent = label;
  if (options.className) button.className = options.className;
  if (options.videoId) button.dataset.videoId = options.videoId;
  if (options.disabled) button.disabled = true;
  return button;
}

function renderLearningStackPanel() {
  ensureLearningStackStyles();
  const queue = getLearningQueue();
  const incomplete = queue.filter((item) => !item.completedAt);
  const completedCount = queue.length - incomplete.length;
  const active = Boolean(runtimeState.learningSessionActive);
  const complete = isLearningSessionComplete();
  const currentId = getCurrentWatchVideoId();
  const canAddCurrent = Boolean(currentId && !isVideoQueued(currentId));
  const open = learningPanelExpanded;
  const collapsed = !open;
  const signature = JSON.stringify({
    queue: queue.map((item) => [item.id, item.completedAt, Math.round((item.progress || 0) * 100)]),
    active,
    complete,
    currentId,
    canAddCurrent,
    expanded: open,
    findMore: Boolean(runtimeState.learningSessionFindMore),
    currentQueueId: runtimeState.learningSessionCurrentId
  });

  let panel = document.getElementById("focuslane-learning-stack");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "focuslane-learning-stack";
    document.documentElement.appendChild(panel);
  }

  panel.className = `focuslane-stack-panel${collapsed ? " collapsed" : ""}`;
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;

  const header = document.createElement("div");
  header.className = "focuslane-stack-head";

  const title = document.createElement("div");
  title.className = "focuslane-stack-title";

  const titleText = document.createElement("strong");
  titleText.textContent = "Learning Stack";

  const meta = document.createElement("span");
  meta.textContent = `${queue.length} queued \u00b7 ${completedCount} done${active ? " \u00b7 session on" : ""}`;

  title.append(titleText, meta);
  header.append(title, createLearningActionButton("toggle-panel", open ? "Hide" : "Open", {
    className: "focuslane-stack-button"
  }));

  const children = [header];
  if (open) {
    const body = document.createElement("div");
    body.className = "focuslane-stack-body";

    const actions = document.createElement("div");
    actions.className = "focuslane-stack-actions";

    if (canAddCurrent) {
      actions.appendChild(createLearningActionButton("add-current", "Add current video", {
        className: "focuslane-stack-button"
      }));
    }
    if (queue.length && !active) {
      actions.appendChild(createLearningActionButton("start-session", "Start session", {
        className: "focuslane-stack-button primary"
      }));
    }
    if (active && incomplete.length) {
      actions.appendChild(createLearningActionButton("resume-queue", "Resume queue", {
        className: "focuslane-stack-button primary"
      }));
      actions.appendChild(createLearningActionButton(
        "toggle-find-more",
        runtimeState.learningSessionFindMore ? "Stop adding" : "Find more",
        { className: "focuslane-stack-button" }
      ));
    }
    if (complete) {
      actions.appendChild(createLearningActionButton("end-session", "End session", {
        className: "focuslane-stack-button primary"
      }));
    }

    body.appendChild(actions);
    if (queue.length) {
      body.appendChild(renderLearningQueueRows(queue, active));
    } else {
      const empty = document.createElement("p");
      empty.className = "focuslane-stack-row-meta";
      empty.textContent = "Add a YouTube video to begin a focused learning queue.";
      body.appendChild(empty);
    }
    children.push(body);
  }

  panel.replaceChildren(...children);

  wireLearningPanel(panel);
}

function renderLearningQueueRows(queue, active) {
  const list = document.createElement("div");
  list.className = "focuslane-stack-list";

  queue.forEach((item, index) => {
    const progress = Math.round(Math.min(1, item.progress || 0) * 100);
    const isCurrent = item.id === runtimeState.learningSessionCurrentId;
    const done = Boolean(item.completedAt);
    const canRemove = !active || done;

    const row = document.createElement("div");
    row.className = "focuslane-stack-row";
    row.dataset.videoId = item.id || "";

    const thumbnail = document.createElement("img");
    thumbnail.className = "focuslane-stack-thumb";
    thumbnail.src = item.thumbnail || "";
    thumbnail.alt = "";

    const body = document.createElement("div");
    body.className = "focuslane-stack-row-body";

    const title = document.createElement("div");
    title.className = "focuslane-stack-row-title";
    title.textContent = item.title || "";

    const meta = document.createElement("div");
    meta.className = "focuslane-stack-row-meta";
    const metaParts = [done ? "Done" : `${progress}% watched`];
    if (isCurrent) metaParts.push("current");
    if (item.channel) metaParts.push(item.channel);
    meta.textContent = metaParts.join(" \u00b7 ");

    const progressBar = document.createElement("div");
    progressBar.className = "focuslane-stack-progress";

    const progressFill = document.createElement("span");
    progressFill.style.width = `${done ? 100 : progress}%`;
    progressBar.appendChild(progressFill);

    const actions = document.createElement("div");
    actions.className = "focuslane-stack-row-actions";
    actions.append(
      createLearningActionButton("play", "Play", { videoId: item.id }),
      createLearningActionButton("mark-done", "Done", { videoId: item.id, disabled: done }),
      createLearningActionButton("move-up", "Up", { videoId: item.id, disabled: index === 0 }),
      createLearningActionButton("move-down", "Down", { videoId: item.id, disabled: index === queue.length - 1 }),
      createLearningActionButton("remove", "Remove", { videoId: item.id, disabled: !canRemove })
    );

    body.append(title, meta, progressBar, actions);
    row.append(thumbnail, body);
    list.appendChild(row);
  });

  return list;
}

function wireLearningPanel(panel) {
  panel.querySelectorAll("[data-learning-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleLearningAction(button.dataset.learningAction, button.dataset.videoId || "");
    });
  });
}

function handleLearningAction(action, id) {
  if (action === "toggle-panel") {
    learningPanelExpanded = !learningPanelExpanded;
    renderLearningStackPanel();
    return;
  }
  if (action === "add-current") {
    addLearningVideo(buildLearningItemFromCurrentVideo());
    return;
  }
  if (action === "start-session") {
    startLearningSession();
    return;
  }
  if (action === "resume-queue") {
    resumeLearningQueue();
    return;
  }
  if (action === "toggle-find-more") {
    setLearningFindMore(!runtimeState.learningSessionFindMore);
    return;
  }
  if (action === "end-session") {
    endLearningSession();
    return;
  }
  if (action === "play") {
    persistLearningState({ learningSessionCurrentId: id, learningSessionFindMore: false });
    navigateToLearningVideo(id);
    return;
  }
  if (action === "mark-done") {
    markLearningVideoDone(id);
    return;
  }
  if (action === "move-up") {
    moveLearningVideo(id, -1);
    return;
  }
  if (action === "move-down") {
    moveLearningVideo(id, 1);
    return;
  }
  if (action === "remove") {
    removeLearningVideo(id);
  }
}

function injectLearningStackButtons() {
  ensureLearningStackStyles();
  const now = Date.now();
  if (now - lastLearningButtonScanAt < 1400) return;
  lastLearningButtonScanAt = now;

  injectWatchLearningButton();

  const cards = Array.from(document.querySelectorAll(VIDEO_RENDERERS.join(","))).slice(0, 90);
  cards.forEach((card) => {
    const item = buildLearningItemFromCard(card);
    if (!item) return;
    const existingButton = card.querySelector(".focuslane-stack-card-button");
    if (existingButton) {
      existingButton.textContent = isVideoQueued(item.id) ? "Stacked" : "Stack";
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "focuslane-stack-card-button";
    button.textContent = isVideoQueued(item.id) ? "Stacked" : "Stack";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addLearningVideo(item);
      button.textContent = "Stacked";
    });
    card.appendChild(button);
  });
}

function injectWatchLearningButton() {
  const item = buildLearningItemFromCurrentVideo();
  if (!item) {
    document.getElementById("focuslane-watch-stack-button")?.remove();
    return;
  }

  let target = document.querySelector("#top-level-buttons-computed") ||
    document.querySelector("ytd-watch-metadata #actions") ||
    document.querySelector("ytd-watch-metadata h1")?.parentElement;
  if (!target) return;

  let button = document.getElementById("focuslane-watch-stack-button");
  if (!button) {
    button = document.createElement("button");
    button.id = "focuslane-watch-stack-button";
    button.type = "button";
    button.className = "focuslane-stack-button focuslane-watch-stack-button";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addLearningVideo(buildLearningItemFromCurrentVideo());
    });
    target.appendChild(button);
  } else if (!target.contains(button)) {
    target.appendChild(button);
  }

  button.textContent = isVideoQueued(item.id) ? "Stacked" : "Stack video";
}

function isLearningSessionLocked() {
  return Boolean(runtimeState.learningSessionActive && getIncompleteLearningItems().length);
}

function isLearningDiscoveryRoute(url = location) {
  const pathname = url.pathname || "";
  if (pathname === "/results") return true;
  if (pathname === "/feed/subscriptions") return true;
  return pathname.startsWith("/@") ||
    pathname.startsWith("/channel/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/user/");
}

function isLearningRouteAllowed() {
  if (!isLearningSessionLocked()) return true;
  if (location.pathname.startsWith("/shorts")) return false;

  const currentId = getCurrentWatchVideoId();
  if (currentId) return isVideoQueued(currentId);

  return Boolean(runtimeState.learningSessionFindMore && isLearningDiscoveryRoute());
}

function applyLearningSessionLocks() {
  if (!isLearningSessionLocked()) {
    delete document.documentElement.dataset.focuslaneLearningLock;
    upsertStyle("focuslane-learning-lock-style", "");
    return;
  }

  document.documentElement.dataset.focuslaneLearningLock = runtimeState.learningSessionFindMore ? "find-more" : "locked";
  upsertStyle("focuslane-learning-lock-style", `
    ytd-watch-flexy #secondary,
    ytd-watch-flexy #secondary-inner,
    ytd-watch-flexy #related,
    ytd-watch-flexy yt-related-chip-cloud-renderer,
    ytd-watch-next-secondary-results-renderer,
    ytd-watch-flexy ytd-item-section-renderer#sections,
    ytd-watch-flexy #secondary ytd-compact-video-renderer,
    ytd-watch-flexy #secondary ytd-compact-radio-renderer,
    ytd-watch-flexy #secondary ytd-compact-playlist-renderer,
    ytd-watch-flexy #secondary ytd-compact-movie-renderer,
    ytd-watch-flexy #secondary ytd-compact-station-renderer,
    ytd-watch-flexy ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer,
    ytd-watch-flexy ytd-watch-next-secondary-results-renderer ytd-compact-radio-renderer,
    ytd-watch-flexy ytd-watch-next-secondary-results-renderer ytd-reel-shelf-renderer,
    ytd-browse[page-subtype='home'] ytd-rich-grid-renderer,
    ytd-browse[page-subtype='home'] #contents.ytd-rich-grid-renderer,
    ytd-browse[page-subtype='home'] ytd-rich-section-renderer,
    ytd-reel-shelf-renderer,
    ytm-shorts-lockup-view-model-v2,
    ytm-shorts-lockup-view-model,
    ytd-rich-shelf-renderer,
    a[href='/shorts'],
    a[href^='/shorts/'],
    a[href='/feed/explore'],
    a[href='/feed/trending'],
    a[href='/gaming'],
    a[href='/live'],
    a[href*='/playables'],
    ytd-backstage-post-thread-renderer,
    ytd-post-renderer,
    ytd-live-chat-frame,
    ytd-watch-flexy #chat,
    yt-live-chat-app,
    ytd-notification-topbar-button-renderer,
    a[href='/feed/notifications'],
    .ytp-endscreen-content,
    .ytp-ce-element,
    .ytp-videowall-still,
    .html5-endscreen,
    .ytp-cards-button,
    .ytp-cards-teaser,
    .ytp-cards-teaser-box,
    .ytp-cards-dialog {
      display: none !important;
      visibility: hidden !important;
    }
    ytd-watch-flexy[theater] #primary,
    ytd-watch-flexy #primary {
      max-width: 1100px !important;
    }
    html[data-focuslane-learning-lock='find-more'] ytd-video-renderer a[href*='/watch'],
    html[data-focuslane-learning-lock='find-more'] ytd-rich-item-renderer a[href*='/watch'],
    html[data-focuslane-learning-lock='find-more'] ytd-grid-video-renderer a[href*='/watch'],
    html[data-focuslane-learning-lock='find-more'] ytd-playlist-video-renderer a[href*='/watch'],
    html[data-focuslane-learning-lock='find-more'] ytm-video-with-context-renderer a[href*='/watch'] {
      cursor: not-allowed !important;
    }
  `);
}

function applyLearningSession() {
  if (!settings.learningStackEnabled) {
    removeLearningStackPanel();
    removeLearningStackButtons();
    removeLearningGate();
    return false;
  }
  renderLearningStackPanel();
  injectLearningStackButtons();
  setupLearningProgressTracking();
  applyLearningSessionLocks();

  if (!isLearningSessionLocked()) {
    removeLearningGate();
    return false;
  }

  if (isLearningRouteAllowed()) {
    removeLearningGate();
    return false;
  }

  renderLearningGate();
  removeIntentGate();
  removePageNotice();
  return true;
}

function isYouTubeNavigationUrl(url) {
  const host = (url.hostname || "").replace(/^www\./, "");
  return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
}

function getLearningNavigationDecision(url) {
  if (!isLearningSessionLocked()) return { allow: true };
  if (!isYouTubeNavigationUrl(url)) return { allow: true };
  if (url.pathname.startsWith("/shorts")) return { allow: false, reason: "blocked-route" };

  const videoId = getVideoIdFromUrl(url);
  if (videoId) {
    return isVideoQueued(videoId) ?
      { allow: true } :
      { allow: false, reason: "unqueued-watch", videoId };
  }

  if (runtimeState.learningSessionFindMore && isLearningDiscoveryRoute(url)) {
    return { allow: true };
  }

  return { allow: false, reason: "blocked-route" };
}

function handleLearningNavigationClick(event) {
  if (!isLearningSessionLocked()) return;
  const target = event.target;
  if (!target || !(target instanceof Element)) return;
  if (target.closest("#focuslane-learning-stack, #focuslane-learning-gate, #focuslane-learning-toast")) return;

  const anchor = target.closest("a[href]");
  if (!anchor) {
    if (target.closest("button, input, textarea, select")) return;
    const card = target.closest(VIDEO_RENDERERS.join(","));
    const item = card ? buildLearningItemFromCard(card) : null;
    if (!item || isVideoQueued(item.id)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    if (runtimeState.learningSessionFindMore) {
      learningPanelExpanded = true;
      renderLearningStackPanel();
      renderLearningToast("Use Stack to add this video before watching.");
    } else {
      renderLearningGate();
      removeIntentGate();
      removePageNotice();
    }
    return;
  }

  let url;
  try {
    url = new URL(anchor.getAttribute("href") || anchor.href, location.href);
  } catch (_err) {
    return;
  }

  const decision = getLearningNavigationDecision(url);
  if (decision.allow) return;

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }

  if (decision.reason === "unqueued-watch" && runtimeState.learningSessionFindMore) {
    learningPanelExpanded = true;
    renderLearningStackPanel();
    renderLearningToast("Use Stack to add this video before watching.");
    return;
  }

  renderLearningGate();
  removeIntentGate();
  removePageNotice();
}

function startLearningNavigationGuard() {
  document.addEventListener("click", handleLearningNavigationClick, true);
  document.addEventListener("auxclick", handleLearningNavigationClick, true);
}

function renderLearningGate() {
  renderBaseOverlayCss();
  const currentId = getCurrentWatchVideoId();
  const canAddCurrent = Boolean(currentId && !isVideoQueued(currentId));
  const signature = JSON.stringify({
    currentId,
    canAddCurrent,
    findMore: Boolean(runtimeState.learningSessionFindMore),
    incomplete: getIncompleteLearningItems().length
  });
  let overlay = document.getElementById("focuslane-learning-gate");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "focuslane-learning-gate";
    overlay.className = "focuslane-overlay";
    document.documentElement.appendChild(overlay);
  }
  if (overlay.dataset.signature === signature) return;
  overlay.dataset.signature = signature;

  const panel = document.createElement("div");
  panel.className = "focuslane-panel";

  const title = document.createElement("h2");
  title.textContent = "Learning session active";

  const message = document.createElement("p");
  message.textContent = canAddCurrent
    ? "This video is not in your stack. Add it to continue watching, or return to your queued videos."
    : "Finish the videos in your Learning Stack before open browsing.";

  const actions = document.createElement("div");
  actions.className = "focuslane-actions";

  if (canAddCurrent) {
    const addButton = document.createElement("button");
    addButton.className = "primary";
    addButton.dataset.learningGateAction = "add-current";
    addButton.textContent = "Add this video";
    actions.appendChild(addButton);
  }

  const resumeButton = document.createElement("button");
  resumeButton.className = "primary";
  resumeButton.dataset.learningGateAction = "resume";
  resumeButton.textContent = "Resume queue";

  const findMoreButton = document.createElement("button");
  findMoreButton.dataset.learningGateAction = "find-more";
  findMoreButton.textContent = runtimeState.learningSessionFindMore ? "Back to adding" : "Find more videos";

  actions.append(resumeButton, findMoreButton);
  panel.append(title, message, actions);
  overlay.replaceChildren(panel);

  overlay.querySelectorAll("[data-learning-gate-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.learningGateAction;
      if (action === "add-current") {
        addLearningVideo(buildLearningItemFromCurrentVideo(), { current: true, leaveFindMore: false });
      } else if (action === "resume") {
        resumeLearningQueue();
      } else if (action === "find-more") {
        setLearningFindMore(true);
      }
    });
  });
}

function removeLearningGate() {
  document.getElementById("focuslane-learning-gate")?.remove();
}

function setupLearningProgressTracking() {
  const video = document.querySelector("video.html5-main-video, video");
  const currentId = getCurrentWatchVideoId();
  if (!video || !currentId || !isVideoQueued(currentId)) {
    if (currentVideoForLearning) {
      currentVideoForLearning.removeEventListener("timeupdate", onLearningTimeUpdate);
      currentVideoForLearning.removeEventListener("ended", onLearningEnded);
      currentVideoForLearning = null;
    }
    return;
  }

  if (runtimeState.learningSessionCurrentId !== currentId) {
    persistLearningState({ learningSessionCurrentId: currentId });
  }

  if (currentVideoForLearning !== video) {
    if (currentVideoForLearning) {
      currentVideoForLearning.removeEventListener("timeupdate", onLearningTimeUpdate);
      currentVideoForLearning.removeEventListener("ended", onLearningEnded);
    }
    currentVideoForLearning = video;
    video.addEventListener("timeupdate", onLearningTimeUpdate);
    video.addEventListener("ended", onLearningEnded);
  }
}

function onLearningTimeUpdate(event) {
  const video = event.currentTarget;
  const currentId = getCurrentWatchVideoId();
  if (!currentId || !video.duration || !Number.isFinite(video.duration)) return;

  const progress = Math.max(0, Math.min(1, video.currentTime / video.duration));
  const now = Date.now();
  if (progress >= 0.9) {
    updateLearningVideoProgress(currentId, progress, true);
    return;
  }
  if (now - lastLearningProgressSaveAt > 3500) {
    lastLearningProgressSaveAt = now;
    updateLearningVideoProgress(currentId, progress);
  }
}

function onLearningEnded() {
  const currentId = getCurrentWatchVideoId();
  if (!currentId) return;
  markLearningVideoDone(currentId, 1);
  const next = getIncompleteLearningItems()[0];
  if (runtimeState.learningSessionActive && next) {
    setTimeout(() => navigateToLearningVideo(next.id), 800);
  }
}

function clearSponsorBlockState() {
  if (sponsorVideo) {
    sponsorVideo.removeEventListener("timeupdate", onSponsorTimeUpdate);
    sponsorVideo.removeEventListener("seeking", onSponsorTimeUpdate);
    sponsorVideo.removeEventListener("loadedmetadata", onSponsorTimeUpdate);
    sponsorVideo.removeEventListener("durationchange", renderSponsorMarkers);
  }
  sponsorVideo = null;
  sponsorVideoId = "";
  sponsorSegments = [];
  sponsorFetchInFlight = false;
  sponsorSegmentsLoaded = false;
  skippedSponsorSegments.clear();
  promptedSponsorSegments.clear();
  removeSponsorMarkers();
  document.getElementById("focuslane-sponsor-notice")?.remove();
  if (sponsorNoticeTimer) {
    clearTimeout(sponsorNoticeTimer);
    sponsorNoticeTimer = null;
  }
}

function setupSponsorBlock(effective) {
  if (!effective.sponsorBlockEnabled) {
    clearSponsorBlockState();
    return;
  }

  const currentId = getCurrentWatchVideoId();
  const video = document.querySelector("video.html5-main-video, video");
  if (!currentId || !video) {
    clearSponsorBlockState();
    return;
  }

  ensureSponsorBlockStyles();

  if (sponsorVideo !== video) {
    if (sponsorVideo) {
      sponsorVideo.removeEventListener("timeupdate", onSponsorTimeUpdate);
      sponsorVideo.removeEventListener("seeking", onSponsorTimeUpdate);
      sponsorVideo.removeEventListener("loadedmetadata", onSponsorTimeUpdate);
      sponsorVideo.removeEventListener("durationchange", renderSponsorMarkers);
    }
    sponsorVideo = video;
    video.addEventListener("timeupdate", onSponsorTimeUpdate);
    video.addEventListener("seeking", onSponsorTimeUpdate);
    video.addEventListener("loadedmetadata", onSponsorTimeUpdate);
    video.addEventListener("durationchange", renderSponsorMarkers);
  }

  if (sponsorVideoId !== currentId) {
    sponsorVideoId = currentId;
    sponsorSegments = [];
    sponsorFetchInFlight = false;
    sponsorSegmentsLoaded = false;
    skippedSponsorSegments.clear();
    promptedSponsorSegments.clear();
    fetchSponsorSegments(currentId);
    return;
  }

  if (!sponsorSegmentsLoaded && !sponsorFetchInFlight) fetchSponsorSegments(currentId);
  renderSponsorMarkers();
  onSponsorTimeUpdate();
}

async function fetchSponsorSegments(videoId) {
  if (!videoId || sponsorFetchInFlight) return;
  sponsorFetchInFlight = true;
  try {
    const response = await extensionApi.runtime.sendMessage({ type: "GET_SPONSOR_SEGMENTS", videoId });
    if (sponsorVideoId !== videoId) return;
    sponsorSegments = Array.isArray(response?.segments) ? response.segments : [];
    sponsorSegmentsLoaded = true;
    renderSponsorMarkers();
    onSponsorTimeUpdate();
  } catch (_err) {
    if (sponsorVideoId === videoId) {
      sponsorSegments = [];
      sponsorSegmentsLoaded = true;
      removeSponsorMarkers();
    }
  } finally {
    sponsorFetchInFlight = false;
  }
}

function getActiveSponsorSegment(currentTime) {
  return sponsorSegments.find((segment) => {
    const start = Number(segment.start);
    const end = Number(segment.end);
    return Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      currentTime >= Math.max(0, start - 0.15) &&
      currentTime < end - 0.05;
  });
}

function getSponsorSegmentKey(segment) {
  return segment.uuid || `${segment.start}-${segment.end}`;
}

function skipSponsorSegment(segment) {
  if (!sponsorVideo || !segment) return;
  if (!sponsorVideo.duration || !Number.isFinite(sponsorVideo.duration)) return;

  const key = getSponsorSegmentKey(segment);
  const target = Math.min(Number(segment.end) + 0.05, Math.max(0, sponsorVideo.duration - 0.05));
  if (!Number.isFinite(target) || target <= sponsorVideo.currentTime) return;

  sponsorVideo.currentTime = target;
  const firstSkipForSegment = !skippedSponsorSegments.has(key);
  skippedSponsorSegments.add(key);
  renderSponsorNotice(segment, "skipped");
  if (!firstSkipForSegment) return;

  const skippedSeconds = Math.max(0, (Number(segment.end) || 0) - (Number(segment.start) || 0));
  sendStats({
    sponsorSegmentsSkipped: 1,
    sponsorSecondsSkipped: skippedSeconds,
    estimatedMinutesSaved: Number((skippedSeconds / 60).toFixed(2))
  });
}

function onSponsorTimeUpdate() {
  if (!settings.sponsorBlockEnabled || !sponsorVideo || !sponsorSegments.length) return;
  if (!sponsorVideo.duration || !Number.isFinite(sponsorVideo.duration)) return;

  const segment = getActiveSponsorSegment(Number(sponsorVideo.currentTime) || 0);
  if (!segment) return;

  const key = getSponsorSegmentKey(segment);
  if ((settings.sponsorSkipMode || "auto") === "ask") {
    if (promptedSponsorSegments.has(key) || skippedSponsorSegments.has(key)) return;
    promptedSponsorSegments.add(key);
    renderSponsorNotice(segment, "ask");
    return;
  }

  skipSponsorSegment(segment);
}

function clearDislikeCountState() {
  dislikeVideoId = "";
  dislikeCountValue = null;
  dislikeFetchInFlight = false;
  dislikeCountLoaded = false;
  dislikeCountRecorded = false;
  dislikeLocalAdjustment = 0;
  dislikeLastSelected = false;
  dislikeSelectedInitialized = false;
  removeDislikeCount();
}

function setupDislikeCount(effective) {
  if (!effective.dislikeCountEnabled) {
    clearDislikeCountState();
    return;
  }

  const currentId = getCurrentWatchVideoId();
  if (!currentId) {
    clearDislikeCountState();
    return;
  }

  if (dislikeVideoId !== currentId) {
    dislikeVideoId = currentId;
    dislikeCountValue = null;
    dislikeFetchInFlight = false;
    dislikeCountLoaded = false;
    dislikeCountRecorded = false;
    dislikeLocalAdjustment = 0;
    dislikeLastSelected = false;
    dislikeSelectedInitialized = false;
    fetchDislikeCount(currentId);
  } else if (!dislikeCountLoaded && !dislikeFetchInFlight) {
    fetchDislikeCount(currentId);
  }

  renderDislikeCount();
}

async function fetchDislikeCount(videoId) {
  if (!videoId || dislikeFetchInFlight) return;
  dislikeFetchInFlight = true;
  renderDislikeCount();
  try {
    const response = await extensionApi.runtime.sendMessage({ type: "GET_DISLIKE_COUNT", videoId });
    if (dislikeVideoId !== videoId) return;
    dislikeCountValue = Number.isFinite(Number(response?.count)) ? Number(response.count) : null;
    dislikeCountLoaded = true;
    renderDislikeCount();
  } catch (_err) {
    if (dislikeVideoId === videoId) {
      dislikeCountValue = null;
      dislikeCountLoaded = true;
      renderDislikeCount();
    }
  } finally {
    dislikeFetchInFlight = false;
  }
}

function renderIntentGate() {
  renderBaseOverlayCss();
  let overlay = document.getElementById("focuslane-intent-gate");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "focuslane-intent-gate";
    overlay.className = "focuslane-overlay";

    const panel = document.createElement("div");
    panel.className = "focuslane-panel";

    const title = document.createElement("h2");
    title.textContent = "What are you here to watch?";

    const description = document.createElement("p");
    description.textContent = "Strict mode keeps open-ended browsing out of the way. Search with intention or go to subscriptions.";

    const intentInput = document.createElement("input");
    intentInput.id = "focuslane-intent-input";
    intentInput.type = "text";
    intentInput.placeholder = "Example: React router tutorial";

    const actions = document.createElement("div");
    actions.className = "focuslane-actions";

    const searchButton = document.createElement("button");
    searchButton.id = "focuslane-intent-search";
    searchButton.className = "primary";
    searchButton.textContent = "Search";

    const subsButton = document.createElement("button");
    subsButton.id = "focuslane-intent-subs";
    subsButton.textContent = "Subscriptions";

    const unlockButton = document.createElement("button");
    unlockButton.id = "focuslane-intent-unlock";
    unlockButton.textContent = "Unlock 5 min";

    actions.append(searchButton, subsButton, unlockButton);

    const unlockInput = document.createElement("input");
    unlockInput.id = "focuslane-unlock-phrase";
    unlockInput.type = "text";
    unlockInput.placeholder = "Type FOCUS to unlock";

    panel.append(title, description, intentInput, actions, unlockInput);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    overlay.querySelector("#focuslane-intent-search").addEventListener("click", () => {
      const query = overlay.querySelector("#focuslane-intent-input").value.trim();
      if (!query) return;
      setIntentSession(60);
      navigateWithinYouTube(`/results?search_query=${encodeURIComponent(query)}`);
    });

    overlay.querySelector("#focuslane-intent-subs").addEventListener("click", () => {
      setIntentSession(60);
      navigateWithinYouTube("/feed/subscriptions");
    });

    overlay.querySelector("#focuslane-intent-unlock").addEventListener("click", () => {
      const phrase = overlay.querySelector("#focuslane-unlock-phrase").value.trim().toUpperCase();
      if (phrase === "FOCUS") setTemporaryUnlock(5);
    });
  }
}

function removeIntentGate() {
  document.getElementById("focuslane-intent-gate")?.remove();
}

function renderPageNotice(title, body) {
  renderBaseOverlayCss();
  let notice = document.getElementById("focuslane-page-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "focuslane-page-notice";
    notice.className = "focuslane-overlay";

    const panel = document.createElement("div");
    panel.className = "focuslane-panel";

    const titleEl = document.createElement("h2");
    const bodyEl = document.createElement("p");

    const queryInput = document.createElement("input");
    queryInput.id = "focuslane-notice-query";
    queryInput.type = "text";
    queryInput.placeholder = "Search YouTube";

    const actions = document.createElement("div");
    actions.className = "focuslane-actions";

    const searchButton = document.createElement("button");
    searchButton.id = "focuslane-notice-search";
    searchButton.className = "primary";
    searchButton.textContent = "Search";

    const subsButton = document.createElement("button");
    subsButton.id = "focuslane-notice-subs";
    subsButton.textContent = "Subscriptions";

    actions.append(searchButton, subsButton);
    panel.append(titleEl, bodyEl, queryInput, actions);
    notice.appendChild(panel);
    document.documentElement.appendChild(notice);
    notice.querySelector("#focuslane-notice-search").addEventListener("click", () => {
      const query = notice.querySelector("#focuslane-notice-query").value.trim();
      if (query) navigateWithinYouTube(`/results?search_query=${encodeURIComponent(query)}`);
    });
    notice.querySelector("#focuslane-notice-subs").addEventListener("click", () => {
      navigateWithinYouTube("/feed/subscriptions");
    });
  }
  notice.querySelector("h2").textContent = title;
  notice.querySelector("p").textContent = body;
}

function removePageNotice() {
  document.getElementById("focuslane-page-notice")?.remove();
}

function setIntentSession(minutes) {
  runtimeState.intentUntil = Date.now() + minutes * 60 * 1000;
  extensionApi.storage.local.set({ intentUntil: runtimeState.intentUntil });
}

function setTemporaryUnlock(minutes) {
  runtimeState.unlockUntil = Date.now() + minutes * 60 * 1000;
  extensionApi.storage.local.set({ unlockUntil: runtimeState.unlockUntil });
  sendStats({ unlockCount: 1 });
  scheduleApply();
}

function setupEndGuard(effective) {
  const video = document.querySelector("video.html5-main-video, video");
  if (runtimeState.learningSessionActive && getIncompleteLearningItems().length) {
    if (currentVideoForEndGuard) {
      currentVideoForEndGuard.removeEventListener("ended", onVideoEnded);
      currentVideoForEndGuard.removeEventListener("play", removeEndGuard);
      currentVideoForEndGuard = null;
    }
    removeEndGuard();
    return;
  }
  if (!effective.endGuard || !video) {
    if (currentVideoForEndGuard) {
      currentVideoForEndGuard.removeEventListener("ended", onVideoEnded);
      currentVideoForEndGuard.removeEventListener("play", removeEndGuard);
      currentVideoForEndGuard = null;
    }
    removeEndGuard();
    return;
  }

  if (currentVideoForEndGuard !== video) {
    if (currentVideoForEndGuard) {
      currentVideoForEndGuard.removeEventListener("ended", onVideoEnded);
      currentVideoForEndGuard.removeEventListener("play", removeEndGuard);
    }
    currentVideoForEndGuard = video;
    video.addEventListener("ended", onVideoEnded);
    video.addEventListener("play", removeEndGuard);
  }
}

function onVideoEnded() {
  const effective = getActiveSettings();
  if (!effective.endGuard) return;
  renderEndGuard(effective);
}

function renderEndGuard(effective) {
  renderBaseOverlayCss();
  let overlay = document.getElementById("focuslane-end-guard");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "focuslane-end-guard";
    overlay.className = "focuslane-overlay";

    const panel = document.createElement("div");
    panel.className = "focuslane-panel";

    const title = document.createElement("h2");
    title.textContent = "Video finished";

    const text = document.createElement("p");
    text.id = "focuslane-end-text";
    text.textContent = "Choose the next intentional step.";

    const queryInput = document.createElement("input");
    queryInput.id = "focuslane-end-query";
    queryInput.type = "text";
    queryInput.placeholder = "Search for the next video";

    const actions = document.createElement("div");
    actions.className = "focuslane-actions";

    const searchButton = document.createElement("button");
    searchButton.id = "focuslane-end-search";
    searchButton.className = "primary";
    searchButton.textContent = "Search";

    const replayButton = document.createElement("button");
    replayButton.id = "focuslane-end-replay";
    replayButton.textContent = "Replay";

    const subsButton = document.createElement("button");
    subsButton.id = "focuslane-end-subs";
    subsButton.textContent = "Subscriptions";

    const closeButton = document.createElement("button");
    closeButton.id = "focuslane-end-close";
    closeButton.textContent = "Close tab";

    const cancelButton = document.createElement("button");
    cancelButton.id = "focuslane-end-cancel";
    cancelButton.textContent = "Stay here";

    actions.append(searchButton, replayButton, subsButton, closeButton, cancelButton);
    panel.append(title, text, queryInput, actions);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    overlay.querySelector("#focuslane-end-search").addEventListener("click", () => {
      const query = overlay.querySelector("#focuslane-end-query").value.trim();
      if (query) navigateWithinYouTube(`/results?search_query=${encodeURIComponent(query)}`);
    });
    overlay.querySelector("#focuslane-end-replay").addEventListener("click", () => {
      const video = document.querySelector("video.html5-main-video, video");
      if (video) {
        video.currentTime = 0;
        video.play();
      }
      removeEndGuard();
    });
    overlay.querySelector("#focuslane-end-subs").addEventListener("click", () => {
      navigateWithinYouTube("/feed/subscriptions");
    });
    overlay.querySelector("#focuslane-end-close").addEventListener("click", closeTab);
    overlay.querySelector("#focuslane-end-cancel").addEventListener("click", removeEndGuard);
  }

  overlay.querySelector("#focuslane-end-close").style.display = effective.endGuardCloseTab ? "" : "none";
  if (endGuardCloseTimer) clearTimeout(endGuardCloseTimer);
  if (effective.endGuardCloseTab) {
    let seconds = 5;
    const text = overlay.querySelector("#focuslane-end-text");
    text.textContent = `This tab will close in ${seconds} seconds unless you choose another action.`;
    endGuardCloseTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(endGuardCloseTimer);
        closeTab();
      } else {
        text.textContent = `This tab will close in ${seconds} seconds unless you choose another action.`;
      }
    }, 1000);
  }
}

function removeEndGuard() {
  document.getElementById("focuslane-end-guard")?.remove();
  if (endGuardCloseTimer) {
    clearInterval(endGuardCloseTimer);
    endGuardCloseTimer = null;
  }
}

function closeTab() {
  extensionApi.runtime.sendMessage({ type: "CLOSE_TAB" }).catch(() => {});
}

function trackFocusMinute() {
  if (document.hidden) return;
  const bucket = Math.floor(Date.now() / 60000);
  if (bucket === lastMinuteBucket) return;
  lastMinuteBucket = bucket;

  if (settings.pomodoroEnabled && runtimeState.pomodoroPhase === "break") {
    sendStats({ breakMinutes: 1 });
    return;
  }

  const effective = getActiveSettings();
  const advancedActive =
    settings.pomodoroEnabled ||
    settings.scheduleEnabled ||
    settings.focusMode === "study" ||
    settings.focusMode === "strict" ||
    effective.hideHomeFeed ||
    effective.hideWatchSidebar ||
    effective.forceAutoplayOff ||
    effective.dislikeCountEnabled ||
    isAiFilterActive(effective) ||
    effective.sponsorBlockEnabled;

  if (advancedActive && !effective.focusRelaxed) {
    sendStats({ focusMinutes: 1 });
  }
}

function applyAll() {
  applyTimer = null;
  if (isApplying) {
    scheduleApply(220);
    return;
  }
  isApplying = true;
  try {
    const effective = getActiveSettings();
    applyShorts(effective);
    applyComments(effective);
    applyDistractionSurfaces(effective);
    applyPlayerChrome(effective);
    applyVisualMode(effective);
    applyAiFilter(effective);
    const learningGateActive = applyLearningSession();
    const learningLocked = isLearningSessionLocked();
    if (!learningGateActive && !(runtimeState.learningSessionActive && runtimeState.learningSessionFindMore)) {
      applyRouteExperience(effective);
    } else if (runtimeState.learningSessionActive && runtimeState.learningSessionFindMore) {
      removeIntentGate();
      removePageNotice();
    }
    forceAutoplayOff(learningLocked ? Object.assign({}, effective, { forceAutoplayOff: true }) : effective);
    setupDislikeCount(effective);
    setupSponsorBlock(effective);
    setupEndGuard(effective);
  } finally {
    isApplying = false;
  }
}

function scheduleApply(delay = 350, force = false) {
  if (force && applyTimer) {
    clearTimeout(applyTimer);
    applyTimer = null;
  }
  if (applyTimer) return;
  applyTimer = setTimeout(applyAll, delay);
}

async function loadState() {
  const [syncState, localState] = await Promise.all([
    extensionApi.storage.sync.get(DEFAULT_SETTINGS),
    extensionApi.storage.local.get(DEFAULT_RUNTIME_STATE)
  ]);

  if (typeof syncState.aiFilterRule === "undefined" && typeof syncState.keywords !== "undefined") {
    syncState.aiFilterRule = syncState.keywords || "";
  }

  settings = Object.assign({}, DEFAULT_SETTINGS, syncState);
  runtimeState = Object.assign({}, DEFAULT_RUNTIME_STATE, localState);
  scheduleApply(120, true);
}

function startObserver() {
  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULT_SETTINGS) settings[key] = change.newValue;
      if (key === "keywords" && !settings.aiFilterRule) settings.aiFilterRule = change.newValue || "";
    }
    if (
      changes.aiFilterRule ||
      changes.filterEnabled ||
      changes.aiAllowChannels ||
      changes.aiBlockChannels ||
      changes.aiAllowKeywords ||
      changes.aiBlockKeywords ||
      changes.aiHideConfidenceThreshold
    ) {
      classifiedVideos.clear();
      clearReason("ai-filter");
    }
    scheduleApply(120, true);
  }

  if (area === "local") {
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULT_RUNTIME_STATE) runtimeState[key] = change.newValue;
    }
    if (changes.aiPreferenceVersion) {
      classifiedVideos.clear();
      clearReason("ai-filter");
    }
    scheduleApply(120, true);
  }
});

loadState()
  .then(() => {
    startLearningNavigationGuard();
    startObserver();
    setInterval(() => scheduleApply(350), 30000);
    setInterval(trackFocusMinute, 60000);
  })
  .catch(() => {});
