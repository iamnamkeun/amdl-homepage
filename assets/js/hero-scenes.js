/* AM&D Lab — 히어로 배경 연구 장면 엔진 (교차 페이드 순환)
   <canvas id="hero-canvas" data-scenes="cochlea,wildfire,..."> 의 목록대로 순환. 장면 1개면 고정.
   장면: wildfire(실제 영상) cochlea(달팽이관 진행파) shoulder(어깨 외전+FE) skull(두개골 tVAS) exoboot(발목 엑소부츠 보행)
         vestibular(전정계·멀미) photos(랩 사진 크로스페이드) papers(논문 카드) mosaic(갤러리 모자이크)
   - prefers-reduced-motion: 정지 프레임 / 탭 숨김 시 일시정지 / 모바일 해상도·격자 절감 / ?scene=N 으로 검토 */
(function () {
  'use strict';
  var canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  var video = document.getElementById('hero-video');
  var capEl = document.getElementById('hero-scene-name');
  var capWrap = document.getElementById('hero-scene-cap');

  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = window.matchMedia('(max-width: 760px)').matches;
  var DUR = 12, FADE = 2.0;
  var W = 0, H = 0, HV = 0, DPR = 1, ready = false; // HV: 실제 보이는 높이
  var FW = 0, WX = 0, COMPACT = false;               // 낮은 히어로(서브페이지)는 장면을 오른쪽 영역에 배치: W=유효 폭, WX=x 오프셋

  /* ---------------- 공용 ---------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function amber(a) { return 'rgba(232,184,32,' + a + ')'; }
  function white(a) { return 'rgba(255,255,255,' + a + ')'; }
  function crest(h, a) { return 'rgba(' + Math.round(232 + 23 * h) + ',' + Math.round(184 + 60 * h) + ',' + Math.round(32 + 170 * h * h) + ',' + a + ')'; }
  function heat(s, a) { s = clamp01(s); return 'hsla(' + (228 - 228 * s) + ',85%,' + (50 + 14 * s) + '%,' + a + ')'; }
  function L(ko, en) { return document.documentElement.lang === 'en' ? en : ko; }
  function label(txt, x, y, align, a) {
    ctx.fillStyle = white(a || 0.62); ctx.font = '500 ' + (MOBILE ? 11 : 12.5) + 'px Paperlogy, sans-serif'; ctx.textAlign = align || 'center'; ctx.fillText(txt, x, y);
  }
  function tick(x0, y0, x1, y1, a) { ctx.strokeStyle = white(a || 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function resample(pts, n) { // 닫힌 Catmull-Rom 스플라인 등간격 샘플
    var out = [], m = pts.length;
    for (var i = 0; i < n; i++) {
      var f = i / n * m, k = Math.floor(f), t = f - k, p0 = pts[(k - 1 + m) % m], p1 = pts[k % m], p2 = pts[(k + 1) % m], p3 = pts[(k + 2) % m], t2 = t * t, t3 = t2 * t;
      out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
    return out;
  }
  function tracePath(pts, close) { ctx.beginPath(); for (var i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); } if (close) ctx.closePath(); }
  function capsule(x0, y0, x1, y1, w, fill, stroke) { ctx.lineCap = 'round'; ctx.lineWidth = w; ctx.strokeStyle = fill; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); if (stroke) { ctx.lineWidth = w + 2; ctx.strokeStyle = stroke; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = fill; ctx.stroke(); } ctx.lineCap = 'butt'; }
  function loadImages(list) { return list.map(function (src) { var im = new Image(); im.decoding = 'async'; im.src = src; return im; }); }
  function drawCover(im, x, y, w, h, zoom, px, py) { // 이미지를 영역에 cover로 그리기(zoom, 패닝 0..1)
    if (!im.complete || !im.naturalWidth) return false;
    var s = Math.max(w / im.naturalWidth, h / im.naturalHeight) * zoom, dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.drawImage(im, x - (dw - w) * px, y - (dh - h) * py, dw, dh); return true;
  }
  function imgList(attr) { var v = canvas.getAttribute(attr); return v ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : []; }

  /* ================= wildfire: 실제 산불 영상 ================= */
  var wildfire = {
    type: 'video', el: video,
    ko: '산불 · 확산 예측 및 시설물 취약성 연구', en: 'Wildfire · spread prediction & facility vulnerability',
    init: function () {},
    show: function (alpha) {
      if (!this.el) return;
      this.el.style.opacity = alpha;
      if (alpha > 0.01) { if (this.el.paused && !REDUCE) { var p = this.el.play(); if (p && p.catch) p.catch(function () {}); } }
      else if (!this.el.paused) this.el.pause();
    },
    draw: function () {}
  };

  /* ================= cochlea: 내이 — 나선형 달팽이관 속 기저막 진행파 ================= */
  var cochlea = {
    ko: '달팽이관 기저막 진행파 · 골전도 청각 연구', en: 'Basilar-membrane traveling wave · bone-conduction hearing',
    init: function () {
      var S = Math.min(W, HV);
      this.N = MOBILE ? 220 : 400; this.turns = 2.5; this.tilt = 0.6;
      this.c = MOBILE ? { x: W * 0.52, y: HV * 0.60 } : { x: W * 0.60, y: HV * 0.58 };
      this.r0 = S * (MOBILE ? 0.36 : 0.30); this.amp = S * (MOBILE ? 0.07 : 0.06);
      var th0 = Math.PI * 1.02;
      this.seg = []; this.order = [];
      for (var i = 0; i <= this.N; i++) {
        var u = i / this.N, th = th0 + u * this.turns * 2 * Math.PI, r = this.r0 * (1 - 0.80 * u), w = this.r0 * (0.21 - 0.11 * u), cs = Math.cos(th), sn = Math.sin(th);
        this.seg.push({ u: u, cx: this.c.x + r * cs, cy: this.c.y + r * sn * this.tilt,
          ix: this.c.x + (r - w / 2) * cs, iy: this.c.y + (r - w / 2) * sn * this.tilt, ox: this.c.x + (r + w / 2) * cs, oy: this.c.y + (r + w / 2) * sn * this.tilt,
          depth: r * sn, tx: -sn, ty: cs * this.tilt });
      }
      for (var k = 0; k < this.N; k++) this.order.push(k);
      var sg = this.seg; this.order.sort(function (a, b) { return sg[a].depth - sg[b].depth; });
      var b = this.seg[0], vx = b.cx + S * 0.05, vy = b.cy - S * 0.10;
      this.vest = { x: vx, y: vy, r: S * 0.028 };
      this.canals = [{ x: vx + S * 0.03, y: vy - S * 0.12, rx: S * 0.07, ry: S * 0.115, rot: -0.35 }, { x: vx + S * 0.12, y: vy - S * 0.085, rx: S * 0.065, ry: S * 0.10, rot: 0.6 }, { x: vx + S * 0.09, y: vy + S * 0.005, rx: S * 0.095, ry: S * 0.042, rot: 0.15 }];
    },
    wave: function (u, t, up) {
      var env = u <= up ? Math.exp(-Math.pow((u - up) / 0.24, 2)) : Math.exp(-Math.pow((u - up) / 0.06, 2));
      return env * Math.sin(2 * Math.PI * (u * 3 + u * u * 11) - t * 7);
    },
    draw: function (dt, t) {
      var up = 0.16 + 0.66 * (0.5 + 0.5 * Math.sin(t * 0.28)), sg = this.seg, N = this.N, amp = this.amp, S = Math.min(W, HV);
      for (var q = 0; q < 3; q++) { var cn = this.canals[q]; ctx.beginPath(); ctx.ellipse(cn.x, cn.y, cn.rx, cn.ry, cn.rot, 0, Math.PI * 2); ctx.lineWidth = 7; ctx.strokeStyle = white(0.10); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.55); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(this.vest.x, this.vest.y, this.vest.r * 1.4, this.vest.r, 0.2, 0, Math.PI * 2); ctx.fillStyle = white(0.10); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.5); ctx.stroke();
      ctx.beginPath();
      for (var i = 0; i <= N; i++) { var s0 = sg[i]; if (i === 0) ctx.moveTo(s0.ox, s0.oy); else ctx.lineTo(s0.ox, s0.oy); }
      for (var j = N; j >= 0; j--) ctx.lineTo(sg[j].ix, sg[j].iy);
      ctx.closePath(); ctx.fillStyle = white(0.06); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = white(0.35); ctx.stroke();
      var hw = amp * 0.55;
      ctx.beginPath(); for (i = 0; i <= N; i++) { if (i === 0) ctx.moveTo(sg[i].ox, sg[i].oy - hw); else ctx.lineTo(sg[i].ox, sg[i].oy - hw); } ctx.lineWidth = 1; ctx.strokeStyle = white(0.22); ctx.stroke();
      for (i = 0; i <= N; i += Math.round(N / 40)) tick(sg[i].ox, sg[i].oy, sg[i].ox, sg[i].oy - hw, 0.18);
      var h = new Array(N + 1);
      for (i = 0; i <= N; i++) h[i] = this.wave(sg[i].u, t, up);
      for (var o = 0; o < N; o++) {
        var k = this.order[o], a = sg[k], b = sg[k + 1], ha = h[k] * amp, hb = h[k + 1] * amp, hm = (h[k] + h[k + 1]) / 2;
        ctx.beginPath(); ctx.moveTo(a.ix, a.iy - ha); ctx.lineTo(a.ox, a.oy - ha); ctx.lineTo(b.ox, b.oy - hb); ctx.lineTo(b.ix, b.iy - hb); ctx.closePath();
        ctx.fillStyle = hm > 0 ? crest(hm, 0.45 + 0.5 * hm) : 'rgba(160,120,40,' + (0.32 + 0.2 * hm) + ')';
        ctx.fill(); ctx.strokeStyle = hm > 0.2 ? white(0.25 + 0.6 * hm) : amber(0.45); ctx.lineWidth = 0.8; ctx.stroke();
      }
      var pk = sg[Math.round(up * N)];
      var g = ctx.createRadialGradient(pk.cx, pk.cy, 0, pk.cx, pk.cy, S * 0.20);
      g.addColorStop(0, amber(0.32)); g.addColorStop(0.5, amber(0.10)); g.addColorStop(1, amber(0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var b0 = sg[0], push = Math.sin(t * 7) * 3.5, fx = b0.cx - b0.tx * push, fy = b0.cy - b0.ty * push, nx = -b0.ty, ny = b0.tx, fw = Math.hypot(b0.ox - b0.ix, b0.oy - b0.iy) / 2;
      ctx.lineWidth = 3; ctx.strokeStyle = white(0.85); ctx.beginPath(); ctx.moveTo(fx - nx * fw, fy - ny * fw); ctx.lineTo(fx + nx * fw, fy + ny * fw); ctx.stroke();
      var hx = fx - b0.tx * 30, hy = fy - b0.ty * 30;
      ctx.lineWidth = 2; ctx.strokeStyle = white(0.6); ctx.beginPath(); ctx.moveTo(fx - nx * fw * 0.8, fy - ny * fw * 0.8); ctx.lineTo(hx, hy); ctx.lineTo(fx + nx * fw * 0.8, fy + ny * fw * 0.8); ctx.stroke();
      ctx.fillStyle = white(0.9); ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
      var per = 2 * Math.PI / 7, ph = (t % per) / per;
      for (var r = 0; r < 4; r++) { var rr = (ph + r / 4) % 1; ctx.beginPath(); ctx.arc(fx, fy, 10 + rr * 60, Math.PI * 0.72, Math.PI * 1.28); ctx.strokeStyle = white(0.5 * (1 - rr)); ctx.lineWidth = 1.2; ctx.stroke(); }
      label(L('음파', 'sound'), fx - 78, fy + 4, 'center', 0.5);
      label(L('등골 · 난원창', 'stapes · oval window'), hx - 6, hy - 14, 'right');
      label(L('반고리관 (평형)', 'semicircular canals'), this.canals[1].x + S * 0.10, this.canals[0].y - S * 0.10, 'left');
      label(L('달팽이관 · 기저막', 'cochlea · basilar membrane'), this.c.x, this.c.y + this.r0 * 1.25 * this.tilt + 40, 'center', 0.75);
      var ap = sg[N]; label(L('첨부 (저주파)', 'apex · low f'), ap.cx, ap.cy - 26, 'center', 0.5);
      label(L('기저부 (고주파)', 'base · high f'), b0.cx + 6, b0.cy + 30, 'left', 0.5);
      label(L('최대 응답', 'peak response'), pk.cx, pk.cy - amp - 18, 'center', 0.6);
    }
  };

  /* ================= shoulder: 견갑골·쇄골·상완골, 외전 운동 + FE 응력 ================= */
  var shoulder = {
    ko: '어깨 관절 유한요소 해석 · 회전근개 연구', en: 'Shoulder finite-element analysis · rotator cuff',
    init: function () {
      var S = Math.min(W, HV), R = S * (MOBILE ? 0.11 : 0.115);
      this.R = R; this.G = MOBILE ? { x: W * 0.46, y: HV * 0.40 } : { x: W * 0.52, y: HV * (COMPACT ? 0.52 : 0.42) };
      this.head = { r: 0.62, rings: MOBILE ? 4 : 6, sect: MOBILE ? 18 : 28 };
      this.shaft = { rows: MOBILE ? 10 : 16, cols: MOBILE ? 4 : 5, len: 3.3, w0: 0.6, w1: 0.48 };
      this.bar = { x: W * (MOBILE ? 0.84 : 0.86), y: HV * 0.62, w: 10, h: Math.min(110, HV * 0.16) };
      this.scap = [[-0.25, -0.55], [-0.32, -0.85], [-0.05, -1.02], [0.35, -1.12], [0.66, -1.0], [0.45, -0.82], [0.05, -0.78], [-0.55, -0.72], [-1.35, -0.95], [-1.75, -0.55], [-1.85, 0.1], [-1.55, 1.05], [-1.2, 1.75], [-0.55, 0.9], [-0.28, 0.55]];
      this.spine = [[-1.7, -0.5], [-0.5, -0.75], [0.35, -1.0]];
      this.clav = [[-2.4, -1.4], [-1.6, -1.5], [-0.8, -1.28], [0.0, -1.3], [0.5, -1.1]];
      this.cuff = [{ from: [-1.2, -0.85], ang: -1.35 }, { from: [-1.35, 0.35], ang: -0.45 }, { from: [-1.2, 1.1], ang: 0.15 }];
    },
    P: function (p, rot) {
      var R = this.R, px = p[0] * R, py = p[1] * R, pvx = -1.0 * R, pvy = 0.6 * R, cs = Math.cos(rot), sn = Math.sin(rot), dx = px - pvx, dy = py - pvy;
      return { x: this.G.x + pvx + dx * cs - dy * sn, y: this.G.y + pvy + dx * sn + dy * cs };
    },
    draw: function (dt, t) {
      var R = this.R, G = this.G;
      var abd = 0.10 + 0.72 * (0.5 - 0.5 * Math.cos(t * 0.55)), load = 0.55 + 0.45 * Math.sin(t * 0.55 - 0.6), srot = -abd * 0.33;
      var self = this, P = function (p) { return self.P(p, srot); };
      ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.10);
      for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(G.x - 3.2 * R, G.y + (0.3 + i * 0.75) * R, 1.9 * R, -0.55, 0.55); ctx.stroke(); }
      var C = P([0.18, 0]);
      var cl = this.clav.map(P); ctx.beginPath(); ctx.moveTo(cl[0].x, cl[0].y);
      for (i = 1; i < cl.length; i++) ctx.quadraticCurveTo(cl[i - 1].x, cl[i - 1].y, (cl[i - 1].x + cl[i].x) / 2, (cl[i - 1].y + cl[i].y) / 2);
      ctx.lineWidth = 9; ctx.strokeStyle = white(0.12); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.6); ctx.stroke();
      var sc = this.scap.map(P);
      ctx.beginPath(); ctx.moveTo(sc[0].x, sc[0].y);
      for (i = 1; i < sc.length; i++) ctx.quadraticCurveTo(sc[i - 1].x, sc[i - 1].y, (sc[i - 1].x + sc[i].x) / 2, (sc[i - 1].y + sc[i].y) / 2);
      ctx.lineTo(sc[sc.length - 1].x, sc[sc.length - 1].y);
      ctx.arc(C.x, C.y, 0.68 * R, Math.PI * 0.69 + srot, Math.PI * 1.31 + srot, false);
      ctx.closePath(); ctx.fillStyle = white(0.08); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.6); ctx.stroke();
      var sp = this.spine.map(P); ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y); ctx.quadraticCurveTo(sp[1].x, sp[1].y, sp[2].x, sp[2].y); ctx.strokeStyle = white(0.35); ctx.stroke();
      var ca = Math.PI + srot - abd * 0.35, contact = { x: C.x + 0.62 * R * Math.cos(ca), y: C.y + 0.62 * R * Math.sin(ca) };
      var gg = ctx.createRadialGradient(contact.x, contact.y, 0, contact.x, contact.y, R * 0.9);
      gg.addColorStop(0, heat(load, 0.55)); gg.addColorStop(1, heat(load, 0)); ctx.fillStyle = gg; ctx.fillRect(contact.x - R, contact.y - R, 2 * R, 2 * R);
      var hd = this.head, hr = hd.r * R;
      for (var ri = 0; ri < hd.rings; ri++) {
        var r0 = hr * ri / hd.rings, r1 = hr * (ri + 1) / hd.rings;
        for (var si = 0; si < hd.sect; si++) {
          var a0 = si / hd.sect * Math.PI * 2, a1 = (si + 1) / hd.sect * Math.PI * 2, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
          var s = Math.exp(-Math.hypot(C.x + rm * Math.cos(am) - contact.x, C.y + rm * Math.sin(am) - contact.y) / (hr * 0.75)) * load;
          ctx.fillStyle = heat(s, 0.85); ctx.strokeStyle = white(0.12); ctx.beginPath();
          ctx.moveTo(C.x + r0 * Math.cos(a0), C.y + r0 * Math.sin(a0)); ctx.lineTo(C.x + r1 * Math.cos(a0), C.y + r1 * Math.sin(a0));
          ctx.lineTo(C.x + r1 * Math.cos(a1), C.y + r1 * Math.sin(a1)); ctx.lineTo(C.x + r0 * Math.cos(a1), C.y + r0 * Math.sin(a1)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(C.x, C.y, hr, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.7); ctx.stroke();
      var sh = this.shaft, dir = { x: Math.sin(abd), y: Math.cos(abd) }, nrm = { x: dir.y, y: -dir.x }, l0 = hr * 0.85, L1 = sh.len * R;
      for (var rw = 0; rw < sh.rows; rw++) {
        var la = l0 + L1 * rw / sh.rows, lb = l0 + L1 * (rw + 1) / sh.rows, wa = lerp(sh.w0, sh.w1, rw / sh.rows) * R, wb = lerp(sh.w0, sh.w1, (rw + 1) / sh.rows) * R;
        for (var cl2 = 0; cl2 < sh.cols; cl2++) {
          var u0 = cl2 / sh.cols - 0.5, u1 = (cl2 + 1) / sh.cols - 0.5, bend = Math.abs((u0 + u1) / 2) * 2 * (1 - rw / sh.rows) * load * 0.7;
          ctx.fillStyle = heat(bend, 0.75); ctx.strokeStyle = white(0.10); ctx.beginPath();
          ctx.moveTo(C.x + dir.x * la + nrm.x * u0 * wa, C.y + dir.y * la + nrm.y * u0 * wa); ctx.lineTo(C.x + dir.x * lb + nrm.x * u0 * wb, C.y + dir.y * lb + nrm.y * u0 * wb);
          ctx.lineTo(C.x + dir.x * lb + nrm.x * u1 * wb, C.y + dir.y * lb + nrm.y * u1 * wb); ctx.lineTo(C.x + dir.x * la + nrm.x * u1 * wa, C.y + dir.y * la + nrm.y * u1 * wa); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      var ex = C.x + dir.x * (l0 + L1), ey = C.y + dir.y * (l0 + L1);
      ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.6);
      ctx.beginPath(); ctx.moveTo(C.x + dir.x * l0 - nrm.x * sh.w0 * R / 2, C.y + dir.y * l0 - nrm.y * sh.w0 * R / 2); ctx.lineTo(ex - nrm.x * sh.w1 * R / 2, ey - nrm.y * sh.w1 * R / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(C.x + dir.x * l0 + nrm.x * sh.w0 * R / 2, C.y + dir.y * l0 + nrm.y * sh.w0 * R / 2); ctx.lineTo(ex + nrm.x * sh.w1 * R / 2, ey + nrm.y * sh.w1 * R / 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(ex, ey, sh.w1 * R * 0.75, sh.w1 * R * 0.45, Math.atan2(dir.y, dir.x), 0, Math.PI * 2); ctx.fillStyle = white(0.10); ctx.fill(); ctx.stroke();
      for (i = 0; i < this.cuff.length; i++) {
        var cf = this.cuff[i], f = P(cf.from), ang = cf.ang - abd, ax = C.x + hr * Math.cos(ang), ay = C.y + hr * Math.sin(ang), tension = 0.35 + 0.65 * Math.max(0, Math.cos(cf.ang + 1.0 + abd * 0.8)) * load;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo((f.x + ax) / 2, (f.y + ay) / 2 - R * 0.35 * (i === 0 ? 1 : 0.2), ax, ay);
        ctx.lineWidth = 5; ctx.strokeStyle = amber(0.3 + 0.65 * tension); ctx.stroke(); ctx.lineWidth = 1;
      }
      var deg = Math.round(abd * 180 / Math.PI);
      ctx.beginPath(); ctx.arc(C.x, C.y, R * 1.55, Math.PI / 2 - abd, Math.PI / 2); ctx.lineWidth = 1; ctx.strokeStyle = white(0.4); ctx.stroke();
      ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(C.x, C.y + hr); ctx.lineTo(C.x, C.y + R * 1.75); ctx.stroke(); ctx.setLineDash([]);
      label(L('외전 ', 'abduction ') + deg + '°', C.x + R * 1.7 * Math.sin(abd / 2) + 8, C.y + R * 1.7 * Math.cos(abd / 2), 'left', 0.7);
      var ls = P([-1.15, 0.45]); label(L('견갑골', 'scapula'), ls.x, ls.y, 'center', 0.6);
      var lc = P([-1.6, -1.7]); label(L('쇄골', 'clavicle'), lc.x, lc.y, 'center', 0.6);
      label(L('상완골', 'humerus'), ex + nrm.x * (sh.w1 * R + 14) - 10, ey + nrm.y * (sh.w1 * R + 14) + 4, 'left', 0.6);
      var lr = P([-0.7, -1.15]); label(L('회전근개', 'rotator cuff'), lr.x, lr.y, 'center', 0.6); ctx.fillStyle = amber(0.9); ctx.fillRect(lr.x - 32, lr.y + 5, 64, 2);
      var b = this.bar;
      for (var k = 0; k < 24; k++) { ctx.fillStyle = heat(1 - k / 23, 0.95); ctx.fillRect(b.x, b.y + b.h * k / 24, b.w, b.h / 24 + 1); }
      label('von Mises', b.x + 15, b.y + 10, 'left', 0.55); label('max', b.x + 15, b.y + 24, 'left', 0.55); label('0', b.x + 15, b.y + b.h, 'left', 0.55);
    }
  };

  /* ================= skull: 두개골 옆모습 — 진동 전달 (tVAS) ================= */
  var skull = {
    ko: '두개골 진동 전달 · 뇌척수액 응답 (tVAS)', en: 'Skull-borne vibration · CSF response (tVAS)',
    init: function () {
      var S = Math.min(W, HV), s = S * (MOBILE ? 0.42 : 0.37);
      this.s = s; this.c = MOBILE ? { x: W * 0.5, y: HV * 0.5 } : { x: W * 0.58, y: HV * 0.52 };
      var self = this, T = function (p) { return [self.c.x + p[0] * s, self.c.y + p[1] * s]; };
      var prof = [[-0.80, -0.12], [-0.86, -0.36], [-0.76, -0.64], [-0.52, -0.87], [-0.20, -0.99], [0.16, -1.0], [0.50, -0.90], [0.78, -0.68], [0.92, -0.38], [0.94, -0.04], [0.86, 0.28], [0.66, 0.50], [0.48, 0.58], [0.40, 0.52],
                  [0.36, 0.80], [0.10, 0.98], [-0.30, 1.02], [-0.52, 0.94], [-0.58, 0.72], [-0.70, 0.64], [-0.74, 0.44], [-0.86, 0.30], [-0.92, 0.10]];
      this.N = MOBILE ? 110 : 200; this.outline = resample(prof.map(T), this.N); this.nrm = [];
      for (var i = 0; i < this.N; i++) { var a = this.outline[(i + 1) % this.N], b = this.outline[(i - 1 + this.N) % this.N], dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; this.nrm.push([dy / l, -dx / l]); }
      this.orbit = T([-0.56, -0.14]); this.orbitR = [0.18 * s, 0.15 * s];
      this.zyg = [T([-0.62, 0.18]), T([-0.2, 0.12]), T([0.22, 0.16])]; this.ear = T([0.40, 0.30]);
      this.teeth = []; for (var k = 0; k < 6; k++) this.teeth.push(T([-0.70 + k * 0.07, 0.66 + k * 0.03]));
      this.jawline = [T([0.40, 0.52]), T([0.30, 0.55]), T([-0.1, 0.72])];
      this.brainC = T([0.06, -0.30]); this.brainR = [0.68 * s, 0.50 * s]; this.brain = []; var M = MOBILE ? 90 : 160;
      for (i = 0; i < M; i++) { var th = i / M * Math.PI * 2, w = 1 + 0.035 * Math.sin(th * 9) + 0.02 * Math.sin(th * 17); this.brain.push([this.brainC[0] + this.brainR[0] * w * Math.cos(th), this.brainC[1] + this.brainR[1] * w * Math.sin(th)]); }
      this.cereb = T([0.50, 0.24]); this.stem = [T([0.36, 0.30]), T([0.42, 0.52])];
      this.sulci = [[T([-0.05, -0.78]), T([0.12, -0.45]), T([0.02, -0.10])], [T([-0.55, -0.15]), T([-0.1, -0.05]), T([0.35, 0.02])]];
      this.inner = []; var rings = MOBILE ? 5 : 8, per = MOBILE ? 22 : 40;
      for (var r = 1; r <= rings; r++) for (i = 0; i < per; i++) { var an = i / per * Math.PI * 2 + r * 0.17, q = r / (rings + 0.8); this.inner.push({ x: this.brainC[0] + this.brainR[0] * 0.92 * q * Math.cos(an), y: this.brainC[1] + this.brainR[1] * 0.92 * q * Math.sin(an) }); }
      this.act = [T([0.52, 0.52]), T([0.16, -1.0])]; this.L = s * 1.1;
    },
    field: function (x, y, t) { var u = 0; for (var i = 0; i < 2; i++) { var d = Math.hypot(x - this.act[i][0], y - this.act[i][1]); u += Math.cos(d / 24 - t * 6.5) * Math.exp(-d / this.L); } return u * 0.55; },
    draw: function (dt, t) {
      var s = this.s, N = this.N, o = this.outline, nr = this.nrm;
      ctx.beginPath();
      for (var i = 0; i <= N; i++) { var k = i % N, u = this.field(o[k][0], o[k][1], t), x = o[k][0] + nr[k][0] * u * 9, y = o[k][1] + nr[k][1] * u * 9; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fillStyle = white(0.05); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = white(0.8); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.55);
      ctx.beginPath(); ctx.ellipse(this.orbit[0], this.orbit[1], this.orbitR[0], this.orbitR[1], -0.15, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.zyg[0][0], this.zyg[0][1]); ctx.quadraticCurveTo(this.zyg[1][0], this.zyg[1][1], this.zyg[2][0], this.zyg[2][1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.ear[0], this.ear[1], s * 0.045, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.jawline[0][0], this.jawline[0][1]); ctx.quadraticCurveTo(this.jawline[1][0], this.jawline[1][1], this.jawline[2][0], this.jawline[2][1]); ctx.stroke();
      ctx.lineWidth = 1; for (i = 0; i < this.teeth.length; i++) { var th = this.teeth[i]; ctx.strokeRect(th[0] - s * 0.025, th[1] - s * 0.04, s * 0.05, s * 0.08); }
      var bf = Math.abs(this.field(this.brainC[0], this.brainC[1], t));
      tracePath(this.brain, true); ctx.fillStyle = amber(0.06 + 0.08 * bf); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.55); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(this.cereb[0], this.cereb[1], s * 0.2, s * 0.13, 0.25, 0, Math.PI * 2); ctx.fillStyle = amber(0.05); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.stem[0][0], this.stem[0][1]); ctx.lineTo(this.stem[1][0], this.stem[1][1]); ctx.lineWidth = 5; ctx.strokeStyle = amber(0.35); ctx.stroke(); ctx.lineWidth = 1;
      ctx.strokeStyle = amber(0.35); for (i = 0; i < this.sulci.length; i++) { var sc = this.sulci[i]; ctx.beginPath(); ctx.moveTo(sc[0][0], sc[0][1]); ctx.quadraticCurveTo(sc[1][0], sc[1][1], sc[2][0], sc[2][1]); ctx.stroke(); }
      for (k = 0; k < this.inner.length; k++) { var p = this.inner[k], v = this.field(p.x, p.y, t), m = Math.abs(v); ctx.fillStyle = m > 0.3 ? amber(0.35 + 0.65 * m) : white(0.18 + 0.4 * m); ctx.beginPath(); ctx.arc(p.x + v * 3, p.y + v * 3, 1.5 + 3.2 * m, 0, Math.PI * 2); ctx.fill(); }
      for (var j = 0; j < N; j += 2) { var e = Math.abs(this.field(o[j][0], o[j][1], t)); ctx.fillStyle = amber(0.25 + 0.75 * e); ctx.beginPath(); ctx.arc(o[j][0], o[j][1], 1.6 + 3.2 * e, 0, Math.PI * 2); ctx.fill(); }
      var per = 2 * Math.PI / 6.5, ph = (t % per) / per;
      for (var q = 0; q < 2; q++) {
        var A = this.act[q];
        ctx.fillStyle = amber(1); ctx.beginPath(); ctx.arc(A[0], A[1], 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = white(0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(A[0], A[1], 10, 0, Math.PI * 2); ctx.stroke();
        for (var r = 0; r < 4; r++) { var rr = (ph + r / 4) % 1; ctx.beginPath(); ctx.arc(A[0], A[1], 12 + rr * this.L * 1.2, 0, Math.PI * 2); ctx.strokeStyle = amber(0.45 * (1 - rr)); ctx.lineWidth = 1; ctx.stroke(); }
      }
      label('40 Hz tVAS', this.act[0][0] + 16, this.act[0][1] + 26, 'left', 0.7); label('40 Hz tVAS', this.act[1][0], this.act[1][1] - 18, 'center', 0.7);
      label(L('두개골', 'skull'), this.c.x - s * 0.95, this.c.y - s * 0.62, 'right', 0.6);
      label(L('뇌 · 뇌척수액', 'brain · CSF'), this.brainC[0], this.brainC[1] + this.brainR[1] * 0.78, 'center', 0.7);
      label(L('진동 전파', 'vibration path'), this.c.x + s * 1.02, this.c.y + s * 0.05, 'left', 0.55);
    }
  };

  /* ================= exoboot: 발목 엑소부츠 — 보행 주기와 보조 토크 ================= */
  var exoboot = {
    ko: '발목 엑소부츠 · 보행 보조 토크 제어', en: 'Ankle exoboot · walking-assist torque control',
    init: function () {
      var S = Math.min(W, HV);
      this.u = S * (MOBILE ? 0.20 : 0.15);                       // 하퇴(정강이) 길이 단위
      this.hip = MOBILE ? { x: W * 0.45, y: HV * 0.22 } : { x: W * 0.62, y: HV * (COMPACT ? 0.36 : 0.26) };
      this.ground = this.hip.y + this.u * 2.45; this.period = 1.25;
      this.plot = MOBILE ? { x: W * 0.08, y: HV * 0.80, w: W * 0.84, h: HV * 0.12 } : { x: W * 0.06, y: HV * 0.50, w: W * 0.28, h: HV * 0.16 };
    },
    // 보행 주기 φ(0=뒤꿈치 닿음)에 따른 관절각(rad). +: 굽힘/발바닥굽힘
    joints: function (ph) {
      var g = function (c, w) { var d = ((ph - c + 1.5) % 1) - 0.5; return Math.exp(-d * d / (w * w)); };
      return { hip: 0.42 * Math.cos(ph * 2 * Math.PI) - 0.05, knee: 0.12 + 1.05 * g(0.72, 0.11) + 0.25 * g(0.15, 0.09), ankle: -0.17 * g(0.42, 0.14) + 0.42 * g(0.60, 0.06), exo: g(0.55, 0.075) };
    },
    leg: function (ph, front, alpha) {
      var u = this.u, J = this.joints(ph), hip = this.hip;
      var th = J.hip, kx = hip.x - Math.sin(th) * u * 1.05, ky = hip.y + Math.cos(th) * u * 1.05;           // 무릎 (앞=왼쪽)
      var sh = th - J.knee, ax = kx - Math.sin(sh) * u, ay = ky + Math.cos(sh) * u;                        // 발목
      var fa = sh + Math.PI / 2 - 0.1 - J.ankle;                                                            // 발 방향(앞쪽)
      var fdx = -Math.cos(fa - Math.PI), fdy = -Math.sin(fa - Math.PI);                                     // 발가락 방향
      var tx = ax + fdx * u * 0.55, ty = ay + fdy * u * 0.55, hx = ax - fdx * u * 0.18, hy = ay - fdy * u * 0.18;
      var bone = front ? white(0.85 * alpha) : white(0.28 * alpha), fill = front ? 'rgba(255,255,255,' + 0.10 * alpha + ')' : 'rgba(255,255,255,' + 0.04 * alpha + ')';
      // 몸통(허리)·허벅지·정강이·발
      if (front) capsule(hip.x, hip.y - u * 0.9, hip.x, hip.y, u * 0.34, fill, white(0.3 * alpha));
      capsule(hip.x, hip.y, kx, ky, u * 0.26, fill, bone); capsule(kx, ky, ax, ay, u * 0.19, fill, bone);
      ctx.beginPath(); ctx.moveTo(ax + fdy * u * 0.05, ay - fdx * u * 0.05); ctx.lineTo(hx, hy); ctx.lineTo(hx + fdy * u * 0.13, hy - fdx * u * 0.13 + u * 0.02); ctx.lineTo(tx + fdy * u * 0.10, ty - fdx * u * 0.10); ctx.lineTo(tx, ty); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = bone; ctx.stroke();
      [[hip.x, hip.y], [kx, ky], [ax, ay]].forEach(function (p) { ctx.fillStyle = white(0.9 * alpha); ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2); ctx.fill(); });
      if (!front) return;
      // 엑소부츠: 정강이 커프 + 모터 + 스트럿 + 케이블 → 뒤꿈치 레버
      var sx = Math.sin(sh), sy = -Math.cos(sh);                          // 정강이 위 방향(발목→무릎)
      var px = -sy, py = sx;                                              // 정강이 뒤쪽(오른쪽) 법선
      var cx = ax + sx * (-u * 0.72), cy = ay + sy * (-u * 0.72);         // 커프 중심(정강이 상부)
      ctx.lineWidth = 7; ctx.strokeStyle = amber(0.95); ctx.beginPath(); ctx.moveTo(cx - px * u * 0.16, cy - py * u * 0.16); ctx.lineTo(cx + px * u * 0.16, cy + py * u * 0.16); ctx.stroke();
      var mx = cx + px * u * 0.24, my = cy + py * u * 0.24;               // 모터 박스
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(sy, sx)); ctx.fillStyle = 'rgba(232,184,32,' + (0.55 + 0.45 * J.exo) + ')'; ctx.fillRect(-u * 0.13, -u * 0.09, u * 0.26, u * 0.18); ctx.strokeStyle = white(0.7); ctx.lineWidth = 1.5; ctx.strokeRect(-u * 0.13, -u * 0.09, u * 0.26, u * 0.18); ctx.restore();
      var lvx = hx - fdx * u * 0.10 + fdy * u * 0.02, lvy = hy - fdy * u * 0.10 - fdx * u * 0.02;  // 뒤꿈치 레버 끝
      ctx.lineWidth = 3; ctx.strokeStyle = amber(0.9); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(lvx, lvy); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = white(0.35); ctx.beginPath(); ctx.moveTo(cx + px * u * 0.12, cy + py * u * 0.12); ctx.lineTo(ax + px * u * 0.16, ay + py * u * 0.16); ctx.stroke(); // 스트럿
      ctx.lineWidth = 1.5 + 2.5 * J.exo; ctx.strokeStyle = 'rgba(255,' + Math.round(200 + 55 * J.exo) + ',' + Math.round(60 + 160 * J.exo) + ',' + (0.6 + 0.4 * J.exo) + ')';
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(lvx, lvy); ctx.stroke();                                           // 케이블(당김 시 굵고 밝게)
      if (J.exo > 0.08) {                                                                                                  // 보조 토크 호살표 + 글로우
        var g = ctx.createRadialGradient(ax, ay, 0, ax, ay, u * 0.55); g.addColorStop(0, amber(0.45 * J.exo)); g.addColorStop(1, amber(0)); ctx.fillStyle = g; ctx.fillRect(ax - u, ay - u, 2 * u, 2 * u);
        var a0 = fa + 0.2, a1 = fa + 0.2 + 1.6 * J.exo; ctx.lineWidth = 3; ctx.strokeStyle = amber(0.9); ctx.beginPath(); ctx.arc(ax, ay, u * 0.32, a0, a1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + Math.cos(a1) * u * 0.32 - Math.sin(a1) * 8 - Math.cos(a1) * 5, ay + Math.sin(a1) * u * 0.32 + Math.cos(a1) * 8 - Math.sin(a1) * 5); ctx.lineTo(ax + Math.cos(a1) * u * 0.32, ay + Math.sin(a1) * u * 0.32); ctx.lineTo(ax + Math.cos(a1) * u * 0.32 - Math.sin(a1) * 8 + Math.cos(a1) * 5, ay + Math.sin(a1) * u * 0.32 + Math.cos(a1) * 8 + Math.sin(a1) * 5); ctx.stroke();
      }
      this.pts = { ax: ax, ay: ay, mx: mx, my: my, cx: cx, cy: cy, hx: hx, hy: hy, exo: J.exo };
    },
    draw: function (dt, t) {
      var ph = (t / this.period) % 1, u = this.u, g = this.ground;
      // 트레드밀 바닥(뒤로 흐르는 줄무늬)
      ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.35); ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(W, g); ctx.stroke();
      var sp = u * 0.5, off = (t * u * 1.25) % sp; ctx.strokeStyle = white(0.15);
      for (var x = -sp + off; x < W; x += sp) { ctx.beginPath(); ctx.moveTo(x, g); ctx.lineTo(x - 12, g + 10); ctx.stroke(); }
      this.leg((ph + 0.5) % 1, false, 1); this.leg(ph, true, 1);
      var P = this.pts;
      // 라벨
      label(L('발목 엑소부츠', 'ankle exoboot'), P.mx + u * 0.22, P.my + 4, 'left', 0.8);
      label(L('모터 · 케이블', 'motor · cable'), P.mx + u * 0.22, P.my + 20, 'left', 0.5);
      label(L('발목 보조 토크', 'assist torque'), P.ax + u * 0.45, P.ay - u * 0.2, 'left', 0.55 + 0.4 * P.exo);
      // 보행 주기 그래프: 발목 토크(흰색) + 보조 토크(앰버)
      var pl = this.plot; ctx.strokeStyle = white(0.25); ctx.lineWidth = 1; ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      ctx.beginPath(); for (var i = 0; i <= 60; i++) { var q = i / 60, J = this.joints(q), v = 0.5 * (Math.exp(-Math.pow((q - 0.5) / 0.14, 2)) + 0.3 * Math.exp(-Math.pow((q - 0.15) / 0.1, 2))); var X = pl.x + q * pl.w, Y = pl.y + pl.h - v * pl.h * 0.9; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.strokeStyle = white(0.6); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); for (i = 0; i <= 60; i++) { q = i / 60; J = this.joints(q); X = pl.x + q * pl.w; Y = pl.y + pl.h - J.exo * pl.h * 0.65; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.strokeStyle = amber(0.95); ctx.lineWidth = 2; ctx.stroke();
      var cxp = pl.x + ph * pl.w; ctx.strokeStyle = white(0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cxp, pl.y); ctx.lineTo(cxp, pl.y + pl.h); ctx.stroke();
      label(L('보행 주기 ', 'gait cycle ') + Math.round(ph * 100) + '%', pl.x, pl.y - 8, 'left', 0.6);
      label(L('생체 발목 토크', 'biological ankle torque'), pl.x + pl.w, pl.y - 8, 'right', 0.5);
      ctx.fillStyle = amber(0.95); ctx.fillRect(pl.x, pl.y + pl.h + 8, 18, 2); label(L('엑소부츠 보조 토크', 'exoboot assist torque'), pl.x + 24, pl.y + pl.h + 12, 'left', 0.6);
      label(L('입각기 → 유각기', 'stance → swing'), pl.x + pl.w * 0.62, pl.y + pl.h + 12, 'left', 0.4);
    }
  };

  /* ================= vestibular: 전정계·시각 정보 불일치 — 멀미 ================= */
  var vestibular = {
    ko: '전정계 · 감각 불일치 모델링 — 멀미 연구', en: 'Vestibular system · sensory-conflict model — motion sickness',
    init: function () {
      var S = Math.min(W, HV), s = S * (MOBILE ? 0.30 : 0.26);
      this.s = s; this.c = MOBILE ? { x: W * 0.5, y: HV * 0.48 } : { x: W * 0.62, y: HV * 0.5 };
      this.head = resample([[-0.55, -0.85], [-0.05, -1.0], [0.45, -0.85], [0.7, -0.4], [0.62, 0.15], [0.4, 0.55], [0.15, 0.85], [-0.2, 0.95], [-0.5, 0.75], [-0.72, 0.35], [-0.78, -0.2], [-0.72, -0.6]], MOBILE ? 60 : 100);
      this.win = MOBILE ? { x: W * 0.06, y: HV * 0.10, w: W * 0.88, h: HV * 0.28 } : { x: W * 0.06, y: HV * 0.20, w: W * 0.30, h: HV * 0.26 };
    },
    draw: function (dt, t) {
      var s = this.s, c = this.c, roll = 0.16 * Math.sin(t * 1.1), vis = 0.16 * Math.sin(t * 1.1 - 1.4);   // 머리(전정) vs 시각(창밖) 위상차 = 감각 불일치
      // 창밖 풍경(시각 입력): 기울어지는 수평선
      var w = this.win; ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
      ctx.translate(w.x + w.w / 2, w.y + w.h * 0.55); ctx.rotate(vis);
      ctx.fillStyle = 'rgba(232,184,32,0.10)'; ctx.fillRect(-w.w, 0, 2 * w.w, w.h); ctx.strokeStyle = white(0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w.w, 0); ctx.lineTo(w.w, 0); ctx.stroke();
      ctx.strokeStyle = white(0.18); ctx.lineWidth = 1; for (var i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * w.w * 0.12 - (t * 30 % (w.w * 0.12)), 0); ctx.lineTo(i * w.w * 0.35 - (t * 30 % (w.w * 0.12)) * 3, w.h); ctx.stroke(); }
      ctx.restore(); ctx.strokeStyle = white(0.45); ctx.lineWidth = 1.5; ctx.strokeRect(w.x, w.y, w.w, w.h);
      label(L('시각 입력 (창밖)', 'visual input (window)'), w.x + 8, w.y - 8, 'left', 0.55);
      // 머리(기울어짐) + 내이
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(roll);
      ctx.beginPath(); for (i = 0; i < this.head.length; i++) { var p = this.head[i]; if (i) ctx.lineTo(p[0] * s, p[1] * s); else ctx.moveTo(p[0] * s, p[1] * s); } ctx.closePath(); ctx.fillStyle = white(0.05); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = white(0.75); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.42 * s, -0.25 * s, 0.05 * s, 0, Math.PI * 2); ctx.strokeStyle = white(0.5); ctx.lineWidth = 1.5; ctx.stroke();   // 눈
      var ex = 0.30 * s, ey = -0.05 * s;                                                                                                        // 내이 위치
      var flow = -roll * 4;                                                                                                                       // 내림프 흐름(관성)
      var canals = [{ rx: 0.13, ry: 0.19, rot: -0.4, dx: 0.02, dy: -0.16 }, { rx: 0.12, ry: 0.17, rot: 0.55, dx: 0.14, dy: -0.12 }, { rx: 0.17, ry: 0.07, rot: 0.1, dx: 0.10, dy: 0.02 }];
      for (i = 0; i < 3; i++) {
        var cn = canals[i]; ctx.beginPath(); ctx.ellipse(ex + cn.dx * s, ey + cn.dy * s, cn.rx * s, cn.ry * s, cn.rot, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = amber(0.18); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.9); ctx.stroke();
        for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2 + t * 1.5 * flow; var px = ex + cn.dx * s + Math.cos(cn.rot) * cn.rx * s * Math.cos(a) - Math.sin(cn.rot) * cn.ry * s * Math.sin(a), py = ey + cn.dy * s + Math.sin(cn.rot) * cn.rx * s * Math.cos(a) + Math.cos(cn.rot) * cn.ry * s * Math.sin(a); ctx.fillStyle = white(0.85); ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); }
      }
      // 달팽이관(작게)
      ctx.beginPath(); for (i = 0; i <= 60; i++) { var u = i / 60, th = u * 2.2 * Math.PI * 2, r = 0.10 * s * (1 - 0.8 * u); var qx = ex + 0.16 * s + r * Math.cos(th), qy = ey + 0.16 * s + r * Math.sin(th); if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); } ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.6); ctx.stroke();
      ctx.restore();
      // 머리 기울기 표시(수직 기준선 vs 머리 축)
      ctx.setLineDash([3, 5]); ctx.strokeStyle = white(0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x, c.y - s * 1.25); ctx.lineTo(c.x, c.y + s * 1.15); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = amber(0.8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - Math.sin(roll) * s * 1.2, c.y - Math.cos(roll) * s * 1.2); ctx.stroke();
      label(L('전정 입력 (머리 기울기 ', 'vestibular input (head tilt ') + Math.round(roll * 180 / Math.PI) + '°)', c.x, c.y + s * 1.3, 'center', 0.6);
      label(L('반고리관 · 내림프', 'semicircular canals · endolymph'), c.x + s * 0.75, c.y - s * 0.55, 'left', 0.6);
      // 불일치 게이지
      var conf = Math.abs(roll - vis) / 0.32, gx = MOBILE ? W * 0.08 : this.win.x, gy = MOBILE ? HV * 0.42 : this.win.y + this.win.h + 36, gw = MOBILE ? W * 0.84 : this.win.w;
      ctx.fillStyle = white(0.12); ctx.fillRect(gx, gy, gw, 6); ctx.fillStyle = heat(conf, 0.95); ctx.fillRect(gx, gy, gw * clamp01(conf), 6);
      label(L('감각 불일치 → 멀미 유발도', 'sensory conflict → sickness incidence'), gx, gy - 8, 'left', 0.6);
    }
  };

  /* ================= photos: 랩 사진 크로스페이드(켄 번즈) ================= */
  var photos = {
    full: true, ko: 'AM&D Lab 구성원', en: 'AM&D Lab members', each: 5.5, fade: 1.4,
    init: function () { if (!this.imgs) this.imgs = loadImages(imgList('data-photos')); },
    one: function (im, k, a) { var z = 1.04 + 0.08 * smooth(k), px = 0.3 + 0.4 * ((k * 0.7) % 1), py = 0.35; ctx.globalAlpha *= a; drawCover(im, 0, 0, W, H, z, px, py); },
    draw: function (dt, t) {
      var n = this.imgs.length; if (!n) return;
      var cyc = this.each, i = Math.floor(t / cyc) % n, k = (t % cyc) / cyc, ga = ctx.globalAlpha;
      ctx.save(); this.one(this.imgs[i], k, 1); ctx.restore(); ctx.globalAlpha = ga;
      if (k > 1 - this.fade / cyc) { var f = smooth((k - (1 - this.fade / cyc)) / (this.fade / cyc)); ctx.save(); this.one(this.imgs[(i + 1) % n], 0, f); ctx.restore(); ctx.globalAlpha = ga; }
      ctx.fillStyle = 'rgba(16,18,22,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(232,184,32,0.06)'; ctx.fillRect(0, 0, W, H);
    }
  };

  /* ================= papers: 실제 논문(제목·저널·썸네일)이 종이 카드로 천천히 떠오르는 장면 ================= */
  function wrapText(txt, maxW, maxLines) {
    var words = txt.split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) { var test = cur ? cur + ' ' + words[i] : words[i]; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = test; }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + ' …'; }
    return lines;
  }
  var papers = {
    full: true, ko: '주요 논문', en: 'Selected publications',
    init: function () {
      if (!this.items) {
        this.items = [];
        var self = this;
        document.querySelectorAll('.pub-item').forEach(function (el) {
          if (self.items.length >= 14) return;
          var img = el.querySelector('.pub-thumb img'), h3 = el.querySelector('h3'), j = el.querySelector('.pub-journal'), y = el.getAttribute('data-year'), im = null;
          if (img) { im = new Image(); im.decoding = 'async'; im.src = img.getAttribute('src'); }
          self.items.push({ title: h3 ? h3.textContent.trim() : '', journal: (j ? j.textContent.trim() : '') + (y ? ' · ' + y : ''), im: im });
        });
      }
      var n = this.items.length, S = Math.min(W, HV); this.cards = [];
      for (var i = 0; i < n; i++) { var d = 0.45 + 0.55 * ((i * 0.37) % 1); this.cards.push({ it: this.items[i], x: 0.06 + 0.88 * ((i * 0.618) % 1), y: (i / n + 0.1) % 1, d: d, w: S * (MOBILE ? 0.62 : 0.36) * d, rot: (((i * 0.53) % 1) - 0.5) * 0.26, v: 0.010 + 0.018 * d }); }
      this.cards.sort(function (a, b) { return a.d - b.d; });
    },
    card: function (it, w, h, d) {
      var pad = w * 0.07, fs = Math.max(9, w * 0.052), x = -w / 2 + pad, y = -h / 2 + pad + fs;
      ctx.fillStyle = 'rgba(238,235,228,' + (0.5 + 0.45 * d) + ')'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(199,154,10,0.95)'; ctx.fillRect(-w / 2, -h / 2, w, 3);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(170,128,6,1)'; ctx.font = '600 ' + (fs * 0.8) + 'px Paperlogy, sans-serif'; ctx.fillText(it.journal, x, y); y += fs * 1.25;
      ctx.fillStyle = '#1b1d22'; ctx.font = '700 ' + fs + 'px Paperlogy, sans-serif';
      var lines = wrapText(it.title, w - 2 * pad, 3);
      for (var k = 0; k < lines.length; k++) { ctx.fillText(lines[k], x, y); y += fs * 1.25; }
      y += fs * 0.35;
      var tw = w * 0.36, th = tw * 0.8;
      if (it.im && it.im.complete && it.im.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.rect(w / 2 - pad - tw, y, tw, th); ctx.clip(); drawCover(it.im, w / 2 - pad - tw, y, tw, th, 1, 0.5, 0.5); ctx.restore(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.strokeRect(w / 2 - pad - tw, y, tw, th); }
      var lw = w - 2 * pad - tw - pad * 0.7; ctx.fillStyle = 'rgba(30,32,38,0.30)';
      for (var ly = y + 2; ly < h / 2 - pad; ly += fs * 0.78) { var full = ly > y + th ? w - 2 * pad : lw; ctx.fillRect(x, ly, full * (0.72 + 0.28 * Math.abs(Math.sin(ly * 7.3))), fs * 0.27); }
    },
    draw: function (dt, t) {
      for (var i = 0; i < this.cards.length; i++) {
        var c = this.cards[i], y = ((c.y - t * c.v) % 1 + 1) % 1, w = c.w, h = w * 1.3, cx = c.x * W, cy = y * (H + h * 1.4) - h * 0.7;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(c.rot); ctx.globalAlpha *= 0.35 + 0.6 * c.d;
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 26 * c.d; ctx.shadowOffsetY = 10; ctx.fillStyle = '#2a2d34'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent';
        this.card(c.it, w, h, c.d); ctx.restore();
      }
      ctx.fillStyle = 'rgba(16,18,22,0.18)'; ctx.fillRect(0, 0, W, H);
    }
  };

  /* ================= mosaic: 갤러리 사진 벽이 천천히 흐르는 장면 ================= */
  var mosaic = {
    full: true, ko: 'AM&D Lab 갤러리', en: 'AM&D Lab gallery',
    init: function () { if (!this.imgs) this.imgs = loadImages(imgList('data-photos')); this.tw = MOBILE ? 150 : 230; this.th = this.tw * 0.66; this.gap = 8; },
    draw: function (dt, t) {
      var n = this.imgs.length; if (!n) return;
      var tw = this.tw + this.gap, th = this.th + this.gap, cols = Math.ceil(W / tw) + 2, rows = Math.ceil(H / th) + 2;
      var ox = -((t * 14) % tw), oy = -((t * 7) % th), ci = Math.floor(t * 14 / tw), ri = Math.floor(t * 7 / th);
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var gi = ((r + ri) * 7 + (c + ci) * 3) % n, im = this.imgs[gi], x = ox + c * tw + (r % 2) * tw * 0.5 - tw, y = oy + r * th - th;
        ctx.save(); ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.rect(x, y, this.tw, this.th); ctx.clip(); if (!drawCover(im, x, y, this.tw, this.th, 1, 0.5, 0.4)) { ctx.fillStyle = white(0.05); ctx.fillRect(x, y, this.tw, this.th); } ctx.restore();
      }
      ctx.fillStyle = 'rgba(16,18,22,0.30)'; ctx.fillRect(0, 0, W, H);
    }
  };

  /* ================= 엔진 ================= */
  var registry = { wildfire: wildfire, cochlea: cochlea, shoulder: shoulder, skull: skull, exoboot: exoboot, vestibular: vestibular, photos: photos, papers: papers, mosaic: mosaic };
  var names = (canvas.getAttribute('data-scenes') || 'cochlea,wildfire,shoulder,exoboot,skull,vestibular').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return registry[s] && (s !== 'wildfire' || video); });
  var scenes = names.map(function (n) { return registry[n]; });
  if (!scenes.length) return;
  var cur = 0, sceneT = 0, last = 0, running = true, lastLang = '';

  function resize() {
    FW = canvas.clientWidth; H = canvas.clientHeight; HV = Math.min(H, (window.innerHeight || H) - 60);
    if (FW < 2 || H < 2) { ready = false; return; }
    COMPACT = H < 480 && !MOBILE; WX = COMPACT ? FW * 0.40 : 0;
    DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1 : 1.5);
    canvas.width = Math.floor(FW * DPR); canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scenes.forEach(function (s) { W = s.full ? FW : FW - WX; s.init(); });
    W = FW;
    ready = true;
  }
  function caption(i) {
    if (!capEl) return;
    var lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
    capEl.textContent = scenes[i][lang]; lastLang = lang;
    if (capWrap) { capWrap.classList.remove('swap'); void capWrap.offsetWidth; capWrap.classList.add('swap'); }
  }
  function present(s, dt, t, alpha) {
    if (s.type === 'video') { s.show(alpha); return; }
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha = alpha;
    if (!s.full && WX) { ctx.translate(WX, 0); W = FW - WX; }
    s.draw(dt, t); W = FW; ctx.restore();
  }
  function frame(now) {
    if (!running) return;
    if (!ready) { resize(); if (!ready) { requestAnimationFrame(frame); return; } }
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    sceneT += dt;
    ctx.clearRect(0, 0, W, H);
    var s = scenes[cur], t = now / 1000, nxt = scenes[(cur + 1) % scenes.length];
    if (scenes.length > 1 && sceneT > DUR - FADE) {
      var k = smooth((sceneT - (DUR - FADE)) / FADE);
      present(s, dt, t, 1 - k); present(nxt, dt, t, k);
      if (sceneT >= DUR) { cur = (cur + 1) % scenes.length; sceneT = 0; caption(cur); }
    } else {
      present(s, dt, t, 1);
      scenes.forEach(function (o) { if (o !== s && o.type === 'video') o.show(0); });
    }
    var lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
    if (lang !== lastLang) caption(cur);
    requestAnimationFrame(frame);
  }

  var m = /[?&]scene=(\d)/.exec(location.search); if (m) cur = (+m[1]) % scenes.length;
  resize(); window.addEventListener('resize', resize);
  caption(cur);
  if (REDUCE) { if (ready) present(scenes[cur], 0.016, 4.2, 1); if (scenes[cur].type === 'video') scenes[cur].show(1); return; }
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
    else if (video && !video.paused) video.pause();
  });
  last = performance.now(); requestAnimationFrame(frame);
})();
