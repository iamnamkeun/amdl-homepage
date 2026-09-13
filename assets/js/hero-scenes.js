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
  var videos = document.querySelectorAll('video.hero-video');
  var capEl = document.getElementById('hero-scene-name');
  var capWrap = document.getElementById('hero-scene-cap');

  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = window.matchMedia('(max-width: 760px)').matches;
  var DUR = 13, FADE = 1.6;
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

  /* ================= 영상 장면(무음 반복): <video id="hero-video-NAME" class="hero-video"> ================= */
  function videoScene(name, ko, en) {
    return { type: 'video', el: document.getElementById('hero-video-' + name), ko: ko, en: en, init: function () {}, draw: function () {},
      show: function (alpha) {
        if (!this.el) return;
        this.el.style.opacity = alpha;
        if (alpha > 0.01) { if (this.el.paused && !REDUCE) { var p = this.el.play(); if (p && p.catch) p.catch(function () {}); } }
        else if (!this.el.paused) this.el.pause();
      } };
  }
  var wildfire = videoScene('wildfire', '산불 · 확산 예측 및 시설물 취약성 연구', 'Wildfire · spread prediction & facility vulnerability');
  var hearing = videoScene('hearing', '우리는 어떻게 듣는가 · 달팽이관 기저막과 유모세포 — 골전도 청각 연구', 'How we hear · basilar membrane & hair cells — bone-conduction hearing');
  var brainvideo = videoScene('brain', '뇌척수액 흐름과 두개골·뇌 유한요소 모델 (tVAS)', 'CSF flow & skull–brain finite-element model (tVAS)');
  var headvideo = videoScene('head', '두개골·뇌 유한요소 모델 · 진동 전달 해석 (연구실 제작 영상)', 'Skull–brain finite-element model · vibration transmission (lab footage)');
  var earvideo = videoScene('ear', '내이 CT·미로(달팽이관·반고리관) 모델 · 전정계·멀미 연구', 'Inner-ear CT & labyrinth model · vestibular system & motion sickness');
  var shouldervideo = videoScene('sim', '근골격 동적 시뮬레이션 · 어깨 역학', 'Musculoskeletal dynamic simulation · shoulder mechanics');
  var exovideo = videoScene('exo', '발목 엑소부츠 보행 실험 · 동작 예측', 'Ankle exoboot walking experiment · motion prediction');

  /* ---------------- 3D 공용: 카메라(z 위, y 깊이), 조명, 튜브 메시 ---------------- */
  function Cam(cx, cy, scale, yaw, tilt, f) { this.cx = cx; this.cy = cy; this.scale = scale; this.f = f; this.cy0 = Math.cos(yaw); this.sy0 = Math.sin(yaw); this.ct = Math.cos(tilt); this.st = Math.sin(tilt); }
  Cam.prototype.rot = function (p) { var x = p[0] * this.cy0 - p[1] * this.sy0, y = p[0] * this.sy0 + p[1] * this.cy0, z = p[2]; return [x, y * this.ct - z * this.st, y * this.st + z * this.ct]; };
  Cam.prototype.proj = function (p) { var c = this.rot(p), d = this.f / (this.f + c[1]); return { x: this.cx + c[0] * this.scale * d, y: this.cy - c[2] * this.scale * d, depth: c[1] }; };
  var LIGHT = [-0.45, -0.55, 0.70];
  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function shadeOf(cam, n) { var c = cam.rot(n), d = c[0] * LIGHT[0] + c[1] * LIGHT[1] + c[2] * LIGHT[2]; return { s: 0.28 + 0.72 * Math.max(0, d), front: c[1] < 0 }; }
  // 경로(3D 점 배열)를 따라 튜브 사각면 생성 → out에 {p:[4점], depth, s, front}
  function tubeQuads(cam, path, radii, K, out, upv) {
    var n = path.length, rings = [], nrms = [], up = upv || [0, 0, 1];
    for (var i = 0; i < n; i++) {
      var a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], T = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      var N = cross3(T, up); if (Math.hypot(N[0], N[1], N[2]) < 1e-4) N = [1, 0, 0]; N = norm3(N); var B = cross3(N, T);
      var ring = [], nr = [];
      for (var j = 0; j < K; j++) { var ph = j / K * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph), v = [c * N[0] + s * B[0], c * N[1] + s * B[1], c * N[2] + s * B[2]]; nr.push(v); ring.push(cam.proj([path[i][0] + v[0] * radii[i], path[i][1] + v[1] * radii[i], path[i][2] + v[2] * radii[i]])); }
      rings.push(ring); nrms.push(nr);
    }
    for (i = 0; i < n - 1; i++) for (var j2 = 0; j2 < K; j2++) {
      var j3 = (j2 + 1) % K, q = [rings[i][j2], rings[i][j3], rings[i + 1][j3], rings[i + 1][j2]], nv = nrms[i][j2], nv2 = nrms[i][j3];
      var sh = shadeOf(cam, [nv[0] + nv2[0], nv[1] + nv2[1], nv[2] + nv2[2]]);
      out.push({ p: q, depth: (q[0].depth + q[2].depth) / 2, s: sh.s, front: sh.front });
    }
  }
  function fillQuad(q, style, stroke) { ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[1].x, q[1].y); ctx.lineTo(q[2].x, q[2].y); ctx.lineTo(q[3].x, q[3].y); ctx.closePath(); ctx.fillStyle = style; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke(); } }
  function bone(s, a) { return 'rgba(' + Math.round(236 * s) + ',' + Math.round(226 * s) + ',' + Math.round(206 * s) + ',' + a + ')'; }
  function offscreen() { var c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; var x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return { c: c, x: x }; }
  function withCtx(x, fn) { var keep = ctx; ctx = x; fn(); ctx = keep; }

  /* ================= cochlea: 내이 미로 — 3D 음영 달팽이관(달팽이집 형태) + 반고리관 + 기저막 진행파 ================= */
  var cochlea = {
    dim: 0.5, ko: '달팽이관 기저막 진행파 · 골전도 청각 연구', en: 'Basilar-membrane traveling wave · bone-conduction hearing',
    init: function () {
      var S = Math.min(W, HV);
      this.turns = 2.25; this.M = MOBILE ? 90 : 170;
      this.cam = new Cam(MOBILE ? W * 0.5 : W * 0.50, MOBILE ? HV * 0.55 : HV * 0.56, S * (MOBILE ? 0.24 : 0.22), 0.55, 0.62, 5.5);
      var self = this, cam = this.cam;
      this.coil = function (u) { var th = u * self.turns * Math.PI * 2, r = 1.0 - 0.66 * u; return [r * Math.cos(th), r * Math.sin(th), 1.15 * u]; };
      this.rad = function (u) { return 0.30 - 0.16 * u; };
      // 정적 메시(달팽이관 튜브 + 전정 + 반고리관) → 오프스크린 2장(뒷면/앞면)
      var quads = [], path = [], radii = [], n = MOBILE ? 150 : 260;
      for (var i = 0; i <= n; i++) { var u = i / n; path.push(this.coil(u)); radii.push(this.rad(u)); }
      tubeQuads(cam, path, radii, MOBILE ? 10 : 14, quads);
      quads.forEach(function (q) { q.glass = true; });
      // 첨부 캡(작은 구)
      var ap = this.coil(1), sp = [], sr = [];
      for (i = 0; i <= 6; i++) { var t = i / 6, ang = t * Math.PI / 2; sp.push([ap[0], ap[1], ap[2] + 0.14 * Math.sin(ang)]); sr.push(0.14 * Math.cos(ang) + 0.002); }
      tubeQuads(cam, sp, sr, 10, quads);
      // 전정(타원체) + 반고리관 3개 (전반고리관·후반고리관: 수직 45°, 외측반고리관: 수평)
      var vc = [1.30, 0.20, 0.22], vp = [], vr = [];
      for (i = 0; i <= 10; i++) { t = i / 10; ang = -Math.PI / 2 + t * Math.PI; vp.push([vc[0] + 0.36 * Math.sin(ang), vc[1], vc[2]]); vr.push(0.27 * Math.cos(ang) + 0.003); }
      tubeQuads(cam, vp, vr, 12, quads, [0, 0, 1]);
      var canals = [
        { c: [1.55, 0.55, 0.62], e1: [0, 0, 1], e2: norm3([0.7, 0.7, 0]), R: 0.52 },
        { c: [1.75, -0.05, 0.55], e1: [0, 0, 1], e2: norm3([0.7, -0.7, 0]), R: 0.48 },
        { c: [1.70, 0.28, 0.20], e1: [1, 0, 0], e2: [0, 1, 0], R: 0.44 }
      ];
      canals.forEach(function (cn) {
        var cp = [], cr = [], m = MOBILE ? 28 : 44;
        for (var k = 0; k <= m; k++) { var a = 0.15 + (k / m) * (Math.PI * 2 - 0.30), x = cn.c[0] + cn.R * (Math.cos(a) * cn.e1[0] + Math.sin(a) * cn.e2[0]), y = cn.c[1] + cn.R * (Math.cos(a) * cn.e1[1] + Math.sin(a) * cn.e2[1]), z = cn.c[2] + cn.R * (Math.cos(a) * cn.e1[2] + Math.sin(a) * cn.e2[2]); cp.push([x, y, z]); cr.push(0.075 + 0.04 * Math.exp(-Math.pow((k / m - 0.06) / 0.08, 2))); }
        tubeQuads(cam, cp, cr, 8, quads, cn.e1[2] === 1 ? [1, 0, 0] : [0, 0, 1]);
      });
      quads.sort(function (a, b) { return b.depth - a.depth; });
      this.back = offscreen(); this.front = offscreen();
      var bx = this.back.x, fx = this.front.x;
      withCtx(bx, function () { quads.forEach(function (q) { if (q.glass && q.front) return; fillQuad(q.p, bone(q.s * (q.glass ? 0.55 : 1), q.glass ? 0.9 : 0.96), q.glass ? null : 'rgba(0,0,0,0.12)'); }); });
      withCtx(fx, function () { quads.forEach(function (q) { if (!(q.glass && q.front)) return; fillQuad(q.p, bone(q.s, 0.08 + 0.14 * q.s), null); }); });
      // 라벨 위치
      this.pBase = cam.proj(this.coil(0)); this.pApex = cam.proj([ap[0], ap[1], ap[2] + 0.2]); this.pVest = cam.proj([vc[0], vc[1], vc[2] + 0.35]); this.pCan = cam.proj([1.62, 0.55, 1.15]);
      var b0 = this.coil(0), b1 = this.coil(0.004); this.baseDir = norm3([b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]]);
      this.pStapes = cam.proj([b0[0] - this.baseDir[0] * 0.28, b0[1] - this.baseDir[1] * 0.28, b0[2] - this.baseDir[2] * 0.28]);
      this.pStapes2 = cam.proj([b0[0] - this.baseDir[0] * 0.75, b0[1] - this.baseDir[1] * 0.75, b0[2] - this.baseDir[2] * 0.75]);
    },
    wave: function (u, t, up) {
      var env = u <= up ? Math.exp(-Math.pow((u - up) / 0.30, 2)) : Math.exp(-Math.pow((u - up) / 0.09, 2));
      return env * Math.sin(2 * Math.PI * (u * 0.9 + u * u * 2.4) - t * 1.5);
    },
    draw: function (dt, t) {
      var up = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.09)), cam = this.cam, M = this.M, S = Math.min(W, HV);
      ctx.drawImage(this.back.c, 0, 0, W, H);
      // 기저막 리본(튜브 내부, 방사 방향으로 걸쳐진 막) — 진행파 변위를 z로
      var quads = [], SL = 4, prev = null, restI = [], restO = [];
      for (var i = 0; i <= M; i++) {
        var u = i / M, c = this.coil(u), th = u * this.turns * Math.PI * 2, er = [Math.cos(th), Math.sin(th), 0], a = this.rad(u) * 0.86, h = this.wave(u, t, up), row = [];
        for (var j = 0; j <= SL; j++) { var sv = -1 + 2 * j / SL, z = h * a * 1.7 * (1 - sv * sv); var p = cam.proj([c[0] + er[0] * a * sv, c[1] + er[1] * a * sv, c[2] + z]); row.push(p); }
        restI.push(cam.proj([c[0] - er[0] * a, c[1] - er[1] * a, c[2]])); restO.push(cam.proj([c[0] + er[0] * a, c[1] + er[1] * a, c[2]]));
        if (prev) for (j = 0; j < SL; j++) quads.push({ p: [prev[j], prev[j + 1], row[j + 1], row[j]], depth: (prev[j].depth + row[j + 1].depth) / 2, h: h, edge: j === 0 || j === SL - 1 });
        prev = row;
      }
      // 정지 위치(변위 0) 윤곽 — 막이 위아래로 얼마나 움직였는지 기준선
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = white(0.30);
      ctx.beginPath(); for (i = 0; i <= M; i++) { if (i) ctx.lineTo(restI[i].x, restI[i].y); else ctx.moveTo(restI[i].x, restI[i].y); } ctx.stroke();
      ctx.beginPath(); for (i = 0; i <= M; i++) { if (i) ctx.lineTo(restO[i].x, restO[i].y); else ctx.moveTo(restO[i].x, restO[i].y); } ctx.stroke(); ctx.setLineDash([]);
      quads.sort(function (a, b) { return b.depth - a.depth; });
      for (i = 0; i < quads.length; i++) { var q = quads[i], hm = q.h; fillQuad(q.p, hm > 0 ? crest(hm, 0.8 + 0.2 * hm) : 'rgba(150,105,25,' + (0.8 + 0.2 * hm) + ')', hm > 0.15 ? white(0.4 + 0.5 * hm) : amber(0.55)); }
      // 변위 표시선: 정지 위치 → 현재 막 (일정 간격)
      ctx.lineWidth = 1; for (i = 0; i <= M; i += Math.round(M / 26)) { var uu = i / M, cc = this.coil(uu), hh = this.wave(uu, t, up) * this.rad(uu) * 0.86 * 1.7; var p0 = cam.proj(cc), p1 = cam.proj([cc[0], cc[1], cc[2] + hh]); ctx.strokeStyle = hh > 0 ? white(0.45) : amber(0.45); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
      // 최대 응답 글로우
      var pc = this.coil(up), pk = cam.proj([pc[0], pc[1], pc[2] + 0.1]);
      var g = ctx.createRadialGradient(pk.x, pk.y, 0, pk.x, pk.y, S * 0.16); g.addColorStop(0, amber(0.35)); g.addColorStop(0.5, amber(0.10)); g.addColorStop(1, amber(0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this.front.c, 0, 0, W, H);      // 반투명 앞면(유리 같은 뼈 벽)
      // 등골(피스톤) — 난원창(기저부 입구)을 밀어 넣음
      var ps = this.pStapes, p2 = this.pStapes2, dx = ps.x - p2.x, dy = ps.y - p2.y, dl = Math.hypot(dx, dy) || 1, tx = dx / dl, ty = dy / dl, nx = -ty, ny = tx, push = Math.sin(t * 1.5) * 3.5;
      var fx = ps.x + tx * push, fy = ps.y + ty * push, fw = S * 0.05;
      ctx.lineWidth = 4; ctx.strokeStyle = white(0.9); ctx.beginPath(); ctx.moveTo(fx - nx * fw, fy - ny * fw); ctx.lineTo(fx + nx * fw, fy + ny * fw); ctx.stroke();
      var hx = fx - tx * S * 0.07, hy = fy - ty * S * 0.07;
      ctx.lineWidth = 2.5; ctx.strokeStyle = white(0.7); ctx.beginPath(); ctx.moveTo(fx - nx * fw * 0.8, fy - ny * fw * 0.8); ctx.lineTo(hx, hy); ctx.lineTo(fx + nx * fw * 0.8, fy + ny * fw * 0.8); ctx.stroke();
      ctx.fillStyle = white(0.95); ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill();
      var per = 2 * Math.PI / 1.5, ph = (t % per) / per, ba = Math.atan2(-ty, -tx);
      for (var r = 0; r < 4; r++) { var rr = (ph + r / 4) % 1; ctx.beginPath(); ctx.arc(hx, hy, 8 + rr * S * 0.09, ba - 0.6, ba + 0.6); ctx.strokeStyle = white(0.55 * (1 - rr)); ctx.lineWidth = 1.3; ctx.stroke(); }
      // 라벨
      label(L('음파 (등골 → 난원창)', 'sound (stapes → oval window)'), hx - tx * S * 0.10, hy - ty * S * 0.10 + 4, tx > 0 ? 'right' : 'left', 0.7);
      label(L('달팽이관 (기저막 진행파)', 'cochlea · traveling wave'), cam.cx, cam.cy + S * 0.30, 'center', 0.8);
      label(L('첨부 (저주파)', 'apex · low f'), this.pApex.x, this.pApex.y - 8, 'center', 0.6);
      label(L('기저부 (고주파)', 'base · high f'), this.pBase.x, this.pBase.y + 30, 'center', 0.6);
      label(L('전정', 'vestibule'), this.pVest.x, this.pVest.y - 6, 'center', 0.6);
      label(L('반고리관 (평형 감각)', 'semicircular canals'), this.pCan.x, this.pCan.y - 6, 'center', 0.7);
      label(L('최대 응답', 'peak'), pk.x, pk.y - 22, 'center', 0.7);
    }
  };

  /* ================= shoulder: 실제 해부학 윤곽(견갑골·쇄골·상완골) + 외전 운동 + FE 응력 ================= */
  var shoulder = {
    ko: '어깨 관절 유한요소 해석 · 회전근개 연구', en: 'Shoulder finite-element analysis · rotator cuff',
    init: function () {
      var S = Math.min(W, HV), R = S * (MOBILE ? 0.11 : 0.12);
      this.R = R; this.G = MOBILE ? { x: W * 0.46, y: HV * 0.40 } : { x: W * 0.47, y: HV * (COMPACT ? 0.52 : 0.44) };
      this.head = { r: 0.62, rings: MOBILE ? 4 : 6, sect: MOBILE ? 18 : 28 };
      this.shaft = { rows: MOBILE ? 6 : 10, cols: MOBILE ? 4 : 5, len: 1.5, w0: 0.56, w1: 0.52 };
      this.bar = { x: W * (MOBILE ? 0.84 : 0.56), y: HV * (MOBILE ? 0.62 : 0.72), w: 10, h: Math.min(90, HV * 0.12) };
      // 견갑골 몸통(앞면 보기, 오른쪽 어깨: 안쪽 경계 왼쪽, 관절와 오른쪽)
      this.scap = resample([[-0.36, -0.62], [-0.58, -0.82], [-0.78, -1.02], [-1.10, -1.10], [-1.55, -0.98], [-1.78, -0.55], [-1.86, 0.05], [-1.80, 0.70], [-1.62, 1.30], [-1.36, 1.82], [-1.12, 1.56], [-0.78, 0.98], [-0.52, 0.58], [-0.36, 0.56], [-0.50, 0.0]], 90);
      this.coracoid = resample([[-0.66, -0.78], [-0.62, -1.02], [-0.36, -1.18], [0.04, -1.14], [0.14, -0.98], [-0.14, -0.94], [-0.42, -0.86]], 40);
      this.acromion = resample([[-0.40, -1.24], [0.08, -1.38], [0.56, -1.32], [0.74, -1.12], [0.60, -0.98], [0.26, -1.02], [-0.18, -1.06]], 40);
      this.clav = resample([[-2.50, -1.30], [-2.40, -1.48], [-1.70, -1.60], [-0.95, -1.42], [-0.25, -1.44], [0.42, -1.30], [0.46, -1.16], [-0.20, -1.26], [-0.95, -1.24], [-1.70, -1.42], [-2.40, -1.32]], 70);
      // 상완골(국소 좌표: x 바깥쪽, y 아래 = 뼈축) — 골두·해부학적 경부·대결절·외과적 경부·삼각근 조면
      this.hum = resample([[-0.62, -0.06], [-0.58, -0.32], [-0.42, -0.52], [-0.20, -0.61], [0.06, -0.62], [0.28, -0.56], [0.40, -0.64], [0.60, -0.62], [0.72, -0.44], [0.68, -0.22], [0.58, -0.06], [0.44, 0.16], [0.32, 0.46], [0.30, 1.20], [0.36, 1.80], [0.30, 2.40], [0.30, 3.30], [-0.26, 3.30], [-0.26, 2.00], [-0.28, 1.00], [-0.30, 0.46], [-0.46, 0.20], [-0.58, 0.06]], 110);
      this.cuff = [{ from: [-1.30, -0.95], to: [0.50, -0.62], via: [-0.30, -1.0], n: 'sup' }, { from: [-1.40, 0.40], to: [-0.06, -0.14], via: [-0.8, 0.2], n: 'sub' }, { from: [-1.20, 1.00], to: [0.64, -0.28], via: [-0.4, 0.6], n: 'inf' }];
    },
    P: function (p, rot) { var R = this.R, px = p[0] * R, py = p[1] * R, pvx = -1.0 * R, pvy = 0.6 * R, cs = Math.cos(rot), sn = Math.sin(rot), dx = px - pvx, dy = py - pvy; return { x: this.G.x + pvx + dx * cs - dy * sn, y: this.G.y + pvy + dx * sn + dy * cs }; },
    boneFill: function (pts, cx, cy, r) { var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 1.6); g.addColorStop(0, 'rgba(240,232,214,0.96)'); g.addColorStop(1, 'rgba(184,170,142,0.96)'); tracePath(pts, true); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(110,96,70,0.9)'; ctx.stroke(); },
    draw: function (dt, t) {
      var R = this.R, G = this.G, abd = 0.10 + 0.72 * (0.5 - 0.5 * Math.cos(t * 0.55)), load = 0.55 + 0.45 * Math.sin(t * 0.55 - 0.6), srot = -abd * 0.33;
      var self = this, P = function (p) { return self.P(p, srot); }, Pm = function (pts) { return pts.map(function (p) { var q = P(p); return [q.x, q.y]; }); };
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(236,226,206,0.10)';
      for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(G.x - 3.2 * R, G.y + (0.3 + i * 0.75) * R, 1.9 * R, -0.55, 0.55); ctx.stroke(); }
      var C = P([0.18, 0]);
      // 견갑골 몸통 + 관절와(오목) + 견갑극 + 오훼돌기
      var sc = Pm(this.scap);
      this.boneFill(sc, G.x - R, G.y + R * 0.3, R * 1.6);
      ctx.beginPath(); ctx.arc(C.x, C.y, 0.68 * R, Math.PI * 0.69 + srot, Math.PI * 1.31 + srot, false); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(160,210,240,0.85)'; ctx.stroke(); // 관절와 연골
      var s1 = P([-1.66, -0.62]), s2 = P([-0.40, -1.20]); ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(120,105,78,0.45)'; ctx.stroke();
      this.boneFill(Pm(this.coracoid), G.x - R * 0.3, G.y - R, R * 0.6);
      // 상완골(외전만큼 회전) — 뼈 실루엣 + FE 요소망(근위부)
      var cs = Math.cos(-abd), sn = Math.sin(-abd), H2 = function (p) { return [C.x + (p[0] * cs - p[1] * sn) * R, C.y + (p[0] * sn + p[1] * cs) * R]; };
      var hp = this.hum.map(H2); this.boneFill(hp, C.x, C.y + R * 0.6, R * 1.4);
      var ca = Math.PI + srot - abd * 0.35, contact = { x: C.x + 0.62 * R * Math.cos(ca), y: C.y + 0.62 * R * Math.sin(ca) };
      ctx.save(); tracePath(hp, true); ctx.clip();
      var hd = this.head, hr = hd.r * R;
      for (var ri = 0; ri < hd.rings; ri++) { var r0 = hr * ri / hd.rings, r1 = hr * (ri + 1) / hd.rings;
        for (var si = 0; si < hd.sect; si++) { var a0 = si / hd.sect * Math.PI * 2, a1 = (si + 1) / hd.sect * Math.PI * 2, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
          var sv = Math.exp(-Math.hypot(C.x + rm * Math.cos(am) - contact.x, C.y + rm * Math.sin(am) - contact.y) / (hr * 0.75)) * load;
          ctx.fillStyle = heat(sv, 0.82); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath();
          ctx.moveTo(C.x + r0 * Math.cos(a0), C.y + r0 * Math.sin(a0)); ctx.lineTo(C.x + r1 * Math.cos(a0), C.y + r1 * Math.sin(a0)); ctx.lineTo(C.x + r1 * Math.cos(a1), C.y + r1 * Math.sin(a1)); ctx.lineTo(C.x + r0 * Math.cos(a1), C.y + r0 * Math.sin(a1)); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
      var sh = this.shaft, dir = { x: Math.sin(abd), y: Math.cos(abd) }, nrm = { x: dir.y, y: -dir.x }, l0 = hr * 0.8, L1 = sh.len * R;
      for (var rw = 0; rw < sh.rows; rw++) { var la = l0 + L1 * rw / sh.rows, lb = l0 + L1 * (rw + 1) / sh.rows, wa = lerp(sh.w0, sh.w1, rw / sh.rows) * R * 1.3, wb = lerp(sh.w0, sh.w1, (rw + 1) / sh.rows) * R * 1.3;
        for (var cl2 = 0; cl2 < sh.cols; cl2++) { var u0 = cl2 / sh.cols - 0.5, u1 = (cl2 + 1) / sh.cols - 0.5, bend = Math.abs((u0 + u1) / 2) * 2 * (1 - rw / sh.rows) * load * 0.7;
          ctx.fillStyle = heat(bend, 0.72); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath();
          ctx.moveTo(C.x + dir.x * la + nrm.x * u0 * wa, C.y + dir.y * la + nrm.y * u0 * wa); ctx.lineTo(C.x + dir.x * lb + nrm.x * u0 * wb, C.y + dir.y * lb + nrm.y * u0 * wb); ctx.lineTo(C.x + dir.x * lb + nrm.x * u1 * wb, C.y + dir.y * lb + nrm.y * u1 * wb); ctx.lineTo(C.x + dir.x * la + nrm.x * u1 * wa, C.y + dir.y * la + nrm.y * u1 * wa); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
      ctx.restore();
      // 골두 연골 + 소결절·이두근구 표시
      ctx.beginPath(); ctx.arc(C.x, C.y, hr + 1.5, Math.PI * 0.85 - abd, Math.PI * 1.75 - abd); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(160,210,240,0.7)'; ctx.stroke();
      var lt = H2([-0.06, -0.24]); ctx.beginPath(); ctx.ellipse(lt[0], lt[1], R * 0.12, R * 0.09, -abd, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(110,96,70,0.7)'; ctx.stroke();
      var g1 = H2([0.18, -0.40]), g2 = H2([0.20, 0.30]); ctx.beginPath(); ctx.moveTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.stroke();
      // 회전근개(근육 색) — 견갑골 → 결절
      for (i = 0; i < this.cuff.length; i++) { var cf = this.cuff[i], f = P(cf.from), v = P(cf.via), a = H2(cf.to), tension = 0.35 + 0.65 * Math.max(0, Math.cos((i - 1) * 0.9 + abd * 0.8)) * load;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(v.x, v.y, a[0], a[1]); ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(214,92,72,' + (0.45 + 0.5 * tension) + ')'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,200,180,' + (0.2 + 0.4 * tension) + ')'; ctx.stroke(); ctx.lineCap = 'butt'; }
      // 견봉·쇄골(앞에 그림)
      this.boneFill(Pm(this.acromion), G.x + R * 0.2, G.y - R * 1.2, R * 0.6);
      this.boneFill(Pm(this.clav), G.x - R, G.y - R * 1.4, R * 1.4);
      // 외전 각도
      var deg = Math.round(abd * 180 / Math.PI);
      ctx.beginPath(); ctx.arc(C.x, C.y, R * 1.9, Math.PI / 2 - abd, Math.PI / 2); ctx.lineWidth = 1; ctx.strokeStyle = white(0.45); ctx.stroke();
      ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(C.x, C.y + hr); ctx.lineTo(C.x, C.y + R * 2.1); ctx.stroke(); ctx.setLineDash([]);
      label(L('외전 ', 'abduction ') + deg + '°', C.x + R * 2.0 * Math.sin(abd / 2) + 10, C.y + R * 2.0 * Math.cos(abd / 2), 'left', 0.75);
      // 라벨
      var lp = P([-1.25, 0.55]); label(L('견갑골', 'scapula'), lp.x, lp.y, 'center', 0.7);
      lp = P([-1.5, -1.80]); label(L('쇄골', 'clavicle'), lp.x, lp.y, 'center', 0.7);
      lp = P([0.55, -1.50]); label(L('견봉', 'acromion'), lp.x, lp.y, 'center', 0.6);
      lp = P([-0.55, -1.30]); label(L('오훼돌기', 'coracoid'), lp.x - 14, lp.y + 12, 'right', 0.5);
      lp = H2([0.9, -0.5]); label(L('대결절', 'greater tubercle'), lp[0] + 4, lp[1], 'left', 0.5);
      lp = H2([0.5, 2.6]); label(L('상완골', 'humerus'), lp[0] + 6, lp[1], 'left', 0.7);
      lp = P([-1.1, 1.25]); label(L('회전근개', 'rotator cuff'), lp.x, lp.y + 16, 'center', 0.6); ctx.fillStyle = 'rgba(214,92,72,0.9)'; ctx.fillRect(lp.x - 30, lp.y + 21, 60, 2);
      var b = this.bar; for (var k = 0; k < 24; k++) { ctx.fillStyle = heat(1 - k / 23, 0.95); ctx.fillRect(b.x, b.y + b.h * k / 24, b.w, b.h / 24 + 1); }
      label('von Mises', b.x + 15, b.y + 10, 'left', 0.6); label('max', b.x + 15, b.y + 24, 'left', 0.55); label('0', b.x + 15, b.y + b.h, 'left', 0.55);
    }
  };

  /* ================= skull: 실제 옆모습 두개골(두꺼운 두개관·안와·광대활·하악골·치아) + 뇌 — 진동 전달(tVAS) ================= */
  var skull = {
    ko: '두개골 진동 전달 · 뇌척수액 응답 (tVAS)', en: 'Skull-borne vibration · CSF response (tVAS)',
    init: function () {
      var S = Math.min(W, HV), s = S * (MOBILE ? 0.40 : 0.33);
      this.s = s; this.c = MOBILE ? { x: W * 0.5, y: HV * 0.5 } : { x: W * 0.47, y: HV * 0.55 };
      var self = this, T = function (p) { return [self.c.x + p[0] * s, self.c.y + p[1] * s]; };
      var vault = [[-0.80, -0.14], [-0.85, -0.34], [-0.81, -0.54], [-0.69, -0.72], [-0.49, -0.86], [-0.25, -0.96], [0.06, -1.00], [0.36, -0.96], [0.62, -0.84], [0.80, -0.64], [0.92, -0.40], [0.95, -0.12], [0.91, 0.14], [0.80, 0.36], [0.64, 0.50], [0.50, 0.56]];
      var face = [[0.44, 0.63], [0.36, 0.52], [0.30, 0.44], [0.10, 0.50], [-0.10, 0.60], [-0.40, 0.66], [-0.58, 0.64], [-0.68, 0.56], [-0.74, 0.44], [-0.81, 0.32], [-0.85, 0.16], [-0.91, 0.00], [-0.86, -0.08]];
      this.N = MOBILE ? 90 : 160;
      var outer = resample(vault.concat(face).map(T), this.N), cen = T([0.05, -0.20]);
      this.vault = outer; this.nrm = []; this.inner = [];
      for (var i = 0; i < this.N; i++) { var a = outer[(i + 1) % this.N], b = outer[(i - 1 + this.N) % this.N], dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; this.nrm.push([dy / l, -dx / l]); var vx = cen[0] - outer[i][0], vy = cen[1] - outer[i][1], vl = Math.hypot(vx, vy) || 1; this.inner.push([outer[i][0] + vx / vl * s * 0.075, outer[i][1] + vy / vl * s * 0.075]); }
      this.vaultN = Math.round(this.N * vault.length / (vault.length + face.length));   // 두개관 구간(진동 표시)
      this.facePoly = resample(face.concat([[-0.70, 0.06], [-0.30, 0.26], [0.10, 0.36], [0.34, 0.42], [0.44, 0.50]]).map(T), 70);
      this.mand = resample([[0.30, 0.44], [0.37, 0.60], [0.35, 0.82], [0.12, 0.96], [-0.30, 1.00], [-0.54, 0.92], [-0.60, 0.78], [-0.56, 0.70], [-0.20, 0.70], [0.08, 0.60], [0.20, 0.50], [0.26, 0.40]].map(T), 60);
      this.orbit = T([-0.57, -0.12]); this.orbitR = [0.17 * s, 0.15 * s];
      this.zyg = resample([[-0.64, 0.14], [-0.30, 0.08], [0.30, 0.12], [0.34, 0.20], [-0.28, 0.18], [-0.62, 0.24]].map(T), 40);
      this.ear = T([0.40, 0.30]);
      this.teethU = []; this.teethL = []; for (var k = 0; k < 6; k++) { this.teethU.push(T([-0.62 + k * 0.085, 0.58 + k * 0.012])); this.teethL.push(T([-0.60 + k * 0.085, 0.70 + k * 0.006])); }
      this.brain = resample([[-0.66, -0.10], [-0.72, -0.34], [-0.66, -0.56], [-0.50, -0.72], [-0.26, -0.84], [0.04, -0.88], [0.32, -0.84], [0.56, -0.72], [0.72, -0.52], [0.80, -0.28], [0.78, -0.02], [0.68, 0.16], [0.50, 0.24], [0.30, 0.32], [0.06, 0.36], [-0.20, 0.32], [-0.44, 0.20], [-0.60, 0.06]].map(T), 80);
      this.brainC = T([0.06, -0.26]);
      var seed = 7, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      this.sulci = []; for (i = 0; i < 12; i++) { var x0 = -0.55 + rnd() * 1.2, y0 = -0.75 + rnd() * 0.95, ang = rnd() * Math.PI, ln = 0.18 + rnd() * 0.2, pts = []; for (k = 0; k <= 6; k++) { var tt = k / 6; pts.push(T([x0 + Math.cos(ang) * ln * tt + Math.sin(tt * 9 + i) * 0.03, y0 + Math.sin(ang) * ln * tt + Math.cos(tt * 7 + i) * 0.03])); } this.sulci.push(pts); }
      this.fissure = [T([-0.50, -0.02]), T([-0.05, -0.12]), T([0.40, -0.26])];
      this.cereb = T([0.52, 0.36]); this.stem = [T([0.30, 0.42]), T([0.38, 0.64])];
      this.nodes = []; var rings = MOBILE ? 5 : 8;
      for (var r = 1; r <= rings; r++) { var q = r / (rings + 0.6), step = MOBILE ? 8 : 5; for (i = 0; i < this.brain.length; i += step) { var p = this.brain[i]; this.nodes.push({ x: this.brainC[0] + (p[0] - this.brainC[0]) * q, y: this.brainC[1] + (p[1] - this.brainC[1]) * q }); } }
      this.act = [T([0.47, 0.60]), T([0.06, -1.0])]; this.L = s * 1.1;
    },
    field: function (x, y, t) { var u = 0; for (var i = 0; i < 2; i++) { var d = Math.hypot(x - this.act[i][0], y - this.act[i][1]); u += Math.cos(d / 24 - t * 6.5) * Math.exp(-d / this.L); } return u * 0.55; },
    draw: function (dt, t) {
      var s = this.s, N = this.N, o = this.vault, nr = this.nrm, inn = this.inner, VN = this.vaultN;
      // 두개관(두꺼운 뼈 판): 바깥 윤곽 + 안쪽 윤곽 사이 채움, 진동 변위 반영
      var disp = new Array(N); for (var i = 0; i < N; i++) disp[i] = i < VN ? this.field(o[i][0], o[i][1], t) * 9 : 0;
      var g = ctx.createLinearGradient(0, this.c.y - s, 0, this.c.y + s); g.addColorStop(0, 'rgba(238,230,212,0.85)'); g.addColorStop(1, 'rgba(180,166,138,0.85)');
      ctx.beginPath();
      for (i = 0; i <= VN; i++) { var k = i % N, x = o[k][0] + nr[k][0] * disp[k], y = o[k][1] + nr[k][1] * disp[k]; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      for (i = VN; i >= 0; i--) { k = i % N; ctx.lineTo(inn[k][0] + nr[k][0] * disp[k] * 0.8, inn[k][1] + nr[k][1] * disp[k] * 0.8); }
      ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(110,96,70,0.9)'; ctx.stroke();
      // 안면골(상악·측두저) — 두개강은 비워 둠
      tracePath(this.facePoly, true); ctx.fillStyle = 'rgba(214,202,178,0.88)'; ctx.fill(); ctx.stroke();
      // 안와·비강·광대활·귓구멍
      ctx.beginPath(); ctx.ellipse(this.orbit[0], this.orbit[1], this.orbitR[0], this.orbitR[1], -0.15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,36,30,0.85)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(110,96,70,0.9)'; ctx.stroke();
      tracePath(this.zyg, true); ctx.fillStyle = 'rgba(232,222,202,0.95)'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.ear[0], this.ear[1], s * 0.045, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,36,30,0.9)'; ctx.fill(); ctx.stroke();
      // 하악골 + 치아
      tracePath(this.mand, true); ctx.fillStyle = 'rgba(226,216,194,0.95)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(250,247,238,0.95)'; ctx.lineWidth = 0.8;
      for (i = 0; i < 6; i++) { var tu = this.teethU[i], tl = this.teethL[i]; ctx.fillRect(tu[0] - s * 0.032, tu[1] - s * 0.045, s * 0.064, s * 0.06); ctx.strokeRect(tu[0] - s * 0.032, tu[1] - s * 0.045, s * 0.064, s * 0.06); ctx.fillRect(tl[0] - s * 0.032, tl[1] - s * 0.012, s * 0.064, s * 0.06); ctx.strokeRect(tl[0] - s * 0.032, tl[1] - s * 0.012, s * 0.064, s * 0.06); }
      // 뇌(대뇌 주름·외측열·소뇌·뇌간) — 진동장에 따라 밝기
      var bf = Math.abs(this.field(this.brainC[0], this.brainC[1], t));
      tracePath(this.brain, true); ctx.fillStyle = 'rgba(232,184,32,' + (0.16 + 0.12 * bf) + ')'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.8); ctx.stroke();
      ctx.save(); tracePath(this.brain, true); ctx.clip(); ctx.strokeStyle = amber(0.42); ctx.lineWidth = 1.2;
      for (i = 0; i < this.sulci.length; i++) { var sp = this.sulci[i]; ctx.beginPath(); for (k = 0; k < sp.length; k++) { if (k) ctx.lineTo(sp[k][0], sp[k][1]); else ctx.moveTo(sp[k][0], sp[k][1]); } ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(this.fissure[0][0], this.fissure[0][1]); ctx.quadraticCurveTo(this.fissure[1][0], this.fissure[1][1], this.fissure[2][0], this.fissure[2][1]); ctx.lineWidth = 2; ctx.strokeStyle = amber(0.6); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.ellipse(this.cereb[0], this.cereb[1], s * 0.21, s * 0.14, 0.25, 0, Math.PI * 2); ctx.fillStyle = amber(0.10); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.65); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = amber(0.4); for (i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(this.cereb[0], this.cereb[1], s * 0.19, s * 0.12, 0.25, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(this.cereb[0] - s * 0.17, this.cereb[1] + i * s * 0.045); ctx.lineTo(this.cereb[0] + s * 0.17, this.cereb[1] + i * s * 0.045); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(this.stem[0][0], this.stem[0][1]); ctx.lineTo(this.stem[1][0], this.stem[1][1]); ctx.lineWidth = 6; ctx.strokeStyle = amber(0.5); ctx.stroke();
      // 뇌 내부 응답 노드(뇌 윤곽을 축소한 등고선 배치)
      for (k = 0; k < this.nodes.length; k++) { var p = this.nodes[k], v = this.field(p.x, p.y, t), m = Math.abs(v); ctx.fillStyle = m > 0.3 ? amber(0.4 + 0.6 * m) : white(0.2 + 0.4 * m); ctx.beginPath(); ctx.arc(p.x + v * 3, p.y + v * 3, 1.4 + 3.2 * m, 0, Math.PI * 2); ctx.fill(); }
      // 두개관 위 진동 에너지 점
      for (var j = 0; j < VN; j += 2) { var e = Math.abs(this.field(o[j][0], o[j][1], t)); ctx.fillStyle = amber(0.3 + 0.7 * e); ctx.beginPath(); ctx.arc(o[j][0] + nr[j][0] * disp[j], o[j][1] + nr[j][1] * disp[j], 1.5 + 3 * e, 0, Math.PI * 2); ctx.fill(); }
      // 진동자 + 파면 링
      var per = 2 * Math.PI / 6.5, ph = (t % per) / per;
      for (var q = 0; q < 2; q++) { var A = this.act[q];
        ctx.fillStyle = amber(1); ctx.beginPath(); ctx.arc(A[0], A[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = white(0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(A[0], A[1], 10, 0, Math.PI * 2); ctx.stroke();
        for (var r = 0; r < 4; r++) { var rr = (ph + r / 4) % 1; ctx.beginPath(); ctx.arc(A[0], A[1], 12 + rr * this.L * 1.2, 0, Math.PI * 2); ctx.strokeStyle = amber(0.45 * (1 - rr)); ctx.lineWidth = 1; ctx.stroke(); } }
      label('40 Hz tVAS ' + L('(유양돌기)', '(mastoid)'), this.act[0][0] + 16, this.act[0][1] + 26, 'left', 0.75);
      label('40 Hz tVAS ' + L('(정수리)', '(vertex)'), this.act[1][0], this.act[1][1] - 18, 'center', 0.75);
      label(L('두개골', 'skull'), this.c.x - s * 0.98, this.c.y - s * 0.66, 'right', 0.65);
      label(L('뇌 · 뇌척수액 응답', 'brain · CSF response'), this.brainC[0], this.brainC[1] + s * 0.02, 'center', 0.8);
      label(L('진동 전파 경로', 'vibration path'), this.c.x + s * 1.02, this.c.y + s * 0.02, 'left', 0.55);
    }
  };

  /* ================= exoboot: 발목 엑소부츠 — 보행 주기와 보조 토크 ================= */
  var exoboot = {
    dim: 0.85, ko: '발목 엑소부츠 · 보행 보조 토크 제어', en: 'Ankle exoboot · walking-assist torque control',
    init: function () {
      var S = Math.min(W, HV);
      this.u = S * (MOBILE ? 0.20 : 0.15);                       // 하퇴(정강이) 길이 단위
      this.hip = MOBILE ? { x: W * 0.45, y: HV * 0.22 } : { x: W * 0.50, y: HV * (COMPACT ? 0.36 : 0.30) };
      this.ground = this.hip.y + this.u * 2.45; this.period = 1.25;
      this.plot = MOBILE ? { x: W * 0.08, y: HV * 0.80, w: W * 0.84, h: HV * 0.12 } : COMPACT ? { x: W * 0.06, y: HV * 0.55, w: W * 0.28, h: HV * 0.22 } : { x: W * 0.63, y: HV * 0.73, w: W * 0.28, h: HV * 0.10 };
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
      var S = Math.min(W, HV), s = S * (MOBILE ? 0.30 : 0.27);
      this.s = s; this.c = MOBILE ? { x: W * 0.5, y: HV * 0.48 } : { x: W * 0.47, y: HV * 0.52 };
      // 실제 머리 옆모습(코·입·턱·귀·목)
      this.head = resample([[-0.20, -1.0], [0.25, -0.98], [0.60, -0.80], [0.78, -0.45], [0.80, -0.05], [0.72, 0.35], [0.55, 0.62], [0.38, 0.82], [0.30, 1.05], [-0.10, 1.05], [-0.38, 0.92], [-0.50, 0.76], [-0.44, 0.62], [-0.52, 0.52], [-0.46, 0.42], [-0.62, 0.28], [-0.66, 0.18], [-0.52, 0.02], [-0.56, -0.20], [-0.62, -0.45], [-0.52, -0.75], [-0.25, -0.95]], MOBILE ? 60 : 110);
      this.win = MOBILE ? { x: W * 0.06, y: HV * 0.10, w: W * 0.88, h: HV * 0.28 } : COMPACT ? { x: W * 0.04, y: HV * 0.18, w: W * 0.30, h: HV * 0.30 } : { x: W * 0.63, y: HV * 0.72, w: W * 0.28, h: HV * 0.11 };
      this.gauge = MOBILE ? { x: W * 0.08, y: HV * 0.42, w: W * 0.84 } : COMPACT ? { x: W * 0.04, y: HV * 0.62, w: W * 0.30 } : { x: W * 0.07, y: HV * 0.80, w: W * 0.30 };
    },
    draw: function (dt, t) {
      var s = this.s, c = this.c, roll = 0.16 * Math.sin(t * 1.1), vis = 0.16 * Math.sin(t * 1.1 - 1.4);
      var w = this.win; ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
      ctx.translate(w.x + w.w / 2, w.y + w.h * 0.55); ctx.rotate(vis);
      ctx.fillStyle = 'rgba(232,184,32,0.12)'; ctx.fillRect(-w.w, 0, 2 * w.w, w.h); ctx.strokeStyle = white(0.75); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w.w, 0); ctx.lineTo(w.w, 0); ctx.stroke();
      ctx.strokeStyle = white(0.2); ctx.lineWidth = 1; for (var i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * w.w * 0.12 - (t * 30 % (w.w * 0.12)), 0); ctx.lineTo(i * w.w * 0.35 - (t * 30 % (w.w * 0.12)) * 3, w.h); ctx.stroke(); }
      ctx.restore(); ctx.strokeStyle = white(0.5); ctx.lineWidth = 1.5; ctx.strokeRect(w.x, w.y, w.w, w.h);
      label(L('시각 입력 (창밖 수평선)', 'visual input (window)'), w.x + 6, w.y - 8, 'left', 0.6);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(roll);
      ctx.beginPath(); for (i = 0; i < this.head.length; i++) { var p = this.head[i]; if (i) ctx.lineTo(p[0] * s, p[1] * s); else ctx.moveTo(p[0] * s, p[1] * s); } ctx.closePath();
      var hg = ctx.createLinearGradient(-s, 0, s, 0); hg.addColorStop(0, 'rgba(255,255,255,0.10)'); hg.addColorStop(1, 'rgba(255,255,255,0.03)'); ctx.fillStyle = hg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = white(0.8); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.30 * s, 0.05 * s, 0.07 * s, 0.12 * s, 0.15, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = white(0.55); ctx.stroke();   // 귀
      ctx.beginPath(); ctx.ellipse(-0.40 * s, -0.22 * s, 0.06 * s, 0.035 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(-0.40 * s, -0.22 * s, 0.018 * s, 0, Math.PI * 2); ctx.fillStyle = white(0.7); ctx.fill(); // 눈
      var ex = 0.36 * s, ey = 0.02 * s, flow = -roll * 4;
      var canals = [{ rx: 0.12, ry: 0.17, rot: -0.4, dx: 0.02, dy: -0.15 }, { rx: 0.11, ry: 0.15, rot: 0.55, dx: 0.13, dy: -0.11 }, { rx: 0.15, ry: 0.06, rot: 0.1, dx: 0.09, dy: 0.02 }];
      for (i = 0; i < 3; i++) { var cn = canals[i]; ctx.beginPath(); ctx.ellipse(ex + cn.dx * s, ey + cn.dy * s, cn.rx * s, cn.ry * s, cn.rot, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = amber(0.2); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.95); ctx.stroke();
        for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2 + t * 1.5 * flow, px = ex + cn.dx * s + Math.cos(cn.rot) * cn.rx * s * Math.cos(a) - Math.sin(cn.rot) * cn.ry * s * Math.sin(a), py = ey + cn.dy * s + Math.sin(cn.rot) * cn.rx * s * Math.cos(a) + Math.cos(cn.rot) * cn.ry * s * Math.sin(a); ctx.fillStyle = white(0.9); ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); } }
      ctx.beginPath(); for (i = 0; i <= 60; i++) { var u = i / 60, th = u * 2.2 * Math.PI * 2, r = 0.09 * s * (1 - 0.8 * u), qx = ex - 0.02 * s + r * Math.cos(th), qy = ey + 0.17 * s + r * Math.sin(th); if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); } ctx.lineWidth = 1.5; ctx.strokeStyle = amber(0.7); ctx.stroke();
      ctx.restore();
      ctx.setLineDash([3, 5]); ctx.strokeStyle = white(0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x, c.y - s * 1.25); ctx.lineTo(c.x, c.y + s * 1.2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = amber(0.8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - Math.sin(roll) * s * 1.2, c.y - Math.cos(roll) * s * 1.2); ctx.stroke();
      label(L('전정 입력 (머리 기울기 ', 'vestibular input (head tilt ') + Math.round(roll * 180 / Math.PI) + '°)', c.x, c.y + s * 1.32, 'center', 0.65);
      label(L('내이: 반고리관 · 내림프 흐름', 'inner ear: canals · endolymph'), c.x + s * 0.85, c.y - s * 0.45, 'left', 0.65);
      var conf = Math.abs(roll - vis) / 0.32, gg = this.gauge;
      ctx.fillStyle = white(0.12); ctx.fillRect(gg.x, gg.y, gg.w, 6); ctx.fillStyle = heat(conf, 0.95); ctx.fillRect(gg.x, gg.y, gg.w * clamp01(conf), 6);
      label(L('감각 불일치 → 멀미 유발도', 'sensory conflict → sickness'), gg.x, gg.y - 8, 'left', 0.65);
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
    ko: '주요 논문', en: 'Selected publications', each: 10, fade: 1.3,
    init: function () {
      if (!this.items) {
        this.items = []; var self = this;
        document.querySelectorAll('.pub-item').forEach(function (el) {
          if (self.items.length >= 12) return;
          var img = el.querySelector('.pub-thumb img'), h3 = el.querySelector('h3'), j = el.querySelector('.pub-journal'), v = el.querySelector('.pub-vol'), au = el.querySelector('.pub-authors'), im = null;
          if (img) { im = new Image(); im.decoding = 'async'; im.src = img.getAttribute('src'); }
          self.items.push({ title: h3 ? h3.textContent.trim() : '', journal: j ? j.textContent.trim() : '', vol: v ? v.textContent.trim() : '', authors: au ? au.textContent.trim() : '', im: im });
        });
      }
      var S = Math.min(W, HV);
      this.pw = MOBILE ? W * 0.9 : Math.min(W * 0.52, HV * 0.95); this.px = MOBILE ? W * 0.05 : W * 0.5 - this.pw / 2;
    },
    // 논문 한 페이지를 (0,0) 기준으로 그림 → 높이 반환
    page: function (it, w, alpha) {
      var pad = w * 0.075, fs = Math.max(11, w * 0.030), x = pad, y = pad + fs, ph = w * 1.42;
      ctx.fillStyle = 'rgba(246,243,236,' + alpha + ')'; ctx.fillRect(0, 0, w, ph);
      ctx.fillStyle = 'rgba(199,154,10,' + alpha + ')'; ctx.fillRect(0, 0, w, 4);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(150,112,4,' + alpha + ')'; ctx.font = '600 ' + (fs * 0.85) + 'px Paperlogy, sans-serif'; ctx.fillText(it.journal, x, y);
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(90,90,90,' + alpha + ')'; ctx.font = '500 ' + (fs * 0.75) + 'px Paperlogy, sans-serif'; ctx.fillText(it.vol, w - pad, y); ctx.textAlign = 'left';
      y += fs * 0.9; ctx.fillStyle = 'rgba(0,0,0,' + 0.15 * alpha + ')'; ctx.fillRect(x, y, w - 2 * pad, 1); y += fs * 1.9;
      ctx.fillStyle = 'rgba(24,26,31,' + alpha + ')'; ctx.font = '700 ' + (fs * 1.55) + 'px Paperlogy, sans-serif';
      var lines = wrapText(it.title, w - 2 * pad, 4); for (var k = 0; k < lines.length; k++) { ctx.fillText(lines[k], x, y); y += fs * 1.55 * 1.22; }
      y += fs * 0.4; ctx.fillStyle = 'rgba(60,62,70,' + alpha + ')'; ctx.font = '500 ' + (fs * 0.95) + 'px Paperlogy, sans-serif';
      lines = wrapText(it.authors, w - 2 * pad, 2); for (k = 0; k < lines.length; k++) { ctx.fillText(lines[k], x, y); y += fs * 1.35; }
      y += fs * 0.5; ctx.fillStyle = 'rgba(0,0,0,' + 0.15 * alpha + ')'; ctx.fillRect(x, y, w - 2 * pad, 1); y += fs * 1.2;
      // 초록 제목 + 본문 줄(두 단), 그림(썸네일) + 캡션
      ctx.fillStyle = 'rgba(24,26,31,' + alpha + ')'; ctx.font = '700 ' + fs + 'px Paperlogy, sans-serif'; ctx.fillText('Abstract', x, y); y += fs * 0.9;
      var colW = (w - 2 * pad - pad * 0.6) / 2, c2 = x + colW + pad * 0.6, lh = fs * 0.78, ly = y, seed = 3;
      ctx.fillStyle = 'rgba(40,42,48,' + 0.30 * alpha + ')';
      for (var n = 0; n < 9; n++) { ly += lh; ctx.fillRect(x, ly, (w - 2 * pad) * (0.86 + 0.14 * Math.abs(Math.sin(n * 2.3))), fs * 0.32); }
      ly += lh * 1.6; var figY = ly, figH = colW * 0.72;
      if (it.im && it.im.complete && it.im.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.rect(x, figY, colW, figH); ctx.clip(); ctx.globalAlpha *= alpha; drawCover(it.im, x, figY, colW, figH, 1, 0.5, 0.5); ctx.restore(); }
      else { ctx.fillStyle = 'rgba(0,0,0,' + 0.06 * alpha + ')'; ctx.fillRect(x, figY, colW, figH); }
      ctx.strokeStyle = 'rgba(0,0,0,' + 0.2 * alpha + ')'; ctx.lineWidth = 1; ctx.strokeRect(x, figY, colW, figH);
      ctx.fillStyle = 'rgba(60,62,70,' + alpha + ')'; ctx.font = '600 ' + (fs * 0.72) + 'px Paperlogy, sans-serif'; ctx.fillText('Fig. 1', x, figY + figH + fs);
      ctx.fillStyle = 'rgba(40,42,48,' + 0.30 * alpha + ')';
      for (n = 0; n < 3; n++) ctx.fillRect(x, figY + figH + fs * 1.4 + n * lh, colW * (0.9 - 0.2 * n), fs * 0.28);
      var ry = figY; for (n = 0; n < 34 && ry < ph - pad * 1.5; n++) { ctx.fillRect(c2, ry, colW * (0.82 + 0.18 * Math.abs(Math.sin(n * 1.7 + 1))), fs * 0.32); ry += lh; }
      ry = figY + figH + fs * 1.4 + 4 * lh; for (n = 0; n < 40 && ry < ph - pad * 1.5; n++) { ctx.fillRect(x, ry, colW * (0.82 + 0.18 * Math.abs(Math.sin(n * 1.9))), fs * 0.32); ry += lh; }
      ctx.fillStyle = 'rgba(90,90,90,' + alpha + ')'; ctx.font = '500 ' + (fs * 0.7) + 'px Paperlogy, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('1', w / 2, ph - pad * 0.6); ctx.textAlign = 'left';
      return ph;
    },
    one: function (it, k, alpha) {
      var w = this.pw, ph = w * 1.42, top = COMPACT ? H * 0.42 : H * 0.14, travel = Math.max(0, ph + top - H * 0.55), y0 = top - travel * smooth(Math.min(1, k * 1.15));
      ctx.save(); ctx.translate(this.px, y0); ctx.shadowColor = 'rgba(0,0,0,' + 0.6 * alpha + ')'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; ctx.fillStyle = 'rgba(30,32,38,' + alpha + ')'; ctx.fillRect(0, 0, w, ph); ctx.shadowColor = 'transparent';
      this.page(it, w, alpha); ctx.restore();
    },
    draw: function (dt, t) {
      var n = this.items.length; if (!n) return;
      var cyc = this.each, i = Math.floor(t / cyc) % n, k = (t % cyc) / cyc, fr = this.fade / cyc;
      this.one(this.items[i], k, k > 1 - fr ? 1 - smooth((k - (1 - fr)) / fr) : 1);
      if (k > 1 - fr) this.one(this.items[(i + 1) % n], 0, smooth((k - (1 - fr)) / fr));
      ctx.fillStyle = 'rgba(16,18,22,0.22)'; ctx.fillRect(0, 0, W, H);
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

  /* ================= headmodel: 연구실 두개골·뇌 유한요소 모델(홍보 영상 형상) + 느린 진동 전파 ================= */
  var headmodel = {
    dim: 0.92, ko: '두개골·뇌 유한요소 모델 · 진동 전달 해석 (tVAS)', en: 'Skull–brain finite-element model · vibration transmission (tVAS)',
    init: function () {
      if (!this.im) this.im = loadImages(['assets/img/hero/head.webp'])[0];
      var S = Math.min(W, HV); this.h = S * (MOBILE ? 0.70 : 0.82); this.w = this.h * 756 / 540;
      this.x = (MOBILE ? W * 0.5 : W * 0.50) - this.w * 0.42; this.y = HV * 0.54 - this.h / 2;
      this.act = [[0.665, 0.56], [0.42, 0.10]]; this.L = this.h * 0.55;
    },
    draw: function (dt, t) {
      if (!this.im.complete || !this.im.naturalWidth) return;
      ctx.drawImage(this.im, this.x, this.y, this.w, this.h);
      var per = 5.0, ph = (t % per) / per;
      for (var q = 0; q < 2; q++) {
        var ax = this.x + this.act[q][0] * this.w, ay = this.y + this.act[q][1] * this.h, pulse = 0.5 + 0.5 * Math.sin(t * 1.26 - q);
        var g = ctx.createRadialGradient(ax, ay, 0, ax, ay, this.h * 0.14); g.addColorStop(0, amber(0.30 + 0.25 * pulse)); g.addColorStop(1, amber(0)); ctx.fillStyle = g; ctx.fillRect(ax - this.h * 0.15, ay - this.h * 0.15, this.h * 0.3, this.h * 0.3);
        ctx.fillStyle = amber(1); ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = white(0.85); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, 9, 0, Math.PI * 2); ctx.stroke();
        for (var r = 0; r < 3; r++) { var rr = (ph + r / 3) % 1; ctx.beginPath(); ctx.arc(ax, ay, 12 + rr * this.L, 0, Math.PI * 2); ctx.strokeStyle = amber(0.38 * (1 - rr)); ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      label('40 Hz tVAS ' + L('(유양돌기)', '(mastoid)'), this.x + this.act[0][0] * this.w + 14, this.y + this.act[0][1] * this.h + 24, 'left', 0.7);
      label('40 Hz tVAS ' + L('(정수리)', '(vertex)'), this.x + this.act[1][0] * this.w, this.y + this.act[1][1] * this.h - 16, 'center', 0.7);
      label(L('두개골 → 뇌 진동 전달 (유한요소 해석)', 'skull → brain vibration transmission (FE)'), this.x + this.w / 2, this.y + this.h + 22, 'center', 0.7);
    }
  };

  /* ================= shouldermodel: 연구실 근골격 모델(홍보 영상 형상) — 느린 외전 왕복 + 관절 응력 ================= */
  var shouldermodel = {
    dim: 0.92, ko: '어깨 근골격 모델 · 외전 운동과 관절 응력', en: 'Shoulder musculoskeletal model · abduction & joint stress', N: 21, per: 7,
    init: function () {
      if (!this.frames) { var list = []; for (var i = 0; i < this.N; i++) list.push('assets/img/hero/shoulder_' + (i < 10 ? '0' : '') + i + '.webp'); this.frames = loadImages(list); }
      var S = Math.min(W, HV); this.h = S * (MOBILE ? 0.80 : 0.88); this.w = this.h * 870 / 890;
      this.x = (MOBILE ? W * 0.5 : W * 0.50) - this.w / 2; this.y = HV * 0.55 - this.h / 2;
      this.bar = { x: W * (MOBILE ? 0.84 : 0.66), y: HV * 0.72, w: 10, h: Math.min(90, HV * 0.12) };
    },
    draw: function (dt, t) {
      var k = (t % (2 * this.per)) / this.per; k = k < 1 ? k : 2 - k; k = smooth(k);
      var f = k * (this.N - 1), i = Math.floor(f), fr = f - i, a = this.frames[Math.min(this.N - 1, i)], b = this.frames[Math.min(this.N - 1, i + 1)], ga = ctx.globalAlpha;
      if (a.complete && a.naturalWidth) ctx.drawImage(a, this.x, this.y, this.w, this.h);
      if (b.complete && b.naturalWidth && fr > 0.02) { ctx.globalAlpha = ga * fr; ctx.drawImage(b, this.x, this.y, this.w, this.h); }
      ctx.globalAlpha = ga;
      var load = 0.25 + 0.75 * k, hx = this.x + this.w * (0.53 - 0.02 * k), hy = this.y + this.h * (0.26 - 0.03 * k), R = this.h * 0.09;
      var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R); g.addColorStop(0, heat(load, 0.55)); g.addColorStop(0.6, heat(load * 0.6, 0.25)); g.addColorStop(1, heat(0, 0)); ctx.fillStyle = g; ctx.fillRect(hx - R, hy - R, 2 * R, 2 * R);
      ctx.strokeStyle = white(0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hx, hy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
      var deg = Math.round(20 + 65 * k);
      label(L('상완와 관절 접촉 응력', 'glenohumeral contact stress'), hx - R * 0.8, hy - R * 0.9, 'right', 0.65);
      label(L('외전 ', 'abduction ') + deg + '°', hx - R * 0.8, hy - R * 0.9 + 16, 'right', 0.75);
      label(L('근골격 동적 시뮬레이션 (회전근개·삼각근)', 'musculoskeletal dynamic simulation (rotator cuff · deltoid)'), this.x + this.w / 2, this.y + this.h + 20, 'center', 0.7);
      var bb = this.bar; for (var q = 0; q < 24; q++) { ctx.fillStyle = heat(1 - q / 23, 0.9); ctx.fillRect(bb.x, bb.y + bb.h * q / 24, bb.w, bb.h / 24 + 1); }
      label('von Mises', bb.x + 15, bb.y + 10, 'left', 0.55); label('0', bb.x + 15, bb.y + bb.h, 'left', 0.5);
    }
  };

  /* ================= earmodel: 연구실 내이 미로 모델(홍보 영상 형상) — 느린 머리 기울기·감각 불일치 ================= */
  var earmodel = {
    dim: 0.92, ko: '내이 미로(반고리관·달팽이관) 모델 · 전정계·멀미 연구', en: 'Inner-ear labyrinth model · vestibular system & motion sickness',
    init: function () {
      if (!this.im) this.im = loadImages(['assets/img/hero/ear.webp'])[0];
      var S = Math.min(W, HV); this.h = S * (MOBILE ? 0.62 : 0.72); this.w = this.h * 470 / 470;
      this.c = { x: MOBILE ? W * 0.5 : W * 0.50, y: HV * 0.54 };
      this.gauge = MOBILE ? { x: W * 0.08, y: HV * 0.90, w: W * 0.84 } : COMPACT ? { x: W * 0.04, y: HV * 0.80, w: W * 0.30 } : { x: W * 0.07, y: HV * 0.80, w: W * 0.28 };
    },
    draw: function (dt, t) {
      if (!this.im.complete || !this.im.naturalWidth) return;
      var roll = 0.11 * Math.sin(t * 0.45), vis = 0.11 * Math.sin(t * 0.45 - 1.5), c = this.c, h = this.h;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(roll); ctx.drawImage(this.im, -this.w / 2, -h / 2, this.w, h); ctx.restore();
      ctx.setLineDash([3, 6]); ctx.strokeStyle = white(0.28); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x, c.y - h * 0.62); ctx.lineTo(c.x, c.y + h * 0.62); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = amber(0.75); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - Math.sin(roll) * h * 0.6, c.y - Math.cos(roll) * h * 0.6); ctx.stroke();
      var hy = c.y + h * 0.70; ctx.strokeStyle = white(0.55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c.x - h * 0.55, hy + Math.tan(vis) * h * 0.55); ctx.lineTo(c.x + h * 0.55, hy - Math.tan(vis) * h * 0.55); ctx.stroke();
      label(L('전정 입력 · 머리 기울기 ', 'vestibular input · head tilt ') + Math.round(roll * 180 / Math.PI) + '°', c.x, c.y - h * 0.68, 'center', 0.7);
      label(L('시각 입력 · 수평선 ', 'visual input · horizon ') + Math.round(vis * 180 / Math.PI) + '°', c.x, hy + 20, 'center', 0.6);
      var conf = Math.abs(roll - vis) / 0.22, gg = this.gauge;
      ctx.fillStyle = white(0.12); ctx.fillRect(gg.x, gg.y, gg.w, 6); ctx.fillStyle = heat(conf, 0.95); ctx.fillRect(gg.x, gg.y, gg.w * clamp01(conf), 6);
      label(L('감각 불일치 → 멀미 유발도', 'sensory conflict → sickness'), gg.x, gg.y - 8, 'left', 0.65);
    }
  };

  /* ================= 엔진 ================= */
  var registry = { wildfire: wildfire, hearing: hearing, brain: brainvideo, headmodel: headmodel, shouldermodel: shouldermodel, earmodel: earmodel, cochlea: cochlea, shoulder: shoulder, skull: skull, exoboot: exoboot, vestibular: vestibular, photos: photos, papers: papers, mosaic: mosaic };
  var names = (canvas.getAttribute('data-scenes') || 'hearing,brain,shouldermodel,exoboot,wildfire,earmodel').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return registry[s] && (registry[s].type !== 'video' || registry[s].el); });
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
    ctx.save(); ctx.globalAlpha = alpha * (s.dim || 0.9);
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
    else videos.forEach(function (v) { if (!v.paused) v.pause(); });
  });
  last = performance.now(); requestAnimationFrame(frame);
})();
