/**
 * Build release script — tạo file .zip sẵn sàng chia sẻ.
 * Chạy: node scripts/build-release.js [chrome|firefox|all]
 *
 * Output:
 *   releases/dlp-shield-chrome-v1.0.0.zip
 *   releases/dlp-shield-firefox-v1.0.0.zip
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const VERSION = pkg.version;
const ROOT = path.join(__dirname, '..');
const RELEASES_DIR = path.join(ROOT, 'releases');
const MODEL_DIR = path.join(ROOT, 'models');

const target = process.argv[2] || 'all';
const browsers = target === 'all' ? ['chrome', 'firefox'] : [target];

// ── Kiểm tra model đã tải chưa ──────────────────────────────────────────────
function checkModel() {
  const modelFile = path.join(MODEL_DIR, 'standard_v3_3', 'model.json');
  if (!fs.existsSync(modelFile)) {
    console.error('❌ Model chưa được tải. Chạy trước:\n   node scripts/download-model.js\n');
    process.exit(1);
  }
  const sizeKB = (fs.statSync(path.join(MODEL_DIR, 'standard_v3_3', 'group1-shard1of1.bin')).size / 1024).toFixed(0);
  console.log(`✓ Model Magika: ${sizeKB} KB\n`);
}

// ── Zip thư mục (dùng Node built-in, không cần dep ngoài) ──────────────────
function zipDir(sourceDir, outFile) {
  // Dùng PowerShell trên Windows, zip trên Unix
  const isWin = process.platform === 'win32';
  if (isWin) {
    const ps = `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${outFile}" -Force`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' });
  } else {
    execSync(`cd "${sourceDir}" && zip -r "${outFile}" .`, { stdio: 'inherit' });
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🛡️  DLP Shield — Build Release v${VERSION}`);
  console.log('='.repeat(44) + '\n');

  checkModel();
  fs.mkdirSync(RELEASES_DIR, { recursive: true });

  for (const browser of browsers) {
    console.log(`📦 Building ${browser}...`);

    // Webpack build offline mode
    execSync(
      `npx webpack --env browser=${browser} --env localModel=true`,
      { cwd: ROOT, stdio: 'inherit' }
    );

    const distDir = path.join(ROOT, 'dist', browser);
    const outFile = path.join(RELEASES_DIR, `dlp-shield-${browser}-v${VERSION}.zip`);

    // Xóa zip cũ nếu có
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    console.log(`\n🗜  Đóng gói → releases/dlp-shield-${browser}-v${VERSION}.zip`);
    zipDir(distDir, outFile);

    const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
    console.log(`✅ ${browser}: ${sizeMB} MB\n`);
  }

  console.log('─'.repeat(44));
  console.log('📁 Files trong releases/:');
  fs.readdirSync(RELEASES_DIR).forEach((f) => {
    const size = (fs.statSync(path.join(RELEASES_DIR, f)).size / 1024 / 1024).toFixed(2);
    console.log(`   ${f}  (${size} MB)`);
  });

  console.log('\n📌 Hướng dẫn chia sẻ:');
  console.log('   Chrome/Edge: Gửi file .zip → người dùng giải nén → chrome://extensions → Load unpacked');
  console.log('   Firefox:     Gửi file .zip → about:debugging → Load Temporary Add-on\n');
}

main().catch((err) => {
  console.error('\n❌ Build thất bại:', err.message);
  process.exit(1);
});
