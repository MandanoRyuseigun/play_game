// 戦歴ビューアに保存ファイルを読み込ませ、オフラインで表示できるか確認する
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out');
(async () => {
  const files = [path.join(__dirname, '..', 'sample', 'sample-match.html'),
    path.join(out, 'bookmarklet-interactive.html'), path.join(out, 'bookmarklet-static.html')];
  for (const f of files) if (!fs.existsSync(f)) throw new Error('先に run-test.js を実行してください: ' + f);
  const b = await chromium.launch();
  const ctx = await b.newContext({ offline: true, viewport: { width: 1280, height: 760 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const url = 'file://' + path.join(__dirname, '..', 'dist', 'nos-viewer.html');
  await p.goto(url);
  await p.screenshot({ path: path.join(out, 'viewer-empty.png') });
  await p.setInputFiles('#fileIn', files);
  await p.waitForSelector('.item');
  const n = await p.locator('.item').count();
  if (n !== 3) throw new Error('items ' + n);
  await p.click('.item:has-text("NoS 戦歴") >> nth=0');
  // 操作できる版と見たまま版のどちらかが表示される。両方確認する
  for (const i of [0, 1]) {
    await p.locator('.item:has-text("NoS 戦歴")').nth(i).click();
    await p.waitForTimeout(800);
    const t = await p.frameLocator('#frame').locator('#title').textContent();
    const pl = await p.frameLocator('#frame').locator('#players').textContent();
    console.log('saved', i, t, pl);
    if (t !== '第3試合 Skeld' || pl !== 'Red,Blue,Lime') throw new Error('frame content');
  }
  await p.click('.item:has-text("サンプル")');
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(out, 'viewer.png') });
  // 再読み込みしても一覧が残るか
  await p.reload(); await p.waitForSelector('.item');
  console.log('after reload items:', await p.locator('.item').count());
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 800 });
  await m.goto(url); await m.waitForSelector('.item'); await m.waitForTimeout(500);
  await m.screenshot({ path: path.join(out, 'viewer-mobile.png') });
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
  console.log('VIEWER OK');
})().catch(e => { console.error(e); process.exit(1); });
