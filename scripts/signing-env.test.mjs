import { describe, expect, test } from 'vitest'

import { mapSigningEnv, parseDeveloperIdIdentity, parseDotEnv } from './signing-env.mjs'

describe('parseDeveloperIdIdentity', () => {
  test('extracts the first Developer ID Application identity', () => {
    const output = `
  1) C83567E0 "Apple Development: gosingk@gmail.com (GW8996KGSN)"
  2) DA51751 "Developer ID Application: HAOTIAN WU (43VLF3KTFZ)"
     2 valid identities found
`

    expect(parseDeveloperIdIdentity(output)).toBe('Developer ID Application: HAOTIAN WU (43VLF3KTFZ)')
  })
})

describe('mapSigningEnv', () => {
  test('maps The Pair local env names to Tauri Apple env names', () => {
    const result = mapSigningEnv(
      {
        CSC_NAME: 'Developer ID Application: HAOTIAN WU (43VLF3KTFZ)',
        TEAM_ID: '43VLF3KTFZ',
        APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
      },
      'Developer ID Application: OTHER (TEAMID)',
    )

    expect(result.APPLE_SIGNING_IDENTITY).toBe('Developer ID Application: HAOTIAN WU (43VLF3KTFZ)')
    expect(result.APPLE_TEAM_ID).toBe('43VLF3KTFZ')
    expect(result.APPLE_PASSWORD).toBe('app-password')
  })

  test('uses detected identity when no explicit identity is configured', () => {
    const result = mapSigningEnv({}, 'Developer ID Application: HAOTIAN WU (43VLF3KTFZ)')

    expect(result.APPLE_SIGNING_IDENTITY).toBe('Developer ID Application: HAOTIAN WU (43VLF3KTFZ)')
  })

  test('maps macOS release secret identity to Tauri signing identity', () => {
    const result = mapSigningEnv(
      {
        MACOS_SIGNING_IDENTITY: 'Developer ID Application: HAOTIAN WU (43VLF3KTFZ)',
      },
      'Developer ID Application: OTHER (TEAMID)',
    )

    expect(result.APPLE_SIGNING_IDENTITY).toBe('Developer ID Application: HAOTIAN WU (43VLF3KTFZ)')
    expect(result.CSC_NAME).toBe('Developer ID Application: HAOTIAN WU (43VLF3KTFZ)')
  })
})

describe('parseDotEnv', () => {
  test('parses quoted signing values while ignoring comments', () => {
    expect(
      parseDotEnv(`
# comment
CSC_NAME="Developer ID Application: HAOTIAN WU (43VLF3KTFZ)"
TEAM_ID=43VLF3KTFZ
`),
    ).toEqual({
      CSC_NAME: 'Developer ID Application: HAOTIAN WU (43VLF3KTFZ)',
      TEAM_ID: '43VLF3KTFZ',
    })
  })
})
