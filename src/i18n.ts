type Locale = 'en' | 'zh-CN';

const DEFAULT_LOCALE: Locale = 'en';
const STORAGE_KEY = 'harbor.locale';

type Dict = Record<string, string>;

const en: Dict = {
  'app.loading': 'Loading Harbor...',
  'app.heroEyebrow': 'Personal Exit Node',
  'app.heroDesc': 'Turn your Mac into a private VLESS WebSocket exit node via Cloudflare Tunnel.',
  'app.checkUpdate': 'Check for Updates',
  'app.checking': 'Checking...',
  'app.about': 'About',
  'app.newVersion': 'New Version',
  'app.downloadUpdate': 'Download Update',
  'app.downloadTokenRequired': 'Please enter a registration token first',
  'app.skipVersion': 'Skip This Version',
  'app.nodeStatus': 'Node Status',
  'app.running': 'Running',
  'app.stopped': 'Stopped',
  'app.online': 'Online',
  'app.starting': 'Starting',
  'app.offline': 'Offline',
  'app.general': 'General',
  'app.autoLaunch': 'Launch at Login',
  'app.cfRoute': 'Cloudflare Route',
  'app.cfRouteDesc': 'Set the tunnel public hostname to forward WebSocket traffic to',
  'app.depMissing': 'Dependencies Missing',
  'app.depSingBoxMissing': 'sing-box not found. Please ensure the app is fully installed or configure the path manually.',
  'app.depCloudflaredMissing': 'cloudflared not found. Please ensure the app is fully installed or configure the path manually.',
  'app.config': 'Configuration',
  'app.hostname': 'Cloudflare Hostname',
  'app.tunnelToken': 'Tunnel Token',
  'app.tunnelTokenPlaceholder': 'Paste your named tunnel token',
  'app.vlessUuid': 'VLESS UUID',
  'app.wsPath': 'WebSocket Path',
  'app.localPort': 'Local Port',
  'app.singBoxPath': 'sing-box Path',
  'app.cloudflaredPath': 'cloudflared Path',
  'app.regToken': 'Registration Token',
  'app.regTokenPlaceholder': 'Paste the download token obtained after purchase',
  'app.start': 'Start Harbor',
  'app.stop': 'Stop',
  'app.refreshLink': 'Refresh Link',
  'app.processing': 'Processing...',
  'app.connection': 'Connection',
  'app.copy': 'Copy',
  'app.logs': 'Logs',
  'app.clear': 'Clear',
  'app.logsEmpty': 'Logs will appear here after Harbor starts.',
  'app.aboutDesc': 'A personal intranet penetration tool — turn your Mac into a private VLESS WebSocket exit node via Cloudflare Tunnel.',
  'app.disclaimer': 'Disclaimer',
  'app.disclaimerBody': 'This tool is for personal network technology research only. Users assume all risks associated with using this tool, including but not limited to Cloudflare account bans. The developer is not responsible for any direct or indirect losses caused by the use of this tool.',
  'app.close': 'Close',
  'app.storedToken': 'Stored Token',
  'app.language': 'Language',
  'app.langEn': 'English',
  'app.langZh': '中文',
  'err.formNotMounted': 'Settings form not mounted',
  'err.noRootElement': 'Missing #app root element',
  'err.downloadFailed': 'Download failed',
  'err.enterTokenFirst': 'Please enter a registration token first',
  'err.tokenInvalid': 'Token is invalid or expired',
  'err.noDownloadUrl': 'No download URL obtained',
  'err.networkRetry': 'Network error, please try again later',
};

const zhCN: Dict = {
  'app.loading': '正在加载 Harbor...',
  'app.heroEyebrow': '个人出口节点',
  'app.heroDesc': '通过 Cloudflare Tunnel 将 Mac 变为私有的 VLESS WebSocket 出口节点。',
  'app.checkUpdate': '检查更新',
  'app.checking': '检查中...',
  'app.about': '关于',
  'app.newVersion': '新版本',
  'app.downloadUpdate': '下载更新',
  'app.downloadTokenRequired': '请先输入注册令牌',
  'app.skipVersion': '跳过此版本',
  'app.nodeStatus': '节点状态',
  'app.running': '运行中',
  'app.stopped': '已停止',
  'app.online': '在线',
  'app.starting': '启动中',
  'app.offline': '离线',
  'app.general': '通用',
  'app.autoLaunch': '开机自动启动',
  'app.cfRoute': 'Cloudflare 路由',
  'app.cfRouteDesc': '设置隧道公共主机名，转发 WebSocket 流量至',
  'app.depMissing': '依赖缺失',
  'app.depSingBoxMissing': 'sing-box 未找到。请确认 App 安装完整或手动配置路径。',
  'app.depCloudflaredMissing': 'cloudflared 未找到。请确认 App 安装完整或手动配置路径。',
  'app.config': '配置',
  'app.hostname': 'Cloudflare 主机名',
  'app.tunnelToken': '隧道令牌',
  'app.tunnelTokenPlaceholder': '粘贴命名隧道令牌',
  'app.vlessUuid': 'VLESS UUID',
  'app.wsPath': 'WebSocket 路径',
  'app.localPort': '本地端口',
  'app.singBoxPath': 'sing-box 路径',
  'app.cloudflaredPath': 'cloudflared 路径',
  'app.regToken': '注册令牌',
  'app.regTokenPlaceholder': '粘贴购买后获取的下载令牌',
  'app.start': '启动 Harbor',
  'app.stop': '停止',
  'app.refreshLink': '刷新链接',
  'app.processing': '处理中...',
  'app.connection': '连接',
  'app.copy': '复制',
  'app.logs': '运行日志',
  'app.clear': '清除',
  'app.logsEmpty': 'Harbor 启动后日志将显示在此处。',
  'app.aboutDesc': '个人内网穿透工具 — 通过 Cloudflare Tunnel 将 Mac 变为私有的 VLESS WebSocket 出口节点。',
  'app.disclaimer': '免责声明',
  'app.disclaimerBody': '本工具仅供个人研究网络技术使用。用户需自行承担使用本工具所产生的一切风险，包括但不限于 Cloudflare 账号被封禁等。开发者不对任何因使用本工具而导致的直接或间接损失负责。',
  'app.close': '关闭',
  'app.storedToken': '已存储的令牌',
  'app.language': '语言',
  'app.langEn': 'English',
  'app.langZh': '中文',
  'err.formNotMounted': '设置表单未挂载',
  'err.noRootElement': '缺少 #app 根元素',
  'err.downloadFailed': '下载失败',
  'err.enterTokenFirst': '请先输入注册令牌',
  'err.tokenInvalid': '令牌无效或已过期',
  'err.noDownloadUrl': '未获取到下载链接',
  'err.networkRetry': '网络错误，请稍后重试',
};

const dictionaries: Record<Locale, Dict> = { en, 'zh-CN': zhCN };

let currentLocale: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function initLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && (saved === 'en' || saved === 'zh-CN')) {
    currentLocale = saved;
  } else {
    currentLocale = DEFAULT_LOCALE;
  }
  document.documentElement.lang = currentLocale;
  return currentLocale;
}

export function t(key: string): string {
  return dictionaries[currentLocale]?.[key] ?? dictionaries.en[key] ?? key;
}

export function tOr(key: string, fallback: string): string {
  return dictionaries[currentLocale]?.[key] ?? fallback;
}
