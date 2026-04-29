import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import QRCode from 'qrcode';

import './styles.css';
import { restoreSettingsFromSaved, statusLabel, type HarborSettings, type HarborStatus } from './ui';

type Preview = {
  vlessLink: string;
  singBoxConfig: unknown;
};

type HarborLogEvent = {
  source: string;
  stream: string;
  line: string;
};

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('Missing #app root element');
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
const logs: HarborLogEvent[] = [];

function persistSettings(nextSettings: HarborSettings): void {
  const { cloudflaredToken: _token, ...safeSettings } = nextSettings;
  localStorage.setItem('harbor.settings', JSON.stringify(safeSettings));
}

function restoreSettings(defaults: HarborSettings): HarborSettings {
  return restoreSettingsFromSaved(defaults, localStorage.getItem('harbor.settings'));
}

function readForm(): HarborSettings {
  const form = app.querySelector<HTMLFormElement>('#settings-form');

  if (!form) {
    throw new Error('Settings form is not mounted');
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
  status = await invoke<HarborStatus>('get_status');
  render();
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
    app.innerHTML = '<div class="loading">Loading Harbor...</div>';
    return;
  }

  const label = statusLabel(status);
  const link = preview?.vlessLink ?? status.vlessLink ?? '';
  const hasRuntimeProcess = status.singBoxRunning || status.cloudflaredRunning;
  const logLines = logs
    .slice(-120)
    .map(
      (log) =>
        `<div class="log-line"><span>${escapeHtml(log.source)}</span><span>${escapeHtml(log.stream)}</span><p>${escapeHtml(log.line)}</p></div>`,
    )
    .join('');

  app.innerHTML = `
    <section class="shell">
      <aside class="hero-panel" aria-label="Harbor overview">
        <div>
          <p class="eyebrow">Personal exit node</p>
          <h1>Harbor</h1>
          <p class="lede">Turn this Mac into a private VLESS WebSocket exit node through Cloudflare Tunnel.</p>
        </div>
        <div class="status-card ${label.toLowerCase()}">
          <span>Status</span>
          <strong>${label}</strong>
          <p>sing-box: ${status.singBoxRunning ? 'running' : 'stopped'} · cloudflared: ${status.cloudflaredRunning ? 'running' : 'stopped'}</p>
        </div>
        <div class="help-card">
          <h2>Cloudflare route</h2>
          <p>Set your tunnel public hostname to forward WebSocket traffic to <code>http://127.0.0.1:${settings.localPort}</code>.</p>
        </div>
      </aside>

      <section class="content-panel">
        <form id="settings-form" class="settings-grid">
          <label>
            <span>Cloudflare hostname</span>
            <input name="hostname" autocomplete="off" value="${escapeAttribute(settings.hostname)}" placeholder="harbor.example.com" />
          </label>
          <label>
            <span>Cloudflare tunnel token</span>
            <input name="cloudflaredToken" type="password" value="${escapeAttribute(settings.cloudflaredToken)}" placeholder="Paste named tunnel token" />
          </label>
          <label>
            <span>VLESS UUID</span>
            <input name="uuid" autocomplete="off" value="${escapeAttribute(settings.uuid)}" />
          </label>
          <label>
            <span>WebSocket path</span>
            <input name="websocketPath" value="${escapeAttribute(settings.websocketPath)}" placeholder="/harbor" />
          </label>
          <label>
            <span>Local port</span>
            <input name="localPort" type="number" min="1" max="65535" value="${settings.localPort}" />
          </label>
          <label>
            <span>sing-box command</span>
            <input name="singBoxPath" value="${escapeAttribute(settings.singBoxPath)}" placeholder="sing-box" />
          </label>
          <label>
            <span>cloudflared command</span>
            <input name="cloudflaredPath" value="${escapeAttribute(settings.cloudflaredPath)}" placeholder="cloudflared" />
          </label>
        </form>

        ${errorMessage ? `<div class="error" role="alert">${escapeHtml(errorMessage)}</div>` : ''}

        <div class="actions-row">
          <button id="start-button" class="primary" ${busy || hasRuntimeProcess ? 'disabled' : ''}>${busy ? 'Working...' : 'Start Harbor'}</button>
          <button id="stop-button" class="secondary" ${busy || !hasRuntimeProcess ? 'disabled' : ''}>Stop</button>
          <button id="preview-button" class="ghost" ${busy ? 'disabled' : ''}>Refresh Link</button>
        </div>

        <section class="link-card" aria-label="Generated VLESS link">
          <div>
            <p class="eyebrow">V2Box import link</p>
            <h2>Copy this into V2Box</h2>
          </div>
          <textarea readonly rows="4" aria-label="VLESS link">${escapeHtml(link)}</textarea>
          <div class="link-actions">
            <button id="copy-button" class="secondary" ${link ? '' : 'disabled'}>Copy VLESS link</button>
            <canvas id="qr-canvas" width="184" height="184" aria-label="VLESS QR code"></canvas>
          </div>
        </section>

        <section class="logs-card" aria-label="Runtime logs">
          <div class="section-heading">
            <h2>Runtime logs</h2>
            <button id="clear-logs-button" class="ghost">Clear</button>
          </div>
          <div class="logs">${logLines || '<p class="empty">Logs will appear after Harbor starts.</p>'}</div>
        </section>
      </section>
    </section>
  `;

  bindEvents();
  renderQrCode(link);
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
    margin: 1,
    width: 184,
    color: {
      dark: '#102a43',
      light: '#f8fbff',
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

async function bootstrap(): Promise<void> {
  const defaults = await invoke<HarborSettings>('get_default_settings');
  settings = restoreSettings(defaults);
  await listen<HarborLogEvent>('harbor-log', (event) => {
    logs.push(event.payload);
    render();
  });
  await refreshStatus();
  scheduleStatusPolling();
  render();
}

void bootstrap();
