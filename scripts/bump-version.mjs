import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import process from 'node:process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const newVersion = process.argv[2]

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: npm run bump <version>')
  console.error('Example: npm run bump 0.2.0')
  process.exit(1)
}

const packagePath = join(rootDir, 'package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const oldVersion = packageJson.version

packageJson.version = newVersion
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

const changelog = readFileSync(join(rootDir, 'CHANGELOG.md'), 'utf8')
if (!changelog.includes(`## [${newVersion}]`)) {
  console.error(`Version bumped ${oldVersion} -> ${newVersion}, but CHANGELOG.md is missing an entry.`)
  console.error(`Add: ## [${newVersion}] - ${new Date().toISOString().slice(0, 10)}`)
  process.exit(1)
}

console.log(`Version bumped ${oldVersion} -> ${newVersion}`)
console.log('Do not create tags manually; GitHub Actions publishes the release for new package versions.')
