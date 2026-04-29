import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { collectMacReleaseAssets } from './release-assets.mjs'

describe('collectMacReleaseAssets', () => {
  test('copies macOS DMG and zips app bundle with Harbor release names', () => {
    const root = mkdtempSync(join(tmpdir(), 'harbor-release-assets-'))
    const bundleRoot = join(root, 'bundle')
    const outDir = join(root, 'dist')
    const appDir = join(bundleRoot, 'macos', 'Harbor.app')
    const dmgDir = join(bundleRoot, 'dmg')
    const dmgPath = join(dmgDir, 'Harbor_0.1.0_aarch64.dmg')

    mkdirSync(appDir, { recursive: true })
    mkdirSync(dmgDir, { recursive: true })
    writeFileSync(join(appDir, 'Contents'), 'app')
    writeFileSync(dmgPath, 'dmg')

    const assets = collectMacReleaseAssets({ bundleRoot, outDir, version: '0.1.0' })

    expect(assets.map((asset) => asset.destination.split('/').at(-1))).toEqual([
      'harbor-0.1.0.dmg',
      'harbor-0.1.0-macos.zip',
    ])
    expect(readFileSync(join(outDir, 'harbor-0.1.0.dmg'), 'utf8')).toBe('dmg')

    rmSync(root, { recursive: true, force: true })
  })
})
