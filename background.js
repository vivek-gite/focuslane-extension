const extensionApi =
  globalThis.browser?.runtime?.id ? globalThis.browser :
  globalThis.chrome?.runtime?.id ? globalThis.chrome :
  null;

const SHORTS_REDIRECT_RULE_ID = 1;

let blockingEnabled = true;

const WORKER_URL = "https://focuslane-api.kytehe.workers.dev";
const CACHE_PREFIX = "vc4_";
const PREVIOUS_CACHE_PREFIX = "vc2_";
const METADATA_CACHE_PREFIX = "vc3_";
const LEGACY_CACHE_PREFIX = "vc_";
const SPONSOR_CACHE_PREFIX = "sb_";
const DISLIKE_CACHE_PREFIX = "ryd_";
const AI_FILTERED_VIDEOS_KEY = "aiFilteredVideos";
const AI_FILTERED_VIDEOS_LIMIT = 100;
const AI_USER_FEEDBACK_KEY = "aiUserFeedback";
const AI_USER_FEEDBACK_LIMIT = 100;
const AI_FEEDBACK_EXAMPLE_LIMIT = 8;
const AI_DESCRIPTION_LIMIT = 1200;
const AI_METADATA_CACHE_VERSION = "t2";
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

function getShortsRedirectRule() {
  return {
    id: SHORTS_REDIRECT_RULE_ID,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { url: "https://www.youtube.com/?focuslane=shorts-blocked" }
    },
    condition: {
      urlFilter: "||youtube.com/shorts",
      resourceTypes: ["main_frame"]
    }
  };
}

async function updateDeclarativeBlockingRule(enabled) {
  if (!extensionApi?.declarativeNetRequest?.updateDynamicRules) return false;

  try {
    await extensionApi.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [SHORTS_REDIRECT_RULE_ID],
      addRules: enabled ? [getShortsRedirectRule()] : []
    });
    return true;
  } catch (_err) {
    return false;
  }
}

function enableBlocking() {
  if (!extensionApi?.webRequest?.onBeforeRequest) return;

  extensionApi.webRequest.onBeforeRequest.removeListener(redirectShortsRequest);
  extensionApi.webRequest.onBeforeRequest.addListener(
    redirectShortsRequest,
    { urls: ["*://*.youtube.com/shorts*"], types: ["main_frame"] },
    ["blocking"]
  );
}

function disableBlocking() {
  if (!extensionApi?.webRequest?.onBeforeRequest) return;

  extensionApi.webRequest.onBeforeRequest.removeListener(redirectShortsRequest);
}

async function updateBlockingRule(enabled) {
  blockingEnabled = enabled;
  if (await updateDeclarativeBlockingRule(enabled)) return;

  if (enabled) {
    enableBlocking();
  } else {
    disableBlocking();
  }
}

async function ensureDefaultSettings() {
  const current = await extensionApi.storage.sync.get(null);
  const updates = {};

  for (const [key, value] of Object.entries(DEFAULT_SYNC_SETTINGS)) {
    if (typeof current[key] === "undefined") updates[key] = value;
  }

  if (typeof current.aiFilterRule === "undefined" && typeof current.keywords !== "undefined") {
    updates.aiFilterRule = current.keywords || "";
  }

  if (current.settingsVersion !== 2) updates.settingsVersion = 2;

  if (Object.keys(updates).length > 0) {
    await extensionApi.storage.sync.set(updates);
  }

  const merged = Object.assign({}, DEFAULT_SYNC_SETTINGS, current, updates);
  await updateBlockingRule(shouldRedirectShorts(merged));
  return merged;
}

async function refreshBlockingFromStorage() {
  const settings = await extensionApi.storage.sync.get(DEFAULT_SYNC_SETTINGS);
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

function normalizeAiMetadataText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function aiMetadataText(video) {
  return [
    video?.title,
    video?.channel,
    video?.description
  ].map(normalizeAiMetadataText).filter(Boolean).join(" ").toLowerCase();
}

function normalizeAiThreshold(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SYNC_SETTINGS.aiHideConfidenceThreshold;
  return Math.max(0.5, Math.min(0.95, number));
}

function metadataHash(video) {
  return hashString([
    normalizeAiMetadataText(video?.title),
    normalizeAiMetadataText(video?.channel),
    normalizeAiMetadataText(video?.description)
  ].join("\n"));
}

function cacheKey(video, filterRule, preferenceSignature = "") {
  const id = typeof video === "string" ? video : video?.id;
  const metadataPart = typeof video === "string" ? "" : `_${metadataHash(video)}`;
  const preferencePart = preferenceSignature ? `_${preferenceSignature}` : "";
  return `${CACHE_PREFIX}${hashString(filterRule)}_${id}${metadataPart}${preferencePart}`;
}

function getPreferenceSignature(settings, feedbackVersion) {
  return hashString(JSON.stringify({
    allowChannels: settings.aiAllowChannels || "",
    blockChannels: settings.aiBlockChannels || "",
    allowKeywords: settings.aiAllowKeywords || "",
    blockKeywords: settings.aiBlockKeywords || "",
    threshold: normalizeAiThreshold(settings.aiHideConfidenceThreshold),
    feedbackVersion: Number(feedbackVersion) || 0
  }));
}

async function getCachedResults(videos, filterRule, preferenceSignature) {
  if (!videos.length) return { results: {}, decisions: {}, uncachedVideos: [] };
  const keys = videos.map((video) => cacheKey(video, filterRule, preferenceSignature));
  const cached = await extensionApi.storage.local.get(keys);
  const results = {};
  const decisions = {};
  const uncachedVideos = [];
  const now = Date.now();

  for (const video of videos) {
    const videoId = video.id;
    const entry = cached[cacheKey(video, filterRule, preferenceSignature)];
    if (entry && now - entry.timestamp < CACHE_EXPIRY_MS) {
      results[videoId] = entry.relevant;
      if (entry.decision) decisions[videoId] = entry.decision;
    } else {
      uncachedVideos.push(video);
    }
  }

  return { results, decisions, uncachedVideos };
}

async function cacheResults(classifications, decisions, videos, filterRule, preferenceSignature) {
  const toStore = {};
  const now = Date.now();
  for (const video of videos) {
    const relevant = classifications[video.id];
    if (typeof relevant === "boolean") {
      toStore[cacheKey(video, filterRule, preferenceSignature)] = {
        relevant,
        decision: decisions?.[video.id] || null,
        timestamp: now
      };
    }
  }
  await extensionApi.storage.local.set(toStore);
}

async function classifyWithBackend(titles, filterRule, preferenceProfile) {
  try {
    const response = await fetch(`${WORKER_URL}/api/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles, filterRule, preferenceProfile })
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.error) return null;
    return {
      results: data.results || null,
      decisions: data.decisions || {}
    };
  } catch (_err) {
    return null;
  }
}

function truncateAiMetadata(value, limit) {
  return normalizeAiMetadataText(value).slice(0, limit);
}

function readYouTubeText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("");
  return "";
}

function extractBalancedJson(text, start) {
  const open = text.indexOf("{", start);
  if (open === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }

  return null;
}

function extractInitialPlayerResponse(html) {
  const markers = [
    "ytInitialPlayerResponse =",
    "ytInitialPlayerResponse="
  ];

  for (const marker of markers) {
    const index = html.indexOf(marker);
    if (index === -1) continue;
    const json = extractBalancedJson(html, index + marker.length);
    if (!json) continue;
    try {
      return JSON.parse(json);
    } catch (_err) {
      return null;
    }
  }

  return null;
}

function extractPlayerDescription(playerResponse) {
  const videoDetails = playerResponse?.videoDetails || {};
  const microformat = playerResponse?.microformat?.playerMicroformatRenderer || {};
  return truncateAiMetadata(
    videoDetails.shortDescription ||
      readYouTubeText(microformat.description) ||
      readYouTubeText(microformat.attributedDescription),
    AI_DESCRIPTION_LIMIT
  );
}

async function fetchYouTubeVideoMetadata(videoId) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId || "")) return null;
  const key = `${METADATA_CACHE_PREFIX}${AI_METADATA_CACHE_VERSION}_${videoId}`;
  const cached = await extensionApi.storage.local.get({ [key]: null });
  const entry = cached[key];
  const now = Date.now();
  if (entry && now - Number(entry.timestamp || 0) < CACHE_EXPIRY_MS) {
    return entry.metadata || null;
  }

  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: { Accept: "text/html" }
    });
    if (!response.ok) return null;

    const html = await response.text();
    const playerResponse = extractInitialPlayerResponse(html);
    if (!playerResponse) return null;

    const metadata = {
      channel: truncateAiMetadata(playerResponse.videoDetails?.author, 160),
      description: extractPlayerDescription(playerResponse)
    };
    await extensionApi.storage.local.set({ [key]: { metadata, timestamp: now } });
    return metadata;
  } catch (_err) {
    return null;
  }
}

async function enrichVideoMetadata(video) {
  if (video.channel && video.description) return video;

  const metadata = await fetchYouTubeVideoMetadata(video.id);
  if (!metadata) return video;

  return Object.assign({}, video, {
    channel: video.channel || metadata.channel || "",
    description: video.description || metadata.description || ""
  });
}

async function enrichVideosMetadata(videos) {
  return Promise.all(videos.map((video) => enrichVideoMetadata(video)));
}

function buildDecision(show, confidence, reason, source) {
  return {
    show: Boolean(show),
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    reason: String(reason || "").slice(0, 240),
    source: source || "ai"
  };
}

function metadataContainsAny(video, terms) {
  if (!terms.length) return "";
  const text = aiMetadataText(video);
  return terms.find((term) => text.includes(term)) || "";
}

function channelMatchesAny(video, terms) {
  if (!terms.length) return "";
  const channel = normalizeAiMetadataText(video?.channel).toLowerCase();
  return terms.find((term) => channel && channel.includes(term)) || "";
}

function correctionMatches(video, filterRule, correction) {
  if (!correction) return false;
  const sameRule = hashString(correction.filterRule || "") === hashString(filterRule || "");
  if (!sameRule) return false;
  if (correction.id && correction.id === video.id) return true;
  const correctionChannel = normalizeAiMetadataText(correction.channel).toLowerCase();
  const videoChannel = normalizeAiMetadataText(video.channel).toLowerCase();
  return Boolean(correctionChannel && videoChannel && correctionChannel === videoChannel);
}

function applyUserDecision(video, filterRule, settings, feedback) {
  const corrections = Array.isArray(feedback?.items) ? feedback.items : [];
  const correction = corrections.find((item) => correctionMatches(video, filterRule, item));
  if (correction?.action === "show") {
    return buildDecision(true, 1, "User restored a similar hidden video.", "feedback");
  }
  if (correction?.action === "hide") {
    return buildDecision(false, 1, "User hid a similar video.", "feedback");
  }

  const allowChannel = channelMatchesAny(video, parseList(settings.aiAllowChannels));
  if (allowChannel) {
    return buildDecision(true, 1, `Allowed channel: ${allowChannel}.`, "override");
  }

  const allowKeyword = metadataContainsAny(video, parseList(settings.aiAllowKeywords));
  if (allowKeyword) {
    return buildDecision(true, 1, `Allowed keyword: ${allowKeyword}.`, "override");
  }

  const blockChannel = channelMatchesAny(video, parseList(settings.aiBlockChannels));
  if (blockChannel) {
    return buildDecision(false, 1, `Blocked channel: ${blockChannel}.`, "override");
  }

  const blockKeyword = metadataContainsAny(video, parseList(settings.aiBlockKeywords));
  if (blockKeyword) {
    return buildDecision(false, 1, `Blocked keyword: ${blockKeyword}.`, "override");
  }

  return null;
}

function tokenOverlapScore(video, feedbackItem) {
  const text = aiMetadataText(video);
  const tokens = aiMetadataText(feedbackItem).split(/\s+/).filter((token) => token.length >= 4);
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of new Set(tokens)) {
    if (text.includes(token)) score++;
  }
  const sameChannel = normalizeAiMetadataText(video.channel).toLowerCase() &&
    normalizeAiMetadataText(video.channel).toLowerCase() === normalizeAiMetadataText(feedbackItem.channel).toLowerCase();
  return score + (sameChannel ? 4 : 0);
}

function selectFeedbackExamples(videos, filterRule, feedback) {
  const items = Array.isArray(feedback?.items) ? feedback.items : [];
  return items
    .filter((item) => hashString(item.filterRule || "") === hashString(filterRule || ""))
    .map((item) => ({
      item,
      score: Math.max(...videos.map((video) => tokenOverlapScore(video, item)), 0)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || Number(b.item.timestamp || 0) - Number(a.item.timestamp || 0))
    .slice(0, AI_FEEDBACK_EXAMPLE_LIMIT)
    .map(({ item }) => ({
      action: item.action === "hide" ? "hide" : "show",
      title: item.title || "",
      channel: item.channel || "",
      reason: item.reason || ""
    }));
}

async function getAiPreferenceState() {
  const [syncSettings, localState] = await Promise.all([
    extensionApi.storage.sync.get(DEFAULT_SYNC_SETTINGS),
    extensionApi.storage.local.get({ [AI_USER_FEEDBACK_KEY]: [], aiPreferenceVersion: 0 })
  ]);
  return {
    settings: Object.assign({}, DEFAULT_SYNC_SETTINGS, syncSettings || {}),
    feedback: {
      version: Number(localState.aiPreferenceVersion) || 0,
      items: Array.isArray(localState[AI_USER_FEEDBACK_KEY]) ? localState[AI_USER_FEEDBACK_KEY] : []
    }
  };
}

async function handleClassifyVideos(message) {
  const { titles, filterRule } = message;

  if (!titles || !titles.length || !hasUsableAiFilterRule(filterRule)) {
    return { results: {}, decisions: {}, error: null };
  }

  const videos = titles
    .filter((t) => t?.id)
    .map((t) => ({
      id: t.id,
      title: t.title || "",
      channel: t.channel || "",
      description: t.description || ""
    }));
  if (!videos.length) return { results: {}, decisions: {}, error: null };

  const enrichedVideos = await enrichVideosMetadata(videos);
  const { settings: aiSettings, feedback } = await getAiPreferenceState();
  const preferenceSignature = getPreferenceSignature(aiSettings, feedback.version);
  const results = {};
  const decisions = {};
  const needsAi = [];

  for (const video of enrichedVideos) {
    const userDecision = applyUserDecision(video, filterRule, aiSettings, feedback);
    if (userDecision) {
      results[video.id] = userDecision.show;
      decisions[video.id] = userDecision;
    } else {
      needsAi.push(video);
    }
  }

  const { results: cachedResults, decisions: cachedDecisions, uncachedVideos } = await getCachedResults(needsAi, filterRule, preferenceSignature);
  Object.assign(results, cachedResults);
  Object.assign(decisions, cachedDecisions);

  if (uncachedVideos.length === 0) {
    return { results, decisions, error: null };
  }

  const preferenceProfile = {
    hideConfidenceThreshold: normalizeAiThreshold(aiSettings.aiHideConfidenceThreshold),
    examples: selectFeedbackExamples(uncachedVideos, filterRule, feedback)
  };
  const apiResponse = await classifyWithBackend(uncachedVideos, filterRule, preferenceProfile);

  if (apiResponse === null || apiResponse.results === null) {
    const fallback = {};
    const fallbackDecisions = {};
    for (const video of uncachedVideos) {
      fallback[video.id] = true;
      fallbackDecisions[video.id] = buildDecision(true, 0, "AI classification unavailable.", "fallback");
    }
    return {
      results: Object.assign({}, results, fallback),
      decisions: Object.assign({}, decisions, fallbackDecisions),
      error: "api_error"
    };
  }

  await cacheResults(apiResponse.results, apiResponse.decisions, uncachedVideos, filterRule, preferenceSignature);
  return {
    results: Object.assign({}, results, apiResponse.results),
    decisions: Object.assign({}, decisions, apiResponse.decisions),
    error: null
  };
}

async function handleClearCache() {
  const allStorage = await extensionApi.storage.local.get(null);
  const cacheKeys = Object.keys(allStorage).filter(
    (key) => key.startsWith(CACHE_PREFIX) ||
      key.startsWith(METADATA_CACHE_PREFIX) ||
      key.startsWith(PREVIOUS_CACHE_PREFIX) ||
      key.startsWith(LEGACY_CACHE_PREFIX) ||
      key.startsWith(SPONSOR_CACHE_PREFIX) ||
      key.startsWith(DISLIKE_CACHE_PREFIX)
  );
  if (cacheKeys.length > 0) await extensionApi.storage.local.remove(cacheKeys);
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
  const cached = await extensionApi.storage.local.get({ [key]: null });
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
      await extensionApi.storage.local.set({ [key]: { segments: [], timestamp: now } });
      return { segments: [], error: null };
    }
    if (!response.ok) return { segments: [], error: `http_${response.status}` };

    const segments = normalizeSponsorSegments(await response.json());
    await extensionApi.storage.local.set({ [key]: { segments, timestamp: now } });
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
  const cached = await extensionApi.storage.local.get({ [key]: null });
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
      await extensionApi.storage.local.set({ [key]: { count: null, timestamp: now } });
      return { count: null, error: null };
    }
    if (!response.ok) return { count: null, error: `http_${response.status}` };

    const data = await response.json();
    const count = Number(data.dislikes);
    const normalized = Number.isFinite(count) && count >= 0 ? Math.round(count) : null;
    await extensionApi.storage.local.set({ [key]: { count: normalized, timestamp: now } });
    return { count: normalized, error: null };
  } catch (_err) {
    return { count: null, error: "api_error" };
  }
}

async function incrementStats(delta) {
  const storageKey = `stats_${getTodayKey()}`;
  const result = await extensionApi.storage.local.get({ [storageKey]: STATS_DEFAULT });
  const current = Object.assign({}, STATS_DEFAULT, result[storageKey] || {});
  for (const [key, value] of Object.entries(delta || {})) {
    const amount = Number(value) || 0;
    current[key] = (Number(current[key]) || 0) + amount;
  }
  await extensionApi.storage.local.set({ [storageKey]: current });
  return current;
}

function normalizeFilteredVideo(item, timestamp) {
  const id = String(item?.id || "").trim();
  const title = String(item?.title || "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id) || !title) return null;
  return {
    id,
    title,
    channel: String(item?.channel || "").trim(),
    description: String(item?.description || "").trim(),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    reason: String(item?.reason || "").trim(),
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

  const state = await extensionApi.storage.local.get({ [AI_FILTERED_VIDEOS_KEY]: [] });
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

  await extensionApi.storage.local.set({ [AI_FILTERED_VIDEOS_KEY]: merged });
  return { success: true, count: nextItems.length };
}

function normalizeFeedbackItem(item, timestamp) {
  const id = String(item?.id || "").trim();
  const title = String(item?.title || "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id) || !title) return null;
  return {
    id,
    title,
    channel: String(item?.channel || "").trim(),
    description: String(item?.description || "").trim(),
    filterRule: String(item?.filterRule || "").trim(),
    action: item?.action === "hide" ? "hide" : "show",
    reason: String(item?.reason || "").trim(),
    timestamp
  };
}

async function recordAiFeedback(item) {
  const timestamp = Date.now();
  const nextItem = normalizeFeedbackItem(item, timestamp);
  if (!nextItem) return { success: false, error: "invalid_feedback" };

  const state = await extensionApi.storage.local.get({ [AI_USER_FEEDBACK_KEY]: [], aiPreferenceVersion: 0 });
  const previous = Array.isArray(state[AI_USER_FEEDBACK_KEY]) ? state[AI_USER_FEEDBACK_KEY] : [];
  const seen = new Set();
  const merged = [];

  for (const entry of [nextItem, ...previous]) {
    const key = `${entry.action}:${hashString(entry.filterRule)}:${entry.id}:${entry.channel.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
    if (merged.length >= AI_USER_FEEDBACK_LIMIT) break;
  }

  const aiPreferenceVersion = (Number(state.aiPreferenceVersion) || 0) + 1;
  await extensionApi.storage.local.set({
    [AI_USER_FEEDBACK_KEY]: merged,
    aiPreferenceVersion
  });

  return { success: true, count: merged.length, aiPreferenceVersion };
}

async function getStats() {
  const allStorage = await extensionApi.storage.local.get(null);
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
    await extensionApi.tabs.remove(sender.tab.id);
    return { success: true };
  }
  return { success: false, error: "No sender tab" };
}

extensionApi.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings();
});

extensionApi.runtime.onStartup.addListener(() => {
  ensureDefaultSettings();
});

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && Object.keys(changes).some((key) => key in DEFAULT_SYNC_SETTINGS)) {
    refreshBlockingFromStorage();
  }
});

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.type === "RECORD_AI_FEEDBACK") {
    recordAiFeedback(message.feedback)
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
