import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import process from 'node:process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
const changelog = readFileSync(join(rootDir, 'CHANGELOG.md'), 'utf8')

if (!changelog.includes(`## [${packageJson.version}]`)) {
  console.error(`Missing changelog entry for version ${packageJson.version}`)
  console.error(`Add: ## [${packageJson.version}] - ${new Date().toISOString().slice(0, 10)}`)
  process.exit(1)
}

console.log(`Changelog entry found for version ${packageJson.version}`)
