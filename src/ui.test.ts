import { describe, expect, test } from 'vitest';

import {
  restoreSettingsFromSaved,
  statusLabel,
  type HarborSettings,
  type HarborStatus,
} from './ui';

function status(overrides: Partial<HarborStatus>): HarborStatus {
  return {
    running: false,
    singBoxRunning: false,
    cloudflaredRunning: false,
    vlessLink: null,
    configPath: null,
    ...overrides,
  };
}

describe('statusLabel', () => {
  test('reports ready when both processes are running', () => {
    expect(
      statusLabel(status({ running: true, singBoxRunning: true, cloudflaredRunning: true })),
    ).toBe('Online');
  });

  test('reports partial state when only one process is running', () => {
    expect(statusLabel(status({ singBoxRunning: true }))).toBe('Starting');
  });

  test('reports stopped when no process is running', () => {
    expect(statusLabel(status({}))).toBe('Offline');
  });
});

describe('restoreSettingsFromSaved', () => {
  const defaults: HarborSettings = {
    hostname: 'harbor.example.com',
    uuid: '6f111e13-f268-4f3c-a191-2f6446466dbe',
    websocketPath: '/harbor',
    localPort: 18080,
    cloudflaredToken: 'bundled-token',
    singBoxPath: 'sing-box',
    cloudflaredPath: 'cloudflared',
  };

  test('keeps bundled token when restoring saved non-secret settings', () => {
    const restored = restoreSettingsFromSaved(
      defaults,
      JSON.stringify({ hostname: 'custom.example.com', localPort: 19090 }),
    );

    expect(restored.hostname).toBe('custom.example.com');
    expect(restored.localPort).toBe(19090);
    expect(restored.cloudflaredToken).toBe('bundled-token');
  });
});
