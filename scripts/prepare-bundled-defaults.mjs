import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const resourcesDir = 'src-tauri/resources'
const bundledDefaultsPath = `${resourcesDir}/harbor-defaults.bundle.json`
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hardcodedDefaultsPath = resolve(repoRoot, 'src-tauri/resources/harbor-defaults.defaults.json')

function readHardcodedDefaults() {
  const defaults = JSON.parse(readFileSync(hardcodedDefaultsPath, 'utf8'))
  return `${JSON.stringify(defaults, null, 2)}\n`
}

mkdirSync(resourcesDir, { recursive: true })
writeFileSync(bundledDefaultsPath, readHardcodedDefaults())
