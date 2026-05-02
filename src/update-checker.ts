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
const GITHUB_RELEASES_URL = 'https://github.com/timwuhaotian/harbor/releases';
const SKIPPED_VERSION_KEY = 'harbor.skippedVersion';

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

export function downloadUpdate(): void {
  window.open(GITHUB_RELEASES_URL, '_blank');
}

export function skipVersion(version: string): void {
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
}
