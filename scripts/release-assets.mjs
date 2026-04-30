import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${token}`)
    }

    options[token.slice(2)] = next
    index += 1
  }

  return options
}

function walkFiles(rootDir) {
  const entries = []

  for (const entry of readdirSync(rootDir, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const absolutePath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      entries.push(...walkFiles(absolutePath))
      continue
    }

    if (entry.isFile()) {
      entries.push(absolutePath)
    }
  }

  return entries
}

function findFirstFile(rootDir, pattern) {
  const searchRoot = resolve(rootDir)
  if (!statSync(searchRoot, { throwIfNoEntry: false })) {
    throw new Error(`Expected bundle directory at ${searchRoot}`)
  }

  const candidate = walkFiles(searchRoot).find((filePath) => pattern.test(filePath))
  if (!candidate) {
    throw new Error(`No matching release asset found under ${searchRoot}`)
  }

  return candidate
}

function zipAppBundle(appPath, destination) {
  const result = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, destination], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`ditto failed with exit code ${result.status}`)
  }
}

export function collectMacReleaseAssets({ bundleRoot, outDir, version }) {
  const resolvedBundleRoot = resolve(bundleRoot)
  const resolvedOutDir = resolve(outDir)
  mkdirSync(resolvedOutDir, { recursive: true })

  const dmgSource = findFirstFile(join(resolvedBundleRoot, 'dmg'), /\.dmg$/i)
  const appSource = join(resolvedBundleRoot, 'macos', 'Harbor.app')
  if (!statSync(appSource, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Expected app bundle at ${appSource}`)
  }

  const dmgDestination = join(resolvedOutDir, `harbor.dmg`)
  const zipDestination = join(resolvedOutDir, `harbor-${version}-macos.zip`)

  copyFileSync(dmgSource, dmgDestination)
  zipAppBundle(appSource, zipDestination)

  return [
    { source: dmgSource, destination: dmgDestination },
    { source: appSource, destination: zipDestination },
  ]
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const platform = options.platform
  const bundleRoot = options['bundle-root']
  const outDir = options['out-dir']
  const version = options.version

  if (!platform || !bundleRoot || !outDir || !version) {
    throw new Error(
      'Usage: node scripts/release-assets.mjs --platform <macos|windows|linux> --bundle-root <path> --out-dir <path> --version <version>',
    )
  }

  if (platform !== 'macos') {
    throw new Error(`${platform} release assets are placeholders and are not built yet`)
  }

  const assets = collectMacReleaseAssets({ bundleRoot, outDir, version })
  for (const asset of assets) {
    console.log(`Collected ${asset.source} -> ${asset.destination}`)
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
