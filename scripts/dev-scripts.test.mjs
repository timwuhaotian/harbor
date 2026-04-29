import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const tauriConfig = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))

describe('development scripts', () => {
  test('npm run dev launches Tauri dev mode', () => {
    expect(packageJson.scripts.dev).toBe('npm run tauri -- dev')
  })

  test('Tauri beforeDevCommand starts only the frontend service', () => {
    expect(packageJson.scripts['dev:frontend']).toBe('node scripts/prepare-bundled-defaults.mjs && vite')
    expect(tauriConfig.build.beforeDevCommand).toBe('npm run dev:frontend')
  })
})
