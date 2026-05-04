import { t } from './i18n';

export type HarborStatus = {
  running: boolean;
  singBoxRunning: boolean;
  cloudflaredRunning: boolean;
  vlessLink?: string | null;
  configPath?: string | null;
};

export type HarborSettings = {
  hostname: string;
  uuid: string;
  websocketPath: string;
  localPort: number;
  cloudflaredToken: string;
  singBoxPath: string;
  cloudflaredPath: string;
};

export function statusLabel(status: HarborStatus): string {
  if (status.running && status.singBoxRunning && status.cloudflaredRunning) {
    return t('app.online');
  }

  if (status.singBoxRunning || status.cloudflaredRunning) {
    return t('app.starting');
  }

  return t('app.offline');
}

export function restoreSettingsFromSaved(
  defaults: HarborSettings,
  rawSavedSettings: string | null,
): HarborSettings {
  if (!rawSavedSettings) {
    return defaults;
  }

  try {
    const saved = JSON.parse(rawSavedSettings) as Partial<HarborSettings>;
    return {
      ...defaults,
      ...saved,
      hostname: restoredText(saved.hostname, defaults.hostname, 'harbor.example.com'),
      cloudflaredToken: restoredText(saved.cloudflaredToken, defaults.cloudflaredToken),
      singBoxPath: restoredText(saved.singBoxPath, defaults.singBoxPath),
      cloudflaredPath: restoredText(saved.cloudflaredPath, defaults.cloudflaredPath),
    };
  } catch {
    return defaults;
  }
}

function restoredText(value: unknown, fallback: string, legacyDefault = ''): string {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text || text === legacyDefault) {
    return fallback;
  }

  return text;
}

export function settingsForStorage(settings: HarborSettings): HarborSettings {
  return { ...settings };
}
