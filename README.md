# 🛡️ DLP Shield — Browser Extension

**DLP Shield** là browser extension ngăn chặn người dùng upload/download các file vi phạm chính sách bảo mật. Extension dùng [Google Magika](https://github.com/google/magika) (ONNX, chạy hoàn toàn trong trình duyệt) để phát hiện loại file thực sự từ nội dung bytes — không thể bypass bằng cách đổi tên file.

---

## Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 🚫 Chặn Upload | Intercept `<input type="file">` trước khi file được submit |
| 🚫 Chặn Download | Cancel download ngay khi được tạo |
| 🧠 Magika AI | Phân loại file theo nội dung thực (4KB đầu), không theo extension |
| 🌐 Domain blocklist | Chặn theo domain + wildcard (`*.malware.org`) |
| 📋 Extension blocklist | Chặn theo đuôi file (`.exe`, `.ps1`, ...) |
| 🔍 MIME type blocklist | Chặn theo MIME type hoặc Magika label |
| ☁️ Remote policy sync | Fetch chính sách từ server trung tâm, tự động sync theo chu kỳ |
| 🔔 Thông báo | Banner trực tiếp trên trang (upload) + browser notification (download) |
| 📊 Block log | Lưu lịch sử 100 sự kiện gần nhất |

---

## Hướng dẫn sử dụng

> Sau khi **Load unpacked** vào Chrome, trang hướng dẫn sẽ tự động mở. Hoặc truy cập file `welcome/welcome.html` trong thư mục `dist/chrome/`.

### Bước 1 — Kiểm tra icon toolbar

Click icon 🛡️ trên thanh công cụ. Nếu thấy badge **Bật** màu xanh lá, extension đã sẵn sàng.

### Bước 2 — Cấu hình blocklist

Click **"Mở cấu hình đầy đủ"** → trang Options mở ra. Thêm vào:

| Mục | Ví dụ | Tác dụng |
|-----|-------|----------|
| **Domain bị chặn** | `evil.com`, `*.malware.org` | Chặn mọi upload/download từ domain này |
| **Extension file** | `.exe`, `.bat`, `.ps1` | Chặn theo đuôi file |
| **MIME / Magika label** | `exe`, `shell`, `elf` | AI phát hiện loại file thực — bypass đổi tên |

Nhấn **Enter** sau mỗi mục, sau đó nhấn **Lưu cấu hình**.

### Bước 3 — Kiểm tra hoạt động

- **Upload**: Thử chọn file `.exe` trong bất kỳ `<input type="file">` nào → banner đỏ xuất hiện, file bị xóa khỏi input.
- **Download**: Thử tải file từ domain trong blocklist → download bị cancel, browser notification hiện góc màn hình.

### Tắt/bật nhanh

Click icon 🛡️ → gạt toggle **Bảo vệ DLP**. Extension vẫn chạy nhưng không chặn khi tắt.

### Xem lịch sử

Options page → mục **Lịch sử block** — hiện 100 sự kiện gần nhất kèm loại (upload/download), lý do, tên file.

---

## Kiến trúc

```
extension-dlp/
├── src/
│   ├── background/
│   │   ├── service-worker.js   # Entry point MV3, message router
│   │   ├── magika.js           # Wrapper Google Magika ONNX classifier
│   │   ├── policy.js           # Quản lý blocklist + remote sync
│   │   └── download.js         # Chặn chrome.downloads
│   ├── content/
│   │   ├── upload.js           # Intercept input[type=file] (capture phase)
│   │   └── notify.js           # Banner UI thông báo block
│   ├── options/
│   │   ├── options.html        # Admin UI cấu hình policy
│   │   └── options.js
│   ├── popup/
│   │   ├── popup.html          # Toggle on/off + thống kê nhanh
│   │   └── popup.js
│   └── __tests__/
│       └── policy.test.js      # Unit tests (Jest)
├── __mocks__/                  # Mock browser API + Magika cho tests
├── manifest.json               # Manifest V3 (Chrome/Edge/Firefox ≥112)
├── webpack.config.js           # Build: dist/chrome + dist/firefox
├── babel.config.js
└── jest.config.js
```

### Luồng xử lý Upload

```
User chọn file
    │
    ▼
[Content Script] upload.js
  Đọc 4KB đầu của file
    │
    ▼  chrome.runtime.sendMessage
[Service Worker] service-worker.js
  1. Kiểm tra domain trang hiện tại
  2. Kiểm tra extension file (.exe, .bat...)
  3. Gọi Magika → classify bytes → MIME label
  4. So sánh với blockedMimeTypes
    │
    ├─ BLOCKED → trả về { blocked: true, reason }
    │               Content script: input.value = ''
    │               Hiển thị banner đỏ trên trang
    │
    └─ OK → cho qua
```

### Luồng xử lý Download

```
User click download / trang trigger download
    │
    ▼
[Service Worker] download.js
  chrome.downloads.onCreated listener
  1. Kiểm tra domain của URL
  2. Kiểm tra extension tên file
  3. Fetch 4KB đầu → Magika classify
  4. So sánh với policy
    │
    ├─ BLOCKED → chrome.downloads.cancel(id)
    │            browser.notifications.create(...)
    │
    └─ OK → cho qua
```

---

## Tích hợp Magika

Magika dùng **TensorFlow.js** (không phải ONNX) để nhận dạng file từ nội dung bytes. Extension hỗ trợ 2 chế độ load model:

### Chế độ CDN (mặc định — dùng ngay, không cần setup)

Model được tải tự động từ CDN của Google (`google.github.io`) lần đầu tiên Magika được gọi, sau đó được cache bởi trình duyệt.

```js
// Không cần options — Magika tự load từ CDN
const magika = await Magika.create();
const result = await magika.identifyBytes(uint8Array);
const label = result.prediction.output.label; // "exe", "pdf", "shell"...
```

**Ưu điểm:** Không cần tải model (~8MB), build nhanh hơn.  
**Nhược điểm:** Cần kết nối internet lần đầu dùng.

```bash
npm run build:chrome   # CDN mode (mặc định)
```

---

### Chế độ Offline (bundle model vào extension)

Phù hợp cho môi trường doanh nghiệp không có internet hoặc cần privacy hoàn toàn.

**Bước 1 — Tải model về local:**

```bash
node scripts/download-model.js
```

Script sẽ tải các file sau vào `models/standard_v3_3/`:
- `config.min.json` — cấu hình model
- `model.json` — graph model TensorFlow.js
- `group1-shard*.bin` — weight shards (~8MB tổng)

**Bước 2 — Build ở chế độ offline:**

```bash
npm run build:chrome:offline
```

Model files sẽ được copy vào `dist/chrome/models/` và extension load từ đó, không cần internet.

---

### API Magika thực tế

```js
import { Magika } from 'magika';

// Khởi tạo (factory method, không dùng new)
const magika = await Magika.create();                       // CDN
const magika = await Magika.create({                        // Local
  modelURL: chrome.runtime.getURL('models/standard_v3_3/model.json'),
  modelConfigURL: chrome.runtime.getURL('models/standard_v3_3/config.min.json'),
});

// Phân loại
const result = await magika.identifyBytes(uint8Array);

// Đọc kết quả — đúng cách:
const label = result.prediction.output.label;  // "exe", "pdf", "shell", ...
const score = result.prediction.output.score;  // 0.0 → 1.0

// Magika labels nguy hiểm cần chặn:
// exe, elf, shell, bat, powershell, vba, jar, dex, macho
```

---

## Cài đặt & Phát triển

### Yêu cầu
- Node.js ≥ 18
- npm ≥ 9

### Cài dependencies

```bash
npm install
```

### Build

```bash
# Build cho Chrome / Edge
npm run build:chrome

# Build cho Firefox
npm run build:firefox

# Build cả hai
npm run build
```

Output: `dist/chrome/` và `dist/firefox/`

### Load extension (Development)

**Chrome / Edge:**
1. Vào `chrome://extensions`
2. Bật "Developer mode" (góc trên phải)
3. Nhấn "Load unpacked" → chọn thư mục `dist/chrome/`

**Firefox:**
1. Vào `about:debugging#/runtime/this-firefox`
2. Nhấn "Load Temporary Add-on" → chọn file `dist/firefox/manifest.json`

### Build để chia sẻ (Offline Release)

Tạo file `.zip` sẵn sàng gửi cho người dùng khác — model Magika được đóng gói bên trong, **không cần internet**:

```bash
# Bước 1 — Tải model về (chỉ cần làm 1 lần)
node scripts/download-model.js

# Bước 2 — Build và đóng gói
npm run release          # cả Chrome + Firefox
npm run release:chrome   # chỉ Chrome/Edge
npm run release:firefox  # chỉ Firefox
```

Output trong thư mục `releases/`:
```
releases/
├── dlp-shield-chrome-v1.0.0.zip   (~3 MB)
└── dlp-shield-firefox-v1.0.0.zip  (~3 MB)
```

**Người nhận cài thế nào?**

| Trình duyệt | Cách cài |
|-------------|----------|
| Chrome / Edge | Giải nén zip → `chrome://extensions` → bật Developer mode → **Load unpacked** → chọn thư mục vừa giải nén |
| Firefox | `about:debugging` → This Firefox → **Load Temporary Add-on** → chọn file `manifest.json` bên trong zip |

> Lưu ý: Chrome yêu cầu giải nén trước khi Load unpacked. Firefox có thể load thẳng từ file zip.

### Chạy tests

```bash
npm test
```

14 unit tests cho toàn bộ logic policy (domain matching, extension matching, MIME type matching).

---

## Cấu hình Policy

Policy được lưu trong `chrome.storage.sync` và có thể quản lý qua Options page:

```json
{
  "enabled": true,
  "blockedDomains": ["evil.com", "*.malware.org"],
  "blockedExtensions": [".exe", ".bat", ".cmd", ".ps1", ".vbs", ".jar", ".msi", ".scr"],
  "blockedMimeTypes": [
    "application/x-msdownload",
    "application/x-executable",
    "application/x-sh",
    "exe",
    "elf",
    "shell"
  ],
  "remoteUrl": "https://company.internal/dlp-policy.json",
  "syncIntervalSeconds": 3600,
  "blockLog": []
}
```

### Remote Policy Format

Server trả về JSON với cấu trúc tương tự — các list sẽ được **merge** (không ghi đè) vào local policy:

```json
{
  "blockedDomains": ["newmalware.com"],
  "blockedExtensions": [".scr"],
  "blockedMimeTypes": ["application/x-dosexec"]
}
```

---

## Magika — Phân loại file bằng AI

[Magika](https://github.com/google/magika) là công cụ của Google dùng deep learning (ONNX) để nhận dạng loại file từ nội dung bytes, độ chính xác cao hơn heuristic thông thường.

**Tại sao dùng Magika thay vì chỉ check extension?**

| Tình huống | Extension-only | Magika |
|------------|---------------|--------|
| `virus.pdf` thực chất là EXE | ❌ Bỏ qua | ✅ Phát hiện `exe` |
| `document.exe` | ✅ Chặn | ✅ Chặn |
| `script.jpg` thực chất là shell | ❌ Bỏ qua | ✅ Phát hiện `shell` |

**Magika labels hay gặp:**

| Label | Mô tả |
|-------|-------|
| `exe` | Windows executable |
| `elf` | Linux executable |
| `shell` | Shell script |
| `bat` | Batch file |
| `jar` | Java Archive |
| `powershell` | PowerShell script |
| `vba` | Visual Basic |
| `pdf` | PDF document |
| `zip` | ZIP archive |

Chỉ cần đọc **4KB đầu** của file — đủ cho Magika, không block UI, không ảnh hưởng hiệu suất.

---

## Lưu ý kỹ thuật

### WASM trong Manifest V3 Service Worker
Magika dùng ONNX Runtime Web (WASM). Cần khai báo trong `manifest.json`:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

### Service Worker Lifecycle
MV3 Service Worker có thể bị browser terminate sau khi idle. Magika instance được cache trong module scope — nếu SW restart, instance sẽ được tạo lại tự động khi có request tiếp theo.

### Cross-origin Download Scan
Khi fetch bytes từ URL để Magika scan, nếu server không có CORS header phù hợp, request sẽ bị block. Trong trường hợp này, extension fallback về chỉ kiểm tra domain + extension — vẫn cung cấp lớp bảo vệ cơ bản.

### Firefox Compatibility
- Yêu cầu Firefox ≥ 112 (MV3 + WASM trong Service Worker)
- Dùng `webextension-polyfill` để tương thích API cross-browser

---

## Icons

Thêm các file icon vào thư mục `icons/`:
- `icon16.png` — 16×16 px (toolbar)
- `icon48.png` — 48×48 px (extensions list)
- `icon128.png` — 128×128 px (Chrome Web Store)

Gợi ý: shield icon với màu chủ đạo `#1976d2`.

---

## Roadmap

- [ ] Chặn clipboard paste file
- [ ] Chặn `fetch`/`XMLHttpRequest` multipart upload
- [ ] Dashboard thống kê chi tiết
- [ ] Export block log ra CSV
- [ ] Hỗ trợ whitelist domain (bypass policy cho domain tin cậy)
- [ ] Admin lock (khóa options page bằng password)
