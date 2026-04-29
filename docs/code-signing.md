# Code Signing & Notarization

Harbor uses Tauri's built-in macOS signing flow. This guide covers optional signed builds for private distribution.

## Prerequisites

- Apple Developer Program membership (for Developer ID certificates)
- A `Developer ID Application` certificate installed in your Keychain

## Setup

### 1. Find Your Signing Identity

```bash
security find-identity -v -p codesigning
```

Look for a line like:

```
Developer ID Application: Your Name (TEAMID)
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```bash
CSC_NAME="Developer ID Application: Your Name (TEAMID)"
APPLE_ID="your-apple-id@example.com"
APPLE_APP_SPECIFIC_PASSWORD="your-app-specific-password"
TEAM_ID="YOURTEAMID"
```

> Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.

### 3. Build

```bash
npm run build:mac:signed
npm run verify:mac-signature
```

The build script maps `.env` values to Tauri's expected environment variables:

```text
CSC_NAME                -> APPLE_SIGNING_IDENTITY
APPLE_APP_SPECIFIC_PASSWORD -> APPLE_PASSWORD
TEAM_ID                 -> APPLE_TEAM_ID
```

If notarization env vars are present, the build will attempt notarization automatically. If they're missing, the app is still signed but not notarized.

## Manual Notarization

If you need to notarize separately:

```bash
APP_PATH="src-tauri/target/release/bundle/macos/Harbor.app"
ZIP_PATH="src-tauri/target/release/bundle/macos/Harbor.zip"

ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

xcrun notarytool submit "$ZIP_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$TEAM_ID" \
  --wait

xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"
```

## Verify Signature

```bash
npm run verify:mac-signature
```

Expected output should show the full authority chain:

```text
Authority=Developer ID Application: Your Name (TEAMID)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
```

## Development Builds

For local development, no signing is needed. `npm run dev` produces an unsigned app that runs normally.
