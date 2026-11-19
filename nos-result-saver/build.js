// node build.js  →  dist/ にブックマークレット・ユーザースクリプト・導入ページを生成する
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const VERSION = require('./package.json').version;

(async () => {
  const shim = (await minify(src('shim.js'))).code;
  // シムは保存ファイルの <script> に入るので "</script" を含めない
  const shimSafe = shim.replace(/<\/script/gi, '<\\/script');
  const saverSrc = src('saver.js').replace("'/*__SHIM__*/'", () => JSON.stringify(shimSafe));
  const saver = (await minify(saverSrc)).code;
  const recorder = (await minify(src('recorder.js'))).code;

  const out = path.join(__dirname, 'dist');
  fs.mkdirSync(out, { recursive: true });

  const bookmarklet = 'javascript:' + encodeURIComponent('void ' + saver.replace(/;$/, ''));
  fs.writeFileSync(path.join(out, 'bookmarklet.txt'), bookmarklet + '\n');

  const userscript = `// ==UserScript==
// @name         NoS リザルト保存
// @namespace    nos-result-saver
// @version      ${VERSION}
// @description  Nebula on the Ship のブラウザ版リザルト(戦歴)を、サーバー退出後も見られる1つのHTMLファイルとして保存します
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @include      /^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?\\/.*$/
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==
${recorder}
(function () {
  function boot() { ${saver} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
`;
  fs.writeFileSync(path.join(out, 'nos-result-saver.user.js'), userscript);

  const tpl = fs.readFileSync(path.join(__dirname, 'install.template.html'), 'utf8');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  fs.writeFileSync(path.join(out, 'install.html'),
    tpl.replace(/__BOOKMARKLET_ATTR__/g, () => esc(bookmarklet)).replace(/__VERSION__/g, VERSION));

  fs.copyFileSync(path.join(__dirname, 'viewer.html'), path.join(out, 'nos-viewer.html'));

  console.log('bookmarklet:', bookmarklet.length, 'chars');
  console.log('built ->', out);
})();
