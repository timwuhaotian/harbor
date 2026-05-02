import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLOUDFLARED_VERSION = '2026.3.0'
const SING_BOX_VERSION = '1.13.11'

const resourcesDir = 'src-tauri/resources'

const downloads = {
  macos: {
    cloudflared: {
      url: `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-darwin-arm64.tgz`,
      dest: 'cloudflared',
      extract: true,
      extractFrom: 'cloudflared',
    },
    'sing-box': {
      url: `https://github.com/SagerNet/sing-box/releases/download/v${SING_BOX_VERSION}/sing-box-${SING_BOX_VERSION}-darwin-arm64.tar.gz`,
      dest: 'sing-box',
      extract: true,
      extractFrom: `sing-box-${SING_BOX_VERSION}-darwin-arm64/sing-box`,
    },
  },
  windows: {
    cloudflared: {
      url: `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`,
      dest: 'cloudflared.exe',
    },
    'sing-box': {
      url: `https://github.com/SagerNet/sing-box/releases/download/v${SING_BOX_VERSION}/sing-box-${SING_BOX_VERSION}-windows-amd64.zip`,
      dest: 'sing-box.exe',
      extract: true,
      extractFrom: `sing-box-${SING_BOX_VERSION}-windows-amd64/sing-box.exe`,
    },
  },
}

function downloadFile(url, dest) {
  console.log(`Downloading ${url}`)
  const result = spawnSync('curl', ['-L', '-o', dest, url], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`curl failed with exit code ${result.status}`)
  }
}

function extractZip(zipPath, extractPath) {
  console.log(`Extracting ${zipPath}`)
  const result = spawnSync('unzip', ['-o', zipPath, '-d', extractPath], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`unzip failed with exit code ${result.status}`)
  }
}

function extractTar(tarPath, extractPath) {
  console.log(`Extracting ${tarPath}`)
  const result = spawnSync('tar', ['-xzf', tarPath, '-C', extractPath], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`tar failed with exit code ${result.status}`)
  }
}

async function fetchRuntimes(platform) {
  const platforms = platform === 'all' ? ['macos', 'windows'] : [platform]

  mkdirSync(resourcesDir, { recursive: true })

  const tempDir = join(tmpdir(), `harbor-runtimes-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })

  try {
    for (const p of platforms) {
      for (const [name, config] of Object.entries(downloads[p])) {
        const destPath = join(resourcesDir, config.dest)
        if (existsSync(destPath)) {
          console.log(`Skipping ${name} (${p}) (already exists at ${destPath})`)
          continue
        }

        const tempFile = join(tempDir, `${p}-${name}`)
        downloadFile(config.url, tempFile)

        if (config.extract) {
          const extractDir = join(tempDir, `${name}-extracted`)
          mkdirSync(extractDir, { recursive: true })
          
          if (config.url.endsWith('.tgz') || config.url.endsWith('.tar.gz')) {
            extractTar(tempFile, extractDir)
          } else {
            extractZip(tempFile, extractDir)
          }

          const extractedFile = join(extractDir, config.extractFrom)
          if (!existsSync(extractedFile)) {
            throw new Error(`Extracted file not found: ${extractedFile}`)
          }

          copyFileSync(extractedFile, destPath)
          console.log(`Extracted ${name} (${p}) to ${destPath}`)
        } else {
          copyFileSync(tempFile, destPath)
          console.log(`Downloaded ${name} (${p}) to ${destPath}`)
        }

        if (name === 'cloudflared' && !config.extract) {
          spawnSync('chmod', ['+x', destPath], {
            stdio: 'inherit',
          })
        }
      }
    }
  } finally {
    spawnSync('rm', ['-rf', tempDir], { stdio: 'inherit' })
  }

  console.log(`✅ ${platforms.join(' + ')} runtimes downloaded successfully`)

  // Create empty placeholders for any missing binaries so Tauri config validation passes
  for (const [, platformDownloads] of Object.entries(downloads)) {
    for (const [, config] of Object.entries(platformDownloads)) {
      const destPath = join(resourcesDir, config.dest)
      if (!existsSync(destPath)) {
        writeFileSync(destPath, '')
        console.log(`Created placeholder: ${destPath}`)
      }
    }
  }
}

const platform = process.argv[2]
if (!platform || !['macos', 'windows', 'all'].includes(platform)) {
  console.error('Usage: node scripts/fetch-runtimes.mjs <macos|windows|all>')
  process.exit(1)
}

try {
  await fetchRuntimes(platform)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
