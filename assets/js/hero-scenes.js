/* AM&D Lab — 히어로 배경 연구 장면 (교차 페이드 순환)
   1) 실제 산불 영상(<video>)  2) 달팽이관 기저막 진행파(3D 표면)  3) 어깨 관절 FE 응력  4) 두개골 진동 전달(tVAS)
   - 캔버스 장면은 실시간 렌더링(파일 없음), 산불만 무음 반복 영상
   - prefers-reduced-motion: 정지 프레임만 / 탭 숨김 시 일시정지 / 모바일은 해상도·격자 절감 */
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
  var W = 0, H = 0, HV = 0, DPR = 1, ready = false; // HV: 실제 보이는 높이(모바일에서 히어로가 뷰포트보다 길 때 장면을 위쪽에 배치)

  /* ---------------- 공용 ---------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function amber(a) { return 'rgba(232,184,32,' + a + ')'; }
  function white(a) { return 'rgba(255,255,255,' + a + ')'; }
  function heat(s, a) { s = clamp01(s); return 'hsla(' + (228 - 228 * s) + ',85%,' + (46 + 14 * s) + '%,' + a + ')'; }

  /* ================= 장면 1: 실제 산불 영상 ================= */
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

  /* ================= 장면 2: 기저막 진행파 (원근 3D 표면) ================= */
  var cochlea = {
    ko: '달팽이관 기저막 진행파 · 골전도 청각 연구', en: 'Basilar-membrane traveling wave · bone-conduction hearing',
    init: function () {
      this.cols = MOBILE ? 60 : 110; this.rows = MOBILE ? 9 : 15;
      var S = Math.min(W, HV);
      this.cam = MOBILE ? { cx: W * 0.5, cy: HV * 0.56, scale: S * 1.9, tilt: 0.9, yaw: -1.05, f: 2.6 }
                        : { cx: W * 0.56, cy: HV * 0.60, scale: S * 1.12, tilt: 0.82, yaw: -0.36, f: 2.6 };
      this.pts = new Array((this.cols + 1) * (this.rows + 1));
    },
    // 기저부(u=0, 좁음)→첨부(u=1, 넓음). 특성주파수 위치 up에서 최대, 그 이후 급격히 감쇠
    wave: function (u, t, up) {
      var env = u <= up ? Math.exp(-Math.pow((u - up) / 0.24, 2)) : Math.exp(-Math.pow((u - up) / 0.06, 2));
      return env * Math.sin(2 * Math.PI * (u * 3 + u * u * 12) - t * 7);
    },
    project: function (x, y, z) { // x: 길이(-1..1), y: 높이, z: 폭
      var c = this.cam;
      var cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);       // Y축 회전
      var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      var ct = Math.cos(c.tilt), st = Math.sin(c.tilt);     // X축 기울임
      var y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      var d = c.f / (c.f + z2 + 1.6);                        // 원근
      return { sx: c.cx + x1 * c.scale * d, sy: c.cy - y2 * c.scale * d, d: d };
    },
    draw: function (dt, t) {
      var up = 0.2 + 0.62 * (0.5 + 0.5 * Math.sin(t * 0.28));
      var C = this.cols, R = this.rows, P = this.pts;
      for (var i = 0; i <= C; i++) {
        var u = i / C, x = -1 + 2 * u, w = lerp(0.08, 0.32, u), hgt = this.wave(u, t, up);
        for (var j = 0; j <= R; j++) {
          var v = -1 + 2 * j / R, z = v * w, y = hgt * (1 - v * v) * 0.46;
          var p = this.project(x, y, z); p.h = hgt * (1 - v * v); P[i * (R + 1) + j] = p;
        }
      }
      // 바닥 글로우(깊이감)
      var mid = P[Math.round(C * 0.55) * (R + 1) + Math.round(R / 2)];
      var bg = ctx.createRadialGradient(mid.sx, mid.sy + 40, 0, mid.sx, mid.sy + 40, Math.min(W, H) * 0.55);
      bg.addColorStop(0, amber(0.08)); bg.addColorStop(1, amber(0));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // 뒤→앞 순서로 면 채우기 (z가 큰 쪽이 먼 쪽)
      for (var j2 = 0; j2 < R; j2++) for (var i2 = 0; i2 < C; i2++) {
        var a = P[i2 * (R + 1) + j2], b = P[(i2 + 1) * (R + 1) + j2], c2 = P[(i2 + 1) * (R + 1) + j2 + 1], d2 = P[i2 * (R + 1) + j2 + 1];
        var h = (a.h + b.h + c2.h + d2.h) / 4, depth = (a.d + c2.d) / 2;
        var lit = 0.22 + 0.55 * clamp01(h + 0.35) * depth;  // 마루는 밝게
        ctx.fillStyle = h > 0 ? 'rgba(' + Math.round(232 + 23 * h) + ',' + Math.round(184 + 60 * h) + ',' + Math.round(32 + 150 * h * h) + ',' + (0.14 + 0.62 * h * depth) + ')' : 'rgba(110,82,28,' + (0.08 + 0.2 * depth) + ')';
        ctx.strokeStyle = h > 0.2 ? white(0.15 + 0.6 * h) : amber(0.16 + 0.4 * lit);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c2.sx, c2.sy); ctx.lineTo(d2.sx, d2.sy); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      // 최대 응답 위치 글로우
      var pk = P[Math.round(up * C) * (R + 1) + Math.round(R / 2)];
      var g = ctx.createRadialGradient(pk.sx, pk.sy, 0, pk.sx, pk.sy, Math.min(W, H) * 0.30);
      g.addColorStop(0, amber(0.34)); g.addColorStop(0.5, amber(0.10)); g.addColorStop(1, amber(0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 입력(난원창) 압력 펄스 링
      var base = P[Math.round(R / 2)], per = 2 * Math.PI / 8.5, ph = (t % per) / per;
      for (var r = 0; r < 3; r++) {
        var rr = (ph + r / 3) % 1; ctx.beginPath(); ctx.arc(base.sx, base.sy, 6 + rr * 46, 0, Math.PI * 2);
        ctx.strokeStyle = white(0.35 * (1 - rr)); ctx.lineWidth = 1; ctx.stroke();
      }
      // 축 라벨
      var apex = P[C * (R + 1) + Math.round(R / 2)];
      ctx.fillStyle = white(0.38); ctx.font = '500 11px Paperlogy, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('base · high f', base.sx, base.sy + 66); ctx.fillText('apex · low f', apex.sx, apex.sy + 66);
    }
  };

  /* ================= 장면 3: 어깨 관절 FE 응력 ================= */
  var shoulder = {
    ko: '어깨 관절 유한요소 해석 · 회전근개 연구', en: 'Shoulder finite-element analysis · rotator cuff',
    init: function () {
      var R = Math.min(W, HV) * (MOBILE ? 0.15 : 0.17);
      this.R = R; this.G = { x: W * 0.47, y: HV * 0.5 }; this.C = { x: this.G.x + R * 0.62, y: this.G.y };
      this.head = { rings: MOBILE ? 4 : 6, sect: MOBILE ? 20 : 30 };
      this.shaft = { rows: MOBILE ? 12 : 20, cols: MOBILE ? 4 : 6, len: R * 2.6, w0: R * 0.72, w1: R * 0.5 };
      this.cuff = [{ a0: -1.45, from: { x: -1.6, y: -1.15 } }, { a0: -0.55, from: { x: -1.9, y: -0.45 } }, { a0: 0.35, from: { x: -1.9, y: 0.55 } }, { a0: 1.15, from: { x: -1.5, y: 1.25 } }];
      this.bar = { x: W * 0.88, y: HV * 0.66, w: 10, h: Math.min(120, HV * 0.18) };
    },
    draw: function (dt, t) {
      var R = this.R, C = this.C, G = this.G;
      var abd = 0.12 + 0.75 * (0.5 - 0.5 * Math.cos(t * 0.55));
      var load = 0.55 + 0.45 * Math.sin(t * 0.55 - 0.6);
      var contact = { x: C.x - R * Math.cos(abd * 0.7), y: C.y - R * Math.sin(abd * 0.7) };
      ctx.lineWidth = 3; ctx.strokeStyle = white(0.45); ctx.beginPath();
      ctx.arc(C.x, C.y, R * 1.08, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); ctx.lineWidth = 1;
      var h = this.head;
      for (var ri = 0; ri < h.rings; ri++) {
        var r0 = R * ri / h.rings, r1 = R * (ri + 1) / h.rings;
        for (var si = 0; si < h.sect; si++) {
          var a0 = si / h.sect * Math.PI * 2, a1 = (si + 1) / h.sect * Math.PI * 2, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
          var s = Math.exp(-Math.hypot(C.x + rm * Math.cos(am) - contact.x, C.y + rm * Math.sin(am) - contact.y) / (R * 0.55)) * load;
          ctx.fillStyle = heat(s, 0.62); ctx.strokeStyle = white(0.10);
          ctx.beginPath();
          ctx.moveTo(C.x + r0 * Math.cos(a0), C.y + r0 * Math.sin(a0)); ctx.lineTo(C.x + r1 * Math.cos(a0), C.y + r1 * Math.sin(a0));
          ctx.lineTo(C.x + r1 * Math.cos(a1), C.y + r1 * Math.sin(a1)); ctx.lineTo(C.x + r0 * Math.cos(a1), C.y + r0 * Math.sin(a1));
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      var sh = this.shaft, dir = { x: Math.sin(abd), y: Math.cos(abd) }, nrm = { x: dir.y, y: -dir.x };
      for (var rw = 0; rw < sh.rows; rw++) {
        var l0 = R * 0.75 + sh.len * rw / sh.rows, l1 = R * 0.75 + sh.len * (rw + 1) / sh.rows;
        var w0 = lerp(sh.w0, sh.w1, rw / sh.rows), w1 = lerp(sh.w0, sh.w1, (rw + 1) / sh.rows);
        for (var cl = 0; cl < sh.cols; cl++) {
          var u0 = cl / sh.cols - 0.5, u1 = (cl + 1) / sh.cols - 0.5;
          var bend = Math.abs((u0 + u1) / 2) * 2 * (l0 / (R * 0.75 + sh.len)) * load;
          ctx.fillStyle = heat(bend * 0.8, 0.55); ctx.strokeStyle = white(0.08);
          ctx.beginPath();
          ctx.moveTo(C.x + dir.x * l0 + nrm.x * u0 * w0, C.y + dir.y * l0 + nrm.y * u0 * w0);
          ctx.lineTo(C.x + dir.x * l1 + nrm.x * u0 * w1, C.y + dir.y * l1 + nrm.y * u0 * w1);
          ctx.lineTo(C.x + dir.x * l1 + nrm.x * u1 * w1, C.y + dir.y * l1 + nrm.y * u1 * w1);
          ctx.lineTo(C.x + dir.x * l0 + nrm.x * u1 * w0, C.y + dir.y * l0 + nrm.y * u1 * w0);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      for (var i = 0; i < this.cuff.length; i++) {
        var cf = this.cuff[i], tension = 0.35 + 0.65 * Math.max(0, Math.cos(cf.a0 + abd * 0.9)) * load;
        var ax = C.x + R * Math.cos(cf.a0 + Math.PI + abd * 0.3), ay = C.y + R * Math.sin(cf.a0 + Math.PI + abd * 0.3);
        var fx = G.x + R * cf.from.x, fy = G.y + R * cf.from.y;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + ax) / 2 - R * 0.2, (fy + ay) / 2, ax, ay);
        ctx.lineWidth = 4; ctx.strokeStyle = amber(0.2 + 0.65 * tension); ctx.stroke(); ctx.lineWidth = 1;
      }
      var ex = C.x + dir.x * (R * 0.75 + sh.len + 26), ey = C.y + dir.y * (R * 0.75 + sh.len + 26);
      ctx.strokeStyle = white(0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex, ey + 34 * load); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - 5, ey + 34 * load - 7); ctx.lineTo(ex, ey + 34 * load); ctx.lineTo(ex + 5, ey + 34 * load - 7); ctx.stroke();
      var b = this.bar;
      for (var k = 0; k < 24; k++) { ctx.fillStyle = heat(1 - k / 23, 0.85); ctx.fillRect(b.x, b.y + b.h * k / 24, b.w, b.h / 24 + 1); }
      ctx.fillStyle = white(0.4); ctx.font = '500 11px Paperlogy, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('von Mises', b.x + 16, b.y + 10); ctx.fillText('max', b.x + 16, b.y + 24); ctx.fillText('0', b.x + 16, b.y + b.h);
    }
  };

  /* ================= 장면 4: 두개골 진동 전달 (tVAS) ================= */
  var skull = {
    ko: '두개골 진동 전달 · 뇌척수액 응답 (tVAS)', en: 'Skull-borne vibration · CSF response (tVAS)',
    init: function () {
      var rx = Math.min(W, HV) * (MOBILE ? 0.24 : 0.27), ry = rx * 1.12;
      this.c = { x: W * 0.5, y: HV * 0.56 }; this.rx = rx; this.ry = ry; this.N = MOBILE ? 100 : 190; this.L = rx * 1.15;
      this.actuators = [{ x: this.c.x - rx * 0.98, y: this.c.y + ry * 0.05 }, { x: this.c.x + rx * 0.98, y: this.c.y + ry * 0.05 }];
      this.inner = [];
      var rings = MOBILE ? 5 : 8, per = MOBILE ? 26 : 46;
      for (var r = 1; r <= rings; r++) for (var i = 0; i < per; i++) {
        var a = i / per * Math.PI * 2 + r * 0.13, q = r / (rings + 0.6);
        this.inner.push({ x: this.c.x + rx * 0.8 * q * Math.cos(a), y: this.c.y + ry * 0.8 * q * Math.sin(a) });
      }
    },
    field: function (x, y, t) {
      var u = 0;
      for (var i = 0; i < 2; i++) { var d = Math.hypot(x - this.actuators[i].x, y - this.actuators[i].y); u += Math.cos(d / 22 - t * 6.5) * Math.exp(-d / this.L); }
      return u * 0.5;
    },
    draw: function (dt, t) {
      var c = this.c, rx = this.rx, ry = this.ry;
      ctx.beginPath();
      for (var i = 0; i <= this.N; i++) {
        var a = i / this.N * Math.PI * 2, bx = c.x + rx * Math.cos(a), by = c.y + ry * Math.sin(a) * (Math.sin(a) > 0 ? 1.06 : 1);
        var u = this.field(bx, by, t), x = bx + Math.cos(a) * u * 10, y = by + Math.sin(a) * u * 10;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.lineWidth = 2.5; ctx.strokeStyle = white(0.65); ctx.stroke(); ctx.fillStyle = amber(0.04); ctx.fill();
      for (var j = 0; j < this.N; j += 2) {
        var aa = j / this.N * Math.PI * 2, px = c.x + rx * Math.cos(aa), py = c.y + ry * Math.sin(aa), e = Math.abs(this.field(px, py, t));
        ctx.fillStyle = amber(0.2 + 0.8 * e); ctx.beginPath(); ctx.arc(px, py, 1.8 + 3.5 * e, 0, Math.PI * 2); ctx.fill();
      }
      for (var k = 0; k < this.inner.length; k++) {
        var p = this.inner[k], v = this.field(p.x, p.y, t), m = Math.abs(v);
        ctx.fillStyle = m > 0.35 ? amber(0.3 + 0.6 * m) : white(0.12 + 0.4 * m);
        ctx.beginPath(); ctx.arc(p.x + v * 3, p.y + v * 3, 1.4 + 3 * m, 0, Math.PI * 2); ctx.fill();
      }
      var per = 2 * Math.PI / 6.5, ph = (t % per) / per;
      for (var q = 0; q < 2; q++) {
        var A = this.actuators[q];
        ctx.fillStyle = amber(0.95); ctx.beginPath(); ctx.arc(A.x, A.y, 5.5, 0, Math.PI * 2); ctx.fill();
        for (var r = 0; r < 4; r++) { var rr = (ph + r / 4) % 1; ctx.beginPath(); ctx.arc(A.x, A.y, 8 + rr * this.L * 1.3, 0, Math.PI * 2); ctx.strokeStyle = amber(0.4 * (1 - rr)); ctx.lineWidth = 1; ctx.stroke(); }
      }
      ctx.fillStyle = white(0.38); ctx.font = '500 11px Paperlogy, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('40 Hz tVAS', this.actuators[0].x, this.actuators[0].y + 26); ctx.fillText('40 Hz tVAS', this.actuators[1].x, this.actuators[1].y + 26);
    }
  };

  /* ================= 엔진 ================= */
  var scenes = [wildfire, cochlea, shoulder, skull];
  var cur = 0, sceneT = 0, last = 0, running = true, lastLang = '';

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight; HV = Math.min(H, (window.innerHeight || H) - 60);
    if (W < 2 || H < 2) { ready = false; return; }             // 레이아웃 전/숨김 상태 가드
    DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1 : 1.5);
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scenes.forEach(function (s) { s.init(); });
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
    ctx.save(); ctx.globalAlpha = alpha; s.draw(dt, t); ctx.restore();
  }
  function frame(now) {
    if (!running) return;
    if (!ready) { resize(); if (!ready) { requestAnimationFrame(frame); return; } }
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    sceneT += dt;
    ctx.clearRect(0, 0, W, H);
    var s = scenes[cur], t = now / 1000, nxt = scenes[(cur + 1) % scenes.length];
    if (sceneT > DUR - FADE) {
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
