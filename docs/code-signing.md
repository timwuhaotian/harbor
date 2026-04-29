# Code Signing & Notarization

Harbor uses the same local signing pattern as `../the-pair`: a Developer ID Application certificate in Keychain plus Tauri's Apple signing environment variables.

## Current Local Identity

The local keychain contains:

```text
Developer ID Application: HAOTIAN WU (43VLF3KTFZ)
```

The signed build script auto-detects the first `Developer ID Application` identity. You can override it with `CSC_NAME` or `APPLE_SIGNING_IDENTITY`.

## Local Signed Build

```bash
npm run build:mac:signed
npm run verify:mac-signature
```

If `src-tauri/resources/harbor-defaults.local.json` exists, `npm run build` copies it to the generated bundle resource before Tauri packages the app. Both files are gitignored because they can contain a Cloudflare tunnel token.

Outputs:

```text
src-tauri/target/release/bundle/macos/Harbor.app
src-tauri/target/release/bundle/dmg/Harbor_0.1.0_aarch64.dmg
```

## Optional `.env`

Copy `.env.example` to `.env` if you want explicit local values:

```bash
cp .env.example .env
```

Supported local env names match `../the-pair`:

```bash
CSC_NAME="Developer ID Application: HAOTIAN WU (43VLF3KTFZ)"
APPLE_ID="your-apple-id@example.com"
APPLE_APP_SPECIFIC_PASSWORD="your-app-specific-password"
TEAM_ID="43VLF3KTFZ"
```

The script maps these to Tauri's Apple env names:

```text
CSC_NAME -> APPLE_SIGNING_IDENTITY
APPLE_APP_SPECIFIC_PASSWORD -> APPLE_PASSWORD
TEAM_ID -> APPLE_TEAM_ID
```

## Notarization

If `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `TEAM_ID` are present, `npm run build:mac:signed` passes the mapped values to Tauri so notarization can run during the build.

If those values are missing, the app and DMG are still Developer ID signed, but Tauri will skip notarization.

Manual notarization check:

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

Expected authority chain:

```text
Authority=Developer ID Application: HAOTIAN WU (43VLF3KTFZ)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=...
TeamIdentifier=43VLF3KTFZ
```
