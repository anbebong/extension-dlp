import browser from 'webextension-polyfill';

/** Nhãn Magika (output.label) + MIME tương ứng — chặn theo nội dung file, không theo đuôi tên. */
export const DEFAULT_BLOCKED_MAGIKA_OR_MIME = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-bat',
  'application/x-msdos-program',
  'application/java-archive',
  'application/x-msi',
  'application/x-powershell',
  'application/x-vba',
  'application/x-android-dex',
  'application/x-mach-binary',
  'exe',
  'elf',
  'shell',
  'bat',
  'powershell',
  'vba',
  'jar',
  'dex',
  'macho',
  'msi',
];

export const DEFAULT_POLICY = {
  enabled: true,
  blockedDomains: [],
  /** Giữ trong storage/UI để tương thích; engine không dùng đuôi để chặn (chỉ Magika). */
  blockedExtensions: [],
  blockedMimeTypes: [...DEFAULT_BLOCKED_MAGIKA_OR_MIME],
  remoteUrl: '',
  syncIntervalSeconds: 3600,
  lastSyncedAt: 0,
  blockLog: [],
};

export async function loadPolicy() {
  const data = await browser.storage.sync.get('policy');
  const saved = data.policy || {};
  const merged = { ...DEFAULT_POLICY, ...saved };
  // Luôn gộp nhãn/MIME nguy hiểm mặc định (Magika) + tùy chỉnh của user
  merged.blockedMimeTypes = [
    ...new Set([...DEFAULT_BLOCKED_MAGIKA_OR_MIME, ...(Array.isArray(saved.blockedMimeTypes) ? saved.blockedMimeTypes : [])]),
  ];
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
      blockedDomains: mergeLists(policy.blockedDomains, remote.blockedDomains),
      blockedExtensions: mergeLists(policy.blockedExtensions, remote.blockedExtensions),
      blockedMimeTypes: mergeLists(policy.blockedMimeTypes, remote.blockedMimeTypes),
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

export function isDomainBlocked(url, policy) {
  if (!policy.blockedDomains.length) return false;
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return policy.blockedDomains.some((pattern) => matchDomain(hostname, pattern));
}

function matchDomain(hostname, pattern) {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return hostname === base || hostname.endsWith('.' + base);
  }
  return hostname === pattern;
}

export function isExtensionBlocked(filename, policy) {
  if (!filename || !policy.blockedExtensions.length) return false;
  const lower = filename.toLowerCase();
  return policy.blockedExtensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

export function isMimeTypeBlocked(mimeLabel, policy) {
  if (!mimeLabel || !policy.blockedMimeTypes.length) return false;
  const lower = mimeLabel.toLowerCase();
  return policy.blockedMimeTypes.some((m) => lower.includes(m.toLowerCase()));
}

export async function logBlockEvent(event) {
  const policy = await loadPolicy();
  const log = policy.blockLog || [];
  log.unshift({ ...event, timestamp: Date.now() });
  // Giữ tối đa 100 entries
  policy.blockLog = log.slice(0, 100);
  await savePolicy(policy);
}
