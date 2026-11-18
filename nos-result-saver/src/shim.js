// 保存したHTMLの先頭で実行される「再生用シム」。
// 保存時に記録した通信結果 (fetch / XHR / 画像 / WebSocket) を、
// ゲームのサーバーに繋がっていなくても返せるように差し替える。
(function () {
  'use strict';
  var holder = document.getElementById('__nos_saved_data__');
  if (!holder) return;
  var D = JSON.parse(holder.textContent);
  window.__NOS_SAVED__ = { savedAt: D.savedAt, source: D.source };

  var exact = {}, byPathSearch = {}, byPath = {};
  function strip(u) { var x = new URL(u); x.hash = ''; return x.href; }
  Object.keys(D.res).forEach(function (k) {
    var e = D.res[k];
    var m = (e.m || 'GET').toUpperCase();
    var u;
    try { u = new URL(e.u); } catch (_) { return; }
    u.hash = '';
    exact[m + ' ' + u.href] = e;
    if (m === 'GET') {
      if (!byPathSearch[u.pathname + u.search]) byPathSearch[u.pathname + u.search] = e;
      if (!byPath[u.pathname]) byPath[u.pathname] = e;
    } else {
      if (!exact['ANY ' + u.href]) exact['ANY ' + u.href] = e;
    }
  });

  function resolve(url) {
    try { return new URL(String(url), document.baseURI); } catch (_) { return null; }
  }
  function passthrough(url) { return /^(data|blob|about|javascript):/i.test(String(url)); }
  function find(method, url) {
    var u = resolve(url);
    if (!u) return null;
    u.hash = '';
    method = (method || 'GET').toUpperCase();
    return exact[method + ' ' + u.href] || exact['GET ' + u.href] || exact['ANY ' + u.href] ||
      byPathSearch[u.pathname + u.search] || (u.search ? null : byPath[u.pathname]) || null;
  }
  var cache = {};
  function bytes(e) {
    var bin = atob(e.b), n = bin.length, a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function dataUrl(e) {
    return 'data:' + (e.t || 'application/octet-stream') + ';base64,' + e.b;
  }
  function blobUrl(e) {
    var key = e.u + '|' + (e.m || 'GET');
    if (!cache[key]) cache[key] = URL.createObjectURL(new Blob([bytes(e)], { type: e.t || '' }));
    return cache[key];
  }
  window.__NOS_FIND__ = find;

  // ---- fetch ----
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = (typeof Request !== 'undefined' && input instanceof Request) ? input.url : String(input);
    if (passthrough(url)) return origFetch.apply(this, arguments);
    var method = (init && init.method) || (input && input.method) || 'GET';
    var e = find(method, url);
    if (!e) return Promise.resolve(new Response('', { status: 404, statusText: 'Not saved' }));
    var st = e.s >= 200 && e.s <= 599 && [204, 205, 304].indexOf(e.s) < 0 ? e.s : 200;
    return Promise.resolve(new Response(bytes(e), {
      status: st, headers: { 'Content-Type': e.t || 'application/octet-stream' }
    }));
  };

  // ---- XMLHttpRequest ----
  var XP = XMLHttpRequest.prototype, xOpen = XP.open;
  XP.open = function (method, url) {
    if (passthrough(url)) return xOpen.apply(this, arguments);
    var e = find(method, url);
    var args = Array.prototype.slice.call(arguments);
    args[0] = 'GET';
    if (e) {
      args[1] = blobUrl(e);
    } else {
      args[1] = 'data:text/plain,';
      Object.defineProperty(this, 'status', { configurable: true, get: function () { return 404; } });
    }
    return xOpen.apply(this, args);
  };

  // ---- 画像・音声など JS から後で設定される src ----
  function patchSrc(proto, prop) {
    var d = proto && Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) {
        if (v && !passthrough(v)) { var e = find('GET', v); if (e) v = blobUrl(e); }
        d.set.call(this, v);
      }
    });
  }
  patchSrc(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
  patchSrc(window.HTMLMediaElement && HTMLMediaElement.prototype, 'src');
  patchSrc(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src');
  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase();
    if ((n === 'src' || n === 'href' || n === 'xlink:href') && value && !passthrough(value) &&
        /^(img|image|source|video|audio|use)$/i.test(this.localName)) {
      var e = find('GET', value);
      if (e) value = blobUrl(e);
    }
    return setAttr.call(this, name, value);
  };

  // ---- WebSocket: 記録したメッセージを順に再生 ----
  var wsRecs = D.ws || [];
  function FakeWS(url) {
    var self = this;
    var u = resolve(url);
    this.url = String(url);
    this.readyState = 0;
    this.protocol = '';
    this.extensions = '';
    this.bufferedAmount = 0;
    this.binaryType = 'blob';
    this._l = {};
    var rec = null;
    for (var i = 0; i < wsRecs.length; i++) {
      var r = resolve(wsRecs[i].url);
      if (u && r && (r.href === u.href || r.pathname === u.pathname)) { rec = wsRecs[i]; if (!rec._used) break; }
    }
    setTimeout(function () {
      if (!rec) { self.readyState = 3; self._emit('error', new Event('error')); self._emit('close', new CloseEvent('close', { code: 1006 })); return; }
      rec._used = true;
      self.readyState = 1;
      self._emit('open', new Event('open'));
      var idx = 0;
      (function next() {
        if (self.readyState !== 1 || idx >= rec.msgs.length) return;
        var m = rec.msgs[idx++];
        var data = m.bin ? bytes({ b: m.d }) : m.d;
        if (m.bin) data = self.binaryType === 'arraybuffer' ? data.buffer : new Blob([data]);
        self._emit('message', new MessageEvent('message', { data: data }));
        setTimeout(next, 0);
      })();
    }, 0);
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  FakeWS.prototype.CONNECTING = 0; FakeWS.prototype.OPEN = 1; FakeWS.prototype.CLOSING = 2; FakeWS.prototype.CLOSED = 3;
  FakeWS.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  FakeWS.prototype.removeEventListener = function (t, f) { var a = this._l[t] || []; var i = a.indexOf(f); if (i >= 0) a.splice(i, 1); };
  FakeWS.prototype.dispatchEvent = function (ev) { this._emit(ev.type, ev); return true; };
  FakeWS.prototype._emit = function (t, ev) {
    try { Object.defineProperty(ev, 'target', { value: this }); } catch (_) {}
    var h = this['on' + t]; if (typeof h === 'function') h.call(this, ev);
    (this._l[t] || []).slice().forEach(function (f) { typeof f === 'function' ? f.call(this, ev) : f.handleEvent(ev); }, this);
  };
  FakeWS.prototype.send = function () {};
  FakeWS.prototype.close = function () {
    if (this.readyState >= 2) return;
    this.readyState = 3; this._emit('close', new CloseEvent('close', { code: 1000, wasClean: true }));
  };
  window.WebSocket = FakeWS;

  // ---- 保存版であることを示す小さなバッジ ----
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.textContent = '保存版 ' + D.savedAt + '  ×';
    b.title = 'Nebula on the Ship のリザルトを保存したファイルです（クリックで非表示）';
    b.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;font:12px/1.6 sans-serif;' +
      'background:rgba(20,20,40,.8);color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;user-select:none';
    b.onclick = function () { b.remove(); };
    document.body.appendChild(b);
  });
})();
