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

const AI_FILTER_MIN_WORDS = 1;
const AI_FILTER_HISTORY_KEY = "aiFilterRuleHistory";
const AI_FILTER_HISTORY_LIMIT = 5;
const FRONTEND_DISABLED_SETTINGS = {
  endGuard: false,
  endGuardCloseTab: false,
  intentGate: false
};
const SVG_NS = "http://www.w3.org/2000/svg";

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

const TOGGLES = [
  ["shortsBlocked", "Block Shorts", "Hide shelves, cards, sidebar entry, and direct Shorts pages."],
  ["commentsHidden", "Hide Comments", "Remove comment sections and comment teasers."],
  ["hideHomeFeed", "Hide Home Feed", "Replace the homepage with an intentional search prompt."],
  ["hideWatchSidebar", "Hide Watch Sidebar", "Remove recommended videos beside a playing video."],
  ["hideEndScreens", "Hide End Screens", "Remove end cards and video wall recommendations."],
  ["hideInfoCards", "Hide Info Cards", "Remove in-player cards and teasers."],
  ["hideExplore", "Hide Explore", "Hide Explore, Trending, Gaming, and Live routes."],
  ["hidePlayables", "Hide Playables", "Hide YouTube games and playables links."],
  ["hideCommunityPosts", "Hide Community Posts", "Remove posts and mixed feed community blocks."],
  ["hideLiveChat", "Hide Live Chat", "Remove live chat from watch pages."],
  ["hideNotifications", "Hide Notifications", "Hide notification entry points."],
  ["forceAutoplayOff", "Force Autoplay Off", "Turn off YouTube autoplay when it appears."]
];

let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
let currentStats = null;
let activeStatsPeriod = "today";
let aiFilterRuleHistory = [];
let autoSaveTimer = null;

const focusMode = document.getElementById("focusMode");
const toggleList = document.getElementById("toggleList");
const dislikeCountEnabled = document.getElementById("dislikeCountEnabled");
const learningStackEnabled = document.getElementById("learningStackEnabled");
const aiFilterRule = document.getElementById("aiFilterRule");
const aiFilterRuleHint = document.getElementById("aiFilterRuleHint");
const aiFilterHistory = document.getElementById("aiFilterHistory");
const sponsorBlockEnabled = document.getElementById("sponsorBlockEnabled");
const sponsorSkipMode = document.getElementById("sponsorSkipMode");
const scheduleEnabled = document.getElementById("scheduleEnabled");
const scheduleStart = document.getElementById("scheduleStart");
const scheduleEnd = document.getElementById("scheduleEnd");
const scheduleDays = document.getElementById("scheduleDays");
const pomodoroEnabled = document.getElementById("pomodoroEnabled");
const pomodoroFocusMinutes = document.getElementById("pomodoroFocusMinutes");
const pomodoroBreakMinutes = document.getElementById("pomodoroBreakMinutes");
const saveBtn = document.getElementById("saveBtn");
const statusLines = document.querySelectorAll(".status-line");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const statusCard = document.getElementById("statusCard");
const modeIconWrap = document.getElementById("modeIconWrap");
const modeStatus = document.getElementById("modeStatus");
const detailStatus = document.getElementById("detailStatus");
const unlockPhrase = document.getElementById("unlockPhrase");
const unlockStatus = document.getElementById("unlockStatus");
const aiFilteredVideoList = document.getElementById("aiFilteredVideoList");

const MODE_ICONS = {
  minimal: [
    ["circle", { cx: "12", cy: "12", r: "7" }],
    ["circle", { cx: "12", cy: "12", r: "2" }],
    ["path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" }]
  ],
  study: [
    ["path", { d: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z" }],
    ["path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }],
    ["path", { d: "M8 7h8" }]
  ],
  strict: [
    ["rect", { x: "5", y: "10", width: "14", height: "10", rx: "2" }],
    ["path", { d: "M8 10V7a4 4 0 0 1 8 0v3" }],
    ["path", { d: "M12 14v2" }]
  ],
  custom: [
    ["path", { d: "M4 7h7M15 7h5" }],
    ["circle", { cx: "13", cy: "7", r: "2" }],
    ["path", { d: "M4 12h12M20 12h0" }],
    ["circle", { cx: "18", cy: "12", r: "2" }],
    ["path", { d: "M4 17h4M12 17h8" }],
    ["circle", { cx: "10", cy: "17", r: "2" }]
  ]
};

function getEffectiveSettings(settings) {
  const base = disableFrontendSettings(Object.assign({}, DEFAULT_SETTINGS, settings || {}));
  if (base.focusMode === "custom") return base;
  return disableFrontendSettings(Object.assign({}, base, MODE_PRESETS[base.focusMode] || MODE_PRESETS.minimal));
}

function disableFrontendSettings(settings) {
  return Object.assign({}, settings || {}, FRONTEND_DISABLED_SETTINGS);
}

function setMessage(message, type = "") {
  statusLines.forEach((line) => {
    line.textContent = message;
    line.className = "status-line" + (type ? ` ${type}` : "");
  });
}

function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function wireModeSegmentControl() {
  const modeButtons = document.querySelectorAll("#modeSegControl .mode-btn");

  function syncModeButtons(value) {
    modeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === value);
    });
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      focusMode.value = btn.dataset.mode;
      syncModeButtons(btn.dataset.mode);
      focusMode.dispatchEvent(new Event("change"));
    });
  });

  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  Object.defineProperty(focusMode, "value", {
    configurable: true,
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      descriptor.set.call(this, value);
      syncModeButtons(value);
    }
  });

  syncModeButtons(focusMode.value);
}

function createModeIcon(mode) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  (MODE_ICONS[mode] || MODE_ICONS.minimal).forEach(([tag, attrs]) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    svg.appendChild(el);
  });

  return svg;
}

function updateModeIcon(mode) {
  const normalizedMode = MODE_ICONS[mode] ? mode : "minimal";
  if (statusCard) statusCard.dataset.mode = normalizedMode;
  if (modeIconWrap) modeIconWrap.replaceChildren(createModeIcon(normalizedMode));
}

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function hasUsableAiFilterRule(value) {
  return countWords(value) >= AI_FILTER_MIN_WORDS;
}

function normalizeAiFilterRuleHistory(history) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  const rules = [];
  for (const item of history) {
    const rule = String(item || "").trim();
    const key = rule.toLowerCase();
    if (!rule || seen.has(key) || !hasUsableAiFilterRule(rule)) continue;
    seen.add(key);
    rules.push(rule);
    if (rules.length >= AI_FILTER_HISTORY_LIMIT) break;
  }
  return rules;
}

function renderAiFilterHistory() {
  if (!aiFilterHistory) return;
  aiFilterHistory.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = aiFilterRuleHistory.length ? "Previous rules" : "No previous rules";
  aiFilterHistory.appendChild(placeholder);

  aiFilterRuleHistory.forEach((rule) => {
    const option = document.createElement("option");
    option.value = rule;
    option.textContent = rule.length > 80 ? `${rule.slice(0, 77)}...` : rule;
    aiFilterHistory.appendChild(option);
  });
}

function updateAiFilterRuleHint() {
  if (!aiFilterRuleHint) return;
  const rule = aiFilterRule.value.trim();
  const wordCount = countWords(rule);
  aiFilterRuleHint.className = "hint";

  if (!rule) {
    aiFilterRuleHint.textContent = "Type at least 1 word to turn on title filtering automatically.";
    return;
  }

  if (hasUsableAiFilterRule(rule)) {
    aiFilterRuleHint.textContent = `Ready: ${wordCount} word${wordCount === 1 ? "" : "s"}. This rule will be saved and used for AI title filtering.`;
    aiFilterRuleHint.classList.add("success");
    return;
  }

  aiFilterRuleHint.textContent = `${AI_FILTER_MIN_WORDS - wordCount} more word${AI_FILTER_MIN_WORDS - wordCount === 1 ? "" : "s"} needed before this rule can be saved.`;
  aiFilterRuleHint.classList.add("error");
}

async function loadAiFilterRuleHistory() {
  const state = await browser.storage.local.get({ [AI_FILTER_HISTORY_KEY]: [] });
  aiFilterRuleHistory = normalizeAiFilterRuleHistory(state[AI_FILTER_HISTORY_KEY]);
  renderAiFilterHistory();
}

async function rememberAiFilterRule(rule) {
  const normalizedRule = String(rule || "").trim();
  if (!hasUsableAiFilterRule(normalizedRule)) return;
  aiFilterRuleHistory = normalizeAiFilterRuleHistory([
    normalizedRule,
    ...aiFilterRuleHistory.filter((item) => item.toLowerCase() !== normalizedRule.toLowerCase())
  ]);
  await browser.storage.local.set({ [AI_FILTER_HISTORY_KEY]: aiFilterRuleHistory });
  renderAiFilterHistory();
}

function modeLabel(mode) {
  const labels = {
    minimal: "Minimal",
    study: "Study",
    strict: "Strict",
    custom: "Custom"
  };
  return labels[mode] || "Mode";
}

function createToggle([key, title, description]) {
  const row = document.createElement("div");
  row.className = "row";

  const text = document.createElement("div");
  text.className = "row-text";

  const strong = document.createElement("strong");
  strong.textContent = title;

  const span = document.createElement("span");
  span.textContent = description;

  const label = document.createElement("label");
  label.className = "toggle";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = key;
  input.dataset.setting = key;

  const slider = document.createElement("span");
  slider.className = "slider";

  text.append(strong, span);
  label.append(input, slider);
  row.append(text, label);
  return row;
}

function renderToggles() {
  TOGGLES.forEach((toggle) => toggleList.appendChild(createToggle(toggle)));
  toggleList.addEventListener("change", (event) => {
    if (event.target.matches("[data-setting]") && focusMode.value !== "custom") {
      focusMode.value = "custom";
      currentSettings.focusMode = "custom";
      updateStatusPreview();
    }
    scheduleAutoSave();
  });
}

function renderDays() {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  labels.forEach((label, value) => {
    const wrapper = document.createElement("label");
    wrapper.className = "day";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(value);
    const text = document.createElement("span");
    text.textContent = label;
    wrapper.append(input, text);
    scheduleDays.appendChild(wrapper);
  });
}

function setToggleValue(key, value) {
  const el = document.getElementById(key);
  if (el) el.checked = Boolean(value);
}

function getToggleValue(key) {
  const el = document.getElementById(key);
  return el ? el.checked : false;
}

function setControls(settings) {
  currentSettings = disableFrontendSettings(Object.assign({}, DEFAULT_SETTINGS, settings || {}));
  const effective = getEffectiveSettings(currentSettings);

  focusMode.value = currentSettings.focusMode || "minimal";
  TOGGLES.forEach(([key]) => setToggleValue(key, effective[key]));
  dislikeCountEnabled.checked = Boolean(currentSettings.dislikeCountEnabled);
  learningStackEnabled.checked = Boolean(currentSettings.learningStackEnabled);

  aiFilterRule.value = currentSettings.aiFilterRule || currentSettings.keywords || "";
  updateAiFilterRuleHint();
  sponsorBlockEnabled.checked = Boolean(currentSettings.sponsorBlockEnabled);
  sponsorSkipMode.value = currentSettings.sponsorSkipMode || "auto";

  scheduleEnabled.checked = Boolean(currentSettings.scheduleEnabled);
  scheduleStart.value = currentSettings.scheduleStart || "09:00";
  scheduleEnd.value = currentSettings.scheduleEnd || "17:00";
  const selectedDays = Array.isArray(currentSettings.scheduleDays) ? currentSettings.scheduleDays : DEFAULT_SETTINGS.scheduleDays;
  scheduleDays.querySelectorAll("input").forEach((input) => {
    input.checked = selectedDays.includes(Number(input.value));
  });

  pomodoroEnabled.checked = Boolean(currentSettings.pomodoroEnabled);
  pomodoroFocusMinutes.value = Number(currentSettings.pomodoroFocusMinutes) || 25;
  pomodoroBreakMinutes.value = Number(currentSettings.pomodoroBreakMinutes) || 5;

  updateStatusPreview();
}

function applyPresetToControls(mode) {
  const preset = MODE_PRESETS[mode];
  if (!preset) return;
  TOGGLES.forEach(([key]) => {
    if (key in preset) setToggleValue(key, preset[key]);
  });
  updateStatusPreview();
}

async function saveModeSelection(mode) {
  const partial = disableFrontendSettings({
    settingsVersion: 2,
    focusMode: mode,
    visualMode: currentSettings.visualMode || "normal",
    dislikeCountEnabled: dislikeCountEnabled.checked,
    learningStackEnabled: learningStackEnabled.checked
  });

  TOGGLES.forEach(([key]) => {
    partial[key] = getToggleValue(key);
  });

  await browser.storage.sync.set(partial);
  currentSettings = Object.assign({}, currentSettings, partial);
  setMessage(`${modeLabel(mode)} mode applied.`, "success");
  setTimeout(() => setMessage(""), 1600);
}

function collectSettings() {
  const rule = aiFilterRule.value.trim();
  const collected = disableFrontendSettings(Object.assign({}, DEFAULT_SETTINGS, currentSettings, {
    settingsVersion: 2,
    focusMode: focusMode.value,
    visualMode: currentSettings.visualMode || "normal",
    dislikeCountEnabled: dislikeCountEnabled.checked,
    learningStackEnabled: learningStackEnabled.checked,
    filterEnabled: hasUsableAiFilterRule(rule),
    aiFilterRule: hasUsableAiFilterRule(rule) ? rule : "",
    keywords: hasUsableAiFilterRule(rule) ? rule : "",
    sponsorBlockEnabled: sponsorBlockEnabled.checked,
    sponsorSkipMode: sponsorSkipMode.value === "ask" ? "ask" : "auto",
    scheduleEnabled: scheduleEnabled.checked,
    scheduleStart: scheduleStart.value || "09:00",
    scheduleEnd: scheduleEnd.value || "17:00",
    scheduleDays: Array.from(scheduleDays.querySelectorAll("input:checked")).map((input) => Number(input.value)),
    pomodoroEnabled: pomodoroEnabled.checked,
    pomodoroFocusMinutes: Math.max(1, Number(pomodoroFocusMinutes.value) || 25),
    pomodoroBreakMinutes: Math.max(1, Number(pomodoroBreakMinutes.value) || 5)
  }));

  TOGGLES.forEach(([key]) => {
    collected[key] = getToggleValue(key);
  });

  return collected;
}

function updateStatusPreview() {
  const settings = collectSettings();
  const effective = getEffectiveSettings(settings);
  const labels = {
    minimal: "Minimal focus",
    study: "Study mode",
    strict: "Strict mode",
    custom: "Custom mode"
  };

  modeStatus.textContent = labels[settings.focusMode] || "focuslane";
  updateModeIcon(settings.focusMode);

  const active = [];
  if (effective.shortsBlocked) active.push("Shorts");
  if (effective.commentsHidden) active.push("comments");
  if (effective.hideWatchSidebar) active.push("sidebar");
  if (effective.hideHomeFeed) active.push("home feed");
  if (effective.forceAutoplayOff) active.push("autoplay");
  if (effective.dislikeCountEnabled) active.push("dislikes");
  if (hasUsableAiFilterRule(effective.aiFilterRule)) active.push("AI filter");
  if (effective.sponsorBlockEnabled) active.push(effective.sponsorSkipMode === "ask" ? "sponsor prompts" : "sponsor auto-skip");
  detailStatus.textContent = active.length ? `Active: ${active.join(", ")}.` : "All focus controls are off.";
}

function validateSettings(settings) {
  const rawRule = aiFilterRule.value.trim();
  if (rawRule && !hasUsableAiFilterRule(rawRule)) {
    return "Use at least 1 word for the AI filter rule.";
  }
  if (settings.scheduleEnabled && settings.scheduleDays.length === 0) return "Select at least one focus day.";
  return "";
}

async function saveSettings(options = {}) {
  const nextSettings = collectSettings();
  const error = validateSettings(nextSettings);
  if (error) {
    setMessage(error, "error");
    return false;
  }

  await browser.storage.sync.set(nextSettings);
  currentSettings = nextSettings;
  if (nextSettings.aiFilterRule) await rememberAiFilterRule(nextSettings.aiFilterRule);

  if (nextSettings.pomodoroEnabled && options.startPomodoro) {
    await browser.storage.local.set({ pomodoroPhase: options.phase || "focus", pomodoroStartedAt: Date.now() });
  }

  if (!options.silent) {
    setMessage(options.message || "Settings saved.", "success");
    setTimeout(() => setMessage(""), 1800);
  }
  updateStatusPreview();
  return true;
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    autoSaveTimer = null;
    try {
      await saveSettings({ silent: true });
    } catch (err) {
      setMessage(err.message || "Could not save settings.", "error");
    }
  }, 250);
}

async function loadRuntimeState() {
  const state = await browser.storage.local.get({ unlockUntil: 0, pomodoroPhase: "focus", pomodoroStartedAt: 0 });
  const unlockUntil = Number(state.unlockUntil) || 0;
  if (unlockUntil > Date.now()) {
    unlockStatus.textContent = `Unlocked until ${new Date(unlockUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  } else {
    unlockStatus.textContent = "No temporary unlock active.";
  }

  if (state.pomodoroStartedAt && currentSettings.pomodoroEnabled) {
    const phase = state.pomodoroPhase === "break" ? "Break" : "Focus";
    detailStatus.textContent += ` ${phase} timer is running.`;
  }
}

async function loadSettings() {
  const syncState = await browser.storage.sync.get(DEFAULT_SETTINGS);
  if (typeof syncState.aiFilterRule === "undefined" && typeof syncState.keywords !== "undefined") {
    syncState.aiFilterRule = syncState.keywords || "";
  }
  const sanitized = disableFrontendSettings(syncState);
  if (syncState.endGuard !== sanitized.endGuard ||
      syncState.endGuardCloseTab !== sanitized.endGuardCloseTab ||
      syncState.intentGate !== sanitized.intentGate) {
    await browser.storage.sync.set(FRONTEND_DISABLED_SETTINGS);
  }
  setControls(sanitized);
}

function displayStats(period) {
  if (!currentStats) return;
  const data = Object.assign({}, STATS_DEFAULT, currentStats[period] || {});
  document.getElementById("statShorts").textContent = formatNumber(data.shortsBlocked);
  document.getElementById("statRecs").textContent = formatNumber(data.recommendationsHidden);
  document.getElementById("statFiltered").textContent = formatNumber(data.aiFiltered || data.videosFiltered || 0);
  document.getElementById("statSponsors").textContent = formatNumber(data.sponsorSegmentsSkipped);
  document.getElementById("statFocus").textContent = formatNumber(data.focusMinutes);
  document.getElementById("statUnlocks").textContent = formatNumber(data.unlockCount);
  document.getElementById("statSaved").textContent = formatNumber(data.estimatedMinutesSaved, 1);
  renderAiFilteredVideos(currentStats.filteredVideos?.[period] || []);
}

function formatNumber(value, digits = 0) {
  const number = Number(value) || 0;
  if (digits && number % 1 !== 0) return number.toFixed(digits);
  return String(Math.round(number));
}

function formatFilteredVideoTime(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderAiFilteredVideos(videos) {
  if (!aiFilteredVideoList) return;
  aiFilteredVideoList.replaceChildren();

  if (!videos.length) {
    const empty = document.createElement("div");
    empty.className = "filtered-video-empty";
    empty.textContent = "No AI-filtered videos in this period.";
    aiFilteredVideoList.appendChild(empty);
    return;
  }

  videos.forEach((video) => {
    const item = document.createElement("div");
    item.className = "filtered-video-item";

    const link = document.createElement("a");
    link.href = video.url || `https://www.youtube.com/watch?v=${video.id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = video.title || "Untitled YouTube video";

    const meta = document.createElement("div");
    meta.className = "filtered-video-meta";
    const time = formatFilteredVideoTime(video.timestamp);
    const rule = String(video.filterRule || "").trim();
    meta.textContent = [time, rule ? `Rule: ${rule}` : ""].filter(Boolean).join(" · ");

    item.append(link, meta);
    aiFilteredVideoList.appendChild(item);
  });
}

async function loadStats() {
  currentStats = await browser.runtime.sendMessage({ type: "GET_STATS" });
  displayStats(activeStatsPeriod);
}

async function temporaryUnlock(minutes) {
  if (unlockPhrase.value.trim().toUpperCase() !== "FOCUS") {
    setMessage("Type FOCUS to unlock temporarily.", "error");
    return;
  }
  const unlockUntil = Date.now() + minutes * 60 * 1000;
  await browser.storage.local.set({ unlockUntil });
  await browser.runtime.sendMessage({ type: "INCREMENT_STATS", delta: { unlockCount: 1 } });
  unlockPhrase.value = "";
  await loadRuntimeState();
  setMessage(`Unlocked for ${minutes} minutes.`, "success");
}

function wireEvents() {
  focusMode.addEventListener("change", async () => {
    try {
      currentSettings.focusMode = focusMode.value;
      if (focusMode.value === "custom") {
        setControls(currentSettings);
        focusMode.value = "custom";
        await saveModeSelection("custom");
        return;
      }
      applyPresetToControls(focusMode.value);
      await saveModeSelection(focusMode.value);
    } catch (err) {
      setMessage(err.message || "Could not apply focus mode.", "error");
    }
  });

  document.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.id !== "focusMode") el.addEventListener("input", updateStatusPreview);
  });

  document.querySelectorAll("input[type='checkbox'], input[type='time'], input[type='number'], select").forEach((el) => {
    if (el.id === "focusMode" || el.id === "aiFilterHistory") return;
    el.addEventListener("change", scheduleAutoSave);
  });

  aiFilterRule.addEventListener("input", updateAiFilterRuleHint);

  if (aiFilterHistory) {
    aiFilterHistory.addEventListener("change", () => {
      if (!aiFilterHistory.value) return;
      aiFilterRule.value = aiFilterHistory.value;
      aiFilterHistory.value = "";
      updateAiFilterRuleHint();
      updateStatusPreview();
    });
  }

  applyFilterBtn.addEventListener("click", () => {
    const message = hasUsableAiFilterRule(aiFilterRule.value.trim()) ? "AI filter applied." : "AI filter cleared.";
    saveSettings({ message });
  });

  saveBtn.addEventListener("click", () => saveSettings());

  clearCacheBtn.addEventListener("click", async () => {
    const response = await browser.runtime.sendMessage({ type: "CLEAR_CACHE" });
    setMessage(`Caches cleared (${response?.count || 0} entries).`, "success");
  });

  document.querySelectorAll(".unlock-btn").forEach((button) => {
    button.addEventListener("click", () => temporaryUnlock(Number(button.dataset.unlock)));
  });

  document.getElementById("startPomodoroBtn").addEventListener("click", async () => {
    pomodoroEnabled.checked = true;
    if (await saveSettings({ silent: true, startPomodoro: true, phase: "focus" })) {
      setMessage("Focus timer started.", "success");
      await loadRuntimeState();
    }
  });

  document.getElementById("startBreakBtn").addEventListener("click", async () => {
    pomodoroEnabled.checked = true;
    if (await saveSettings({ silent: true, startPomodoro: true, phase: "break" })) {
      setMessage("Break timer started.", "success");
      await loadRuntimeState();
    }
  });

  document.querySelectorAll(".period-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".period-btn").forEach((item) => item.classList.remove("primary"));
      button.classList.add("primary");
      activeStatsPeriod = button.dataset.period;
      displayStats(activeStatsPeriod);
    });
  });
}

wireTabs();
wireModeSegmentControl();
renderToggles();
renderDays();
wireEvents();

Promise.all([loadAiFilterRuleHistory(), loadSettings()])
  .then(() => rememberAiFilterRule(currentSettings.aiFilterRule))
  .then(loadRuntimeState)
  .then(loadStats)
  .catch((err) => setMessage(err.message || "Could not load focuslane settings.", "error"));
