const BANNER_ID = 'dlp-shield-banner';

export function showBlockBanner(message) {
  removeBanner();

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: #d32f2f;
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    max-width: 480px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: dlp-slide-in 0.2s ease;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes dlp-slide-in {
      from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head?.appendChild(style);

  const icon = document.createElement('span');
  icon.textContent = '🛡️';
  icon.style.fontSize = '18px';

  const text = document.createElement('span');
  text.textContent = message;

  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = `
    background: none; border: none; color: #fff;
    cursor: pointer; font-size: 16px; margin-left: auto; padding: 0;
  `;
  close.onclick = removeBanner;

  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(close);
  document.documentElement.appendChild(banner);

  setTimeout(removeBanner, 6000);
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
}

const STALE_ID = 'dlp-shield-stale-banner';

/** Extension vừa reload — tab cần F5 để script mới chạy (tránh lỗi invalidated). */
export function showExtensionStaleBanner() {
  document.getElementById(STALE_ID)?.remove();

  const banner = document.createElement('div');
  banner.id = STALE_ID;
  banner.setAttribute('role', 'status');
  banner.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: #e65100;
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,.3);
    max-width: 520px;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  const text = document.createElement('span');
  text.textContent =
    'DLP Shield: Extension vừa cập nhật/reload. Nhấn F5 (tải lại trang) để chặn upload hoạt động đúng.';

  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = `
    background: none; border: none; color: #fff;
    cursor: pointer; font-size: 16px; margin-left: auto; padding: 0;
  `;
  close.onclick = () => banner.remove();

  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(close);
  document.documentElement.appendChild(banner);

  setTimeout(() => banner.remove(), 12000);
}
