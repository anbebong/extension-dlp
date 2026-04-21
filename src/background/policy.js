import browser from 'webextension-polyfill';

/** Nhóm định dạng để hiển thị trong UI — label là Magika label chính xác */
export const FILE_TYPE_GROUPS = [
  {
    id: 'documents',
    name: 'Tài liệu văn phòng',
    types: [
      { label: 'pdf',   desc: 'PDF' },
      { label: 'docx',  desc: 'Word .docx' },
      { label: 'doc',   desc: 'Word .doc (cũ)' },
      { label: 'xlsx',  desc: 'Excel .xlsx' },
      { label: 'xls',   desc: 'Excel .xls (cũ)' },
      { label: 'pptx',  desc: 'PowerPoint .pptx' },
      { label: 'ppt',   desc: 'PowerPoint .ppt (cũ)' },
      { label: 'ooxml', desc: 'Office OLE chung' },
      { label: 'odt',   desc: 'LibreOffice Writer' },
      { label: 'ods',   desc: 'LibreOffice Calc' },
      { label: 'odp',   desc: 'LibreOffice Impress' },
      { label: 'rtf',   desc: 'Rich Text Format' },
      { label: 'csv',   desc: 'CSV' },
    ],
  },
  {
    id: 'images',
    name: 'Hình ảnh',
    types: [
      { label: 'jpeg', desc: 'JPEG' },
      { label: 'png',  desc: 'PNG' },
      { label: 'gif',  desc: 'GIF' },
      { label: 'bmp',  desc: 'BMP' },
      { label: 'tiff', desc: 'TIFF' },
      { label: 'webp', desc: 'WebP' },
      { label: 'svg',  desc: 'SVG' },
      { label: 'psd',  desc: 'Photoshop PSD' },
    ],
  },
  {
    id: 'media',
    name: 'Video / Audio',
    types: [
      { label: 'mp4',  desc: 'MP4' },
      { label: 'mkv',  desc: 'MKV' },
      { label: 'avi',  desc: 'AVI' },
      { label: 'mp3',  desc: 'MP3' },
      { label: 'wav',  desc: 'WAV' },
      { label: 'flac', desc: 'FLAC' },
    ],
  },
  {
    id: 'archives',
    name: 'Nén / Archive',
    types: [
      { label: 'zip',      desc: 'ZIP' },
      { label: 'rar',      desc: 'RAR' },
      { label: 'sevenzip', desc: '7-Zip' },
      { label: 'gzip',     desc: 'GZIP' },
      { label: 'tar',      desc: 'TAR' },
    ],
  },
  {
    id: 'executables',
    name: 'Executable / Script',
    types: [
      { label: 'pebin',      desc: 'Windows EXE/DLL' },
      { label: 'elf',        desc: 'Linux binary' },
      { label: 'shell',      desc: 'Shell script' },
      { label: 'batch',      desc: 'Batch .bat' },
      { label: 'powershell', desc: 'PowerShell' },
      { label: 'vba',        desc: 'VBA macro' },
      { label: 'jar',        desc: 'Java Archive' },
      { label: 'apk',        desc: 'Android APK' },
    ],
  },
  {
    id: 'sensitive',
    name: 'Dữ liệu nhạy cảm',
    types: [
      { label: 'sqlite',  desc: 'SQLite database' },
      { label: 'pem',     desc: 'Certificate / Private key' },
      { label: 'pgp',     desc: 'PGP key' },
      { label: 'outlook', desc: 'Outlook .pst/.ost' },
      { label: 'eml',     desc: 'Email .eml' },
    ],
  },
];

/** Nhãn Magika mặc định cho upload */
export const DEFAULT_UPLOAD_BLOCKED = [
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'ooxml',
];

/** Nhãn Magika mặc định cho download */
export const DEFAULT_DOWNLOAD_BLOCKED = [
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'ooxml',
];

export const DEFAULT_POLICY = {
  enabled: true,
  allowedDomains: [],
  upload: {
    blockedTypes: [...DEFAULT_UPLOAD_BLOCKED],
  },
  download: {
    blockedTypes: [...DEFAULT_DOWNLOAD_BLOCKED],
  },
  remoteUrl: '',
  syncIntervalSeconds: 3600,
  lastSyncedAt: 0,
  blockLog: [],
};

export async function loadPolicy() {
  const data = await browser.storage.sync.get('policy');
  const saved = data.policy || {};
  const merged = { ...DEFAULT_POLICY, ...saved };
  // Nếu user đã lưu list thì dùng list của user, không merge default
  merged.upload = {
    blockedTypes: Array.isArray(saved.upload?.blockedTypes)
      ? saved.upload.blockedTypes
      : [...DEFAULT_UPLOAD_BLOCKED],
  };
  merged.download = {
    blockedTypes: Array.isArray(saved.download?.blockedTypes)
      ? saved.download.blockedTypes
      : [...DEFAULT_DOWNLOAD_BLOCKED],
  };
  return merged;
}

export async function savePolicy(policy) {
  await browser.storage.sync.set({ policy });
}

export async function syncRemotePolicy() {
  const policy = await loadPolicy();
  if (!policy.remoteUrl) return policy;

  try {
    const res = await fetch(policy.remoteUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = await res.json();

    const merged = {
      ...policy,
      allowedDomains: mergeLists(policy.allowedDomains, remote.allowedDomains),
      upload: {
        blockedTypes: mergeLists(policy.upload.blockedTypes, remote.upload?.blockedTypes),
      },
      download: {
        blockedTypes: mergeLists(policy.download.blockedTypes, remote.download?.blockedTypes),
      },
      lastSyncedAt: Date.now(),
    };
    await savePolicy(merged);
    return merged;
  } catch (err) {
    console.error('[DLP] Remote sync failed:', err.message);
    return policy;
  }
}

function mergeLists(local, remote) {
  if (!Array.isArray(remote)) return local;
  return [...new Set([...local, ...remote])];
}

export function isDomainAllowed(url, policy) {
  if (!policy.allowedDomains?.length) return false;
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return policy.allowedDomains.some((pattern) => matchDomain(hostname, pattern));
}

function matchDomain(hostname, pattern) {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return hostname === base || hostname.endsWith('.' + base);
  }
  return hostname === pattern;
}

/** scope: 'upload' | 'download' */
export function isMimeTypeBlocked(mimeLabel, policy, scope) {
  const list = policy[scope]?.blockedTypes;
  if (!mimeLabel || !list?.length) return false;
  const lower = mimeLabel.toLowerCase();
  return list.some((m) => {
    const ml = m.toLowerCase();
    return lower === ml || lower.includes(ml) || ml.includes(lower);
  });
}

export async function logBlockEvent(event) {
  const policy = await loadPolicy();
  const log = policy.blockLog || [];
  log.unshift({ ...event, timestamp: Date.now() });
  // Giữ tối đa 100 entries
  policy.blockLog = log.slice(0, 100);
  await savePolicy(policy);
}
