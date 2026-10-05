/* ==========================================================================
   wd-beagle-loader.js, the dashboard loading scene.
   A beagle walks in from the left after her treat while wd-core.js loads the
   workspace. When 'wd:ready' fires she runs the rest of the way, pounces,
   picks the treat up and the scene fades out over the finished dashboard.
   If loading is slow she waits beside the treat and looks at the viewer.

   Frames: /property/assets/beagle/watchdog-beagle-frames.webp is one row of
   four 600x400 frames that share a ground line at y=371:
     a = walk (contact), b = walk (passing), leap, front = looking at viewer.
   All positions below are in sprite-width units (F), so the scene scales.
   Reduced motion: no walking; the finished dashboard replaces the scene.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var boot = d.getElementById('wdd-boot');
  var scene = d.getElementById('wdd-boot-scene');
  var dog = d.getElementById('wdd-boot-dog');
  var treat = d.getElementById('wdd-boot-treat');
  var retry = d.getElementById('wdd-boot-retry');
  if (!boot || !scene || !dog || !treat) return;

  var motion = w.matchMedia ? w.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(motion && motion.matches); }

  /* Frame geometry in native frame pixels (600 wide, ground at 371). */
  var NATIVE = 600;
  var PAW = 470 / NATIVE;          // front paw of walk frame A
  var MOUTH_X = 345 / NATIVE;      // mouth of the front-facing frame
  var MOUTH_UP = 250 / NATIVE;     // mouth height above the ground
  var BODY = 437 / NATIVE;         // nose-to-rump length, for speeds

  var WALK_FRAME_MS = 230, RUN_FRAME_MS = 120;
  var LEAP_MS = 360, LAND_MS = 110, GRAB_MS = 170, HOLD_MS = 380, FADE_MS = 260;
  var MIN_SHOW_MS = 650;

  var state = 'walk';              // walk | wait | run | leap | land | grab | hold | out | failed | still
  var ready = false, finished = false, raf = 0;
  var started = now(), stateAt = started, last = started, frameClock = 0;
  var geo = null, x = 0, y = 0, leapFrom = 0, glanceAt = 0;
  var treatPos = { x: 0, up: 0, tilt: 0 };

  function now() { return w.performance && performance.now ? performance.now() : Date.now(); }
  function setState(next) { state = next; stateAt = now(); boot.setAttribute('data-state', next); }
  function setFrame(name) { if (dog.getAttribute('data-frame') !== name) dog.setAttribute('data-frame', name); }

  function measure() {
    var sw = scene.clientWidth || 320;
    var sprite = dog.offsetWidth || 240;
    var F = sprite;
    var treatX = Math.round(sw * 0.84);
    var landX = treatX - (PAW + 0.07) * F;       // sprite left when the paw is just behind the treat
    var leapX = landX - Math.min(0.72 * F, 0.24 * sw); // where the leap starts, and where she waits
    var startX = -0.62 * F;                      // just her head showing past the faded edge
    var prev = geo;
    geo = { sw: sw, F: F, treatX: treatX, landX: landX, leapX: leapX, startX: startX, walk: 0.5 * BODY * F, run: 2.4 * BODY * F };
    if (!prev) x = startX;
    else if (prev.sw !== sw || prev.F !== F) x = startX + (x - prev.startX) * ((leapX - startX) / Math.max(1, prev.leapX - prev.startX));
    if (!ready || state === 'walk' || state === 'wait' || state === 'failed' || state === 'still') placeTreatOnGround();
  }

  function placeTreatOnGround() { treatPos.x = geo.treatX; treatPos.up = 0; treatPos.tilt = 0; }

  function paint() {
    dog.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + (-y).toFixed(1) + 'px,0)';
    dog.style.setProperty('--lift', (y / geo.F).toFixed(3));
    treat.style.transform = 'translate3d(' + (treatPos.x).toFixed(1) + 'px,' + (-treatPos.up).toFixed(1) + 'px,0) translateX(-50%) rotate(' + treatPos.tilt.toFixed(1) + 'deg)';
  }

  function stepFrames(dt, ms, a, b) {
    frameClock += dt;
    var phase = Math.floor(frameClock / ms) % 2;
    setFrame(phase ? b : a);
    return phase;
  }

  function tick() {
    raf = 0;
    if (finished) return;
    var t = now(), dt = Math.min(64, t - last), since = t - stateAt;
    last = t;

    if (state === 'walk') {
      var phase = stepFrames(dt, WALK_FRAME_MS, 'a', 'b');
      x += geo.walk * dt / 1000;
      y = phase ? 0.004 * geo.F : 0;
      if (ready && t - started >= MIN_SHOW_MS) {
        setState(x < geo.leapX - 0.25 * geo.F ? 'run' : 'leap');
        leapFrom = x;
      } else if (x >= geo.leapX) {
        x = geo.leapX; y = 0; setState('wait'); setFrame('front'); glanceAt = t + 2600;
      }
    } else if (state === 'wait') {
      y = 0;
      if (ready && t - started >= MIN_SHOW_MS) { leapFrom = x; setState('leap'); }
      else if (t >= glanceAt) {
        // Now and then she glances back at the treat, then at the viewer again.
        var looking = dog.getAttribute('data-frame') === 'front';
        setFrame(looking ? 'a' : 'front');
        glanceAt = t + (looking ? 900 : 2600);
      }
    } else if (state === 'run') {
      var runPhase = stepFrames(dt, RUN_FRAME_MS, 'leap', 'b');
      var remaining = geo.leapX - x;
      var speed = Math.max(geo.run, remaining / 0.5);
      x = Math.min(geo.leapX, x + speed * dt / 1000);
      y = runPhase ? 0 : 0.05 * geo.F;
      if (x >= geo.leapX - 0.5) { leapFrom = x; setState('leap'); }
    } else if (state === 'leap') {
      setFrame('leap');
      var p = Math.min(1, since / LEAP_MS);
      var ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      x = leapFrom + (geo.landX - leapFrom) * ease;
      y = Math.sin(Math.PI * p) * 0.13 * geo.F;
      if (p >= 1) { x = geo.landX; y = 0; setState('land'); setFrame('a'); }
    } else if (state === 'land') {
      y = since < 60 ? -0.006 * geo.F : 0;
      if (since >= LAND_MS) { setState('grab'); setFrame('front'); }
    } else if (state === 'grab') {
      // The treat rises from the ground into her mouth.
      var g = Math.min(1, since / GRAB_MS), ge = 1 - Math.pow(1 - g, 3);
      var mouthX = x + MOUTH_X * geo.F;
      treatPos.x = geo.treatX + (mouthX - geo.treatX) * ge;
      treatPos.up = (MOUTH_UP - 0.042) * geo.F * ge;
      treatPos.tilt = -7 * ge;
      boot.classList.add('has-treat');
      if (g >= 1) setState('hold');
    } else if (state === 'hold') {
      y = Math.sin(Math.min(1, since / 220) * Math.PI) * 0.018 * geo.F;
      treatPos.x = x + MOUTH_X * geo.F;
      treatPos.up = (MOUTH_UP - 0.042) * geo.F + y;
      if (since >= HOLD_MS) leave();
    }

    paint();
    if (!finished && state !== 'failed' && state !== 'still' && state !== 'out') raf = w.requestAnimationFrame(tick);
  }

  function run() { if (!raf && !finished) { last = now(); raf = w.requestAnimationFrame(tick); } }
  function stop() { if (raf) { w.cancelAnimationFrame(raf); raf = 0; } }

  function hide() {
    if (finished) return;
    finished = true;
    stop();
    boot.hidden = true;
    boot.classList.remove('is-leaving');
    d.removeEventListener('pointerdown', skip, true);
    d.removeEventListener('keydown', skip, true);
  }
  function leave() {
    if (state === 'out' || finished) return;
    setState('out');
    boot.classList.add('is-leaving');
    w.setTimeout(hide, FADE_MS);
  }
  // Once the dashboard is ready, a click, tap or key press skips the finale.
  function skip() { if (ready && !finished) hide(); }

  function stillPose() {
    stop();
    x = geo.leapX; y = 0;
    setFrame('front');
    placeTreatOnGround();
    paint();
  }

  function onFailed() {
    if (!retry || retry.hidden || ready) return;
    setState('failed');
    stillPose();
    var title = d.getElementById('wdd-boot-title');
    if (title) title.textContent = 'Your dashboard hit a snag';
  }

  function onReady() {
    if (ready) return;
    ready = true;
    // wd-core hides the boot element before it announces the dashboard; keep
    // the scene up for the finale while the dashboard paints underneath.
    if (retry && !retry.hidden) { boot.hidden = true; finished = true; stop(); return; }
    if (reduced() || d.hidden) { hide(); return; }
    boot.hidden = false;
    boot.classList.add('is-finishing');
    d.addEventListener('pointerdown', skip, true);
    d.addEventListener('keydown', skip, true);
    // Background tabs pause animation frames; never hold the dashboard hostage.
    w.setTimeout(hide, 4200);
    if (state === 'still') { setState('wait'); glanceAt = now() + 9999; }
    run();
  }

  measure();
  boot.setAttribute('data-state', state);
  if (reduced()) { setState('still'); stillPose(); }
  else { setFrame('a'); paint(); run(); }

  d.addEventListener('wd:ready', onReady, { once: true });
  if (retry && w.MutationObserver) new MutationObserver(onFailed).observe(retry, { attributes: true, attributeFilter: ['hidden'] });
  w.addEventListener('resize', function () { if (finished) return; measure(); paint(); });
  if (motion) {
    var onMotion = function () {
      if (finished || ready) return;
      if (reduced()) { setState('still'); stillPose(); }
      else if (state === 'still') { x = geo.startX; frameClock = 0; setState('walk'); run(); }
    };
    if (motion.addEventListener) motion.addEventListener('change', onMotion);
    else if (motion.addListener) motion.addListener(onMotion);
  }
})(window, document);
