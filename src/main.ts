import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import QRCode from 'qrcode';

import './styles.css';
import { restoreSettingsFromSaved, statusLabel, type HarborSettings, type HarborStatus } from './ui';
import { checkForUpdate, downloadUpdate, skipVersion, getStoredDownloadToken, storeDownloadToken, type UpdateCheckResult } from './update-checker';

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
    throw new Error('缺少 #app 根元素');
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
let downloadToken = getStoredDownloadToken();
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
    throw new Error('设置表单未挂载');
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
    app.innerHTML = '<div class="loading">正在加载 Harbor...</div>';
    return;
  }

  const label = statusLabel(status);
  const link = preview?.vlessLink ?? status.vlessLink ?? '';
  const hasRuntimeProcess = status.singBoxRunning || status.cloudflaredRunning;
  const statusClass = label === '在线' ? 'online' : label === '启动中' ? 'starting' : '';
  const logLines = logs
    .slice(-120)
    .map(
      (log) =>
        `<div class="log-line"><span>${escapeHtml(log.source)}</span><span>${escapeHtml(log.stream)}</span><p>${escapeHtml(log.line)}</p></div>`,
    )
    .join('');

  app.innerHTML = `
    <section class="shell">
      <aside class="hero-panel" aria-label="Harbor 概览">
        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-icon">H</div>
            <h1>Harbor</h1>
          </div>
          <p class="eyebrow">个人出口节点</p>
          <p class="lede">通过 Cloudflare Tunnel 将 Mac 变为私有的 VLESS WebSocket 出口节点。</p>
          <button id="check-update-button" class="ghost version-check" ${checkingUpdate ? 'disabled' : ''}>${checkingUpdate ? '检查中...' : 'v' + __APP_VERSION__ + ' · 检查更新'}</button>
        </div>

        ${updateInfo?.hasUpdate ? `
        <div class="update-card">
          <div class="update-card-header">
            <span class="update-badge">新版本</span>
            <span class="update-version">v${escapeHtml(updateInfo.version ?? '')}</span>
          </div>
          ${updateInfo.changelog ? `<div class="update-changelog">${formatChangelog(escapeHtml(updateInfo.changelog))}</div>` : ''}
          ${updateError ? `<div class="update-error">${escapeHtml(updateError)}</div>` : ''}
          <div class="update-actions">
            <button id="download-update-button" class="primary">${downloadToken ? '下载更新' : '请先输入注册令牌'}</button>
            <button id="skip-update-button" class="ghost">跳过此版本</button>
          </div>
        </div>
        ` : ''}

        <div class="status-panel">
          <div class="status-header">
            <h2>节点状态</h2>
            <div class="status-indicator">
              <span class="status-dot ${statusClass}"></span>
              <span>${label}</span>
            </div>
          </div>
          <div class="status-processes">
            <div class="process-item">
              <span class="process-name">sing-box</span>
              <span class="process-status ${status.singBoxRunning ? 'running' : 'stopped'}">${status.singBoxRunning ? '运行中' : '已停止'}</span>
            </div>
            <div class="process-item">
              <span class="process-name">cloudflared</span>
              <span class="process-status ${status.cloudflaredRunning ? 'running' : 'stopped'}">${status.cloudflaredRunning ? '运行中' : '已停止'}</span>
            </div>
          </div>
        </div>

        <div class="help-card">
          <h2>Cloudflare 路由</h2>
          <p>设置隧道公共主机名，转发 WebSocket 流量至 <code>http://127.0.0.1:${settings.localPort}</code></p>
        </div>
      </aside>

      <section class="content-panel">
        <div class="panel-section">
          <div class="section-title">配置</div>
          <form id="settings-form" class="settings-grid">
            <label>
              <span>Cloudflare 主机名</span>
              <input name="hostname" autocomplete="off" value="${escapeAttribute(settings.hostname)}" placeholder="harbor.example.com" />
            </label>
            <label>
              <span>隧道令牌</span>
              <input name="cloudflaredToken" type="password" value="${escapeAttribute(settings.cloudflaredToken)}" placeholder="粘贴命名隧道令牌" />
            </label>
            <label>
              <span>VLESS UUID</span>
              <input name="uuid" autocomplete="off" value="${escapeAttribute(settings.uuid)}" />
            </label>
            <label>
              <span>WebSocket 路径</span>
              <input name="websocketPath" value="${escapeAttribute(settings.websocketPath)}" placeholder="/harbor" />
            </label>
            <label>
              <span>本地端口</span>
              <input name="localPort" type="number" min="1" max="65535" value="${settings.localPort}" />
            </label>
            <label>
              <span>sing-box 路径</span>
              <input name="singBoxPath" value="${escapeAttribute(settings.singBoxPath)}" placeholder="sing-box" />
            </label>
            <label>
              <span>cloudflared 路径</span>
              <input name="cloudflaredPath" value="${escapeAttribute(settings.cloudflaredPath)}" placeholder="cloudflared" />
            </label>
            <label>
              <span>注册令牌</span>
              <input name="downloadToken" type="password" value="${escapeAttribute(downloadToken)}" placeholder="粘贴购买后获取的下载令牌" />
            </label>
          </form>

          ${errorMessage ? `<div class="error" role="alert">${escapeHtml(errorMessage)}</div>` : ''}

          <div class="actions-row">
            <button id="start-button" class="primary" ${busy || hasRuntimeProcess ? 'disabled' : ''}>${busy ? '处理中...' : '启动 Harbor'}</button>
            <button id="stop-button" class="secondary" ${busy || !hasRuntimeProcess ? 'disabled' : ''}>停止</button>
            <button id="preview-button" class="ghost" ${busy ? 'disabled' : ''}>刷新链接</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-title">连接</div>
          <section class="link-card" aria-label="生成的 VLESS 链接">
            <div class="link-body">
              <textarea readonly rows="3" aria-label="VLESS 链接">${escapeHtml(link)}</textarea>
              <div class="link-side">
                <canvas id="qr-canvas" width="96" height="96" aria-label="VLESS 二维码"></canvas>
                <button id="copy-button" class="secondary" ${link ? '' : 'disabled'}>复制</button>
              </div>
            </div>
          </section>
        </div>

        <div class="panel-section">
          <section class="logs-card" aria-label="运行日志">
            <div class="section-heading">
              <h2>运行日志</h2>
              <button id="clear-logs-button" class="ghost">清除</button>
            </div>
            <div class="logs">${logLines || '<p class="empty">Harbor 启动后日志将显示在此处。</p>'}</div>
          </section>
        </div>
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

  app.querySelector('#check-update-button')?.addEventListener('click', () => void manualCheckUpdate());

  app.querySelector('#download-update-button')?.addEventListener('click', () => void handleDownloadUpdate());
  app.querySelector('#skip-update-button')?.addEventListener('click', () => {
    if (updateInfo?.version) {
      skipVersion(updateInfo.version);
      updateInfo = null;
      render();
    }
  });

  const tokenInput = app.querySelector<HTMLInputElement>('input[name="downloadToken"]');
  tokenInput?.addEventListener('change', () => {
    downloadToken = tokenInput.value;
    storeDownloadToken(downloadToken);
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
  const result = await downloadUpdate(downloadToken);

  if (!result.ok) {
    updateError = result.error ?? '下载失败';
    render();
  }
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

  checkForUpdate(__APP_VERSION__).then((result) => {
    updateInfo = result;
    render();
  });
}

void bootstrap();
