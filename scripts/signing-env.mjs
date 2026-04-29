export function parseDeveloperIdIdentity(output) {
  const match = String(output).match(/"(Developer ID Application:[^"]+)"/)
  return match?.[1] ?? null
}

export function parseDotEnv(content) {
  const values = {}

  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

export function mapSigningEnv(env, detectedIdentity) {
  const applePassword = env.APPLE_PASSWORD || env.APPLE_APP_SPECIFIC_PASSWORD || ''
  const appleTeamId = env.APPLE_TEAM_ID || env.TEAM_ID || ''
  const appleSigningIdentity = env.APPLE_SIGNING_IDENTITY || env.CSC_NAME || detectedIdentity || ''

  return {
    ...env,
    APPLE_SIGNING_IDENTITY: appleSigningIdentity,
    APPLE_TEAM_ID: appleTeamId,
    APPLE_PASSWORD: applePassword,
  }
}
