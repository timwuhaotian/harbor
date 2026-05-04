import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const scriptPath = resolve('scripts/prepare-bundled-defaults.mjs')

function withTempProject(callback) {
  const projectDir = mkdtempSync(join(tmpdir(), 'harbor-defaults-'))

  try {
    return callback(projectDir)
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
}

function runPrepare(projectDir, env = {}) {
  const childEnv = { ...process.env }
  delete childEnv.HARBOR_DEFAULT_HOSTNAME
  delete childEnv.HARBOR_CLOUDFLARED_TOKEN
  delete childEnv.HARBOR_REQUIRE_BUNDLED_TOKEN

  execFileSync(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: { ...childEnv, ...env },
    stdio: 'pipe',
  })

  return JSON.parse(
    readFileSync(join(projectDir, 'src-tauri/resources/harbor-defaults.bundle.json'), 'utf8'),
  )
}

describe('prepare-bundled-defaults', () => {
  test('builds hardcoded bundled defaults on fresh checkouts', () => {
    withTempProject((projectDir) => {
      const defaults = runPrepare(projectDir)

      expect(defaults.hostname).toBe('harbor.chatgpt.link')
      expect(defaults.cloudflaredToken).toEqual(expect.any(String))
      expect(defaults.cloudflaredToken.length).toBeGreaterThan(40)
      expect(defaults.singBoxPath).toBe('sing-box')
      expect(defaults.cloudflaredPath).toBe('cloudflared')
    })
  })

  test('ignores build environment defaults', () => {
    withTempProject((projectDir) => {
      const defaults = runPrepare(projectDir, {
        HARBOR_DEFAULT_HOSTNAME: 'env.example.com',
        HARBOR_CLOUDFLARED_TOKEN: 'env-token',
      })

      expect(defaults.hostname).toBe('harbor.chatgpt.link')
      expect(defaults.cloudflaredToken).not.toBe('env-token')
    })
  })

  test('ignores build-machine local defaults', () => {
    withTempProject((projectDir) => {
      const resourcesDir = join(projectDir, 'src-tauri/resources')
      mkdirSync(resourcesDir, { recursive: true })
      writeFileSync(
        join(resourcesDir, 'harbor-defaults.local.json'),
        JSON.stringify({ hostname: 'local.example.com', cloudflaredToken: 'local-token' }),
      )

      const defaults = runPrepare(projectDir)

      expect(defaults.hostname).toBe('harbor.chatgpt.link')
      expect(defaults.cloudflaredToken).not.toBe('local-token')
    })
  })

  test('does not require release token configuration', () => {
    withTempProject((projectDir) => {
      const defaults = runPrepare(projectDir, {
        HARBOR_REQUIRE_BUNDLED_TOKEN: '1',
      })

      expect(defaults.cloudflaredToken.length).toBeGreaterThan(40)
    })
  })
})
