let blockingEnabled = true;

const WORKER_URL = "https://focuslane-api.kytehe.workers.dev";
const CACHE_PREFIX = "vc2_";
const LEGACY_CACHE_PREFIX = "vc_";
const SPONSOR_CACHE_PREFIX = "sb_";
const DISLIKE_CACHE_PREFIX = "ryd_";
const AI_FILTERED_VIDEOS_KEY = "aiFilteredVideos";
const AI_FILTERED_VIDEOS_LIMIT = 100;
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const SPONSOR_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const DISLIKE_CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000;
const AI_FILTER_MIN_WORDS = 1;

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

const DEFAULT_SYNC_SETTINGS = {
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

const STATS_DEFAULT = {
  shortsBlocked: 0,
  recommendationsHidden: 0,
  aiFiltered: 0,
  videosFiltered: 0,
  focusMinutes: 0,
  breakMinutes: 0,
  unlockCount: 0,
  estimatedMinutesSaved: 0,
  learningVideosAdded: 0,
  learningVideosCompleted: 0,
  learningSessionsCompleted: 0,
  sponsorSegmentsSkipped: 0,
  sponsorSecondsSkipped: 0,
  dislikeCountsShown: 0
};

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function mergeDefaults(base, defaults) {
  return Object.assign({}, defaults, base || {});
}

function getEffectiveSettings(settings) {
  const mode = settings.focusMode || "minimal";
  if (mode === "custom") return mergeDefaults(settings, DEFAULT_SYNC_SETTINGS);
  const preset = MODE_PRESETS[mode] || MODE_PRESETS.minimal;
  return Object.assign({}, DEFAULT_SYNC_SETTINGS, settings, preset);
}

function shouldRedirectShorts(settings) {
  return getEffectiveSettings(settings).shortsBlocked === true;
}

function redirectShortsRequest(details) {
  if (blockingEnabled && details.url.includes("youtube.com/shorts")) {
    return { redirectUrl: "https://www.youtube.com/?focuslane=shorts-blocked" };
  }
  return {};
}

function enableBlocking() {
  browser.webRequest.onBeforeRequest.removeListener(redirectShortsRequest);
  browser.webRequest.onBeforeRequest.addListener(
    redirectShortsRequest,
    { urls: ["*://*.youtube.com/shorts*"], types: ["main_frame"] },
    ["blocking"]
  );
}

function disableBlocking() {
  browser.webRequest.onBeforeRequest.removeListener(redirectShortsRequest);
}

async function updateBlockingRule(enabled) {
  blockingEnabled = enabled;
  if (enabled) {
    enableBlocking();
  } else {
    disableBlocking();
  }
}

async function ensureDefaultSettings() {
  const current = await browser.storage.sync.get(null);
  const updates = {};

  for (const [key, value] of Object.entries(DEFAULT_SYNC_SETTINGS)) {
    if (typeof current[key] === "undefined") updates[key] = value;
  }

  if (typeof current.aiFilterRule === "undefined" && typeof current.keywords !== "undefined") {
    updates.aiFilterRule = current.keywords || "";
  }

  if (current.settingsVersion !== 2) updates.settingsVersion = 2;

  if (Object.keys(updates).length > 0) {
    await browser.storage.sync.set(updates);
  }

  const merged = Object.assign({}, DEFAULT_SYNC_SETTINGS, current, updates);
  await updateBlockingRule(shouldRedirectShorts(merged));
  return merged;
}

async function refreshBlockingFromStorage() {
  const settings = await browser.storage.sync.get(DEFAULT_SYNC_SETTINGS);
  await updateBlockingRule(shouldRedirectShorts(settings));
}

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

function cacheKey(videoId, filterRule) {
  return `${CACHE_PREFIX}${hashString(filterRule)}_${videoId}`;
}

async function getCachedResults(videoIds, filterRule) {
  const keys = videoIds.map((id) => cacheKey(id, filterRule));
  const cached = await browser.storage.local.get(keys);
  const results = {};
  const uncachedIds = [];
  const now = Date.now();

  for (const videoId of videoIds) {
    const entry = cached[cacheKey(videoId, filterRule)];
    if (entry && now - entry.timestamp < CACHE_EXPIRY_MS) {
      results[videoId] = entry.relevant;
    } else {
      uncachedIds.push(videoId);
    }
  }

  return { results, uncachedIds };
}

async function cacheResults(classifications, filterRule) {
  const toStore = {};
  const now = Date.now();
  for (const [videoId, relevant] of Object.entries(classifications)) {
    toStore[cacheKey(videoId, filterRule)] = { relevant, timestamp: now };
  }
  await browser.storage.local.set(toStore);
}

async function classifyWithBackend(titles, filterRule) {
  try {
    const response = await fetch(`${WORKER_URL}/api/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles, filterRule })
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.error) return null;
    return data.results || null;
  } catch (_err) {
    return null;
  }
}

async function handleClassifyVideos(message) {
  const { titles, filterRule } = message;

  if (!titles || !titles.length || !hasUsableAiFilterRule(filterRule)) {
    return { results: {}, error: null };
  }

  const videoIds = titles.map((t) => t.id);
  const { results: cachedResults, uncachedIds } = await getCachedResults(videoIds, filterRule);

  if (uncachedIds.length === 0) {
    return { results: cachedResults, error: null };
  }

  const uncachedTitles = titles.filter((t) => uncachedIds.includes(t.id));
  const apiResults = await classifyWithBackend(uncachedTitles, filterRule);

  if (apiResults === null) {
    const fallback = {};
    for (const id of uncachedIds) fallback[id] = true;
    return { results: Object.assign({}, cachedResults, fallback), error: "api_error" };
  }

  await cacheResults(apiResults, filterRule);
  return { results: Object.assign({}, cachedResults, apiResults), error: null };
}

async function handleClearCache() {
  const allStorage = await browser.storage.local.get(null);
  const cacheKeys = Object.keys(allStorage).filter(
    (key) => key.startsWith(CACHE_PREFIX) ||
      key.startsWith(LEGACY_CACHE_PREFIX) ||
      key.startsWith(SPONSOR_CACHE_PREFIX) ||
      key.startsWith(DISLIKE_CACHE_PREFIX)
  );
  if (cacheKeys.length > 0) await browser.storage.local.remove(cacheKeys);
  return { success: true, count: cacheKeys.length };
}

function sponsorCacheKey(videoId) {
  return `${SPONSOR_CACHE_PREFIX}${videoId}`;
}

function normalizeSponsorSegments(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const segment = Array.isArray(item.segment) ? item.segment : [];
      const start = Number(segment[0]);
      const end = Number(segment[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return {
        start,
        end,
        uuid: String(item.UUID || ""),
        category: item.category || "sponsor",
        actionType: item.actionType || "skip"
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

async function handleGetSponsorSegments(message) {
  const videoId = String(message.videoId || "");
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return { segments: [], error: "invalid_video_id" };

  const key = sponsorCacheKey(videoId);
  const cached = await browser.storage.local.get({ [key]: null });
  const entry = cached[key];
  const now = Date.now();
  if (entry && now - Number(entry.timestamp || 0) < SPONSOR_CACHE_EXPIRY_MS) {
    return { segments: entry.segments || [], error: null, cached: true };
  }

  const params = new URLSearchParams({
    videoID: videoId,
    category: "sponsor",
    actionType: "skip",
    service: "YouTube"
  });

  try {
    const response = await fetch(`https://sponsor.ajay.app/api/skipSegments?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });

    if (response.status === 404) {
      await browser.storage.local.set({ [key]: { segments: [], timestamp: now } });
      return { segments: [], error: null };
    }
    if (!response.ok) return { segments: [], error: `http_${response.status}` };

    const segments = normalizeSponsorSegments(await response.json());
    await browser.storage.local.set({ [key]: { segments, timestamp: now } });
    return { segments, error: null };
  } catch (_err) {
    return { segments: [], error: "api_error" };
  }
}

function dislikeCacheKey(videoId) {
  return `${DISLIKE_CACHE_PREFIX}${videoId}`;
}

async function handleGetDislikeCount(message) {
  const videoId = String(message.videoId || "");
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return { count: null, error: "invalid_video_id" };
  }

  const key = dislikeCacheKey(videoId);
  const cached = await browser.storage.local.get({ [key]: null });
  const entry = cached[key];
  const now = Date.now();
  if (entry && now - Number(entry.timestamp || 0) < DISLIKE_CACHE_EXPIRY_MS) {
    return { count: entry.count, error: null, cached: true };
  }

  try {
    const params = new URLSearchParams({ videoId });
    const response = await fetch(`https://returnyoutubedislikeapi.com/votes?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });

    if (response.status === 404) {
      await browser.storage.local.set({ [key]: { count: null, timestamp: now } });
      return { count: null, error: null };
    }
    if (!response.ok) return { count: null, error: `http_${response.status}` };

    const data = await response.json();
    const count = Number(data.dislikes);
    const normalized = Number.isFinite(count) && count >= 0 ? Math.round(count) : null;
    await browser.storage.local.set({ [key]: { count: normalized, timestamp: now } });
    return { count: normalized, error: null };
  } catch (_err) {
    return { count: null, error: "api_error" };
  }
}

async function incrementStats(delta) {
  const storageKey = `stats_${getTodayKey()}`;
  const result = await browser.storage.local.get({ [storageKey]: STATS_DEFAULT });
  const current = Object.assign({}, STATS_DEFAULT, result[storageKey] || {});
  for (const [key, value] of Object.entries(delta || {})) {
    const amount = Number(value) || 0;
    current[key] = (Number(current[key]) || 0) + amount;
  }
  await browser.storage.local.set({ [storageKey]: current });
  return current;
}

function normalizeFilteredVideo(item, timestamp) {
  const id = String(item?.id || "").trim();
  const title = String(item?.title || "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id) || !title) return null;
  return {
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    filterRule: String(item?.filterRule || "").trim(),
    timestamp
  };
}

async function recordAiFilteredVideos(videos, filterRule) {
  const timestamp = Date.now();
  const nextItems = (Array.isArray(videos) ? videos : [])
    .map((video) => normalizeFilteredVideo(Object.assign({}, video, { filterRule }), timestamp))
    .filter(Boolean);

  if (!nextItems.length) return { success: true, count: 0 };

  const state = await browser.storage.local.get({ [AI_FILTERED_VIDEOS_KEY]: [] });
  const previous = Array.isArray(state[AI_FILTERED_VIDEOS_KEY]) ? state[AI_FILTERED_VIDEOS_KEY] : [];
  const seen = new Set();
  const merged = [];

  for (const item of [...nextItems, ...previous]) {
    const key = `${item.id}:${item.filterRule || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= AI_FILTERED_VIDEOS_LIMIT) break;
  }

  await browser.storage.local.set({ [AI_FILTERED_VIDEOS_KEY]: merged });
  return { success: true, count: nextItems.length };
}

async function getStats() {
  const allStorage = await browser.storage.local.get(null);
  const statsKeys = Object.keys(allStorage).filter((key) => key.startsWith("stats_"));
  const today = getTodayKey();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const filteredVideos = Array.isArray(allStorage[AI_FILTERED_VIDEOS_KEY]) ? allStorage[AI_FILTERED_VIDEOS_KEY] : [];

  const todayStats = Object.assign({}, STATS_DEFAULT);
  const weekStats = Object.assign({}, STATS_DEFAULT);
  const allTimeStats = Object.assign({}, STATS_DEFAULT);

  for (const key of statsKeys) {
    const date = key.replace("stats_", "");
    const data = Object.assign({}, STATS_DEFAULT, allStorage[key] || {});

    for (const statKey of Object.keys(STATS_DEFAULT)) {
      allTimeStats[statKey] += Number(data[statKey]) || 0;
      if (date >= weekAgo) weekStats[statKey] += Number(data[statKey]) || 0;
      if (date === today) todayStats[statKey] += Number(data[statKey]) || 0;
    }
  }

  const videosByPeriod = {
    today: [],
    week: [],
    allTime: []
  };

  filteredVideos.forEach((video) => {
    const date = new Date(Number(video.timestamp) || 0).toISOString().slice(0, 10);
    if (date === today) videosByPeriod.today.push(video);
    if (date >= weekAgo) videosByPeriod.week.push(video);
    videosByPeriod.allTime.push(video);
  });

  return { today: todayStats, week: weekStats, allTime: allTimeStats, filteredVideos: videosByPeriod };
}

async function closeSenderTab(sender) {
  if (sender?.tab?.id) {
    await browser.tabs.remove(sender.tab.id);
    return { success: true };
  }
  return { success: false, error: "No sender tab" };
}

browser.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings();
});

browser.runtime.onStartup.addListener(() => {
  ensureDefaultSettings();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && Object.keys(changes).some((key) => key in DEFAULT_SYNC_SETTINGS)) {
    refreshBlockingFromStorage();
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_BLOCKING") {
    updateBlockingRule(message.enabled)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CLASSIFY_VIDEOS") {
    handleClassifyVideos(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ results: {}, error: err.message }));
    return true;
  }

  if (message.type === "GET_SPONSOR_SEGMENTS") {
    handleGetSponsorSegments(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ segments: [], error: err.message }));
    return true;
  }

  if (message.type === "GET_DISLIKE_COUNT") {
    handleGetDislikeCount(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ count: null, error: err.message }));
    return true;
  }

  if (message.type === "CLEAR_CACHE") {
    handleClearCache()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ success: false, count: 0 }));
    return true;
  }

  if (message.type === "INCREMENT_STATS") {
    incrementStats(message.delta)
      .then((result) => sendResponse({ success: true, stats: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "RECORD_AI_FILTERED_VIDEOS") {
    recordAiFilteredVideos(message.videos, message.filterRule)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_STATS") {
    getStats()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ today: STATS_DEFAULT, week: STATS_DEFAULT, allTime: STATS_DEFAULT }));
    return true;
  }

  if (message.type === "CLOSE_TAB") {
    closeSenderTab(sender)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

ensureDefaultSettings();
