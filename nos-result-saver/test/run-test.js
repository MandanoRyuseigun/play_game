// 模擬リザルトサーバーで保存→サーバー停止→保存ファイルを開いて動くかを確認する
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const start = require('./mock-server');
const dist = path.join(__dirname, '..', 'dist');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

async function checkPage(page, label) {
  const r = await page.evaluate(() => {
    const c = document.getElementById('map');
    const px = (x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)).join(',');
    return { title: document.getElementById('title').textContent, h1: getComputedStyle(document.getElementById('title')).color,
      bg: getComputedStyle(document.querySelector('.bg')).backgroundImage.slice(0, 20), pos: document.getElementById('pos').textContent,
      players: document.getElementById('players').textContent, mapPx: px(100, 100), markerPx: px(12, 12), app: !!window.APP_LOADED };
  });
  await page.fill('#slider', '2'); await page.dispatchEvent('#slider', 'input');
  r.posAfter = await page.textContent('#pos');
  console.log(label, JSON.stringify(r));
  const ok = r.title === '第3試合 Skeld' && r.h1 === 'rgb(1, 2, 3)' && r.bg.startsWith('url("') && r.pos === 'Red@10,10' &&
    r.players === 'Red,Blue,Lime' && r.mapPx === '30,120,60' && r.markerPx === '255,255,0' && r.app && r.posAfter === 'Red@150,90';
  if (!ok) throw new Error(label + ' FAILED');
}

async function run(mode) {
  const server = await start(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  if (mode === 'userscript') {
    const us = fs.readFileSync(path.join(dist, 'nos-result-saver.user.js'), 'utf8');
    await page.addInitScript(us);
  }
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.MAP_OK && document.getElementById('players').textContent);
  await checkPage(page, mode + ' live');
  if (mode === 'bookmarklet') {
    const bm = fs.readFileSync(path.join(dist, 'bookmarklet.txt'), 'utf8').trim();
    await page.evaluate(decodeURIComponent(bm.slice('javascript:'.length)));
  }
  const saved = {};
  for (const [k, label] of [['i', 'interactive'], ['s', 'static']]) {
    const dl = page.waitForEvent('download');
    await page.locator(`#__nos_saver_host__ >> button[data-k="${k}"]`).click();
    const d = await dl;
    saved[label] = path.join(outDir, `${mode}-${label}.html`);
    await d.saveAs(saved[label]);
  }
  server.close(); server.closeAllConnections();
  // 保存版を開く（サーバー停止済み・ネットワーク遮断）
  const ctx2 = await browser.newContext({ offline: true });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  p2.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p2.goto('file://' + saved.interactive);
  await p2.waitForFunction(() => window.MAP_OK && document.getElementById('players').textContent, null, { timeout: 10000 });
  await checkPage(p2, mode + ' saved-interactive');
  const p3 = await ctx2.newPage();
  await p3.goto('file://' + saved.static);
  const st = await p3.evaluate(() => ({ title: document.getElementById('title').textContent, img: !!document.querySelector('img#map'), pos: document.getElementById('pos').textContent, slider: document.getElementById('slider').value }));
  console.log(mode, 'saved-static', JSON.stringify(st));
  if (st.title !== '第3試合 Skeld' || !st.img || st.pos !== 'Red@150,90' || st.slider !== '2') throw new Error('static FAILED');
  await p3.screenshot({ path: path.join(outDir, mode + '-static.png') });
  if (errors.length) console.log('page errors:', errors);
  await browser.close();
}
(async () => { await run('bookmarklet'); await run('userscript'); console.log('ALL OK'); })().catch(e => { console.error(e); process.exit(1); });
