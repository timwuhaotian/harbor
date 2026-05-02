# Harbor

A personal macOS/Windows desktop app that turns your machine into a VLESS WebSocket exit node through Cloudflare Tunnel.

```
V2Box on phone
  └─ VLESS + WebSocket + TLS
     └─ Cloudflare hostname
        └─ Cloudflare Tunnel
           └─ Harbor on Mac/Windows
              └─ local sing-box VLESS inbound
                 └─ direct outbound from the machine
```

Cloudflare handles public TLS. Harbor runs plain WebSocket on `127.0.0.1`, and `cloudflared` carries that local service through an authenticated tunnel.

## Features

- **Zero-config tunnel** — bundled `cloudflared` and `sing-box` binaries, no manual installation required
- **QR code & VLESS link** — scan or copy to connect from any compatible client
- **System tray** — start/stop Harbor from the menu bar; close-to-tray behavior keeps it running
- **Auto-launch** — optional login item for persistent operation
- **EN/中文** — bilingual UI with in-app language switcher (also updates tray menu)
- **Automatic updates** — built-in update checker with changelog display and direct GitHub Releases download
- **macOS + Windows** — signed macOS builds (DMG) and Windows installers (NSIS/MSI) via CI/CD
- **Real-time logs** — live stdout/stderr from sing-box and cloudflared, shown inline
- **Port conflict detection** — identifies which process is blocking the local port
- **Dependency check** — verifies bundled binaries at startup with version display and warnings
- **Custom binary paths** — override bundled sing-box/cloudflared with system-installed versions
- **About modal** — built-in disclaimer and version info

## Requirements

- **macOS 11.0+** (Big Sur or later) or **Windows 10+**
- A Cloudflare account with a domain managed by Cloudflare DNS

> Harbor bundles `sing-box` and `cloudflared` binaries. No `brew install` needed.

## Quick Start

1. **Set up a Cloudflare Tunnel** (see [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup) below)
2. **Download Harbor** from [Releases](https://github.com/timwuhaotian/harbor/releases) or [build from source](#development)
3. **Open Harbor** and paste your tunnel token + hostname
4. Click **Start Harbor**
5. **Scan the QR code** or copy the VLESS link into your client (V2Box, Surge, Shadowrocket, etc.)

## Cloudflare Tunnel Setup

This guide walks you through creating a Cloudflare Zero Trust Tunnel to expose Harbor's local VLESS WebSocket endpoint to the internet.

### Step 1: Create a Tunnel

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Zero Trust** → **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Select **Cloudflared** as the connector type
5. Give it a name (e.g., `harbor-mac`) and click **Save**

### Step 2: Copy the Tunnel Token

Cloudflare will show an install command:

```bash
cloudflared tunnel --no-autoupdate run --token <very-long-token>
```

Copy only the `<very-long-token>` value. You'll paste it into Harbor's **Cloudflare tunnel token** field.

> Harbor passes the token via the `TUNNEL_TOKEN` environment variable, never in process arguments.

### Step 3: Configure the Public Hostname

Inside your tunnel settings, go to **Public Hostnames** and click **Add a public hostname**:

| Field       | Value                          |
|-------------|--------------------------------|
| Subdomain   | `harbor` (or your choice)      |
| Domain      | `yourdomain.com`               |
| Path        | *(leave blank)*                |
| Type        | **HTTP**                       |
| URL         | `127.0.0.1:18080`              |

After saving, Cloudflare should display the public hostname as `harbor.yourdomain.com`. Use this exact value in Harbor's **Cloudflare hostname** field.

### Step 4: Configure Harbor

Open Harbor and fill in:

| Field                   | Value                                    | Required |
|-------------------------|------------------------------------------|----------|
| Cloudflare hostname     | `harbor.yourdomain.com`                  | Yes      |
| Cloudflare tunnel token | *(the token from Step 2)*                | Yes      |
| VLESS UUID              | *(auto-generated, or use your own)*      | Yes      |
| WebSocket path          | `/harbor` (default)                      | Yes      |
| Local port              | `18080` (default)                        | Yes      |
| sing-box Path           | `sing-box` (or full path to override)    | No       |
| cloudflared Path        | `cloudflared` (or full path to override) | No       |

### Step 5: Start and Connect

1. Click **Start Harbor**
2. Verify both `sing-box` and `cloudflared` show as **Running**
3. Copy the generated VLESS link or scan the QR code
4. Import it into your client:

```
vless://<uuid>@harbor.yourdomain.com:443?encryption=none&security=tls&type=ws&host=harbor.yourdomain.com&sni=harbor.yourdomain.com&path=%2Fharbor#Harbor-Mac
```

## Compatible Clients

| Client       | Platform      | Notes                                      |
|--------------|---------------|--------------------------------------------|
| **V2Box**    | iOS / iPadOS  | Free on App Store, supports VLESS + WS + TLS |
| **Surge**    | iOS / macOS   | Paid, advanced routing features            |
| **Shadowrocket** | iOS       | Paid, popular choice                       |
| **Clash Meta / Mihomo** | Multi | Supports VLESS WebSocket                 |
| **sing-box** | Multi         | CLI / GUI clients available                |

## Troubleshooting

### V2Box cannot connect

1. Confirm Harbor shows both `sing-box` and `cloudflared` as **Running**
2. In Cloudflare Dashboard, verify the tunnel connector shows **Healthy**
3. Confirm the public hostname service target is `http://127.0.0.1:18080`
4. Confirm your client's WebSocket path is `/harbor`
5. Confirm your client uses WebSocket transport and TLS enabled
6. Check Harbor's runtime logs for `sing-box` config or port errors

### `sing-box` or `cloudflared` not found

Harbor bundles these binaries. If you see a dependency warning:
- The binaries may be missing from an incomplete install — reinstall from [Releases](https://github.com/timwuhaotian/harbor/releases)
- Or provide the full path in the settings (e.g., `/opt/homebrew/bin/sing-box`)

### Mac goes to sleep

Harbor requires your Mac to stay awake while remote devices use it. Consider:
- System Settings → Energy Saver → prevent display sleep when plugged in
- Use `caffeinate` or a utility like Amphetamine

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  V2Box (iPhone)                  │
│    vless://uuid@harbor.yourdomain.com:443        │
└──────────────────────┬──────────────────────────┘
                       │ VLESS + WS + TLS
                       ▼
┌─────────────────────────────────────────────────┐
│               Cloudflare Edge                    │
│  TLS termination → WebSocket → Tunnel connector  │
└──────────────────────┬──────────────────────────┘
                       │ HTTP (plain)
                       ▼
┌─────────────────────────────────────────────────┐
│                 Harbor (Mac)                     │
│  ┌──────────────┐     ┌───────────────────────┐  │
│  │  sing-box     │────▶│  cloudflared          │  │
│  │  VLESS WS :18080│     │  tunnel --token TOKEN  │  │
│  └──────┬───────┘     └───────────┬───────────┘  │
│         │                         │              │
│         ▼                         ▼              │
│  ┌──────────────┐     ┌───────────────────────┐  │
│  │  direct out   │     │  Cloudflare edge      │  │
│  └──────────────┘     └───────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Key design decisions:

- **No local TLS certificates needed** — Cloudflare terminates TLS on the public hostname
- **Token passed via environment variable** — never exposed in `ps` or process arguments
- **sing-box config generated at runtime** — written to `~/Library/Application Support/com.harbor.exitnode/sing-box.json`
- **Settings persisted locally** — stored in `localStorage` (tunnel token excluded from disk for safety)
- **Bundled binaries** — `cloudflared` and `sing-box` included, no manual installation required
- **Close-to-tray** — closing the window hides to system tray; the app stays running

## Development

### Prerequisites

- Rust (stable toolchain)
- Node.js 18+
- npm

### Build and Run

```bash
git clone https://github.com/timwuhaotian/harbor.git
cd harbor
npm install
npm run dev
```

`npm run dev` launches the Tauri desktop app with hot-reload. Tauri starts the Vite dev server automatically.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Launch Tauri app with hot-reload |
| `npm run build` | TypeScript compile + Vite build |
| `npm run test` | Run frontend tests (Vitest) |
| `npm run bump` | Bump version and validate changelog entry |
| `npm run build:mac` | Build unsigned macOS app |
| `npm run build:mac:signed` | Build signed + notarized macOS app |
| `npm run verify:mac-signature` | Verify macOS code signature |

### Signed macOS Build

```bash
npm run build:mac:signed
npm run verify:mac-signature
```

Outputs:

```
src-tauri/target/release/bundle/macos/Harbor.app
src-tauri/target/release/bundle/dmg/Harbor_<version>_aarch64.dmg
```

See [docs/code-signing.md](docs/code-signing.md) for signing and notarization details.

### Tests

```bash
npm test
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

### Project Structure

```
harbor/
├── src/                          # Frontend (TypeScript)
│   ├── main.ts                   # App entry, UI rendering, event binding
│   ├── ui.ts                     # Shared types and utilities
│   ├── ui.test.ts                # Frontend unit tests
│   ├── i18n.ts                   # English/Chinese localization
│   ├── update-checker.ts         # Automatic update check & download
│   ├── env.d.ts                  # Type declarations (e.g. __APP_VERSION__)
│   └── styles.css                # UI styles
├── src-tauri/                    # Tauri backend (Rust)
│   ├── src/
│   │   ├── lib.rs                # Tauri app setup, command registration
│   │   ├── config.rs             # Settings, VLESS link & sing-box config builders
│   │   ├── runtime.rs            # Process management (sing-box, cloudflared)
│   │   └── main.rs               # Binary entry point
│   ├── capabilities/
│   │   └── default.json          # Tauri capability definitions
│   ├── resources/
│   │   └── harbor-defaults.bundle.json   # Bundled defaults (gitignored)
│   └── tauri.conf.json           # Tauri configuration
├── scripts/                      # Build, signing, and CI scripts
│   ├── build-signed-mac.mjs      # macOS signed build + notarization
│   ├── bump-version.mjs          # Version bump with changelog validation
│   ├── fetch-runtimes.mjs        # Download sing-box + cloudflared binaries
│   ├── prepare-bundled-defaults.mjs  # Copy local defaults to bundle path
│   ├── release-assets.mjs        # Collect release artifacts from Tauri output
│   ├── signing-env.mjs           # Parse .env + keychain for signing identity
│   ├── validate-changelog.mjs    # Ensure changelog has current version entry
│   └── verify-mac-signature.mjs  # Verify macOS code signature
├── .github/workflows/
│   └── release.yml               # CI/CD: test, build macOS + Windows, publish
└── docs/
    ├── cloudflare-setup.md       # Detailed Cloudflare Tunnel guide
    └── code-signing.md           # macOS code signing & notarization
```

## Security Notes

- The tunnel token is passed to `cloudflared` via `TUNNEL_TOKEN` environment variable, never in command-line arguments
- sing-box listens on `127.0.0.1` only — no direct network exposure
- The VLESS UUID is auto-generated on first launch
- Tunnel token is excluded from settings export for safety
- Signal handlers (SIGTERM/SIGINT/SIGHUP) clean up child processes on Unix

## License

Apache-2.0
