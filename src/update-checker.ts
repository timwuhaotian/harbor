import { t } from './i18n';

export type LatestVersion = {
  version: string;
  changelog: string;
  releasedAt: string;
};

export type UpdateCheckResult = {
  hasUpdate: boolean;
  version?: string;
  changelog?: string;
  releasedAt?: string;
};

const LATEST_VERSION_URL = 'https://harbor.timwuhaotian.dev/api/latest-version';
const VERIFY_TOKEN_URL = 'https://harbor.timwuhaotian.dev/api/verify-token';
const SKIPPED_VERSION_KEY = 'harbor.skippedVersion';
const DOWNLOAD_TOKEN_KEY = 'harbor.downloadToken';

function compareSemver(current: string, remote: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map(Number);
  const cur = parse(current);
  const rem = parse(remote);

  for (let i = 0; i < 3; i += 1) {
    if ((rem[i] ?? 0) > (cur[i] ?? 0)) return 1;
    if ((rem[i] ?? 0) < (cur[i] ?? 0)) return -1;
  }

  return 0;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const skipped = localStorage.getItem(SKIPPED_VERSION_KEY);

  try {
    const res = await fetch(LATEST_VERSION_URL, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      return { hasUpdate: false };
    }

    const data = (await res.json()) as LatestVersion;

    if (compareSemver(currentVersion, data.version) !== 1) {
      return { hasUpdate: false };
    }

    if (skipped === data.version) {
      return { hasUpdate: false };
    }

    return {
      hasUpdate: true,
      version: data.version,
      changelog: data.changelog,
      releasedAt: data.releasedAt,
    };
  } catch (error) {
    console.warn('[Harbor] Update check failed:', error);
    return { hasUpdate: false };
  }
}

export async function downloadUpdate(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!token.trim()) {
    return { ok: false, error: t('err.enterTokenFirst') };
  }

  try {
    const res = await fetch(VERIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();

    if (!data.valid) {
      return { ok: false, error: t('err.tokenInvalid') };
    }

    if (data.downloadUrl) {
      window.open(data.downloadUrl, '_blank');
      return { ok: true };
    }

    return { ok: false, error: t('err.noDownloadUrl') };
  } catch {
    return { ok: false, error: t('err.networkRetry') };
  }
}

export function skipVersion(version: string): void {
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
}

export function getStoredDownloadToken(): string {
  return localStorage.getItem(DOWNLOAD_TOKEN_KEY) ?? '';
}

export function storeDownloadToken(token: string): void {
  localStorage.setItem(DOWNLOAD_TOKEN_KEY, token);
}
