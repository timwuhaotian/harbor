# Auto Update Check & Changelog Notification

Date: 2026-05-01

## Problem

Harbor users have no way to know when a new version is available. They must manually check for updates. Since Harbor is a paid product distributed through a private GitHub repo, standard update mechanisms (GitHub Releases public API, Tauri Updater with public endpoints) don't work out of the box.

## Solution

Add an automatic update check system that:
1. Checks for new versions on app startup (and manually via a button)
2. Displays an in-app notification card with changelog when a new version is found
3. Downloads updates through the existing paid download flow (Stripe token authentication)

## Architecture

```
Harbor App                        harbor-site
┌──────────────┐            ┌──────────────────────────┐
│              │            │                          │
│  Startup /   │  GET       │  /api/latest-version     │
│  Manual      │───────────►│  (public, no auth)       │
│  Button      │◄───────────│  returns version+changelog│
│              │            │                          │
│  "Download"  │  POST      │  /api/verify-token       │
│  Button      │───────────►│  validates stored token  │
│              │◄───────────│  returns download URL     │
│  Browser     │            │  (proxies DMG via        │
│  Opens DMG   │            │   GITHUB_PAT)            │
└──────────────┘            └──────────────────────────┘
```

The download URL returned by `/api/verify-token` uses the existing GITHUB_PAT to proxy the DMG from the private repo. The user's token (stored in localStorage) authenticates the request.

## Changes

### harbor-site (3 changes)

#### 1. Token becomes permanent

In `src/lib/tokens.ts`, remove the `TOKEN_EXPIRY_SECONDS` expiry. Tokens stored in Redis without TTL remain valid indefinitely. Users are warned on the success page to save their token.

#### 2. New public API: `GET /api/latest-version`

New file: `src/app/api/latest-version/route.ts`

Uses the existing `GITHUB_PAT` to call `GET /repos/{owner}/{repo}/releases/latest` on the GitHub API. Returns:

```json
{
  "version": "0.2.0",
  "changelog": "## [0.2.0]\n### Added\n- Auto update check\n### Fixed\n- Connection stability",
  "releasedAt": "2026-05-15T00:00:00Z"
}
```

No authentication required. Only exposes version number, changelog text, and release date. Does not expose any download URLs or asset information.

#### 3. Success page shows token for saving

In `src/app/download/success/page.tsx`, after the download button, display the token value in a `<code>` block with a copy button and a warning message: "Please save this token. You will need it to download future updates in the Harbor app."

### Harbor app (2 new files + 1 modification)

#### 1. New: `src/update-checker.ts`

```typescript
type LatestVersion = {
  version: string;
  changelog: string;
  releasedAt: string;
};

type UpdateCheckResult = {
  hasUpdate: boolean;
  version?: string;
  changelog?: string;
  releasedAt?: string;
};
```

- `checkForUpdate(currentVersion: string): Promise<UpdateCheckResult>`
  - Fetches `https://harbor.timwuhaotian.dev/api/latest-version`
  - Compares semver: if remote > current, returns `hasUpdate: true`
  - Skips if version matches `localStorage.getItem('harbor.skippedVersion')`

- `downloadUpdate(token: string): Promise<void>`
  - POSTs to `https://harbor.timwuhaotian.dev/api/verify-token` with `{ token }`
  - If valid, opens the returned `downloadUrl` in the system browser
  - If invalid, shows error: "Token invalid or expired"

#### 2. Modify: `src/main.ts`

**Registration token input:**
- Add a "Registration Token" field in the settings form
- Value read from / written to `localStorage.getItem('harbor.downloadToken')`
- Masked display (like `cloudflaredToken`)
- On blur, persist to localStorage

**Auto check on startup:**
- In `bootstrap()`, after `refreshStatus()`, call `checkForUpdate(VERSION)`
- `VERSION` read from `__TAURI_METADATA__` or hardcoded from build config

**Manual check button:**
- Add a "Check for Updates" button in the sidebar header area (below the eyebrow text)

**Update notification card:**
- When `hasUpdate === true`, render a card above the status panel:
  ```
  ┌─────────────────────────────────┐
  │ 🔔 New version 0.2.0 available  │
  │                                 │
  │ Changelog:                      │
  │ - Auto update check             │
  │ - Connection stability fix      │
  │                                 │
  │ [Download Update] [Skip]        │
  └─────────────────────────────────┘
  ```
- "Download Update" calls `downloadUpdate(storedToken)`, which opens browser
- "Skip" sets `localStorage.setItem('harbor.skippedVersion', remoteVersion)` and re-renders

**Error states:**
- No token stored: card shows "Enter your registration token to download updates"
- Token invalid: card shows "Token invalid. Please check your token."
- Network error: silent, no card shown

### CSP consideration

The Tauri CSP in `tauri.conf.json` currently is:
```
default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'
```

The `fetch` to `harbor.timwuhaotian.dev` is made from the Rust backend (Tauri HTTP plugin) or the WebView. If using the WebView's `fetch`, we need to add `connect-src https://harbor.timwuhaotian.dev` to the CSP. Alternatively, a Tauri Rust command can make the HTTP request, avoiding CSP changes entirely.

**Decision: Use a Tauri Rust command for HTTP requests.** This avoids CSP modifications and keeps the frontend free of hardcoded URLs.

Wait, actually looking at the current codebase, the frontend uses `@tauri-apps/api` invoke for all backend calls. The update checker can also use invoke to call a Rust command that makes the HTTP request. But this adds complexity.

Simpler approach: just add `connect-src https://harbor.timwuhaotian.dev` to CSP. The frontend `fetch` is straightforward.

**Revised decision: Use frontend `fetch` + CSP update.** Simpler to implement, consistent with the lightweight approach of the current codebase.

### No changes needed

- CI/CD pipeline (`release.yml`) remains unchanged
- No signing keys needed
- No GitHub Pages needed
- Stripe checkout flow unchanged

## User Flow

### First-time purchase
1. User pays via Stripe on harbor-site
2. Redirected to `/download/success?session_id=xxx`
3. Token displayed on page with "Please save this token" warning
4. User downloads initial DMG, installs Harbor

### In-app token registration
5. User opens Harbor
6. Sees "Registration Token" field in settings
7. Pastes their saved token
8. Token stored in localStorage

### Update notification
9. Harbor starts → auto fetches `/api/latest-version`
10. New version found → notification card appears
11. User clicks "Download Update"
12. Harbor POSTs token to `/api/verify-token` → gets download URL
13. Browser opens download URL → DMG downloads through GITHUB_PAT proxy
14. User installs new DMG

### Skip behavior
- User can click "Skip" to dismiss the notification for this version
- Skipped version stored in `localStorage('harbor.skippedVersion')`
- Next startup won't show notification for the skipped version
- A newer version will trigger the notification again

## Security Considerations

- The `/api/latest-version` endpoint is fully public and returns only version info + changelog text. No download URLs, no asset info, no tokens.
- Download still requires a valid token, verified server-side via Redis lookup.
- Tokens are stored in localStorage (not accessible to other apps, but accessible to the WebView). Acceptable for a desktop app.
- No new free download paths are introduced. The existing `/api/verify-token` endpoint is reused.
- The GITHUB_PAT remains server-side only and is never exposed to the client.
