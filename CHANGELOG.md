# Changelog

All notable changes to Harbor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.14] - 2026-05-01

### Fixed
- Kill child process groups on stop/quit to prevent stale sing-box and cloudflared processes.
- Stop services when closing the app window.
- Fix log panel auto-scrolling back to top; logs now append incrementally and only auto-follow when near the bottom.

## [0.1.13] - 2026-05-01

### Fixed
- Bundle Cloudflare tunnel token and hostname in harbor-defaults.bundle.json so the service can start without manual configuration.

## [0.1.12] - 2026-05-01

### Fixed
- Fix Windows CI release asset collection by using PowerShell env variable syntax.

## [0.1.11] - 2026-05-01

### Fixed
- Codesign bundled runtime binaries (cloudflared, sing-box) with hardened runtime for macOS notarization.
- Use file copy instead of rename in runtime download script to fix cross-device link error on Windows CI.

## [0.1.10] - 2026-05-01

### Fixed
- Fixed placeholder creation loop in `fetch-runtimes.mjs` that caused "path must be string" error on Windows runtime downloads.

## [0.1.9] - 2026-05-01

### Fixed
- Create placeholder files for missing platform binaries so Tauri config validation passes on all runners.

## [0.1.8] - 2026-05-01

### Fixed
- Download runtimes in CI test job before building Tauri.

## [0.1.7] - 2026-05-01

### Fixed
- Fixed CI/CD resource bundling by downloading both macOS and Windows binaries.
- Removed glob patterns from tauri.conf.json resources (use explicit filenames).

## [0.1.6] - 2026-05-01

### Added
- Windows release build (NSIS + MSI) via GitHub Actions.
- Bundled `cloudflared` and `sing-box` binaries for out-of-the-box experience.
- Automatic runtime binary download during CI/CD and local development.

### Changed
- Default binary paths are now empty (uses bundled binaries).
- Release workflow downloads platform-specific runtimes before building.

## [0.1.5] - 2026-05-01

### Fixed
- Fixed version number display position next to app title.
- Added debug logging for update check failures.

## [0.1.4] - 2026-05-01

### Added
- Automatic update check on startup with in-app notification card showing changelog.
- Manual "Check for Updates" button in sidebar.
- Registration token input field for paid download authentication.
- Skip version option to dismiss update notifications per version.

## [0.1.3] - 2026-05-01

### Fixed
- Fixed macOS bundling error by adding proper icon files (`.icns`, `.ico`, and required PNG sizes).

## [0.1.2] - 2026-05-01

### Changed
- Renamed DMG release asset to `harbor.dmg` (without version suffix).

## [0.1.1] - 2026-05-01

### Changed
- Lowered minimum macOS version from 12.0 to 11.0 to support Big Sur.

## [0.1.0] - 2026-04-29

### Added
- Initial macOS Tauri app for running a personal VLESS WebSocket exit node through Cloudflare Tunnel.
- sing-box and cloudflared process management with runtime logs.
- V2Box-compatible VLESS link and QR code generation.
- Developer ID signing flow for private macOS distribution.
- Cloudflare setup and code-signing documentation.

[0.1.9]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.9
[0.1.8]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.8
[0.1.7]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.7
[0.1.6]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.6
[0.1.5]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.5
[0.1.4]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.4
[0.1.3]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.3
[0.1.2]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.2
[0.1.1]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.1
[0.1.0]: https://github.com/timwuhaotian/harbor/releases/tag/v0.1.0
