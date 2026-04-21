/**
 * Script tải model Magika về local để dùng ở chế độ offline.
 * Chạy: node scripts/download-model.js
 *
 * Model sẽ được lưu vào thư mục models/standard_v3_3/
 * sau đó build bằng: npm run build:chrome:offline
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_VERSION = 'standard_v3_3';
const BASE_URL = `https://google.github.io/magika/models/${MODEL_VERSION}`;
const OUT_DIR = path.join(__dirname, '..', 'models', MODEL_VERSION);

const FILES_TO_DOWNLOAD = [
  'config.min.json',
  'model.json',
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`📦 Tải Magika model ${MODEL_VERSION} về ${OUT_DIR}\n`);

  // Bước 1: tải config + model.json trước
  for (const file of FILES_TO_DOWNLOAD) {
    await downloadFile(`${BASE_URL}/${file}`, path.join(OUT_DIR, file));
  }

  // Bước 2: đọc model.json để biết các shard files cần tải
  const modelJson = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'model.json'), 'utf8'));
  const shards = modelJson.weightsManifest?.flatMap((g) => g.paths) || [];

  if (!shards.length) {
    console.warn('⚠️  Không tìm thấy weight shards trong model.json');
    return;
  }

  console.log(`\n📂 Tải ${shards.length} weight shard(s)...`);
  for (const shard of shards) {
    await downloadFile(`${BASE_URL}/${shard}`, path.join(OUT_DIR, shard));
  }

  console.log('\n✅ Hoàn tất! Giờ build với:\n   npm run build:chrome:offline\n');
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const filename = path.basename(dest);
    process.stdout.write(`  ⬇ ${filename} ... `);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);

    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} khi tải ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        const size = (fs.statSync(dest).size / 1024).toFixed(0);
        console.log(`${size} KB`);
        file.close(resolve);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

main().catch((err) => {
  console.error('\n❌ Lỗi:', err.message);
  process.exit(1);
});
