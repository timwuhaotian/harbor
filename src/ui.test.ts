import { describe, expect, test } from 'vitest';

import { maskToken, restoreSettingsFromSaved, statusLabel, type HarborSettings, type HarborStatus } from './ui';

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
    ).toBe('在线');
  });

  test('reports partial state when only one process is running', () => {
    expect(statusLabel(status({ singBoxRunning: true }))).toBe('启动中');
  });

  test('reports stopped when no process is running', () => {
    expect(statusLabel(status({}))).toBe('离线');
  });
});

describe('maskToken', () => {
  test('keeps empty token empty', () => {
    expect(maskToken('')).toBe('');
  });

  test('masks long tokens without hiding that a token exists', () => {
    expect(maskToken('abcdefghijklmnopqrstuvwxyz')).toBe('abcd...wxyz');
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
