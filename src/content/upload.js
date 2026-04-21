import browser from 'webextension-polyfill';
import { initDebugPanel, debugLogAsync } from './debug-panel.js';
import { isExtensionContextInvalidated } from './extension-context.js';
import { showBlockBanner, showExtensionStaleBanner } from './notify.js';

const READ_BYTES = 4096;

initDebugPanel().catch(() => {});

/**
 * Drive / SPA hay đặt input file trong Shadow DOM — event.target có thể là host (div), không phải INPUT.
 * Phải dùng composedPath() mới bắt được đúng <input type="file">.
 */
function getFileInputFromChangeEvent(e) {
  const t = e.target;
  if (t && t.tagName === 'INPUT' && t.type === 'file') return t;
  if (typeof e.composedPath !== 'function') return null;
  for (const node of e.composedPath()) {
    if (node instanceof HTMLInputElement && node.type === 'file') return node;
  }
  return null;
}

/**
 * Handler async KHÔNG giữ được luồng sự kiện: sau await, listener của React/form đã chạy với file.
 * Cách đúng: stopImmediatePropagation ĐỒNG BỘ (trước mọi await), chặn toàn bộ handler khác;
 * nếu không chặn policy → phát lại change (isTrusted: false) để framework nhận file.
 * Sự kiện phát lại bị bỏ qua nhờ !e.isTrusted.
 */
document.addEventListener(
  'change',
  async (e) => {
    const input = getFileInputFromChangeEvent(e);
    if (!input || !input.files || input.files.length === 0) return;
    if (!e.isTrusted) return;

    e.stopImmediatePropagation();
    e.stopPropagation();

    const replayChange = () => {
      queueMicrotask(() => {
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
    };

    try {
      let blockReason = null;
      for (const file of input.files) {
        const blocked = await checkFile(file);
        if (blocked) {
          blockReason = blocked;
          break;
        }
      }

      if (blockReason) {
        input.value = '';
        showBlockBanner(blockReason);
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return;
      }

      replayChange();
    } catch (err) {
      if (isExtensionContextInvalidated(err)) {
        showExtensionStaleBanner();
      } else {
        console.error('[DLP Shield]', err);
      }
      replayChange();
    }
  },
  true
);

async function checkFile(file) {
  await debugLogAsync(`Chọn file: ${file.name} (${file.size} byte)`);

  const bytes = await readFirstBytes(file);
  await debugLogAsync(`Đã đọc ${bytes.length} byte đầu → gửi background kiểm tra…`);

  let response;
  try {
    response = await browser.runtime.sendMessage({
      type: 'CLASSIFY_AND_CHECK',
      filename: file.name,
      bytes: Array.from(bytes),
      domain: location.hostname,
    });
    await debugLogAsync(`Phản hồi background: ${JSON.stringify(response ?? null)}`);
  } catch (err) {
    if (isExtensionContextInvalidated(err)) {
      throw err;
    }
    await debugLogAsync(`LỖI sendMessage: ${err?.message || err}`);
    console.warn('[DLP Shield] Không gọi được background (upload sẽ không bị chặn):', err?.message || err);
    return null;
  }

  if (response?.blocked) {
    await debugLogAsync(`→ CHẶN: ${response.reason || 'có'}`);
    return response.reason || 'File bị chặn bởi chính sách bảo mật';
  }
  await debugLogAsync('→ Cho phép (không chặn)');
  return null;
}

async function readFirstBytes(file) {
  const slice = file.slice(0, READ_BYTES);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}
