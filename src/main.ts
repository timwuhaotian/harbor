import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import QRCode from 'qrcode';

import './styles.css';
import {
  restoreSettingsFromSaved,
  settingsForStorage,
  statusLabel,
  type HarborSettings,
  type HarborStatus,
} from './ui';
import { checkForUpdate, downloadUpdate, skipVersion, type UpdateCheckResult } from './update-checker';
import { getLocale, setLocale, initLocale, t } from './i18n';

type Preview = {
  vlessLink: string;
  singBoxConfig: unknown;
};

type DependencyStatus = {
  singBoxOk: boolean;
  cloudflaredOk: boolean;
  singBoxPath: string;
  cloudflaredPath: string;
  singBoxVersion: string | null;
  cloudflaredVersion: string | null;
};

type HarborLogEvent = {
  source: string;
  stream: string;
  line: string;
};

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
    throw new Error(t('err.noRootElement'));
}

const app: HTMLDivElement = appRoot;

let settings: HarborSettings | null = null;
let status: HarborStatus = {
  running: false,
  singBoxRunning: false,
  cloudflaredRunning: false,
  vlessLink: null,
  configPath: null,
};
let preview: Preview | null = null;
let errorMessage = '';
let busy = false;
let updateInfo: UpdateCheckResult | null = null;
let updateError = '';
let checkingUpdate = false;
let dependencyStatus: DependencyStatus | null = null;
let autoLaunchEnabled = false;
let showAbout = false;
const logs: HarborLogEvent[] = [];

function persistSettings(nextSettings: HarborSettings): void {
  localStorage.setItem('harbor.settings', JSON.stringify(settingsForStorage(nextSettings)));
}

function restoreSettings(defaults: HarborSettings): HarborSettings {
  return restoreSettingsFromSaved(defaults, localStorage.getItem('harbor.settings'));
}

function readForm(): HarborSettings {
  const form = app.querySelector<HTMLFormElement>('#settings-form');

  if (!form) {
    throw new Error(t('err.formNotMounted'));
  }

  const data = new FormData(form);

  return {
    hostname: String(data.get('hostname') ?? ''),
    uuid: String(data.get('uuid') ?? ''),
    websocketPath: String(data.get('websocketPath') ?? ''),
    localPort: Number(data.get('localPort') ?? 18080),
    cloudflaredToken: String(data.get('cloudflaredToken') ?? ''),
    singBoxPath: String(data.get('singBoxPath') ?? ''),
    cloudflaredPath: String(data.get('cloudflaredPath') ?? ''),
  };
}

async function updatePreview(): Promise<void> {
  if (!settings) {
    return;
  }

  try {
    preview = await invoke<Preview>('preview_settings', { settings });
    errorMessage = '';
  } catch (error) {
    preview = null;
    errorMessage = String(error);
  }

  render();
}

async function refreshStatus(): Promise<void> {
  const prev = status;
  status = await invoke<HarborStatus>('get_status');
  if (JSON.stringify(status) !== JSON.stringify(prev)) {
    try {
      await invoke('update_tray_icon', { running: status.running });
    } catch { /* non-critical */ }
    render();
  }
}

function scheduleStatusPolling(): void {
  window.setInterval(() => {
    if (status.running || status.singBoxRunning || status.cloudflaredRunning) {
      void refreshStatus();
    }
  }, 2_000);
}

async function startHarbor(): Promise<void> {
  if (!settings) {
    return;
  }

  busy = true;
  errorMessage = '';
  render();

  try {
    status = await invoke<HarborStatus>('start_harbor', { settings });
    preview = status.vlessLink ? { vlessLink: status.vlessLink, singBoxConfig: null } : preview;
    try { await invoke('update_tray_icon', { running: status.running }); } catch { /* non-critical */ }
  } catch (error) {
    errorMessage = String(error);
  } finally {
    busy = false;
    render();
  }
}

async function stopHarbor(): Promise<void> {
  busy = true;
  errorMessage = '';
  render();

  try {
    status = await invoke<HarborStatus>('stop_harbor');
    try { await invoke('update_tray_icon', { running: false }); } catch { /* non-critical */ }
  } catch (error) {
    errorMessage = String(error);
  } finally {
    busy = false;
    render();
  }
}

async function copyVlessLink(): Promise<void> {
  const link = preview?.vlessLink ?? status.vlessLink;

  if (!link) {
    return;
  }

  await navigator.clipboard.writeText(link);
}

function render(): void {
  if (!settings) {
    app.innerHTML = `<div class="loading">${t('app.loading')}</div>`;
    return;
  }

  const label = statusLabel(status);
  const link = preview?.vlessLink ?? status.vlessLink ?? '';
  const hasRuntimeProcess = status.singBoxRunning || status.cloudflaredRunning;
  const statusClass = label === t('app.online') ? 'online' : label === t('app.starting') ? 'starting' : '';
  const logLines = logs
    .slice(-120)
    .map(
      (log) =>
        `<div class="log-line"><span>${escapeHtml(log.source)}</span><span>${escapeHtml(log.stream)}</span><p>${escapeHtml(log.line)}</p></div>`,
    )
    .join('');

  const locale = getLocale();

  app.innerHTML = `
    <section class="shell">
      <aside class="hero-panel" aria-label="Harbor Overview">
        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-left">
              <div class="brand-icon">H</div>
              <h1>Harbor <span class="app-version">v${__APP_VERSION__}</span></h1>
            </div>
            <div class="lang-switch" role="radiogroup" aria-label="${t('app.language')}">
              <label class="lang-option">
                <input type="radio" name="lang" value="en" ${locale === 'en' ? 'checked' : ''} />
                <span>EN</span>
              </label>
              <label class="lang-option">
                <input type="radio" name="lang" value="zh-CN" ${locale === 'zh-CN' ? 'checked' : ''} />
                <span>中文</span>
              </label>
            </div>
          </div>
          <p class="eyebrow">${t('app.heroEyebrow')}</p>
          <p class="lede">${t('app.heroDesc')}</p>
          <div class="hero-actions-row">
            <button id="check-update-button" class="ghost version-check" ${checkingUpdate ? 'disabled' : ''}>${checkingUpdate ? t('app.checking') : t('app.checkUpdate')}</button>
            <button id="about-button" class="ghost version-check">${t('app.about')}</button>
          </div>
        </div>

        ${updateInfo?.hasUpdate ? `
        <div class="update-card">
          <div class="update-card-header">
            <span class="update-badge">${t('app.newVersion')}</span>
            <span class="update-version">v${escapeHtml(updateInfo.version ?? '')}</span>
          </div>
          ${updateInfo.changelog ? `<div class="update-changelog">${formatChangelog(escapeHtml(updateInfo.changelog))}</div>` : ''}
          ${updateError ? `<div class="update-error">${escapeHtml(updateError)}</div>` : ''}
          <div class="update-actions">
            <button id="download-update-button" class="primary">${t('app.downloadUpdate')}</button>
            <button id="skip-update-button" class="ghost">${t('app.skipVersion')}</button>
          </div>
        </div>
        ` : ''}

        <div class="status-panel">
          <div class="status-header">
            <h2>${t('app.nodeStatus')}</h2>
            <div class="status-indicator">
              <span class="status-dot ${statusClass}"></span>
              <span>${label}</span>
            </div>
          </div>
          <div class="status-processes">
            <div class="process-item">
              <span class="process-name">sing-box</span>
              <span class="process-status ${status.singBoxRunning ? 'running' : 'stopped'}">${status.singBoxRunning ? t('app.running') : t('app.stopped')}</span>
            </div>
            <div class="process-item">
              <span class="process-name">cloudflared</span>
              <span class="process-status ${status.cloudflaredRunning ? 'running' : 'stopped'}">${status.cloudflaredRunning ? t('app.running') : t('app.stopped')}</span>
            </div>
          </div>
        </div>

        <div class="general-card">
          <h2>${t('app.general')}</h2>
          <div class="toggle-row-inline">
            <span>${t('app.autoLaunch')}</span>
            <input id="auto-launch-toggle" type="checkbox" ${autoLaunchEnabled ? 'checked' : ''} />
          </div>
        </div>

        <div class="help-card">
          <h2>${t('app.cfRoute')}</h2>
          <p>${t('app.cfRouteDesc')} <code>http://127.0.0.1:${settings.localPort}</code></p>
        </div>

        ${dependencyStatus && (!dependencyStatus.singBoxOk || !dependencyStatus.cloudflaredOk) ? `
        <div class="dep-warning">
          <h2>${t('app.depMissing')}</h2>
          ${!dependencyStatus.singBoxOk ? `<p>${t('app.depSingBoxMissing')}</p>` : ''}
          ${!dependencyStatus.cloudflaredOk ? `<p>${t('app.depCloudflaredMissing')}</p>` : ''}
        </div>
        ` : ''}
      </aside>

      <section class="content-panel">
        <div class="panel-section">
          <div class="section-title">${t('app.config')}</div>
          <form id="settings-form" class="settings-grid">
            <label>
              <span>${t('app.hostname')}</span>
              <input name="hostname" autocomplete="off" value="${escapeAttribute(settings.hostname)}" placeholder="harbor.example.com" />
            </label>
            <label>
              <span>${t('app.tunnelToken')}</span>
              <input name="cloudflaredToken" type="password" value="${escapeAttribute(settings.cloudflaredToken)}" placeholder="${t('app.tunnelTokenPlaceholder')}" />
            </label>
            <label>
              <span>${t('app.vlessUuid')}</span>
              <input name="uuid" autocomplete="off" value="${escapeAttribute(settings.uuid)}" />
            </label>
            <label>
              <span>${t('app.wsPath')}</span>
              <input name="websocketPath" value="${escapeAttribute(settings.websocketPath)}" placeholder="/harbor" />
            </label>
            <label>
              <span>${t('app.localPort')}</span>
              <input name="localPort" type="number" min="1" max="65535" value="${settings.localPort}" />
            </label>
            <label>
              <span>${t('app.singBoxPath')}</span>
              <input name="singBoxPath" value="${escapeAttribute(settings.singBoxPath)}" placeholder="sing-box" />
            </label>
            <label>
              <span>${t('app.cloudflaredPath')}</span>
              <input name="cloudflaredPath" value="${escapeAttribute(settings.cloudflaredPath)}" placeholder="cloudflared" />
            </label>
          </form>

          ${errorMessage ? `<div class="error" role="alert">${escapeHtml(errorMessage)}</div>` : ''}

          <div class="actions-row">
            <button id="start-button" class="primary" ${busy || hasRuntimeProcess ? 'disabled' : ''}>${busy ? t('app.processing') : t('app.start')}</button>
            <button id="stop-button" class="secondary" ${busy || !hasRuntimeProcess ? 'disabled' : ''}>${t('app.stop')}</button>
            <button id="preview-button" class="ghost" ${busy ? 'disabled' : ''}>${t('app.refreshLink')}</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-title">${t('app.connection')}</div>
          <section class="link-card" aria-label="Generated VLESS link">
            <div class="link-body">
              <textarea readonly rows="3" aria-label="VLESS link">${escapeHtml(link)}</textarea>
              <div class="link-side">
                <canvas id="qr-canvas" width="96" height="96" aria-label="VLESS QR code"></canvas>
                <button id="copy-button" class="secondary" ${link ? '' : 'disabled'}>${t('app.copy')}</button>
              </div>
            </div>
          </section>
        </div>

        <div class="panel-section">
          <section class="logs-card" aria-label="Logs">
            <div class="section-heading">
              <h2>${t('app.logs')}</h2>
              <button id="clear-logs-button" class="ghost">${t('app.clear')}</button>
            </div>
            <div class="logs">${logLines || `<p class="empty">${t('app.logsEmpty')}</p>`}</div>
          </section>
        </div>
      </section>

      ${showAbout ? `
      <div class="modal-overlay" id="about-overlay">
        <div class="modal-content about-modal">
          <div class="about-header">
            <div class="brand-icon">H</div>
            <h1>Harbor <span class="app-version">v${__APP_VERSION__}</span></h1>
          </div>
          <p class="about-desc">${t('app.aboutDesc')}</p>
          <div class="about-disclaimer">
            <h3>${t('app.disclaimer')}</h3>
            <p>${t('app.disclaimerBody')}</p>
          </div>
          <button id="close-about-button" class="primary">${t('app.close')}</button>
        </div>
      </div>
      ` : ''}
    </section>
  `;

  bindEvents();
  renderQrCode(link);
}

function appendLog(log: HarborLogEvent): void {
  const container = app.querySelector<HTMLDivElement>('.logs');
  if (!container) {
    render();
    return;
  }

  while (container.children.length > 119) {
    container.removeChild(container.firstChild!);
  }

  const empty = container.querySelector('.empty');
  if (empty) {
    empty.remove();
  }

  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span>${escapeHtml(log.source)}</span><span>${escapeHtml(log.stream)}</span><p>${escapeHtml(log.line)}</p>`;
  container.appendChild(div);

  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
  if (isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function bindEvents(): void {
  const form = app.querySelector<HTMLFormElement>('#settings-form');
  form?.addEventListener('input', () => {
    settings = readForm();
    persistSettings(settings);
  });

  app.querySelector('#start-button')?.addEventListener('click', () => {
    settings = readForm();
    persistSettings(settings);
    void startHarbor();
  });
  app.querySelector('#stop-button')?.addEventListener('click', () => void stopHarbor());
  app.querySelector('#preview-button')?.addEventListener('click', () => {
    settings = readForm();
    persistSettings(settings);
    void updatePreview();
  });
  app.querySelector('#copy-button')?.addEventListener('click', () => void copyVlessLink());
  app.querySelector('#clear-logs-button')?.addEventListener('click', () => {
    logs.length = 0;
    render();
  });

  app.querySelector('#check-update-button')?.addEventListener('click', () => void manualCheckUpdate());
  app.querySelector('#about-button')?.addEventListener('click', () => { showAbout = true; render(); });
  app.querySelector('#close-about-button')?.addEventListener('click', () => { showAbout = false; render(); });
  app.querySelector('#about-overlay')?.addEventListener('click', (e) => {
    if (e.target === app.querySelector('#about-overlay')) { showAbout = false; render(); }
  });

  app.querySelector('#download-update-button')?.addEventListener('click', () => void handleDownloadUpdate());
  app.querySelector('#skip-update-button')?.addEventListener('click', () => {
    if (updateInfo?.version) {
      skipVersion(updateInfo.version);
      updateInfo = null;
      render();
    }
  });

  app.querySelectorAll<HTMLInputElement>('.lang-option input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      const next = input.value as 'en' | 'zh-CN';
      setLocale(next);
      void invoke('set_locale', { locale: next }).catch(() => {});
      render();
    });
  });

  app.querySelector<HTMLInputElement>('#auto-launch-toggle')?.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      autoLaunchEnabled = await isEnabled();
    } catch {
      autoLaunchEnabled = await isEnabled();
    }
    render();
  });
}

function renderQrCode(link: string): void {
  const canvas = app.querySelector<HTMLCanvasElement>('#qr-canvas');

  if (!canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);

  if (!link) {
    return;
  }

  void QRCode.toCanvas(canvas, link, {
    margin: 0,
    width: 120,
    color: {
      dark: '#e6edf3',
      light: '#0d1117',
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function formatChangelog(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('##')) return `<strong>${escapeHtml(trimmed.replace(/^#+\s*/, ''))}</strong>`;
      if (trimmed.startsWith('-')) return `<span>${escapeHtml(trimmed)}</span>`;
      return `<span>${escapeHtml(trimmed)}</span>`;
    })
    .filter(Boolean)
    .join('');
}

async function manualCheckUpdate(): Promise<void> {
  checkingUpdate = true;
  updateError = '';
  render();

  updateInfo = await checkForUpdate(__APP_VERSION__);

  checkingUpdate = false;
  render();
}

async function handleDownloadUpdate(): Promise<void> {
  downloadUpdate();
}

async function bootstrap(): Promise<void> {
  initLocale();
  const defaults = await invoke<HarborSettings>('get_default_settings');
  settings = restoreSettings(defaults);
  await listen<HarborLogEvent>('harbor-log', (event) => {
    logs.push(event.payload);
    appendLog(event.payload);
  });
  await listen<string>('tray-action', (event) => {
    if (event.payload === 'start') {
      void startHarbor();
    } else if (event.payload === 'stop') {
      void stopHarbor();
    } else if (event.payload === 'about') {
      showAbout = true;
      render();
    }
  });
  await refreshStatus();
  scheduleStatusPolling();

  try {
    dependencyStatus = await invoke<DependencyStatus>('check_dependencies', { settings });
  } catch {
    dependencyStatus = null;
  }

  try {
    autoLaunchEnabled = await isEnabled();
  } catch { /* non-critical */ }

  render();

  checkForUpdate(__APP_VERSION__).then((result) => {
    updateInfo = result;
    render();
  });
}

void bootstrap();
