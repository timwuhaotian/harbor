import { describe, expect, test } from 'vitest';

import {
  restoreSettingsFromSaved,
  settingsForStorage,
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

  test('uses bundled token when saved token is missing', () => {
    const restored = restoreSettingsFromSaved(
      defaults,
      JSON.stringify({ hostname: 'custom.example.com', localPort: 19090 }),
    );

    expect(restored.hostname).toBe('custom.example.com');
    expect(restored.localPort).toBe(19090);
    expect(restored.cloudflaredToken).toBe('bundled-token');
  });

  test('keeps custom saved token ahead of bundled token', () => {
    const restored = restoreSettingsFromSaved(
      defaults,
      JSON.stringify({ cloudflaredToken: 'custom-token' }),
    );

    expect(restored.cloudflaredToken).toBe('custom-token');
  });

  test('replaces old empty saved defaults with bundled release defaults', () => {
    const restored = restoreSettingsFromSaved(
      {
        ...defaults,
        hostname: 'harbor.chatgpt.link',
      },
      JSON.stringify({
        hostname: 'harbor.example.com',
        cloudflaredToken: '',
        singBoxPath: '',
        cloudflaredPath: '',
      }),
    );

    expect(restored.hostname).toBe('harbor.chatgpt.link');
    expect(restored.cloudflaredToken).toBe('bundled-token');
    expect(restored.singBoxPath).toBe('sing-box');
    expect(restored.cloudflaredPath).toBe('cloudflared');
  });

  test('keeps custom saved runtime paths', () => {
    const restored = restoreSettingsFromSaved(
      defaults,
      JSON.stringify({
        singBoxPath: '/opt/custom/sing-box',
        cloudflaredPath: '/opt/custom/cloudflared',
      }),
    );

    expect(restored.singBoxPath).toBe('/opt/custom/sing-box');
    expect(restored.cloudflaredPath).toBe('/opt/custom/cloudflared');
  });
});

describe('settingsForStorage', () => {
  test('keeps user-entered token for local saved settings', () => {
    const settings: HarborSettings = {
      hostname: 'custom.example.com',
      uuid: '6f111e13-f268-4f3c-a191-2f6446466dbe',
      websocketPath: '/harbor',
      localPort: 18080,
      cloudflaredToken: 'custom-token',
      singBoxPath: 'sing-box',
      cloudflaredPath: 'cloudflared',
    };

    expect(settingsForStorage(settings).cloudflaredToken).toBe('custom-token');
  });
});
