# focuslane

focuslane is a browser extension that makes YouTube calmer and more intentional. It blocks common distraction surfaces, supports focus modes, filters videos with natural-language AI rules, skips sponsor segments, restores estimated dislike counts, and tracks focus-related stats.

The shared source supports Firefox and Chrome. Firefox uses the root Manifest V2 add-on package. Chrome is generated as a Manifest V3 build in `dist/chrome`.

## Install

Install focuslane from Firefox Add-ons:

https://addons.mozilla.org/en-US/firefox/addon/focuslane/

For Chrome development, build the Chrome target and load `dist/chrome` as an unpacked extension from `chrome://extensions`.

## Features

### Focus Modes

focuslane includes preset modes for different levels of YouTube cleanup:

- **Minimal**: blocks Shorts and hides comments while keeping most of YouTube intact.
- **Study**: removes more recommendation surfaces such as watch sidebars, end screens, info cards, live chat, notifications, community posts, and playables.
- **Strict**: hides the home feed and major discovery surfaces for a more locked-down YouTube experience.
- **Custom**: lets you manually adjust individual controls.

### Distraction Controls

The popup exposes toggles for:

- Blocking Shorts links, shelves, cards, sidebar entries, and direct Shorts pages.
- Hiding comments.
- Hiding the YouTube home feed.
- Hiding the watch page sidebar.
- Hiding end screens and info cards.
- Hiding Explore, Trending, Gaming, Live, Playables, community posts, live chat, and notifications.
- Forcing autoplay off.

### AI Video Filtering

focuslane can classify YouTube video title, channel, and visible description metadata against a natural-language rule, such as:

> Only show programming tutorials and tech reviews. Hide gaming, vlogs, and politics.

When a usable rule is configured, matching video metadata is sent to the configured focuslane classification backend. Results are cached locally to reduce repeated classification requests.

AI filtering includes:

- Natural-language rule composer.
- Rule validation.
- Reusable rule history.
- Confidence threshold tuning to reduce false positives.
- Always-show and always-hide channel and keyword overrides.
- Local feedback corrections from the AI-filtered video history.
- Local cache clearing.
- Stats for videos hidden by the AI filter.
- A list of AI-filtered videos grouped by Today, Week, and All Time.

### Learning Stack

The Learning Stack helps keep YouTube sessions focused by letting you build a queue of learning videos. It can gate navigation away from the selected queue and provide controls to resume, complete, remove, or find more videos for the session.

### Schedule, Pomodoro, and Temporary Unlock

focuslane can relax or apply settings depending on context:

- **Focus hours**: apply the selected mode only during configured days and times.
- **Pomodoro**: run focus and break phases with configurable durations.
- **Temporary unlock**: type `FOCUS` to unlock relaxed browsing for 5, 15, or 30 minutes.

### SponsorBlock

When enabled, focuslane uses the public SponsorBlock API for the current video. It can:

- Automatically skip sponsor segments.
- Ask before skipping.
- Render sponsor markers.
- Track skipped sponsor segments and skipped seconds.

### Return YouTube Dislike

When enabled, focuslane requests estimated dislike counts from Return YouTube Dislike for the current YouTube video and displays the count beside the dislike button. Local like/dislike interactions adjust the displayed count immediately.

### Stats

The popup includes a Stats tab with period filters for:

- Shorts blocked.
- Recommendations hidden.
- AI-filtered videos.
- Sponsor segments skipped.
- Focus minutes.
- Temporary unlocks.
- Estimated minutes saved.

## Privacy and External Services

focuslane stores settings and runtime state in extension storage.

The extension declares no data collection in `manifest.json`:

```json
"data_collection_permissions": {
  "required": ["none"],
  "optional": []
}
```

Some optional features call external services when enabled or used:

- **AI filtering** sends video title, channel, visible description, the configured filter rule, and a small set of local feedback examples to `https://focuslane-api.onrender.com/api/classify`.
- **SponsorBlock** sends the current YouTube video ID to `https://sponsor.ajay.app`.
- **Return YouTube Dislike** sends the current YouTube video ID to `https://returnyoutubedislikeapi.com`.

These services are only needed for their corresponding features. Cache entries, channel and keyword overrides, and feedback corrections are stored locally or in extension sync storage and can be cleared from the popup where applicable.

## Permissions

The Firefox extension requests:

- `storage`: save settings, caches, stats, and runtime state.
- `tabs`: close or redirect tabs when focus controls require it.
- `webRequest` and `webRequestBlocking`: redirect direct YouTube Shorts requests when Shorts blocking is active.
- `*://*.youtube.com/*`: apply focus controls on YouTube.
- `https://focuslane-api.onrender.com/*`: call the AI classification backend.
- `https://sponsor.ajay.app/*`: fetch SponsorBlock segments.
- `https://returnyoutubedislikeapi.com/*`: fetch estimated dislike counts.

The Chrome build requests the same storage, tab, and host access, but uses `declarativeNetRequestWithHostAccess` instead of `webRequestBlocking` for Shorts redirects.

## Project Structure

```text
.
├── background.js              # Background script, settings defaults, caches, API calls, stats, request redirects
├── content.js                 # YouTube DOM controls, filtering, learning stack, sponsor/dislike UI, runtime behavior
├── popup.html                 # Extension popup markup and styles
├── popup.js                   # Popup state, events, settings, tabs, focus mode UI, stats rendering
├── manifest.json              # Firefox extension manifest
├── manifests/chrome.json      # Chrome Manifest V3 template
├── scripts/build-chrome.mjs   # Builds the unpacked Chrome extension
├── amo-metadata.json          # Add-ons Mozilla metadata for signing/publishing
├── icons/                     # Extension icons
├── package.json               # Firefox and Chrome build scripts
└── .github/workflows/         # CI/CD workflow for linting, packaging, and AMO publishing
```

## Requirements

- Node.js
- npm
- Firefox
- Chrome

The project uses [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) for Firefox linting, packaging, and AMO submission. The Chrome build script is dependency-free and writes an unpacked extension to `dist/chrome`.

## Setup

Install dependencies:

```bash
npm ci
```

## Development

For manual testing in Firefox, load the extension temporarily:

1. Open Firefox.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `manifest.json` from this repository.
5. Open YouTube and use the focuslane toolbar popup to configure settings.

You can also use `web-ext` directly if you prefer a managed development run:

```bash
npx web-ext run --source-dir .
```

For manual testing in Chrome:

1. Run `npm run build:chrome`.
2. Open Chrome.
3. Navigate to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select `dist/chrome`.
7. Open YouTube and use the focuslane toolbar popup to configure settings.

## Validation

Run Firefox extension linting:

```bash
npm run lint
```

This validates the extension with `web-ext lint`.

Build the Chrome target as a structural validation pass:

```bash
npm run build:chrome
```

The Chrome build validates that the generated manifest uses Manifest V3, `action`, a service worker, declarative net request permissions, and PNG manifest icons.

## Build

Create an unsigned Firefox extension package in `artifacts/`:

```bash
npm run build
```

Create an unpacked Chrome extension in `dist/chrome`:

```bash
npm run build:chrome
```

Build both targets:

```bash
npm run build:all
```

The Firefox build script ignores development-only and Chrome-only files such as `package.json`, `package-lock.json`, `manifests/**`, `scripts/**`, `.github/**`, `dist/**`, and `artifacts/**`.

## Publish to AMO

Publishing is handled by:

```bash
npm run publish:amo
```

This command signs and submits the listed extension to Mozilla Add-ons using `web-ext sign`.

Required environment variables:

- `WEB_EXT_API_KEY`
- `WEB_EXT_API_SECRET`

The GitHub workflow maps these from repository secrets:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

## Release Workflow

The GitHub Actions workflow runs on:

- Pushes to `main`.
- Published GitHub releases.

On every run, it:

1. Checks out the repository.
2. Installs dependencies with `npm ci`.
3. Runs `npm run lint`.
4. Builds an unsigned extension package.
5. Uploads the package as a workflow artifact.

For published releases, it also:

1. Verifies the release tag matches `manifest.json` version.
2. Verifies AMO credentials are configured.
3. Submits the extension to AMO.

Release tags must use the format `vX.Y.Z` and match the manifest version. For example, `v2.0.1` must match:

```json
"version": "2.0.1"
```

## Configuration Notes

The canonical Firefox extension version is stored in `manifest.json`. Keep `manifests/chrome.json` in sync before publishing a Chrome build.

Some settings are intentionally disabled in the current popup/runtime path:

- `endGuard`
- `endGuardCloseTab`
- `intentGate`

They are forced off by the frontend settings sanitizer and are not shown as active popup controls.

## Troubleshooting

### `web-ext update check failed`

If `npm run lint` succeeds but prints an update-check warning about `/Users/<user>/.config`, the lint result is still valid. The warning is from `web-ext` trying to access its local update config store.

### AI filtering is not hiding videos

Check that:

- The AI filter rule has at least one word.
- You clicked **Apply filter** or waited for auto-save.
- YouTube has loaded video cards on the current page.
- The AI backend is reachable.

You can also clear caches from the popup and try again.

### Sponsor skipping is not working

Check that:

- SponsorBlock is enabled in Settings.
- The current video has submitted sponsor segments.
- The skip mode is set to either automatic skip or prompt.

### Dislike count is unavailable

Return YouTube Dislike may not have data for every video. The extension will show an unavailable state when the service does not return a usable count.

## License

All rights reserved. See `amo-metadata.json` for the AMO license metadata.
