import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

describe('release workflow', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8')

  test('uses macOS release build and keeps Windows/Linux placeholders', () => {
    expect(workflow).toContain('build-macos')
    expect(workflow).toContain('windows-placeholder')
    expect(workflow).toContain('linux-placeholder')
    expect(workflow).not.toContain('windows-latest')
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
})
