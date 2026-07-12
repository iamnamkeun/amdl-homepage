/* AM&D Lab — interactions */
(function () {
  'use strict';

  /* ---------- language toggle (Korean default, English on demand) ---------- */
  var LANG_KEY = 'amdl-lang';
  function applyLang(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (!el.hasAttribute('data-ko')) el.setAttribute('data-ko', el.innerHTML);
      el.innerHTML = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-ko');
    });
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.textContent = lang === 'en' ? '한국어' : 'ENG';
    });
  }
  var savedLang = 'ko';
  try { savedLang = localStorage.getItem(LANG_KEY) || 'ko'; } catch (e) {}
  applyLang(savedLang);
  document.querySelectorAll('.lang-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var cur = document.documentElement.lang === 'en' ? 'en' : 'ko';
      var next = cur === 'en' ? 'ko' : 'en';
      try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
      applyLang(next);
    });
  });

  /* ---------- nav ---------- */
  var nav = document.getElementById('nav');
  var hero = document.querySelector('.hero, .page-hero');
  if (hero) nav.classList.add('on-dark');

  function onScroll() {
    nav.classList.toggle('solid', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var burger = document.getElementById('hamburger');
  var menu = document.getElementById('menu');
  if (burger) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) nav.classList.add('solid');
      else onScroll();
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.classList.remove('open');
        burger.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- hero wave canvas ---------- */
  var canvas = document.getElementById('wave-canvas');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ctx = canvas.getContext('2d');
    var W, H, t = 0;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    var waves = [
      { amp: 42, freq: 0.0042, speed: 0.010, y: 0.62, color: 'rgba(232,184,32,0.30)', lw: 1.6 },
      { amp: 58, freq: 0.0031, speed: 0.007, y: 0.68, color: 'rgba(232,184,32,0.14)', lw: 1.2 },
      { amp: 34, freq: 0.0055, speed: 0.013, y: 0.56, color: 'rgba(255,255,255,0.10)', lw: 1.1 },
      { amp: 70, freq: 0.0024, speed: 0.005, y: 0.75, color: 'rgba(255,255,255,0.06)', lw: 1.0 },
      { amp: 26, freq: 0.0068, speed: 0.016, y: 0.50, color: 'rgba(232,184,32,0.08)', lw: 1.0 }
    ];

    function draw() {
      ctx.clearRect(0, 0, W, H);
      waves.forEach(function (w) {
        ctx.beginPath();
        for (var x = 0; x <= W; x += 3) {
          var envelope = Math.sin((x / W) * Math.PI);
          var y = H * w.y +
            Math.sin(x * w.freq + t * w.speed * 60) * w.amp * envelope +
            Math.sin(x * w.freq * 2.3 + t * w.speed * 36) * w.amp * 0.3 * envelope;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.lw;
        ctx.stroke();
      });
      t += 0.016;
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ---------- scroll cue (all pages) ---------- */
  var cue = document.querySelector('.scroll-cue');
  if (cue) {
    var cueScroll = function () {
      var nearTop = window.scrollY < 60;
      var canScroll = document.body.scrollHeight > window.innerHeight + 120;
      cue.classList.toggle('hide', !nearTop || !canScroll);
    };
    window.addEventListener('scroll', cueScroll, { passive: true });
    window.addEventListener('resize', cueScroll);
    cueScroll();
  }

  /* ---------- hero news accordion ---------- */
  document.querySelectorAll('.hero-news-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var open = item.classList.toggle('open');
      item.setAttribute('aria-expanded', open);
    });
  });

  /* ---------- publications year filter ---------- */
  var pubList = document.getElementById('pub-list');
  if (pubList) {
    var btns = document.querySelectorAll('.filter-btn[data-year]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var y = b.dataset.year;
        pubList.querySelectorAll('.pub-item').forEach(function (item) {
          item.classList.toggle('hide', y !== 'all' && item.dataset.year !== y);
        });
      });
    });
  }

  /* ---------- gallery tabs ---------- */
  var tabBtns = document.querySelectorAll('.filter-btn[data-tab]');
  if (tabBtns.length) {
    tabBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        tabBtns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        document.querySelectorAll('.gal-panel').forEach(function (p) {
          p.classList.toggle('active', p.id === b.dataset.tab);
        });
        document.querySelectorAll('.gal-panel.active .reveal').forEach(function (el) {
          el.classList.add('in');
        });
      });
    });
  }

  /* ---------- lightbox ---------- */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    document.querySelectorAll('.gal-item').forEach(function (item) {
      item.addEventListener('click', function () {
        lbImg.src = item.dataset.full;
        lb.hidden = false;
        document.body.style.overflow = 'hidden';
      });
    });
    function closeLb() {
      lb.hidden = true;
      lbImg.src = '';
      document.body.style.overflow = '';
    }
    lb.addEventListener('click', function (e) {
      if (e.target !== lbImg) closeLb();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lb.hidden) closeLb();
    });
  }
})();
