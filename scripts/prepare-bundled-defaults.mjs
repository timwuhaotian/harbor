import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'

const resourcesDir = 'src-tauri/resources'
const localDefaultsPath = `${resourcesDir}/harbor-defaults.local.json`
const bundledDefaultsPath = `${resourcesDir}/harbor-defaults.bundle.json`

mkdirSync(resourcesDir, { recursive: true })

if (existsSync(localDefaultsPath)) {
  copyFileSync(localDefaultsPath, bundledDefaultsPath)
} else {
  writeFileSync(bundledDefaultsPath, '{}\n')
}
