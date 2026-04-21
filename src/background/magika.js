import { Magika } from 'magika';

const MODEL_VERSION = Magika.MODEL_VERSION;

// ── Eager init: bắt đầu load model ngay khi module được import ──────────────
// Không chờ request đầu tiên — tránh timeout message channel.
let _readyPromise = null;
let _instance = null;

function startLoading() {
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    const options = buildModelOptions();
    console.log('[DLP] Magika init:', options ? 'local model' : 'CDN model');
    const m = await Magika.create(options);
    _instance = m;
    console.log('[DLP] Magika ready ✓');
    return m;
  })();

  _readyPromise.catch((err) => {
    console.error('[DLP] Magika load failed:', err.message);
    _readyPromise = null; // cho phép retry
  });

  return _readyPromise;
}

function buildModelOptions() {
  // Nếu được build offline (có file model local), dùng local.
  // Dùng try/catch để không crash nếu chrome.runtime chưa sẵn sàng.
  try {
    const localModel = chrome.runtime.getURL(`models/${MODEL_VERSION}/model.json`);
    // Kiểm tra nhanh bằng URL pattern — không fetch, không delay.
    // File chỉ có trong dist nếu được build với --env localModel=true.
    // Ta dùng một global được webpack inject: __DLP_LOCAL_MODEL__
    if (typeof __DLP_LOCAL_MODEL__ !== 'undefined' && __DLP_LOCAL_MODEL__) {
      return {
        modelURL: localModel,
        modelConfigURL: chrome.runtime.getURL(`models/${MODEL_VERSION}/config.min.json`),
      };
    }
  } catch { /* ignore */ }
  return undefined; // CDN mặc định
}

// Bắt đầu load ngay khi module được import
startLoading();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Phân loại file từ nội dung bytes.
 * Có timeout 8s — nếu Magika chưa sẵn sàng, fallback về heuristic.
 */
export async function classifyBytes(bytes) {
  try {
    const magika = await Promise.race([
      startLoading(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Magika timeout')), 8000)
      ),
    ]);
    const result = await magika.identifyBytes(bytes);
    const label = result.prediction?.output?.label ?? 'unknown';
    const score = result.prediction?.output?.score ?? 0;
    return { label, score };
  } catch (err) {
    console.warn('[DLP] classifyBytes fallback:', err.message);
    return { label: 'unknown', score: 0 };
  }
}

export function resetMagika() {
  _instance = null;
  _readyPromise = null;
}

export function isMagikaReady() {
  return _instance !== null;
}

// ── Label → MIME ─────────────────────────────────────────────────────────────

const LABEL_TO_MIME = {
  // Tài liệu
  pdf:        'application/pdf',
  docx:       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:        'application/msword',
  xlsx:       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:        'application/vnd.ms-excel',
  pptx:       'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:        'application/vnd.ms-powerpoint',
  ooxml:      'application/vnd.ms-office',
  odt:        'application/vnd.oasis.opendocument.text',
  ods:        'application/vnd.oasis.opendocument.spreadsheet',
  odp:        'application/vnd.oasis.opendocument.presentation',
  rtf:        'application/rtf',
  csv:        'text/csv',
  // Hình ảnh
  jpeg:       'image/jpeg',
  png:        'image/png',
  gif:        'image/gif',
  bmp:        'image/bmp',
  tiff:       'image/tiff',
  webp:       'image/webp',
  svg:        'image/svg+xml',
  psd:        'image/vnd.adobe.photoshop',
  // Video / Audio
  mp4:        'video/mp4',
  mkv:        'video/x-matroska',
  avi:        'video/x-msvideo',
  mp3:        'audio/mpeg',
  wav:        'audio/wav',
  flac:       'audio/flac',
  // Archive
  zip:        'application/zip',
  rar:        'application/vnd.rar',
  sevenzip:   'application/x-7z-compressed',
  gzip:       'application/gzip',
  tar:        'application/x-tar',
  // Executable / Script
  pebin:      'application/x-msdownload',
  exe:        'application/x-msdownload',
  elf:        'application/x-executable',
  shell:      'application/x-sh',
  batch:      'application/x-bat',
  powershell: 'application/x-powershell',
  vba:        'application/x-vba',
  jar:        'application/java-archive',
  apk:        'application/vnd.android.package-archive',
  // Dữ liệu nhạy cảm
  sqlite:     'application/x-sqlite3',
  pem:        'application/x-pem-file',
  pgp:        'application/pgp-keys',
  outlook:    'application/vnd.ms-outlook',
  eml:        'message/rfc822',
};

export function labelToMime(label) {
  return LABEL_TO_MIME[label?.toLowerCase()] || `application/x-${label}`;
}

export function resolveEffectiveLabel(bytes, magikaLabel) {
  return magikaLabel || 'unknown';
}
