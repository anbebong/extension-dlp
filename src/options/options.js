import browser from 'webextension-polyfill';
import { loadPolicy, savePolicy, syncRemotePolicy, DEFAULT_POLICY } from '../background/policy.js';

let policy = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function $(id) {
  return document.getElementById(id);
}

function showStatus(id, type, msg) {
  const el = $(id);
  if (!el) return;
  el.className = `status-msg ${type}`;
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; el.className = 'status-msg'; }, 4000);
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  $('enabled').checked = policy.enabled;
  $('remote-url').value = policy.remoteUrl || '';
  $('sync-interval').value = Math.round((policy.syncIntervalSeconds || 3600) / 60);
  renderTagList('domain-list', policy.blockedDomains, 'blockedDomains');
  renderTagList('ext-list', policy.blockedExtensions, 'blockedExtensions');
  renderTagList('mime-list', policy.blockedMimeTypes, 'blockedMimeTypes');
}

function renderTagList(containerId, items, key) {
  const container = $(containerId);
  if (!container) return;

  // Đảm bảo items luôn là array
  const list = Array.isArray(items) ? items : [];

  if (!list.length) {
    container.innerHTML = '<span class="tag-empty">Chưa có mục nào</span>';
    return;
  }

  container.innerHTML = '';
  list.forEach((item, i) => {
    const tag = document.createElement('div');
    tag.className = 'tag';

    const label = document.createElement('span');
    label.textContent = item;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove';
    removeBtn.title = 'Xóa';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      policy[key].splice(i, 1);
      renderTagList(containerId, policy[key], key);
    });

    tag.appendChild(label);
    tag.appendChild(removeBtn);
    container.appendChild(tag);
  });
}

function renderLog() {
  const container = $('block-log');
  if (!container) return;

  const log = Array.isArray(policy.blockLog) ? policy.blockLog : [];

  if (!log.length) {
    container.innerHTML = '<div class="log-empty">📋 Chưa có sự kiện nào được ghi lại</div>';
    return;
  }

  const tbody = log.map((e) => {
    const time = new Date(e.timestamp).toLocaleString('vi-VN');
    const typeLabel = e.type === 'upload' ? '⬆ upload' : '⬇ download';
    const reasonMap = {
      blocked_domain: 'Domain',
      blocked_extension: 'Extension',
      blocked_filetype: `AI: ${e.detectedType || '?'}`,
    };
    const reason = reasonMap[e.reason] || e.reason || '?';
    const detail = e.filename || e.url || e.domain || '—';
    const short = detail.length > 45 ? detail.slice(0, 42) + '…' : detail;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space:nowrap;color:var(--text-muted)">${time}</td>
      <td><span class="badge badge-${e.type}">${typeLabel}</span></td>
      <td><span class="reason-chip">${reason}</span></td>
      <td title="${detail}">${short}</td>
    `;
    return tr;
  });

  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'log-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Thời gian</th><th>Loại</th><th>Lý do</th><th>File / Domain</th>
      </tr>
    </thead>
  `;
  const tbodyEl = document.createElement('tbody');
  tbody.forEach((tr) => tbodyEl.appendChild(tr));
  table.appendChild(tbodyEl);
  container.appendChild(table);
}

// ── Add / remove items ───────────────────────────────────────────────────────

function addItem(inputId, key, listId) {
  const input = $(inputId);
  if (!input) return;

  const val = input.value.trim();
  if (!val) return;

  if (!Array.isArray(policy[key])) policy[key] = [];

  if (!policy[key].includes(val)) {
    policy[key].push(val);
    renderTagList(listId, policy[key], key);
  }
  input.value = '';
  input.focus();
}

// ── Sidebar nav ──────────────────────────────────────────────────────────────

function initNav() {
  const sections = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('nav a');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((a) => a.classList.remove('active'));
          const active = document.querySelector(`nav a[href="#${entry.target.id}"]`);
          if (active) active.classList.add('active');
        }
      });
    },
    { threshold: 0.4 }
  );

  sections.forEach((s) => observer.observe(s));

  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ── Event bindings (đặt trong DOMContentLoaded để chắc chắn DOM sẵn sàng) ──

function bindEvents() {
  // Domain
  $('add-domain')?.addEventListener('click', () =>
    addItem('domain-input', 'blockedDomains', 'domain-list')
  );
  $('domain-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem('domain-input', 'blockedDomains', 'domain-list');
  });

  $('debug-ui')?.addEventListener('change', async () => {
    const on = $('debug-ui')?.checked ?? false;
    try {
      await browser.storage.local.set({ dlpDebugUi: on });
      showStatus(
        'debug-ui-hint',
        'success',
        on
          ? 'Đã bật — mở/một trang https và xem góc phải dưới (hoặc tải lại trang).'
          : 'Đã tắt panel debug.'
      );
    } catch (err) {
      showStatus('debug-ui-hint', 'error', 'Lỗi: ' + err.message);
    }
  });

  // Extension
  $('add-ext')?.addEventListener('click', () =>
    addItem('ext-input', 'blockedExtensions', 'ext-list')
  );
  $('ext-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem('ext-input', 'blockedExtensions', 'ext-list');
  });

  // MIME
  $('add-mime')?.addEventListener('click', () =>
    addItem('mime-input', 'blockedMimeTypes', 'mime-list')
  );
  $('mime-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem('mime-input', 'blockedMimeTypes', 'mime-list');
  });

  // Save
  $('save-btn')?.addEventListener('click', async () => {
    policy.enabled = $('enabled').checked;
    policy.remoteUrl = $('remote-url').value.trim();
    policy.syncIntervalSeconds = Number($('sync-interval').value) * 60;
    try {
      await savePolicy(policy);
      showStatus('save-status', 'success', '✓ Đã lưu cấu hình!');
    } catch (err) {
      showStatus('save-status', 'error', '✗ Lưu thất bại: ' + err.message);
    }
  });

  // Reset
  $('reset-btn')?.addEventListener('click', async () => {
    if (!confirm('Đặt lại về mặc định? Toàn bộ cấu hình sẽ bị xóa.')) return;
    policy = { ...DEFAULT_POLICY, blockLog: [] };
    await savePolicy(policy);
    render();
    renderLog();
    showStatus('save-status', 'success', '✓ Đã đặt lại mặc định');
  });

  // Sync
  $('sync-now')?.addEventListener('click', async () => {
    showStatus('sync-status', 'info', '↻ Đang đồng bộ...');
    try {
      policy = await syncRemotePolicy();
      render();
      showStatus('sync-status', 'success', `✓ Đồng bộ thành công lúc ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch (err) {
      showStatus('sync-status', 'error', `✗ Thất bại: ${err.message}`);
    }
  });

  // Clear log
  $('clear-log')?.addEventListener('click', async () => {
    if (!confirm('Xóa toàn bộ lịch sử block?')) return;
    policy.blockLog = [];
    await savePolicy(policy);
    renderLog();
  });
}

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    policy = await loadPolicy();
  } catch (err) {
    console.error('[DLP Options] loadPolicy failed:', err);
    policy = { ...DEFAULT_POLICY, blockLog: [] };
  }
  const local = await browser.storage.local.get('dlpDebugUi');
  render();
  const dbg = $('debug-ui');
  if (dbg) dbg.checked = !!local.dlpDebugUi;
  renderLog();
  initNav();
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  init();
});
