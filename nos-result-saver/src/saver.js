// リザルトページを1つのHTMLファイルとして保存する本体。
// ブックマークレットとして実行されても、ユーザースクリプトから呼ばれても動く。
(function () {
  'use strict';
  if (window.__NOS_SAVER__) { window.__NOS_SAVER__.show(); return; }

  var SHIM = '/*__SHIM__*/';
  var MAX_RES = 800;
  var MAX_BYTES = 200 * 1024 * 1024;

  // ---------- 小物 ----------
  function abToB64(ab) {
    var u8 = new Uint8Array(ab), s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function textToB64(t) { return abToB64(new TextEncoder().encode(t).buffer); }
  function b64ToText(b) {
    var bin = atob(b), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(u8);
  }
  function abs(u, base) { try { var x = new URL(u, base || document.baseURI); x.hash = ''; return x.href; } catch (_) { return null; } }
  function isHttp(u) { return /^https?:/i.test(u || ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d, sep) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + (sep || ' ') + pad(d.getHours()) + (sep ? '' : ':') + pad(d.getMinutes()); }
  function dataUri(e) { return 'data:' + (e.t || 'application/octet-stream') + ';base64,' + e.b; }
  function guessType(url, t) {
    t = (t || '').split(';')[0].trim();
    if (t && t !== 'application/octet-stream') return t;
    var m = /\.([a-z0-9]+)(?:$|[?#])/i.exec(url || ''), ext = m ? m[1].toLowerCase() : '';
    return ({ js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
      woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', html: 'text/html', txt: 'text/plain',
      mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' })[ext] || t || 'application/octet-stream';
  }
  function isText(t) { return /^text\/|json|javascript|xml|svg/.test(t || ''); }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 60000);
  }
  function fileName(kind) {
    var title = (document.title || 'result').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    return 'NoS_' + title + '_' + stamp(new Date(), '_') + (kind ? '_' + kind : '') + '.html';
  }

  // ---------- リソース取得 ----------
  var store = new Map(); // "METHOD url" -> {u,m,s,t,b}
  var totalBytes = 0;
  function key(m, u) { return (m || 'GET').toUpperCase() + ' ' + u; }
  function getRes(u) { return u ? store.get(key('GET', u)) : null; }

  function importRecorded() {
    var R = window.__NOS_REC__;
    if (!R) return;
    R.entries.forEach(function (e) { if (e && e.b != null) store.set(key(e.m, abs(e.u)), e); });
  }

  async function fetchOne(u) {
    if (!isHttp(u) || store.has(key('GET', u))) return store.get(key('GET', u)) || null;
    if (store.size >= MAX_RES || totalBytes > MAX_BYTES) return null;
    try {
      var r = await withTimeout(fetch(u, { credentials: 'include', cache: 'force-cache' }), 20000);
      var ab = await r.arrayBuffer();
      totalBytes += ab.byteLength;
      var e = { u: u, m: 'GET', s: r.status, t: guessType(u, r.headers.get('content-type')), b: abToB64(ab) };
      store.set(key('GET', u), e);
      return e;
    } catch (err) {
      return null;
    }
  }

  // CSS 内の url() / @import を拾う
  function cssRefs(css, base) {
    var out = [], re = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g, m;
    while ((m = re.exec(css))) { var u = abs(m[2] || m[4], base); if (u) out.push(u); }
    return out;
  }
  // JS モジュール内の import 指定子を拾う
  var IMPORT_RE = /(\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*(?:[\w*{}\s,$]+\s*from)\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g;
  function jsRefs(js, base) {
    var out = [], m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(js))) {
      var s = m[3];
      if (/^(\.{0,2}\/|https?:)/.test(s)) { var u = abs(s, base); if (u) out.push(u); }
    }
    return out;
  }

  function domRefs(root, base) {
    var urls = [];
    function add(v) { var u = abs(v, base); if (u) urls.push(u); }
    root.querySelectorAll('link[href]').forEach(function (el) {
      if (/stylesheet|icon|preload|modulepreload|manifest/i.test(el.getAttribute('rel') || '')) add(el.getAttribute('href'));
    });
    root.querySelectorAll('script[src],img[src],source[src],video[src],audio[src],track[src],input[src],embed[src],iframe[src]').forEach(function (el) { add(el.getAttribute('src')); });
    root.querySelectorAll('video[poster]').forEach(function (el) { add(el.getAttribute('poster')); });
    root.querySelectorAll('object[data]').forEach(function (el) { add(el.getAttribute('data')); });
    root.querySelectorAll('img[srcset],source[srcset]').forEach(function (el) {
      el.getAttribute('srcset').split(',').forEach(function (p) { var s = p.trim().split(/\s+/)[0]; if (s) add(s); });
    });
    root.querySelectorAll('image,use').forEach(function (el) { var h = el.getAttribute('href') || el.getAttribute('xlink:href'); if (h && h[0] !== '#') add(h); });
    root.querySelectorAll('[style]').forEach(function (el) { urls.push.apply(urls, cssRefs(el.getAttribute('style'), base)); });
    root.querySelectorAll('style').forEach(function (el) { urls.push.apply(urls, cssRefs(el.textContent, base)); });
    root.querySelectorAll('script:not([src])').forEach(function (el) {
      if ((el.type || '') === 'module') urls.push.apply(urls, jsRefs(el.textContent, base));
      if ((el.type || '') === 'importmap') {
        try { var im = JSON.parse(el.textContent); Object.keys(im.imports || {}).forEach(function (k) { add(im.imports[k]); }); } catch (_) {}
      }
    });
    return urls;
  }

  async function crawl(seed, progress) {
    var queue = seed.slice(), seen = new Set(), done = 0;
    store.forEach(function (e) { if (isText(e.t)) queue.push.apply(queue, refsOf(e)); });
    async function worker() {
      while (queue.length) {
        var u = queue.shift();
        if (!u || seen.has(u) || !isHttp(u)) continue;
        seen.add(u);
        var e = await fetchOne(u);
        done++;
        progress('ファイル取得中… ' + done + '件');
        if (e) queue.push.apply(queue, refsOf(e));
      }
    }
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  }
  function refsOf(e) {
    if (/css/.test(e.t)) return cssRefs(b64ToText(e.b), e.u);
    if (/javascript/.test(e.t)) return jsRefs(b64ToText(e.b), e.u);
    return [];
  }

  // ---------- 書き換え ----------
  var cssMemo = new Map();
  function rewriteCss(css, base, depth) {
    depth = depth || 0;
    css = css.replace(/@import\s+(['"])([^'"]+)\1/g, function (all, q, u) { return '@import url(' + JSON.stringify(cssDataUrl(abs(u, base), depth)) + ')'; });
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (all, q, u) {
      if (/^(data|blob):/i.test(u) || u[0] === '#') return all;
      var a = abs(u, base), e = getRes(a);
      if (!e) return all;
      if (/css/.test(e.t)) return 'url(' + JSON.stringify(cssDataUrl(a, depth)) + ')';
      return 'url(' + JSON.stringify(dataUri(e)) + ')';
    });
  }
  function cssDataUrl(u, depth) {
    var e = getRes(u);
    if (!e || depth > 8) return u;
    if (!cssMemo.has(u)) cssMemo.set(u, 'data:text/css;base64,' + textToB64(rewriteCss(b64ToText(e.b), u, depth + 1)));
    return cssMemo.get(u);
  }

  // ES モジュールは data: URL にすると相対 import が解決できないので、
  // 指定子を絶対URLへ書き換え、import map で data: URL に対応付ける。
  var modMemo = new Map();
  function moduleUrl(u, imap) {
    var e = getRes(u);
    if (!e) return null;
    if (modMemo.has(u)) return modMemo.get(u);
    modMemo.set(u, u); // 循環 import 対策の仮置き
    var js = b64ToText(e.b).replace(IMPORT_RE, function (all, pre, q, s) {
      if (!/^(\.{0,2}\/|https?:)/.test(s)) return all;
      var a = abs(s, u);
      if (a && getRes(a)) { moduleUrl(a, imap); return pre + q + a + q; }
      return all;
    });
    var d = 'data:text/javascript;base64,' + textToB64(js);
    imap[u] = d;
    modMemo.set(u, d);
    return d;
  }

  function buildInteractive(html, pageUrl) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var base = pageUrl;
    var b0 = doc.querySelector('base[href]');
    if (b0) base = abs(b0.getAttribute('href'), pageUrl) || pageUrl;
    doc.querySelectorAll('base, meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="refresh" i]').forEach(function (el) { el.remove(); });

    function swap(el, attr) {
      var v = el.getAttribute(attr);
      if (!v || /^(data|blob|javascript):/i.test(v) || v[0] === '#') return;
      var e = getRes(abs(v, base));
      if (e) el.setAttribute(attr, dataUri(e));
    }
    doc.querySelectorAll('link[href]').forEach(function (el) {
      var rel = (el.getAttribute('rel') || '').toLowerCase();
      var u = abs(el.getAttribute('href'), base);
      if (/stylesheet/.test(rel)) {
        var e = getRes(u);
        if (!e) return;
        var st = doc.createElement('style');
        if (el.media) st.setAttribute('media', el.getAttribute('media'));
        st.textContent = rewriteCss(b64ToText(e.b), u);
        el.replaceWith(st);
      } else if (/preload|modulepreload|prefetch|manifest/.test(rel)) {
        el.remove();
      } else swap(el, 'href');
    });
    doc.querySelectorAll('style').forEach(function (el) { el.textContent = rewriteCss(el.textContent, base); });
    doc.querySelectorAll('[style]').forEach(function (el) { el.setAttribute('style', rewriteCss(el.getAttribute('style'), base)); });
    doc.querySelectorAll('img[src],source[src],video[src],audio[src],track[src],input[src],embed[src]').forEach(function (el) { swap(el, 'src'); });
    doc.querySelectorAll('video[poster]').forEach(function (el) { swap(el, 'poster'); });
    doc.querySelectorAll('object[data]').forEach(function (el) { swap(el, 'data'); });
    doc.querySelectorAll('image,use').forEach(function (el) { swap(el, 'href'); swap(el, 'xlink:href'); });
    doc.querySelectorAll('img[srcset],source[srcset]').forEach(function (el) {
      el.setAttribute('srcset', el.getAttribute('srcset').split(',').map(function (p) {
        var parts = p.trim().split(/\s+/), e = getRes(abs(parts[0], base));
        if (e) parts[0] = dataUri(e);
        return parts.join(' ');
      }).join(', '));
    });

    // スクリプト
    var imap = {};
    var existingMap = null;
    doc.querySelectorAll('script[type="importmap"]').forEach(function (el) {
      try { existingMap = JSON.parse(el.textContent); } catch (_) {}
      el.remove();
    });
    if (existingMap && existingMap.imports) {
      Object.keys(existingMap.imports).forEach(function (k) {
        var target = abs(existingMap.imports[k], base);
        var d = target && moduleUrl(target, imap);
        imap[k] = d || existingMap.imports[k];
      });
    }
    doc.querySelectorAll('script').forEach(function (el) {
      var type = (el.getAttribute('type') || '').toLowerCase();
      var src = el.getAttribute('src');
      if (type === 'module') {
        if (src) {
          var u = abs(src, base);
          if (moduleUrl(u, imap)) {
            el.removeAttribute('src');
            el.textContent = 'import ' + JSON.stringify(u) + ';';
          }
        } else {
          jsRefs(el.textContent, base).forEach(function (u) { moduleUrl(u, imap); });
        }
      } else if (src && (!type || /javascript|ecmascript/.test(type))) {
        var e = getRes(abs(src, base));
        if (e) el.setAttribute('src', 'data:text/javascript;base64,' + e.b);
        el.removeAttribute('integrity');
      }
    });

    // 先頭に <base> / 保存データ / シム / import map を差し込む
    var head = doc.head;
    doc.querySelectorAll('meta[charset], meta[http-equiv="Content-Type" i]').forEach(function (el) { el.remove(); });
    var first = head.firstChild;
    function ins(node) { head.insertBefore(node, first); }
    var charset = doc.createElement('meta'); charset.setAttribute('charset', 'utf-8');
    ins(charset);
    var baseEl = doc.createElement('base'); baseEl.setAttribute('href', base); ins(baseEl);

    var res = {};
    store.forEach(function (e, k) { res[k] = { u: e.u, m: e.m, s: e.s, t: e.t, b: e.b }; });
    var R = window.__NOS_REC__;
    var payload = {
      savedAt: stamp(new Date()),
      source: pageUrl,
      res: res,
      ws: R && R.ws ? R.ws.map(function (w) { return { url: w.url, msgs: w.msgs.filter(function (m) { return m.d != null; }) }; }) : []
    };
    var data = doc.createElement('script');
    data.type = 'application/json';
    data.id = '__nos_saved_data__';
    data.textContent = JSON.stringify(payload).replace(/</g, '\\u003c');
    ins(data);
    var shim = doc.createElement('script'); shim.textContent = SHIM; ins(shim);
    if (Object.keys(imap).length) {
      var im = doc.createElement('script'); im.type = 'importmap';
      im.textContent = JSON.stringify({ imports: imap, scopes: existingMap && existingMap.scopes || undefined });
      ins(im);
    }
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  // ---------- 見たまま版（静的スナップショット） ----------
  async function buildStatic(progress) {
    importRecorded();
    var base = document.baseURI;
    // 先に現在の画像・CSSを取得
    var seed = domRefs(document, base);
    Array.prototype.forEach.call(document.styleSheets, function (s) { if (s.href) seed.push(abs(s.href)); });
    document.querySelectorAll('img').forEach(function (im) { if (im.currentSrc) seed.push(abs(im.currentSrc)); });
    await crawl(seed, progress);
    progress('ページを固めています…');

    var live = document.documentElement;
    var clone = live.cloneNode(true);
    // 要素の対応を、置き換えを行う前に確定しておく
    var liveImgs = live.querySelectorAll('img'), cloneImgs = Array.prototype.slice.call(clone.querySelectorAll('img'));
    // 状態の写し取り
    var liveCanvas = live.querySelectorAll('canvas'), cloneCanvas = clone.querySelectorAll('canvas');
    cloneCanvas.forEach(function (c, i) {
      var src = liveCanvas[i];
      try {
        var img = document.createElement('img');
        img.src = src.toDataURL('image/png');
        for (var j = 0; j < c.attributes.length; j++) {
          var a = c.attributes[j];
          if (a.name !== 'width' && a.name !== 'height') img.setAttribute(a.name, a.value);
        }
        var cs = getComputedStyle(src);
        img.style.width = cs.width; img.style.height = cs.height;
        if (cs.display === 'inline') img.style.display = 'inline-block';
        c.replaceWith(img);
      } catch (_) {}
    });
    var liveIn = live.querySelectorAll('input,textarea,select'), cloneIn = clone.querySelectorAll('input,textarea,select');
    cloneIn.forEach(function (el, i) {
      var s = liveIn[i];
      if (s.type === 'checkbox' || s.type === 'radio') { if (s.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }
      else if (el.tagName === 'SELECT') Array.prototype.forEach.call(el.options, function (o, k) { if (s.options[k] && s.options[k].selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      else if (el.tagName === 'TEXTAREA') el.textContent = s.value;
      else el.setAttribute('value', s.value);
    });
    var liveSc = live.querySelectorAll('*'), cloneSc = clone.querySelectorAll('*');
    cloneSc.forEach(function (el, i) {
      var s = liveSc[i];
      if (s && (s.scrollTop || s.scrollLeft)) el.setAttribute('data-nos-scroll', s.scrollLeft + ',' + s.scrollTop);
    });
    clone.querySelectorAll('#__nos_saver_host__').forEach(function (el) { el.remove(); });
    clone.querySelectorAll('script, link[rel~="preload"], link[rel~="modulepreload"], meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="refresh" i], base').forEach(function (el) { el.remove(); });
    // 動的に足された分も含めて CSS を全部まとめる
    clone.querySelectorAll('link[rel~="stylesheet"], style').forEach(function (el) { el.remove(); });
    var cssText = '';
    Array.prototype.forEach.call(document.styleSheets, function (s) {
      var text = null;
      try { text = Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (_) {}
      var sheetBase = s.href || base;
      if (text == null && s.href) { var e = getRes(abs(s.href)); if (e) text = b64ToText(e.b); }
      if (text == null) return;
      var media = s.media && s.media.mediaText;
      text = rewriteCss(text, sheetBase);
      cssText += media ? '@media ' + media + '{\n' + text + '\n}\n' : text + '\n';
    });
    if (document.adoptedStyleSheets) document.adoptedStyleSheets.forEach(function (s) {
      try { cssText += rewriteCss(Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join('\n'), base) + '\n'; } catch (_) {}
    });
    var head = clone.querySelector('head');
    var st = document.createElement('style'); st.textContent = cssText; head.appendChild(st);
    // 画像など
    function swap(el, attr, val) {
      var v = val || el.getAttribute(attr);
      if (!v || /^(data|javascript):/i.test(v) || v[0] === '#') return;
      var e = getRes(abs(v, base));
      if (e) el.setAttribute(attr, dataUri(e));
    }
    cloneImgs.forEach(function (el, i) {
      var s = liveImgs[i];
      var cur = s && s.currentSrc;
      if (cur && /^blob:/.test(cur) && s.complete && s.naturalWidth) {
        try {
          var c = document.createElement('canvas'); c.width = s.naturalWidth; c.height = s.naturalHeight;
          c.getContext('2d').drawImage(s, 0, 0); el.setAttribute('src', c.toDataURL()); el.removeAttribute('srcset'); return;
        } catch (_) {}
      }
      if (cur && !/^data:/.test(cur)) { swap(el, 'src', cur); el.removeAttribute('srcset'); }
    });
    clone.querySelectorAll('source[src],video[src],audio[src],input[src]').forEach(function (el) { swap(el, 'src'); });
    clone.querySelectorAll('video[poster]').forEach(function (el) { swap(el, 'poster'); });
    clone.querySelectorAll('image,use').forEach(function (el) { swap(el, 'href'); swap(el, 'xlink:href'); });
    clone.querySelectorAll('[style]').forEach(function (el) { el.setAttribute('style', rewriteCss(el.getAttribute('style'), base)); });
    clone.querySelectorAll('a[href]').forEach(function (el) { var a = abs(el.getAttribute('href')); if (a && el.getAttribute('href')[0] !== '#') el.setAttribute('href', a); });
    clone.querySelectorAll('[srcset]').forEach(function (el) { el.removeAttribute('srcset'); });
    var meta = document.createElement('meta'); meta.setAttribute('charset', 'utf-8'); head.insertBefore(meta, head.firstChild);
    var tail = document.createElement('script');
    tail.textContent = "document.querySelectorAll('[data-nos-scroll]').forEach(function(e){var p=e.getAttribute('data-nos-scroll').split(',');e.scrollLeft=+p[0];e.scrollTop=+p[1];});";
    clone.querySelector('body').appendChild(tail);
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  // ---------- 操作できる版 ----------
  async function saveInteractive(progress) {
    importRecorded();
    var pageUrl = abs(location.href);
    progress('ページを取得中…');
    var html = null;
    var R = window.__NOS_REC__;
    if (R && R.doc) html = R.doc;
    if (!html) {
      try {
        var r = await withTimeout(fetch(location.href, { credentials: 'include', cache: 'force-cache' }), 20000);
        if (r.ok) html = await r.text();
      } catch (_) {}
    }
    if (!html) throw new Error('ページのHTMLを取得できませんでした（サーバーから切断済み？）。「見たまま版」を試してください。');
    var seed = [];
    performance.getEntriesByType('resource').forEach(function (e) { seed.push(abs(e.name)); });
    seed.push.apply(seed, domRefs(new DOMParser().parseFromString(html, 'text/html'), pageUrl));
    seed.push.apply(seed, domRefs(document, document.baseURI));
    document.querySelectorAll('img').forEach(function (im) { if (im.currentSrc) seed.push(abs(im.currentSrc)); });
    await crawl(seed, progress);
    progress('ファイルにまとめています…');
    return buildInteractive(html, pageUrl);
  }

  // ---------- UI ----------
  var host = document.createElement('div');
  host.id = '__nos_saver_host__';
  host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  root.innerHTML =
    '<style>' +
    '.p{font:13px/1.5 "Segoe UI","Yu Gothic UI",Meiryo,sans-serif;background:#1d1f33;color:#eee;border:1px solid #5a5f9a;border-radius:8px;padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,.4);width:250px}' +
    '.t{font-weight:bold;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}' +
    '.x{cursor:pointer;background:none;border:none;color:#aaa;font-size:16px;padding:0 2px}' +
    'button.b{display:block;width:100%;margin:6px 0 0;padding:7px 8px;border-radius:5px;border:1px solid #7b81c9;background:#353a6b;color:#fff;cursor:pointer;font:inherit;text-align:left}' +
    'button.b:hover{background:#454b8a}button.b:disabled{opacity:.5;cursor:wait}' +
    '.d{font-size:11px;color:#bbb;display:block}.s{margin-top:8px;font-size:12px;color:#9fe0a8;min-height:1em;white-space:pre-wrap}.s.e{color:#ff9d9d}' +
    '</style>' +
    '<div class="p"><div class="t"><span>リザルト保存</span><button class="x" title="閉じる">×</button></div>' +
    '<button class="b" data-k="i">💾 保存（操作できる版）<span class="d">マップ再生・切替などもそのまま動く</span></button>' +
    '<button class="b" data-k="s">🖼 保存（見たまま版）<span class="d">今の画面をそのまま固めて保存</span></button>' +
    '<div class="s"></div></div>';
  var statusEl = root.querySelector('.s');
  function progress(msg, err) { statusEl.textContent = msg; statusEl.className = 's' + (err ? ' e' : ''); }
  var busy = false;
  root.querySelectorAll('button.b').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (busy) return;
      busy = true;
      root.querySelectorAll('button.b').forEach(function (b) { b.disabled = true; });
      try {
        var kind = btn.getAttribute('data-k');
        var html = kind === 'i' ? await saveInteractive(progress) : await buildStatic(progress);
        download(fileName(kind === 'i' ? '' : 'static'), html);
        progress('保存しました（' + (html.length / 1048576).toFixed(1) + 'MB）\nダウンロードフォルダを確認してください。');
      } catch (err) {
        progress('失敗しました: ' + (err && err.message || err), true);
      } finally {
        busy = false;
        root.querySelectorAll('button.b').forEach(function (b) { b.disabled = false; });
      }
    });
  });
  root.querySelector('.x').addEventListener('click', function () { host.style.display = 'none'; });

  window.__NOS_SAVER__ = { show: function () { host.style.display = ''; (document.body || document.documentElement).appendChild(host); } };
  window.__NOS_SAVER__.show();
})();
