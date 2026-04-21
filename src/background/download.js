import browser from 'webextension-polyfill';
import { loadPolicy, isDomainAllowed, isMimeTypeBlocked, logBlockEvent } from './policy.js';

// Map từ extension file → Magika label tương đương
const EXT_TO_LABEL = {
  // Tài liệu
  '.pdf':  'pdf',
  '.docx': 'docx', '.doc': 'ooxml', '.dotx': 'docx',
  '.xlsx': 'xlsx', '.xls': 'ooxml', '.xlsb': 'xlsx',
  '.pptx': 'pptx', '.ppt': 'ooxml',
  '.odt':  'odt',  '.ods': 'ods',   '.odp': 'odp',
  '.rtf':  'rtf',  '.csv': 'csv',
  // Hình ảnh
  '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png',
  '.gif': 'gif',  '.bmp': 'bmp',   '.tiff': 'tiff', '.tif': 'tiff',
  '.webp': 'webp', '.svg': 'svg',  '.psd': 'psd',
  // Video / Audio
  '.mp4': 'mp4', '.mkv': 'mkv', '.avi': 'avi',
  '.mp3': 'mp3', '.wav': 'wav', '.flac': 'flac',
  // Archive
  '.zip': 'zip', '.rar': 'rar', '.7z': 'sevenzip',
  '.gz': 'gzip', '.tar': 'tar',
  // Executable / Script
  '.exe': 'pebin', '.dll': 'pebin', '.sys': 'pebin',
  '.sh':  'shell', '.bash': 'shell',
  '.bat': 'batch', '.cmd': 'batch',
  '.ps1': 'powershell',
  '.jar': 'jar', '.apk': 'apk',
  // Dữ liệu nhạy cảm
  '.db': 'sqlite', '.sqlite': 'sqlite',
  '.pem': 'pem', '.key': 'pem', '.crt': 'pem',
  '.eml': 'eml', '.pst': 'outlook', '.ost': 'outlook',
};

export function initDownloadBlocker() {
  // onDeterminingFilename fired sau khi server trả Content-Disposition — có tên file thật
  chrome.downloads.onDeterminingFilename.addListener(handleDeterminingFilename);
}

function handleDeterminingFilename(downloadItem, suggest) {
  const { id, filename } = downloadItem;
  const url = downloadItem.finalUrl || downloadItem.url;

  console.log(`[DLP] download filename resolved: "${filename}" from ${url}`);

  // Gọi suggest ngay để Chrome không timeout, rồi cancel async nếu cần
  suggest({ filename });

  checkAndBlock(id, filename, url);
}

async function checkAndBlock(id, filename, url) {
  const policy = await loadPolicy();
  if (!policy.enabled) return false;

  if (isDomainAllowed(url, policy)) {
    console.log(`[DLP] download allowed (domain whitelist): ${url}`);
    return false;
  }

  const ext = getExt(filename).toLowerCase();
  const label = EXT_TO_LABEL[ext];

  console.log(`[DLP] download check: ext="${ext}" → label="${label}"`);

  if (label && isMimeTypeBlocked(label, policy, 'download')) {
    console.log(`[DLP] download BLOCKED: "${filename}" (${label})`);
    try {
      await browser.downloads.cancel(id);
    } catch { /* có thể đã xong */ }
    await logBlockEvent({ type: 'download', reason: 'blocked_filetype', detectedType: label, url, filename });
    await showBlockNotification({ reason: 'blocked_filetype', detectedType: label });
    return true;
  }

  return false;
}

function getExt(filename) {
  const i = (filename || '').lastIndexOf('.');
  return i >= 0 ? filename.slice(i) : '';
}

async function showBlockNotification(event) {
  const messages = {
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

