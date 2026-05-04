import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

describe('release workflow', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8')

  test('uses macOS and Windows release builds and keeps Linux placeholder', () => {
    expect(workflow).toContain('build-macos')
    expect(workflow).toContain('build-windows')
    expect(workflow).toContain('linux-placeholder')
    expect(workflow).toContain('windows-latest')
    expect(workflow).not.toContain('ubuntu-latest\n    steps:\n      - name: Build Linux')
  })

  test('uses The Pair compatible signing secret names', () => {
    for (const secretName of [
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_ID',
      'APPLE_TEAM_ID',
      'MACOS_CERTIFICATE_P12_BASE64',
      'MACOS_CERTIFICATE_PASSWORD',
      'MACOS_SIGNING_IDENTITY',
    ]) {
      expect(workflow).toContain(`secrets.${secretName}`)
    }
  })

  test('lets MACOS_SIGNING_IDENTITY override the detected imported certificate identity', () => {
    expect(workflow).toContain('MACOS_SIGNING_IDENTITY: ${{ secrets.MACOS_SIGNING_IDENTITY }}')
    expect(workflow).toContain('DETECTED_CERT_ID=')
    expect(workflow).toContain('CERT_ID="${MACOS_SIGNING_IDENTITY:-$DETECTED_CERT_ID}"')
  })

  test('generates bundled defaults before Rust tests on fresh CI checkouts', () => {
    const prepareIndex = workflow.indexOf('node scripts/prepare-bundled-defaults.mjs')
    const rustTestIndex = workflow.indexOf('cargo test --lib')

    expect(prepareIndex).toBeGreaterThan(-1)
    expect(prepareIndex).toBeLessThan(rustTestIndex)
  })

  test('does not require release default configuration secrets', () => {
    expect(workflow).not.toContain('HARBOR_DEFAULT_HOSTNAME')
    expect(workflow).not.toContain('HARBOR_CLOUDFLARED_TOKEN')
    expect(workflow).not.toContain('HARBOR_REQUIRE_BUNDLED_TOKEN')
  })

  test('keeps release artifacts separate from the frontend dist directory', () => {
    expect(workflow).toContain('--out-dir release-dist')
    expect(workflow).toContain('path: release-dist/')
    expect(workflow).toContain('path: release-dist')
    expect(workflow).toContain('gh release create "$TAG" release-dist/*')
    expect(workflow).not.toContain('gh release create "$TAG" dist/*')
  })
})
