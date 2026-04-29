# Harbor Design

## Goal

Build a small macOS app that lets a mobile device use V2Box to connect to this Mac as a personal proxy exit node without router port forwarding.

## Architecture

Harbor uses Tauri v2 with a Rust backend and a Vite TypeScript frontend. The Rust backend generates the VLESS share link and sing-box config, starts `sing-box` as the local VLESS WebSocket server, starts `cloudflared` with a named tunnel token, and streams process logs to the UI.

Cloudflare terminates TLS for the public hostname. Local traffic from Cloudflare Tunnel is forwarded to `http://127.0.0.1:18080`, where sing-box accepts VLESS WebSocket traffic and exits directly through the Mac's network.

## MVP Scope

- One VLESS user UUID.
- One WebSocket path.
- One Cloudflare hostname.
- One named Cloudflare tunnel token.
- Start/stop runtime controls.
- VLESS link and QR code generation.
- Runtime logs.

## Out of Scope

- Full Cloudflare API automation.
- Bundled sing-box/cloudflared binaries.
- TUN mode.
- Multi-user management.
- VPS relay mode.
