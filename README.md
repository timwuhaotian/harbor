# Harbor

A personal macOS desktop app that turns your Mac into a VLESS WebSocket exit node through Cloudflare Tunnel.

```
V2Box on phone
  └─ VLESS + WebSocket + TLS
     └─ Cloudflare hostname
        └─ Cloudflare Tunnel
           └─ Harbor on Mac
              └─ local sing-box VLESS inbound
                 └─ direct outbound from the Mac
```

Cloudflare handles public TLS. Harbor runs plain WebSocket on `127.0.0.1`, and `cloudflared` carries that local service through an authenticated tunnel.

## Requirements

- **macOS 12.0+** (Monterey or later)
- **[sing-box](https://sing-box.sagernet.org/)** — VLESS WebSocket inbound
- **[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)** — Cloudflare Tunnel connector
- A Cloudflare account with a domain managed by Cloudflare DNS

Install dependencies:

```bash
brew install sing-box cloudflared
```

## Quick Start

1. **Set up a Cloudflare Tunnel** (see [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup) below)
2. **Download or build Harbor** (see [Development](#development))
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

| Field                   | Value                                    |
|-------------------------|------------------------------------------|
| Cloudflare hostname     | `harbor.yourdomain.com`                  |
| Cloudflare tunnel token | *(the token from Step 2)*                |
| VLESS UUID              | *(auto-generated, or use your own)*      |
| WebSocket path          | `/harbor` (default)                      |
| Local port              | `18080` (default)                        |
| sing-box command        | `sing-box` (or full path if not in `$PATH`) |
| cloudflared command     | `cloudflared` (or full path)             |

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

### `sing-box` or `cloudflared` fails to start

- If the binary isn't in `$PATH`, provide the full path in Harbor's settings:
  - Homebrew (Apple Silicon): `/opt/homebrew/bin/sing-box`, `/opt/homebrew/bin/cloudflared`
  - Homebrew (Intel): `/usr/local/bin/sing-box`, `/usr/local/bin/cloudflared`
- Verify installation: `sing-box version` and `cloudflared --version`

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
- **Settings persisted locally** — stored in `localStorage` (token excluded from disk for safety)

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
│   └── styles.css                # UI styles
├── src-tauri/                    # Tauri backend (Rust)
│   ├── src/
│   │   ├── lib.rs                # Tauri app setup, command registration
│   │   ├── config.rs             # Settings, VLESS link & sing-box config builders
│   │   ├── runtime.rs            # Process management (sing-box, cloudflared)
│   │   └── main.rs               # Binary entry point
│   ├── resources/
│   │   └── harbor-defaults.bundle.json   # Bundled defaults (gitignored)
│   └── tauri.conf.json           # Tauri configuration
└── docs/
    ├── cloudflare-setup.md       # Detailed Cloudflare Tunnel guide
    └── code-signing.md           # macOS code signing & notarization
```

## Security Notes

- The tunnel token is stored in `localStorage` without the saved settings export (token is stripped before persistence)
- The token is passed to `cloudflared` via `TUNNEL_TOKEN` environment variable, never in command-line arguments
- sing-box listens on `127.0.0.1` only — no direct network exposure
- The VLESS UUID is auto-generated on first launch; consider rotating it periodically

## License

MIT
