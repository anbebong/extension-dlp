import browser from 'webextension-polyfill';
import { loadPolicy, savePolicy } from '../background/policy.js';

async function init() {
  const policy = await loadPolicy();

  const toggle = document.getElementById('toggle');
  const pill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const hint = document.getElementById('toggle-hint');

  function updateUI(enabled) {
    toggle.checked = enabled;
    pill.className = 'status-pill ' + (enabled ? 'on' : 'off');
    statusText.textContent = enabled ? 'Bật' : 'Tắt';
    hint.textContent = enabled ? 'Đang chặn upload & download' : 'Bảo vệ đã tắt';
  }

  updateUI(policy.enabled);

  toggle.onchange = async () => {
    policy.enabled = toggle.checked;
    await savePolicy(policy);
    updateUI(policy.enabled);
  };

  // Stats
  const log = policy.blockLog || [];
  document.getElementById('upload-count').textContent = log.filter((e) => e.type === 'upload').length;
  document.getElementById('download-count').textContent = log.filter((e) => e.type === 'download').length;

  // Recent events (5 gần nhất)
  renderRecentEvents(log.slice(0, 5));

  document.getElementById('open-options').onclick = () => {
    browser.runtime.openOptionsPage();
  };

  const pingResult = document.getElementById('ping-result');
  document.getElementById('btn-ping').onclick = async () => {
    pingResult.className = 'ping-result';
    pingResult.textContent = 'Đang gọi…';
    try {
      const r = await browser.runtime.sendMessage({ type: 'PING' });
      if (r?.ok && r?.pong) {
        pingResult.className = 'ping-result ok';
        pingResult.textContent = `OK — service worker trả lời. Bảo vệ: ${r.policyEnabled ? 'BẬT' : 'TẮT'} · ${new Date(r.ts).toLocaleString('vi-VN')}`;
      } else {
        pingResult.className = 'ping-result err';
        pingResult.textContent = 'Phản hồi lạ: ' + JSON.stringify(r);
      }
    } catch (err) {
      pingResult.className = 'ping-result err';
      pingResult.textContent = 'Lỗi: ' + (err?.message || err) + ' (background không chạy hoặc extension lỗi)';
    }
  };

  const magikaResult = document.getElementById('magika-result');
  document.getElementById('btn-magika-test').onclick = async () => {
    magikaResult.className = 'ping-result';
    magikaResult.textContent = 'Đang phân loại… (vài giây lần đầu)';
    try {
      const r = await browser.runtime.sendMessage({ type: 'SELF_TEST_MAGIKA' });
      if (r?.ok) {
        if (r.policyEnabled === false) {
          magikaResult.className = 'ping-result err';
          magikaResult.textContent = 'Bảo vệ đang TẮT — bật toggle "Bảo vệ DLP" rồi thử lại.';
          return;
        }
        magikaResult.className = 'ping-result ' + (r.wouldBlock ? 'ok' : 'err');
        magikaResult.textContent = r.wouldBlock
          ? `OK — Magika raw: ${r.magikaRawLabel} → chặn theo: ${r.effectiveLabel} (chuỗi hoạt động)`
          : `Lỗi cấu hình — file MZ không bị chặn (raw ${r.magikaRawLabel} → ${r.effectiveLabel}). Xem MIME/Magika trong Options.`;
      } else {
        magikaResult.className = 'ping-result err';
        magikaResult.textContent = JSON.stringify(r);
      }
    } catch (err) {
      magikaResult.className = 'ping-result err';
      magikaResult.textContent = String(err?.message || err);
    }
  };
}

function renderRecentEvents(events) {
  const container = document.getElementById('event-list');
  if (!events.length) return;

  container.innerHTML = events
    .map((e) => {
      const name = e.filename || e.domain || e.url || '—';
      const short = name.length > 28 ? name.slice(0, 25) + '…' : name;
      const time = formatTime(e.timestamp);
      return `
        <div class="event-item">
          <span class="event-badge ${e.type}">${e.type === 'upload' ? '⬆' : '⬇'} ${e.type}</span>
          <span class="event-name" title="${name}">${short}</span>
          <span class="event-time">${time}</span>
        </div>
      `;
    })
    .join('');
}

function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'vừa xong';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'ph';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

init();
