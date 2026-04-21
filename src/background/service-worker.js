import browser from 'webextension-polyfill';
import {
  loadPolicy, syncRemotePolicy,
  isDomainBlocked, isExtensionBlocked, isMimeTypeBlocked, logBlockEvent,
} from './policy.js';
import { classifyBytes, labelToMime, resolveEffectiveLabel, isMagikaReady } from './magika.js';
import { initDownloadBlocker } from './download.js';

// Khởi tạo ngay khi service worker load
initDownloadBlocker();
setupAlarms();

// Mở trang hướng dẫn khi cài lần đầu
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    browser.tabs.create({ url: browser.runtime.getURL('welcome/welcome.html') });
  }
});

// ── Message handler ────────────────────────────────────────────────────────
// Dùng chrome.runtime trực tiếp (KHÔNG qua polyfill) + return true để giữ
// channel mở trong khi async — đây là pattern chính xác cho MV3 service worker.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case 'PING':           return handlePing();
      case 'CLASSIFY_AND_CHECK': return handleClassifyAndCheck(msg);
      case 'GET_POLICY':    return loadPolicy();
      case 'SELF_TEST_MAGIKA': return selfTestMagika();
      default:              return undefined;
    }
  };

  handle()
    .then(sendResponse)
    .catch((err) => {
      console.error('[DLP]', msg.type, err);
      sendResponse({ blocked: false, _error: String(err?.message || err) });
    });

  return true; // giữ channel mở cho async response
});

// ── Handlers ────────────────────────────────────────────────────────────────

async function handlePing() {
  const policy = await loadPolicy();
  return {
    ok: true,
    pong: true,
    policyEnabled: policy.enabled,
    magikaReady: isMagikaReady(),
    ts: Date.now(),
  };
}

async function handleClassifyAndCheck({ filename, bytes, domain }) {
  const policy = await loadPolicy();
  if (!policy.enabled) return { blocked: false };

  // Lớp 1: domain
  if (domain && isDomainBlocked(`https://${domain}`, policy)) {
    await logBlockEvent({ type: 'upload', reason: 'blocked_domain', domain, filename });
    return { blocked: true, reason: 'Domain này bị chặn bởi chính sách bảo mật' };
  }

  // Lớp 2: extension file (nếu blockedExtensions có cấu hình)
  if (isExtensionBlocked(filename, policy)) {
    await logBlockEvent({ type: 'upload', reason: 'blocked_extension', filename });
    return { blocked: true, reason: `Loại file "${getExt(filename)}" không được phép upload` };
  }

  // Lớp 3: Magika AI + heuristic fallback
  if (bytes && bytes.length > 0) {
    const uint8 = new Uint8Array(bytes);
    const { label: rawLabel } = await classifyBytes(uint8);
    const label = resolveEffectiveLabel(uint8, rawLabel);
    const mime  = labelToMime(label);

    console.log(`[DLP] classify "${filename}": raw=${rawLabel} → effective=${label} → mime=${mime}`);

    if (isMimeTypeBlocked(mime, policy) || isMimeTypeBlocked(label, policy)) {
      await logBlockEvent({ type: 'upload', reason: 'blocked_filetype', filename, detectedType: label });
      return { blocked: true, reason: `Nội dung file bị phát hiện là "${label}" — không được phép upload` };
    }
  }

  return { blocked: false };
}

async function selfTestMagika() {
  const policy = await loadPolicy();
  const mz = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ header
  const { label: rawLabel } = await classifyBytes(mz);
  const label = resolveEffectiveLabel(mz, rawLabel);
  const mime  = labelToMime(label);
  const wouldBlock = isMimeTypeBlocked(mime, policy) || isMimeTypeBlocked(label, policy);
  return {
    ok: true,
    magikaRawLabel: rawLabel,
    effectiveLabel: label,
    mimeMapped: mime,
    wouldBlock,
    policyEnabled: policy.enabled,
    magikaReady: isMagikaReady(),
  };
}

function getExt(filename) {
  const i = (filename || '').lastIndexOf('.');
  return i >= 0 ? filename.slice(i) : '';
}

function setupAlarms() {
  browser.alarms.create('remote-sync', { periodInMinutes: 60 });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'remote-sync') await syncRemotePolicy();
  });
  syncRemotePolicy().catch(console.error);
}
