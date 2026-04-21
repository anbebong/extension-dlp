# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build              # build cả Chrome + Firefox vào dist/chrome/ và dist/firefox/
npm run build:chrome       # chỉ build Chrome (dùng khi dev nhanh)
npm run build:firefox      # chỉ build Firefox
npm run build:chrome:offline   # build offline — copy model files từ models/ vào dist
npm run watch:chrome       # watch mode cho Chrome

npm run download-model     # tải model Magika (~3MB) về thư mục models/ (cần cho offline build)
npm run release            # build + zip cả hai browser vào releases/
npm test                   # chạy Jest tests
```

Sau mỗi thay đổi phải build lại rồi reload extension tại `chrome://extensions`.

## Architecture

### Luồng dữ liệu chính

**Upload:**
```
Trang web (input[type=file]) → content/upload.js (đọc bytes đầu file)
  → chrome.runtime.sendMessage(CLASSIFY_AND_CHECK)
  → background/service-worker.js → background/magika.js (Magika AI)
  → isMimeTypeBlocked(label, policy, 'upload')
  → { blocked, reason } → upload.js hiện banner / bỏ qua
```

**Download:**
```
Chrome downloads API → background/download.js
  → chrome.downloads.onDeterminingFilename (có tên file thật từ Content-Disposition)
  → getExt(filename) → EXT_TO_LABEL map → isMimeTypeBlocked(label, policy, 'download')
  → cancel nếu blocked
```

### Policy Structure

Policy lưu trong `chrome.storage.sync`:
```js
{
  enabled: boolean,
  allowedDomains: string[],       // wildcard: "*.example.com" — bypass tất cả check
  upload: { blockedTypes: string[] },    // Magika labels: 'pdf', 'docx', ...
  download: { blockedTypes: string[] },  // Magika labels riêng cho download
  remoteUrl: string,              // URL fetch remote policy JSON
  syncIntervalSeconds: number,
  blockLog: BlockEvent[],
}
```

**Quan trọng:** `loadPolicy()` chỉ dùng `saved.upload.blockedTypes` nếu đã tồn tại, không merge với default. Điều này cho phép user xóa item mà không bị merge lại.

### Magika Integration

- Magika dùng nhãn riêng (không phải MIME chuẩn): `pebin` (Windows EXE), `docx`, `pdf`, `shell`, v.v.
- Model load **eager** ngay khi service worker khởi động — không lazy load (tránh timeout message channel MV3).
- `LABEL_TO_MIME` trong `magika.js` map label → MIME chuẩn.
- `FILE_TYPE_GROUPS` trong `policy.js` là danh sách đầy đủ các nhóm định dạng dùng cho UI checkbox.

### Message Channel (MV3 gotcha)

Service worker dùng `chrome.runtime.onMessage` **trực tiếp** (không qua webextension-polyfill) với `return true` để giữ channel mở cho async response. Polyfill Promise-based sẽ timeout trong MV3.

### Key Files

| File | Vai trò |
|---|---|
| `src/background/policy.js` | Policy CRUD, `FILE_TYPE_GROUPS`, `isDomainAllowed`, `isMimeTypeBlocked(label, policy, scope)` |
| `src/background/magika.js` | Wrapper Magika AI, `LABEL_TO_MIME` map, eager init |
| `src/background/service-worker.js` | Message handler (PING, CLASSIFY_AND_CHECK, SELF_TEST_MAGIKA) |
| `src/background/download.js` | `onDeterminingFilename` listener, `EXT_TO_LABEL` map |
| `src/content/upload.js` | Intercept `<input type=file>` kể cả Shadow DOM |
| `src/content/debug-panel.js` | Floating debug panel, toggle bằng `dlpDebugUi` trong storage.local |
| `src/options/options.js` | Dùng `getList(path)` / `setList(path, value)` với dot-notation cho nested policy |

### isMimeTypeBlocked — scope bắt buộc

```js
isMimeTypeBlocked(label, policy, 'upload')    // upload scope
isMimeTypeBlocked(label, policy, 'download')  // download scope
// KHÔNG gọi thiếu scope — sẽ trả false
```

### Build System

Webpack bundle tất cả JS. `__DLP_LOCAL_MODEL__` là DefinePlugin flag — `true` khi build offline, `false` (CDN) khi build thường. Content scripts và HTML được copy bằng CopyPlugin, không bundle.

### Tests

Tests cũ (`src/__tests__/policy.test.js`) dùng API cũ (`isDomainBlocked`, flat `blockedMimeTypes`) — cần cập nhật khi thay đổi policy API. Mocks nằm ở `src/__mocks__/`.
