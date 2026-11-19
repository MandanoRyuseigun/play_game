// docs/matches/ にある保存済みリザルト(.html)から一覧 docs/matches/matches.json を作り直す。
// 使い方: node tools/update-matches.js
// matches.json に手で書いた title / note は、ファイルが残っている限り引き継ぐ。
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'docs', 'matches');
const listPath = path.join(dir, 'matches.json');

let old = [];
try { old = JSON.parse(fs.readFileSync(listPath, 'utf8')).matches || []; } catch (_) {}
const oldByFile = new Map(old.map((m) => [m.file, m]));

function readHead(file, bytes) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(bytes);
  const n = fs.readSync(fd, buf, 0, bytes, 0);
  fs.closeSync(fd);
  return buf.slice(0, n).toString('utf8');
}

function dateFrom(name, head, stat) {
  // 保存ツールが埋め込む保存日時
  let m = /"savedAt":"(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})"/.exec(head);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  // ファイル名 NoS_..._YYYY-MM-DD_HHMM
  m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(name);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  const d = stat.mtime;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function titleFrom(head) {
  // 保存データ(巨大)を飛ばして <title> を探す
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(head);
  return m ? m[1].trim() : '';
}

const files = fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f)).sort();
const matches = files.map((file) => {
  const full = path.join(dir, file);
  const stat = fs.statSync(full);
  const head = readHead(full, 2 * 1024 * 1024);
  const prev = oldByFile.get(file) || {};
  return {
    file,
    title: prev.title || titleFrom(head) || file.replace(/\.html?$/i, ''),
    date: prev.date || dateFrom(file, head, stat),
    note: prev.note || '',
    size: stat.size,
    ...(prev.sample ? { sample: true } : {}),
  };
});
matches.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.file.localeCompare(b.file)));

const next = JSON.stringify({ matches }, null, 2) + '\n';
let cur = '';
try { cur = fs.readFileSync(listPath, 'utf8'); } catch (_) {}
if (cur !== next) {
  fs.writeFileSync(listPath, next);
  console.log(`matches.json を更新しました (${matches.length}件)`);
} else {
  console.log(`変更なし (${matches.length}件)`);
}
