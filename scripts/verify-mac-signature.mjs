import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'

const appPath = 'src-tauri/target/release/bundle/macos/Harbor.app'
const dmgDir = 'src-tauri/target/release/bundle/dmg'

if (!existsSync(appPath)) {
  throw new Error(`Missing app bundle: ${appPath}`)
}

execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
  stdio: 'inherit',
})

execFileSync('codesign', ['-dvvv', appPath], {
  stdio: 'inherit',
})

if (existsSync(dmgDir)) {
  const dmgPath = readdirSync(dmgDir)
    .filter((name) => name.endsWith('.dmg'))
    .sort()
    .at(-1)

  if (dmgPath) {
    const fullPath = `${dmgDir}/${dmgPath}`
    execFileSync('codesign', ['--verify', '--verbose=2', fullPath], {
      stdio: 'inherit',
    })
    execFileSync('codesign', ['-dvvv', fullPath], {
      stdio: 'inherit',
    })
  }
}
