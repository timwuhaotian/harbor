# Harbor

Harbor is a small macOS desktop app that turns this Mac into a personal VLESS WebSocket exit node through Cloudflare Tunnel.

## How It Works

```text
V2Box on phone
  -> VLESS + WebSocket + TLS
  -> Cloudflare hostname
  -> Cloudflare Tunnel
  -> Harbor on Mac
  -> local sing-box VLESS inbound
  -> direct outbound from the Mac
```

Cloudflare manages TLS on the public hostname. Harbor runs plain local WebSocket on `127.0.0.1`, and `cloudflared` carries that local service through the authenticated tunnel.

## Requirements

- macOS with Rust, Node.js, and npm
- `sing-box`
- `cloudflared`
- A Cloudflare named tunnel with a public hostname pointing to `http://127.0.0.1:18080`

Install the runtime tools with Homebrew if needed:

```bash
brew install sing-box cloudflared
```

## Cloudflare Setup

1. Create a named Cloudflare Tunnel.
2. Add a public hostname such as `harbor.example.com`.
3. Set the service target to `http://127.0.0.1:18080`.
4. Copy the tunnel token.
5. Paste the token and hostname into Harbor.

## Development

```bash
npm install
npm run dev
```

`npm run dev` launches the Tauri desktop app. Tauri starts the Vite frontend through `npm run dev:frontend`.

## Signed macOS Build

Harbor is configured to sign with the same Developer ID Application account used by `../the-pair`.

```bash
npm run build:mac:signed
npm run verify:mac-signature
```

See `docs/code-signing.md` for optional notarization env values.

## Cloudflare Guide

See `docs/cloudflare-setup.md` for the exact subdomain and tunnel setup.

This local build can prefill GUI defaults from `src-tauri/resources/harbor-defaults.local.json`. Build scripts copy it into the app bundle as `harbor-defaults.bundle.json`. Both files are intentionally gitignored because they may contain a Cloudflare tunnel token.

## Tests

```bash
npm test
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

## V2Box Link Shape

```text
vless://<uuid>@harbor.example.com:443?encryption=none&security=tls&type=ws&host=harbor.example.com&sni=harbor.example.com&path=%2Fharbor#Harbor-Mac
```
