import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import { mapSigningEnv, parseDeveloperIdIdentity, parseDotEnv } from './signing-env.mjs'

function loadLocalEnv() {
  if (!existsSync('.env')) {
    return {}
  }

  return parseDotEnv(readFileSync('.env', 'utf8'))
}

function detectDeveloperIdIdentity() {
  const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })

  return parseDeveloperIdIdentity(output)
}

function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Signed macOS builds must run on macOS.')
  }

  const localEnv = loadLocalEnv()
  const detectedIdentity = detectDeveloperIdIdentity()
  const env = mapSigningEnv({ ...process.env, ...localEnv }, detectedIdentity)

  if (!env.APPLE_SIGNING_IDENTITY) {
    throw new Error('No Developer ID Application identity found. Install the certificate or set CSC_NAME.')
  }

  console.log(`Using signing identity: ${env.APPLE_SIGNING_IDENTITY}`)

  const args = ['run', 'tauri', '--', 'build', ...process.argv.slice(2)]
  const result = spawnSync('npm', args, {
    env,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  process.exit(result.status ?? 1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
