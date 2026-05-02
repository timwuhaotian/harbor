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
    return { ...defaults, ...saved, cloudflaredToken: defaults.cloudflaredToken };
  } catch {
    return defaults;
  }
}
