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
  exe:        'application/x-msdownload',
  elf:        'application/x-executable',
  shell:      'application/x-sh',
  bat:        'application/x-bat',
  jar:        'application/java-archive',
  msi:        'application/x-msi',
  powershell: 'application/x-powershell',
  vba:        'application/x-vba',
  dex:        'application/x-android-dex',
  macho:      'application/x-mach-binary',
};

export function labelToMime(label) {
  return LABEL_TO_MIME[label?.toLowerCase()] || `application/x-${label}`;
}

/**
 * Nếu Magika trả 'unknown', dùng heuristic byte-header để vẫn chặn được
 * PE (MZ), ELF, shebang script.
 */
export function resolveEffectiveLabel(bytes, magikaLabel) {
  const raw = (magikaLabel || 'unknown').toLowerCase();
  if (raw && raw !== 'unknown') return magikaLabel;

  if (!bytes || bytes.length < 2) return magikaLabel || 'unknown';

  // MZ header → Windows PE executable
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return 'exe';
  // ELF header → Linux/Unix executable
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x7f && bytes[1] === 0x45 &&
    bytes[2] === 0x4c && bytes[3] === 0x46
  ) return 'elf';
  // Shebang → shell script
  if (bytes[0] === 0x23 && bytes[1] === 0x21) return 'shell';

  return magikaLabel || 'unknown';
}
