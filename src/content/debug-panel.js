import browser from 'webextension-polyfill';
import { isExtensionContextInvalidated } from './extension-context.js';

const PANEL_ID = 'dlp-shield-debug-panel';
const LOG_ID = 'dlp-shield-debug-log';

function ensurePanel() {
  let root = document.getElementById(PANEL_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = PANEL_ID;
  root.setAttribute('role', 'log');
  root.setAttribute('aria-label', 'DLP Shield debug');
  root.style.cssText = `
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 2147483646;
    width: min(420px, calc(100vw - 24px));
    max-height: 240px;
    overflow: auto;
    background: #1a1d24;
    color: #e8eaed;
    font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    border-radius: 10px;
    border: 1px solid #3c4048;
    box-shadow: 0 8px 32px rgba(0,0,0,.45);
    padding: 10px 12px;
  `;

  const title = document.createElement('div');
  title.textContent = 'DLP Shield · Debug';
  title.style.cssText = 'font-weight:700;color:#8ab4f8;margin-bottom:8px;font-size:12px;';

  const log = document.createElement('div');
  log.id = LOG_ID;
  log.style.cssText =
    'margin:0;max-height:180px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;';

  root.appendChild(title);
  root.appendChild(log);
  (document.documentElement || document.body).appendChild(root);
  return root;
}

function appendLine(text) {
  const log = document.getElementById(LOG_ID);
  if (!log) return;
  const line = document.createElement('div');
  line.style.cssText = 'border-bottom:1px solid #2d3139;padding:4px 0;';
  line.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${text}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function removePanel() {
  document.getElementById(PANEL_ID)?.remove();
}

/**
 * Gọi khi content script load: bật panel nếu user bật trong Options, và lắng storage.
 */
export async function initDebugPanel() {
  try {
    const { dlpDebugUi } = await browser.storage.local.get('dlpDebugUi');
    if (dlpDebugUi) {
      ensurePanel();
      appendLine('Content script đã inject (upload.js)');
      appendLine(`URL: ${location.href}`);
    }

    browser.storage.onChanged.addListener((changes, area) => {
      try {
        if (area !== 'local' || !changes.dlpDebugUi) return;
        if (changes.dlpDebugUi.newValue) {
          ensurePanel();
          appendLine('Panel debug bật từ Options');
          appendLine(`URL: ${location.href}`);
        } else {
          removePanel();
        }
      } catch (_) {
        /* invalidated */
      }
    });
  } catch (err) {
    if (!isExtensionContextInvalidated(err)) console.warn('[DLP] initDebugPanel:', err);
  }
}

/** Ghi dòng lên panel (chỉ khi bật debug trong Options). Không throw (tránh Uncaught khi context invalidated). */
export async function debugLogAsync(message) {
  try {
    const { dlpDebugUi } = await browser.storage.local.get('dlpDebugUi');
    if (!dlpDebugUi) return;
    ensurePanel();
    appendLine(message);
  } catch (err) {
    if (!isExtensionContextInvalidated(err)) console.warn('[DLP] debugLog:', err);
  }
}
