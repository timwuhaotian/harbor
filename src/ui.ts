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
    return 'Online';
  }

  if (status.singBoxRunning || status.cloudflaredRunning) {
    return 'Starting';
  }

  return 'Offline';
}

export function maskToken(token: string): string {
  const trimmed = token.trim();

  if (trimmed.length === 0) {
    return '';
  }

  if (trimmed.length <= 12) {
    return 'Stored token';
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
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
