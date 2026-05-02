import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

describe('release configuration', () => {
  test('keeps Tauri app version sourced from package.json', () => {
    const tauriConfig = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))

    expect(tauriConfig.version).toBe('../package.json')
  })

  test('does not log secret-derived signing identity values', () => {
    const buildScript = readFileSync('scripts/build-signed-mac.mjs', 'utf8')

    expect(buildScript).not.toContain('APPLE_SIGNING_IDENTITY}`')
  })
})
