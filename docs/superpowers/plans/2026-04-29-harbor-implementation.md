# Harbor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Harbor, a macOS Tauri app that exposes this Mac as a VLESS WebSocket exit node through Cloudflare Tunnel.

**Architecture:** Rust owns protocol config, process lifecycle, and log streaming. TypeScript owns the desktop UI, form state, copy action, and QR rendering.

**Tech Stack:** Tauri v2, Rust, Vite, TypeScript, sing-box, cloudflared, Cloudflare Tunnel.

---

## Chunk 1: Rust Core

### Task 1: VLESS Link And sing-box Config

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Write failing Rust tests for VLESS URL generation, local VLESS WebSocket inbound config, and token validation.
- [x] Run `cargo test config --lib` and verify the tests fail on unimplemented functions.
- [x] Implement minimal config generation and validation.
- [x] Run `cargo test config --lib` and verify green.

### Task 2: Runtime Process Boundary

**Files:**
- Create: `src-tauri/src/runtime.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Write failing tests for sing-box args, cloudflared args, and config path generation.
- [x] Run `cargo test runtime --lib` and verify the tests fail on unimplemented functions.
- [x] Implement process helpers, Tauri commands, app state, and log streaming.
- [x] Run `cargo test --lib` and verify green.

## Chunk 2: Frontend

### Task 3: UI Helpers

**Files:**
- Create: `src/ui.ts`
- Create: `src/ui.test.ts`

- [x] Write failing Vitest tests for status labels and token masking.
- [x] Run `npm test` and verify red.
- [x] Implement the helpers.
- [x] Run `npm test` and verify green.

### Task 4: Desktop Interface

**Files:**
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `index.html`

- [x] Build the settings form, status card, action buttons, link card, QR code, and logs panel.
- [x] Wire Tauri commands through `@tauri-apps/api/core`.
- [x] Wire `harbor-log` events through `@tauri-apps/api/event`.
- [x] Run `npm run build` and verify green.

## Chunk 3: Verification

### Task 5: Project Validation

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [x] Add setup instructions for Cloudflare Tunnel, sing-box, and cloudflared.
- [x] Run `cargo check` for the Tauri Rust app.
- [x] Run `npm run tauri build` once icons/bundling are production-ready.
