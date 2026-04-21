import browser from 'webextension-polyfill';
import { loadPolicy, savePolicy, syncRemotePolicy, DEFAULT_POLICY, FILE_TYPE_GROUPS } from '../background/policy.js';

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
  renderTagList('domain-list', getList('allowedDomains'), 'allowedDomains');
  renderTypeGroups('upload-groups', 'upload.blockedTypes');
  renderTypeGroups('download-groups', 'download.blockedTypes');
}

function renderTypeGroups(containerId, path) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';

  const checked = new Set(getList(path));

  FILE_TYPE_GROUPS.forEach((group) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'type-group';

    const header = document.createElement('div');
    header.className = 'type-group-header';

    const allChecked = group.types.every((t) => checked.has(t.label));
    const someChecked = group.types.some((t) => checked.has(t.label));

    const masterCb = document.createElement('input');
    masterCb.type = 'checkbox';
    masterCb.checked = allChecked;
    masterCb.indeterminate = !allChecked && someChecked;
    masterCb.addEventListener('change', () => {
      group.types.forEach((t) => {
        const cb = container.querySelector(`input[data-label="${t.label}"][data-path="${path}"]`);
        if (cb) cb.checked = masterCb.checked;
      });
      syncCheckboxesToPolicy(container, path);
    });

    const title = document.createElement('span');
    title.textContent = group.name;
    title.className = 'type-group-title';

    header.appendChild(masterCb);
    header.appendChild(title);
    groupEl.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'type-grid';

    group.types.forEach((t) => {
      const label = document.createElement('label');
      label.className = 'type-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.label = t.label;
      cb.dataset.path = path;
      cb.checked = checked.has(t.label);
      cb.addEventListener('change', () => {
        syncCheckboxesToPolicy(container, path);
        const allNow = group.types.every((x) => {
          const c = container.querySelector(`input[data-label="${x.label}"][data-path="${path}"]`);
          return c?.checked;
        });
        const someNow = group.types.some((x) => {
          const c = container.querySelector(`input[data-label="${x.label}"][data-path="${path}"]`);
          return c?.checked;
        });
        masterCb.checked = allNow;
        masterCb.indeterminate = !allNow && someNow;
      });

      const name = document.createElement('span');
      name.textContent = t.desc;

      const code = document.createElement('code');
      code.textContent = t.label;
      code.className = 'type-label-code';

      label.appendChild(cb);
      label.appendChild(name);
      label.appendChild(code);
      grid.appendChild(label);
    });

    groupEl.appendChild(grid);
    container.appendChild(groupEl);
  });
}

function syncCheckboxesToPolicy(container, path) {
  const selected = [];
  container.querySelectorAll(`input[type=checkbox][data-path="${path}"]`).forEach((cb) => {
    if (cb.checked) selected.push(cb.dataset.label);
  });
  setList(path, selected);
}

function getList(path) {
  const parts = path.split('.');
  let obj = policy;
  for (const p of parts) obj = obj?.[p];
  return Array.isArray(obj) ? obj : [];
}

function setList(path, value) {
  const parts = path.split('.');
  let obj = policy;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

function renderTagList(containerId, items, path) {
  const container = $(containerId);
  if (!container) return;

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
      const arr = getList(path);
      arr.splice(i, 1);
      setList(path, arr);
      renderTagList(containerId, arr, path);
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

function addItem(inputId, path, listId) {
  const input = $(inputId);
  if (!input) return;

  const val = input.value.trim();
  if (!val) return;

  const arr = getList(path);
  if (!arr.includes(val)) {
    arr.push(val);
    setList(path, arr);
    renderTagList(listId, arr, path);
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
    addItem('domain-input', 'allowedDomains', 'domain-list')
  );
  $('domain-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem('domain-input', 'allowedDomains', 'domain-list');
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
