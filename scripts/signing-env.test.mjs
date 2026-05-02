import { describe, expect, test } from 'vitest'

import { mapSigningEnv, parseDeveloperIdIdentity, parseDotEnv } from './signing-env.mjs'

describe('parseDeveloperIdIdentity', () => {
  test('extracts the first Developer ID Application identity', () => {
    const output = `
  1) C83567E0 "Apple Development: developer@example.com (GW8996KGSN)"
  2) DA51751 "Developer ID Application: Your Name (TEAMID)"
     2 valid identities found
`

    expect(parseDeveloperIdIdentity(output)).toBe('Developer ID Application: Your Name (TEAMID)')
  })
})

describe('mapSigningEnv', () => {
  test('maps local env names to Tauri Apple env names', () => {
    const result = mapSigningEnv(
      {
        CSC_NAME: 'Developer ID Application: Your Name (TEAMID)',
        TEAM_ID: 'TEAMID',
        APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
      },
      'Developer ID Application: Other (OTHERID)',
    )

    expect(result.APPLE_SIGNING_IDENTITY).toBe('Developer ID Application: Your Name (TEAMID)')
    expect(result.APPLE_TEAM_ID).toBe('TEAMID')
    expect(result.APPLE_PASSWORD).toBe('app-password')
  })

  test('uses detected identity when no explicit identity is configured', () => {
    const result = mapSigningEnv({}, 'Developer ID Application: Your Name (TEAMID)')

    expect(result.APPLE_SIGNING_IDENTITY).toBe('Developer ID Application: Your Name (TEAMID)')
  })

  test('maps macOS release secret identity to Tauri signing identity', () => {
    const result = mapSigningEnv(
      {
        MACOS_SIGNING_IDENTITY: 'Developer ID Application: Your Name (TEAMID)',
      },
      'Developer ID Application: Other (OTHERID)',
    )

    expect(result.APPLE_SIGNING_IDENTITY).toBe('Developer ID Application: Your Name (TEAMID)')
    expect(result.CSC_NAME).toBe('Developer ID Application: Your Name (TEAMID)')
  })
})

describe('parseDotEnv', () => {
  test('parses quoted signing values while ignoring comments', () => {
    expect(
      parseDotEnv(`
# comment
CSC_NAME="Developer ID Application: Your Name (TEAMID)"
TEAM_ID=TEAMID
`),
    ).toEqual({
      CSC_NAME: 'Developer ID Application: Your Name (TEAMID)',
      TEAM_ID: 'TEAMID',
    })
  })
})
