import browser from 'webextension-polyfill';
import { loadPolicy, isDomainBlocked, isMimeTypeBlocked, logBlockEvent } from './policy.js';
import { classifyBytes, labelToMime, resolveEffectiveLabel } from './magika.js';

const FETCH_FIRST_BYTES = 4096;

export function initDownloadBlocker() {
  browser.downloads.onCreated.addListener(handleDownloadCreated);
}

async function handleDownloadCreated(downloadItem) {
  const policy = await loadPolicy();
  if (!policy.enabled) return;

  const { id, filename } = downloadItem;
  const url = downloadItem.finalUrl || downloadItem.url;

  // Kiểm tra domain
  if (isDomainBlocked(url, policy)) {
    await cancelDownload(id, {
      type: 'download',
      reason: 'blocked_domain',
      url,
      filename,
    });
    return;
  }

  let resumeAfter = false;
  try {
    await browser.downloads.pause(id);
    resumeAfter = true;
  } catch {
    /* một số download không pause được */
  }

  try {
    const bytes = await fetchFirstBytes(url);
    if (bytes && bytes.length > 0) {
      const magika = await classifyBytes(bytes);
      const label = resolveEffectiveLabel(bytes, magika.label);
      const mime = labelToMime(label);
      if (isMimeTypeBlocked(mime, policy) || isMimeTypeBlocked(label, policy)) {
        await cancelDownload(id, {
          type: 'download',
          reason: 'blocked_filetype',
          detectedType: label,
          url,
          filename,
        });
        resumeAfter = false;
        return;
      }
    }
  } finally {
    if (resumeAfter) {
      try {
        await browser.downloads.resume(id);
      } catch {
        /* đã xong */
      }
    }
  }
}

async function cancelDownload(downloadId, event) {
  try {
    await browser.downloads.cancel(downloadId);
  } catch {
    // Download có thể đã hoàn thành trước khi cancel
  }

  await logBlockEvent(event);
  await showBlockNotification(event);
}

async function showBlockNotification(event) {
  const messages = {
    blocked_domain: `Download bị chặn: domain nguy hiểm`,
    blocked_extension: `Download bị chặn: loại file không được phép`,
    blocked_filetype: `Download bị chặn: nội dung file nguy hiểm (${event.detectedType})`,
  };

  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon48.png'),
      title: 'DLP Shield - Download bị chặn',
      message: messages[event.reason] || 'File bị chặn bởi chính sách bảo mật',
    });
  } catch {
    /* thông báo không bắt buộc */
  }
}

async function fetchFirstBytes(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;

  const base = { credentials: 'omit', cache: 'no-store' };
  const slice = (buf) => {
    const u = new Uint8Array(buf);
    return u.byteLength > FETCH_FIRST_BYTES ? u.slice(0, FETCH_FIRST_BYTES) : u;
  };

  try {
    const res = await fetch(url, {
      ...base,
      headers: { Range: `bytes=0-${FETCH_FIRST_BYTES - 1}` },
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const out = slice(buf);
      if (out.length > 0) return out;
    }
  } catch {
    /* nhiều server không hỗ trợ Range hoặc chặn Range — thử GET */
  }

  try {
    const res = await fetch(url, base);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const out = slice(buf);
    if (out.length > 0) return out;
  } catch {
    /* thử kèm cookie (một số link chỉ tải được khi đã đăng nhập) */
  }

  try {
    const res = await fetch(url, { ...base, credentials: 'include' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const out = slice(buf);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
