import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(rootDir, 'data', 'wishes.sqlite');

if (!fs.existsSync(dbPath)) {
  console.log('\n[Hokora DB] File belum dibuat: data/wishes.sqlite (jalankan server atau kirim 1 wish terlebih dahulu).\n');
  process.exit(0);
}

const db = new DatabaseSync(dbPath, { open: true });
const rows = db
  .prepare(
    `SELECT
       id,
       wish_text,
       season,
       omikuji_rank,
       created_at
     FROM wishes
     ORDER BY id DESC`
  )
  .all();

console.log(`\n=== HOKORA WISH DATABASE (${rows.length} total) ===`);
console.log(`File: ${dbPath}\n`);

if (rows.length === 0) {
  console.log('(Belum ada permohonan yang masuk)\n');
} else {
  console.table(rows);
}
db.close();
