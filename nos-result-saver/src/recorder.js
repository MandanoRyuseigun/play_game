// ユーザースクリプト版のみ: ページ読み込み直後から通信内容を記録しておく。
// (ブックマークレット版は押した時点で取り直すため、これが無くても動く)
(function () {
  'use strict';
  if (window.__NOS_REC__) return;
  var R = window.__NOS_REC__ = { entries: new Map(), ws: [], doc: null };
  function abToB64(ab) {
    var u8 = new Uint8Array(ab), s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function abs(u) { try { var x = new URL(u, document.baseURI); x.hash = ''; return x.href; } catch (_) { return String(u); } }
  function put(m, u, s, t, ab) {
    m = (m || 'GET').toUpperCase();
    R.entries.set(m + ' ' + abs(u), { u: abs(u), m: m, s: s, t: t || '', b: abToB64(ab) });
  }

  var origFetch = window.fetch;
  try {
    origFetch(location.href, { credentials: 'include' }).then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) { if (t) R.doc = t; }).catch(function () {});
  } catch (_) {}

  window.fetch = function (input, init) {
    var url = (input && input.url) || String(input);
    var method = (init && init.method) || (input && input.method) || 'GET';
    var p = origFetch.apply(this, arguments);
    p.then(function (res) {
      if (res.type === 'opaque') return;
      res.clone().arrayBuffer().then(function (ab) {
        put(method, url, res.status, res.headers.get('content-type'), ab);
        if (res.url && abs(res.url) !== abs(url)) put(method, res.url, res.status, res.headers.get('content-type'), ab);
      }).catch(function () {});
    }).catch(function () {});
    return p;
  };

  var XP = XMLHttpRequest.prototype, xOpen = XP.open, xSend = XP.send;
  XP.open = function (m, u) { this.__nosReq = { m: m, u: String(u) }; return xOpen.apply(this, arguments); };
  XP.send = function () {
    var x = this;
    x.addEventListener('loadend', function () {
      var q = x.__nosReq;
      if (!q || !x.status) return;
      var t = x.getResponseHeader('content-type');
      try {
        var rt = x.responseType;
        if (rt === '' || rt === 'text') put(q.m, q.u, x.status, t, new TextEncoder().encode(x.responseText).buffer);
        else if (rt === 'arraybuffer') put(q.m, q.u, x.status, t, x.response);
        else if (rt === 'json') put(q.m, q.u, x.status, t || 'application/json', new TextEncoder().encode(JSON.stringify(x.response)).buffer);
        else if (rt === 'blob') x.response.arrayBuffer().then(function (ab) { put(q.m, q.u, x.status, t || x.response.type, ab); });
      } catch (_) {}
    });
    return xSend.apply(this, arguments);
  };

  var OrigWS = window.WebSocket;
  if (OrigWS) {
    var Rec = function (url, protocols) {
      var ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
      var rec = { url: abs(url), msgs: [] };
      R.ws.push(rec);
      ws.addEventListener('message', function (ev) {
        var slot = { d: null, bin: false };
        rec.msgs.push(slot);
        var d = ev.data;
        if (typeof d === 'string') slot.d = d;
        else if (d instanceof ArrayBuffer) { slot.bin = true; slot.d = abToB64(d); }
        else if (d && d.arrayBuffer) { slot.bin = true; d.arrayBuffer().then(function (ab) { slot.d = abToB64(ab); }); }
      });
      return ws;
    };
    Rec.prototype = OrigWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Rec[k] = OrigWS[k]; });
    window.WebSocket = Rec;
  }
})();
