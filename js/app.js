/* ==========================================================================
   eliezerchavez.com — TV Tuning Sequence
   ========================================================================== */

(() => {
  'use strict';

  /* ==========================================================================
   * 1) Configuration / Utilities
   * ======================================================================= */

  // Timings (ms)
  const CRT_RAMP        = 500;             // CRT fade-in
  const REDIRECT_BUFFER = 1000;            // cushion before navigating
  const START_DELAY     = 10000;           // delay before auto plan starts
  const CRT_START_DELAY = 2000;            // early CRT “something’s off” cue
  const TUBE_OFF_MS     = 1200;            // CSS animation duration for tube-off

  // SMPTE roll speed (CSS time string)
  const ROLL_SPEED      = '1100ms';

  // Desktop-remote hint timings
  const HINT_INITIAL_MS = 3000;            // first cue after remote reveal
  const HINT_BOUNCE_MS  = 1500;            // bounce duration
  const HINT_GLOW_MS    = 1500;            // glow hold
  const HINT_GAP_MS     = 2000;            // gap between cycles

  // Helpers
  const rng    = (min, max) => Math.round(min + Math.random() * (max - min));
  const jitter = (ms) => rng(Math.max(300, ms - 120), ms + 120);
  const clamp  = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
  function haptic(ms = 12) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} }

  // Respect reduced-motion users for non-essential animations
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Demo plan
  const BASE_PLAN = [
    { base: 1400, channel: 2, type: 'good' },
    { base:  900, channel: 2, type: 'snow' },
    { base: 1400, channel: 2, type: 'bars' },
    { base: 1500, channel: 2, type: 'good' },
    { base:  900, channel: 2, type: 'snow' },
    { base: 1000, channel: 3, type: 'snow' },
    { base: 1400, channel: 2, type: 'good' },
    { base:  800, channel: 2, type: 'snow' },
    { base: 1100, channel: 3, type: 'snow' },
    { base: 2400, channel: 4, type: 'good' },
    { base: 1000, channel: 5, type: 'snow' },
    { base: 1100, channel: 6, type: 'snow' },
    { base: 2400, channel: 7, type: 'bars' },
    { to: '/new/index.html', type: 'redirect' }
  ];
  const CHANNEL_PLAN = BASE_PLAN.map(s => (s.type === 'redirect' ? s : { ...s, duration: jitter(s.base) }));

  // URL param to disable redirect (demo/hold)
  const params      = new URLSearchParams(window.location.search);
  const NO_REDIRECT = params.has('noredirect') || params.has('hold');


  /* ==========================================================================
   * 2) DOM Handles / Runtime State
   * ======================================================================= */

  const crt      = document.getElementById('ec-crt');
  const osd      = document.getElementById('ec-osd');
  const osdBadge = document.getElementById('ec-osdBadge');
  const remote   = document.getElementById('ec-remote');
  const remoteM  = document.getElementById('ec-remote-m');
  const smpte    = document.getElementById('ec-smpte');
  const snow     = document.getElementById('ec-snow');
  const tvOff    = document.getElementById('ec-tvoff');
  const volOSD   = document.getElementById('ec-vol');
  const volBars  = volOSD ? volOSD.querySelectorAll('.ec-vol-bars span') : null;

  let volHideT = null;
  let manualMode = false;
  let autoPlanStarted = false;

  const CHANNELS     = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  let currentIdx     = CHANNELS.indexOf(2);
  let currentChannel = CHANNELS[currentIdx];

  const channelModeMap     = new Map();
  const randomNonGoodMode  = () => (Math.random() < 0.72 ? 'snow' : 'bars');

  function initManualChannelModes() {
    if (channelModeMap.size) return;
    // Explicit mapping
    channelModeMap.set(2,  'good');    // clean
    channelModeMap.set(4,  'good');    // clean
    channelModeMap.set(8,  'bwLite');  // black & white + light static
    channelModeMap.set(10, 'goodBad'); // bad reception
    // All other VHF channels: session-random non-good
    CHANNELS.forEach(ch => { if (!channelModeMap.has(ch)) channelModeMap.set(ch, randomNonGoodMode()); });
  }

  let digitBuffer = '';
  let digitTimer  = null;
  const DIGIT_COMMIT_MS = 1200;

  let masterVol = 0.8;  // 0..1
  let isMuted   = false;

  // Timer bag (for easy cleanup)
  const _timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); _timers.push(id); return id; };
  const clearAllTimers = () => { _timers.forEach(clearTimeout); _timers.length = 0; };

  // Sync CSS custom properties that we vary from JS
  document.documentElement.style.setProperty('--ec-crt-ramp', `${CRT_RAMP}ms`);
  if (smpte) smpte.style.setProperty('--ec-roll', ROLL_SPEED);

  // Scene + artifacts state (only used in certain channel modes)
  let scene = null, ghostBg = null, tearBands = [];
  let motionRAF = null, tearRAF = null;
  let rollY = 0;

  // Top countdown notice
  const cdWrap = document.getElementById('ec-countdown');
  const cdNum  = cdWrap ? cdWrap.querySelector('.ec-count') : null;
  const COUNTDOWN_SECS = Math.max(0, Math.round(START_DELAY / 1000));
  let cdTimer = null;
  let cdLeft  = COUNTDOWN_SECS;


  /* ==========================================================================
   * 2a) Scene Layer & Artifacts (ghosting, tearing, wobble)
   * ======================================================================= */

  function ensureScene() {
    if (scene) return scene;

    // Copy body background image, then clear body so we draw it ourselves
    const cs = getComputedStyle(document.body);
    const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none'
      ? cs.backgroundImage
      : 'url("/img/background.webp")';
    document.body.style.background = 'transparent';

    // Full-viewport scene that mimics body flex anchoring (bottom-right)
    scene = document.createElement('div');
    scene.id = 'ec-scene';
    Object.assign(scene.style, {
      position: 'fixed',
      inset: 0,
      zIndex: 1, // below overlays (they’re 9k+)
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      backgroundImage: bgImg,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: '50% 50%',
      willChange: 'transform, background-position',
    });

    // Move the card into the scene so it’s affected by effects
    const card = document.querySelector('.container');
    if (card) scene.appendChild(card);

    // Insert scene before overlays so remote/OSD remain above
    const overlaysAnchor = document.getElementById('ec-crt') || document.body.firstChild;
    document.body.insertBefore(scene, overlaysAnchor);

    return scene;
  }

  function startGhosting() {
    if (REDUCED_MOTION) return;
    ensureScene();
    if (ghostBg) return;
    ghostBg = document.createElement('div');
    Object.assign(ghostBg.style, {
      position: 'fixed',
      inset: 0,
      zIndex: 1,
      pointerEvents: 'none',
      opacity: 0.12,
      filter: 'blur(0.6px) contrast(1.02)',
      mixBlendMode: 'lighter',
      backgroundImage: scene.style.backgroundImage,
      backgroundSize: scene.style.backgroundSize,
      backgroundRepeat: scene.style.backgroundRepeat,
      backgroundPosition: scene.style.backgroundPosition,
    });
    document.body.insertBefore(ghostBg, document.getElementById('ec-crt'));
  }

  function stopGhosting() {
    ghostBg?.remove();
    ghostBg = null;
  }

  function startTearing() {
    if (REDUCED_MOTION) return;
    stopTearing();
    ensureScene();

    const BANDS = 6;
    for (let i = 0; i < BANDS; i++) {
      const h = 8 + Math.floor(Math.random() * 22);
      const top = Math.floor(Math.random() * (window.innerHeight - h));

      const band = document.createElement('div');
      Object.assign(band.style, {
        position: 'fixed',
        left: 0,
        top: `${top}px`,
        width: '100vw',
        height: `${h}px`,
        zIndex: 2, // above scene, still below overlays
        pointerEvents: 'none',
        backgroundImage: scene.style.backgroundImage,
        backgroundSize: scene.style.backgroundSize,
        backgroundRepeat: scene.style.backgroundRepeat,
        backgroundPosition: scene.style.backgroundPosition,
        willChange: 'transform',
        opacity: 0.6,
      });
      document.body.insertBefore(band, document.getElementById('ec-crt'));
      tearBands.push({ el: band, dx: (Math.random() * 2 - 1) * 20 });
    }

    const animate = () => {
      const pos = scene.style.backgroundPosition || '50% 50%';
      tearBands.forEach(b => {
        b.el.style.backgroundPosition = pos;
        if (Math.random() < 0.08) b.dx = (Math.random() * 2 - 1) * 28;
        b.el.style.transform = `translateX(${b.dx}px)`;
      });
      tearRAF = requestAnimationFrame(animate);
    };
    tearRAF = requestAnimationFrame(animate);
  }

  function stopTearing() {
    if (tearRAF) cancelAnimationFrame(tearRAF), tearRAF = null;
    tearBands.forEach(b => b.el.remove());
    tearBands.length = 0;
  }

  function startSceneMotion() {
    if (REDUCED_MOTION) return;
    cancelSceneMotion();
    ensureScene();
    rollY = 0;
    let t0 = performance.now();

    const ROLL_PX_PER_SEC = 28; // vertical roll speed
    const JUMP_EVERY_SEC  = 4.5;
    let lastJump = 0;

    const loop = (t) => {
      const s = (t - t0) / 1000;

      // small wobble with random jitter
      const wobX = Math.sin(s * 1.7) * 10 + (Math.random() - 0.5) * 1.2;
      const wobY = Math.cos(s * 1.3) * 6  + (Math.random() - 0.5) * 0.8;

      // continuous roll + occasional jump
      rollY += ROLL_PX_PER_SEC * (1 / 60);
      if (s - lastJump > JUMP_EVERY_SEC) { rollY += 120 + Math.random() * 120; lastJump = s; }

      // Move the whole scene (bg + card)
      scene.style.transform = `translate(${wobX}px, ${wobY + rollY}px) rotate(${Math.sin(s*0.8)*0.35}deg)`;

      // keep ghost aligned but slightly offset to the right/up
      if (ghostBg) {
        ghostBg.style.transform = `translate(${wobX + 10}px, ${wobY + rollY - 2}px) rotate(${Math.sin(s*0.8)*0.35}deg)`;
      }

      // Also drift the background position subtly for extra “swim”
      const bpx = `calc(50% + ${Math.sin(s*0.9)*4}px)`;
      const bpy = `calc(50% + ${Math.cos(s*0.7)*3}px)`;
      scene.style.backgroundPosition = `${bpx} ${bpy}`;
      if (ghostBg) ghostBg.style.backgroundPosition = `${bpx} ${bpy}`;

      motionRAF = requestAnimationFrame(loop);
    };
    motionRAF = requestAnimationFrame(loop);
  }

  function cancelSceneMotion() {
    if (motionRAF) cancelAnimationFrame(motionRAF), motionRAF = null;
    if (scene) {
      scene.style.transform = '';
      scene.style.backgroundPosition = '50% 50%';
    }
    if (ghostBg) {
      ghostBg.style.transform = '';
      ghostBg.style.backgroundPosition = '50% 50%';
    }
  }


  /* ==========================================================================
   * 3) Audio Engine (Web Audio)
   * ======================================================================= */

  let audioCtx, fxGain, hp, lp, noiseSrc, snowGain, toneGain, toneOsc;
  let audioReady = false;
  let audioUnlocked = false;

  function ensureAudioCtx() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function initNoise() {
    if (audioReady) return;
    audioCtx = ensureAudioCtx();
    if (!audioCtx) return;

    const dur = 2.0, sr = audioCtx.sampleRate, n = Math.floor(dur * sr);
    const buf = audioCtx.createBuffer(1, n, sr);
    const ch0 = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch0[i] = Math.random() * 2 - 1;

    noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop   = true;

    hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 7500;

    snowGain = audioCtx.createGain(); snowGain.gain.value = 0;
    fxGain   = audioCtx.createGain(); fxGain.gain.value   = 0;

    noiseSrc.connect(hp).connect(lp);
    lp.connect(snowGain).connect(audioCtx.destination);
    lp.connect(fxGain).connect(audioCtx.destination);

    noiseSrc.start();
    audioReady = true;
  }

  function unlockAudioOnce() {
    if (audioUnlocked) return;
    initNoise();
    ensureAudioCtx();
    audioUnlocked = true;
  }
  ['keydown','pointerdown'].forEach(evt =>
    document.addEventListener(evt, unlockAudioOnce, { once: true, passive: true })
  );

  const _effective = (level) => isMuted ? 0 : clamp(level * masterVol, 0, 1);

  function noiseOn(level = 0.22) {
    if (!audioReady) return;
    const t = audioCtx.currentTime;
    snowGain.gain.cancelScheduledValues(t);
    snowGain.gain.setTargetAtTime(_effective(level), t, 0.015);
  }
  function noiseOff() {
    if (!audioReady) return;
    const t = audioCtx.currentTime;
    snowGain.gain.cancelScheduledValues(t);
    snowGain.gain.setTargetAtTime(0.0, t, 0.02);
  }

  function initTone() {
    ensureAudioCtx();
    if (!audioCtx || toneOsc) return;
    toneOsc = audioCtx.createOscillator();
    toneOsc.type = 'sine';
    toneOsc.frequency.value = 1000;
    toneGain = audioCtx.createGain();
    toneGain.gain.value = 0;
    toneOsc.connect(toneGain).connect(audioCtx.destination);
    toneOsc.start();
  }
  function toneOn(level = 0.07) {
    initTone();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    toneGain.gain.cancelScheduledValues(t);
    toneGain.gain.setTargetAtTime(_effective(level), t, 0.02);
  }
  function toneOff() {
    if (!toneGain || !audioCtx) return;
    const t = audioCtx.currentTime;
    toneGain.gain.cancelScheduledValues(t);
    toneGain.gain.setTargetAtTime(0.0, t, 0.02);
  }

  function playTubeOff() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const t0 = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t0);
    osc.frequency.exponentialRampToValueAtTime(58, t0 + 0.36);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.0001, t0);
    oGain.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
    oGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.46);

    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.setValueAtTime(4200, t0);
    lp2.Q.value = 0.7;

    osc.connect(oGain).connect(lp2).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.5);

    const dur = 0.08, sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * dur));
    const buf = ctx.createBuffer(1, n, sr);
    const ch0 = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch0[i] = (Math.random() * 2 - 1) * (1 - i / n);

    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const hp2 = ctx.createBiquadFilter();  hp2.type = 'highpass'; hp2.frequency.value = 1200;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, t0);
    nGain.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);

    noise.connect(hp2).connect(nGain).connect(ctx.destination);
    noise.start(t0); noise.stop(t0 + 0.12);
  }

  // Audio unlock fallback / nudge
  let audioBlocked = false;
  let soundNudged  = false;

  function tryStartAudioFromGesture() {
    try {
      unlockAudioOnce();
      ensureAudioCtx();
      initTone();
      return !!(audioCtx && audioCtx.state !== 'suspended');
    } catch { return false; }
  }

  function forceAudioReadyWithFallback() {
    const ok = tryStartAudioFromGesture();
    if (ok) { audioBlocked = false; refreshAudioForCurrentMode(); return; }
    // Fall back silently; the top countdown already instructs users to interact.
    audioBlocked = true;
  }

  // Minimal nudge UI
  let nudgeEl = null;
  function showSoundNudge() {
    if (nudgeEl) return;
    nudgeEl = document.createElement('div');
    nudgeEl.textContent = 'Tap once to enable sound';
    Object.assign(nudgeEl.style, {
      position: 'fixed', zIndex: 10000, left: '50%',
      bottom: 'calc(18px + env(safe-area-inset-bottom,0px))',
      transform: 'translateX(-50%)', padding: '8px 12px',
      background: 'rgba(0,0,0,.7)', color: '#fff',
      border: '1px solid rgba(255,255,255,.2)', borderRadius: '10px',
      font: '600 12px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      pointerEvents: 'none', opacity: '0', transition: 'opacity .25s ease'
    });
    document.body.appendChild(nudgeEl);
    requestAnimationFrame(() => nudgeEl.style.opacity = '1');
    setTimeout(hideSoundNudge, 4000);
  }
  function hideSoundNudge() {
    if (!nudgeEl) return;
    nudgeEl.style.opacity = '0';
    setTimeout(() => { nudgeEl?.remove(); nudgeEl = null; }, 250);
  }

  const NOISE_DEFAULT = { hp: 900, lp: 7500 };
  function setNoiseColor(hzHP, hzLP) {
    if (!hp || !lp) return;
    hp.frequency.value = hzHP;
    lp.frequency.value = hzLP;
  }


  /* ==========================================================================
   * 4) Renderers (Canvas Snow)
   * ======================================================================= */

  const ctx2d = snow.getContext('2d', { alpha: false });
  let rafId = null;
  let resizeHandler = null;

  function startSnow() {
    if (rafId) return;
    snow.classList.add('on');

    let w = (snow.width  = innerWidth);
    let h = (snow.height = innerHeight);
    const img  = ctx2d.createImageData(w, h);
    const data = img.data;

    const frame = () => {
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx2d.putImageData(img, 0, 0);

      if (Math.random() < 0.22) {
        const y = (Math.random() * h) | 0;
        const sliceH = 2 + ((Math.random() * 6) | 0);
        const shift  = (Math.random() * 42 - 21) | 0;
        const row    = ctx2d.getImageData(0, y, w, sliceH);
        ctx2d.putImageData(row, Math.max(-shift, 0), y);
      }

      rafId = requestAnimationFrame(frame);
    };

    resizeHandler = () => {
      w = snow.width  = innerWidth;
      h = snow.height = innerHeight;
    };
    addEventListener('resize', resizeHandler, { passive: true });

    frame();
  }

  function stopSnow() {
    snow.classList.remove('on');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;

    if (resizeHandler) {
      removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }

    ctx2d.fillStyle = '#000';
    ctx2d.fillRect(0, 0, snow.width, snow.height);
  }


  /* ==========================================================================
   * 5) UI Helpers (Overlays / Modes / OSD)
   * ======================================================================= */

  const setCRT    = (on) => crt.classList.toggle('on', !!on);
  const setOSD    = (on) => osd.classList.toggle('on', !!on);
  const setSMPTE  = (on) => smpte.classList.toggle('on', !!on);
  const setChannel = (n) => {
    if (typeof n !== 'number') return;
    osdBadge.textContent = n;
    osdBadge.classList.remove('pop'); void osdBadge.offsetWidth; osdBadge.classList.add('pop');
  };

  function modeForChannel(ch) {
    if (manualMode) { initManualChannelModes(); return channelModeMap.get(ch) || 'snow'; }
    return 'good';
  }

  function refreshAudioForCurrentMode() {
    if (smpte.classList.contains('on')) { toneOn(); } else { toneOff(); }
    if (snow.classList.contains('on'))  { noiseOn(); } else { noiseOff(); }
  }

  function applyMode(mode) {
    // --- Baseline reset (visuals & audio) ---
    setSMPTE(false);  toneOff();
    stopSnow();       noiseOff();

    // Clear any per-mode filters/opacity we might set below
    document.documentElement.style.filter = '';
    snow.style.opacity = '';
    setNoiseColor(NOISE_DEFAULT.hp, NOISE_DEFAULT.lp);

    // Kill CH-10 artifacts when leaving the mode
    cancelSceneMotion();
    stopGhosting();
    stopTearing();

    // Cancel envelopes and hard-zero gains
    if (audioReady) {
      const t = audioCtx.currentTime;
      snowGain?.gain.cancelScheduledValues(t);
      fxGain?.gain.cancelScheduledValues(t);
      snowGain && snowGain.gain.setValueAtTime(0, t);
      fxGain   && fxGain.gain.setValueAtTime(0, t);
    }

    // --- Modes ---
    if (mode === 'bwLite') {
      document.documentElement.style.filter = 'grayscale(1)';
      startSnow();
      snow.style.opacity = '0.18';
      setNoiseColor(1400, 4800);
      noiseOn(0.0006);
      return;
    }

    if (mode === 'goodBad') {
      startSnow();
      snow.style.opacity = '0.16';
      setNoiseColor(1000, 6000);
      noiseOn(0.0006);

      // Artifacts (skip under reduced motion)
      startGhosting();
      startTearing();
      startSceneMotion();
      return;
    }

    if (mode === 'good') return;
    if (mode === 'bars') { setSMPTE(true);  toneOn();  return; }
    if (mode === 'snow') { startSnow();     noiseOn(); return; }
  }

  function showVolumeOSD() {
    if (!volOSD) return;
    const steps = isMuted ? 0 : Math.round(masterVol * 10); // 0..10
    if (volBars) volBars.forEach((b, i) => b.classList.toggle('on', i < steps));
    const pb = volOSD.querySelector('.ec-vol-bars');
    if (pb) pb.setAttribute('aria-valuenow', String(steps));
    volOSD.classList.toggle('muted', isMuted || steps === 0);

    volOSD.classList.add('on');
    clearTimeout(volHideT);
    volHideT = setTimeout(() => volOSD.classList.remove('on'), 1400);
  }

  function tvOffAndRedirect(to) {
    tvOff.classList.add('on');
    playTubeOff();
    if (NO_REDIRECT) return;
    setTimeout(() => { window.location.href = to || '/new/index.html'; }, TUBE_OFF_MS + REDIRECT_BUFFER);
  }

  function startTopCountdown() {
    if (!cdWrap || !cdNum) return;

    cdLeft = COUNTDOWN_SECS;
    cdNum.textContent = cdLeft;
    cdWrap.hidden = false;
    // allow next frame to transition
    requestAnimationFrame(() => cdWrap.classList.add('show'));

    clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      cdLeft -= 1;
      if (cdLeft < 0) { stopTopCountdown('ended'); return; }
      cdNum.textContent = cdLeft;
    }, 1000);
  }

  function stopTopCountdown(reason) {
    if (!cdWrap) return;
    clearInterval(cdTimer);
    cdTimer = null;
    cdWrap.classList.remove('show');
    // fully remove from a11y tree after fade
    setTimeout(() => { if (cdWrap) cdWrap.hidden = true; }, 240);
  }


  /* ==========================================================================
   * 6) Remote (Layout, Emphasis, Input, Keyboard)
   * ======================================================================= */

  function positionRemoteAboveCardFor(el) {
    if (!el) return;
    const card = document.querySelector('.container');
    if (!card) return;

    const stash = {
      vis: el.style.visibility,
      disp: el.style.display,
      w:   el.style.width,
      mw:  el.style.maxWidth
    };
    el.style.visibility = 'hidden';
    el.style.display = 'grid';
    el.style.width = '';
    el.style.maxWidth = '';

    requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      const gap   = 12;
      const cardW = Math.max(0, r.width);

      const preferred = Math.floor(cardW * 0.92);
      const cap       = Math.floor(cardW);
      el.style.maxWidth = `${cap}px`;
      el.style.width    = `${preferred}px`;

      const rw = Math.ceil(el.offsetWidth);
      const rh = Math.ceil(el.offsetHeight);

      let left = Math.round(r.left + (r.width - rw) / 2);
      left = Math.max(12, Math.min(left, window.innerWidth - rw - 12));

      let bottom = Math.round(window.innerHeight - r.top + gap);
      const fits = bottom + rh <= window.innerHeight + 8;
      if (!fits) {
        left   = Math.max(12, Math.min(window.innerWidth - rw - 12, window.innerWidth - rw - 18));
        bottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ec-gap')) || 18;
      }

      el.style.left   = `${left}px`;
      el.style.right  = 'auto';
      el.style.bottom = `${bottom}px`;
      el.style.visibility = stash.vis || '';
      el.style.display    = stash.disp || 'grid';
    });
  }
  // Convenience alias for desktop remote
  function positionRemoteAboveCard() { positionRemoteAboveCardFor(remote); }

  // Bounce → glow → (gap) → repeat, until user acts or auto plan starts
  function scheduleRemoteEmphasis() {
    if (REDUCED_MOTION) return;
    const cycle = () => {
      if (manualMode || autoPlanStarted) return;

      // Bounce
      remote.classList.add('hint-bounce');
      later(() => {
        remote.classList.remove('hint-bounce');
        if (manualMode || autoPlanStarted) return;

        // Glow hold
        remote.classList.add('hint-glow');
        later(() => {
          remote.classList.remove('hint-glow');
          if (manualMode || autoPlanStarted) return;

          // Small gap, then repeat
          later(cycle, HINT_GAP_MS);
        }, HINT_GLOW_MS);

      }, HINT_BOUNCE_MS);
    };
    later(cycle, HINT_INITIAL_MS);
  }

  function enterManualMode() {
    if (manualMode) return;
    manualMode = true;
    clearAllTimers();                 // kills emphasis & pending plan timers
    stopTopCountdown('manual');
    initManualChannelModes();
    setCRT(true);
    setOSD(true);
    
    hideRemotes();
    showActiveRemote();

    tuneToChannelNumber(currentChannel, false);
  }

  function repeatWhileHeld(el, fn, initialDelay = 500, repeatEvery = 220) {
    if (!el) return;
    let holdTimer = null, repTimer = null, wasHeld = false;
    const clear = () => { clearTimeout(holdTimer); clearInterval(repTimer); holdTimer = repTimer = null; wasHeld = false; };
    el.addEventListener('pointerdown', () => {
      holdTimer = setTimeout(() => { wasHeld = true; repTimer = setInterval(fn, repeatEvery); fn(); }, initialDelay);
    });
    el.addEventListener('pointerup', () => { if (!wasHeld) fn(); clear(); });
    el.addEventListener('pointercancel', clear);
    window.addEventListener('blur', clear);
  }

  function wireRemoteFor(container, { positionDesktop = false } = {}) {
    if (!container || container.dataset.wired === '1') return;  // guard
    container.dataset.wired = '1';

    // Early reveal
    later(() => {
      container.hidden = false;
      container.classList.add('show');
      if (positionDesktop) {
        positionRemoteAboveCardFor(container);
        // Start hint loop only for desktop remote
        if (container === remote) scheduleRemoteEmphasis();
      }
    }, 600);

    // Clicks…
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.ec-r-btn');
      if (!btn) return;

      forceAudioReadyWithFallback();
      enterManualMode();

      const act   = btn.dataset.action;
      const digit = btn.dataset.digit;

      if (digit) {
        digitBuffer = (digitBuffer + digit).slice(0, 2);
        setChannel(parseInt(digitBuffer, 10));
        clearTimeout(digitTimer);
        digitTimer = setTimeout(commitDigits, DIGIT_COMMIT_MS);
        return;
      }

      haptic(); // light tap feedback on mobile; harmless elsewhere

      switch (act) {
        case 'power': {
          toneOff(); noiseOff(); stopSnow(); setSMPTE(false);
          if (audioReady) {
            const t = audioCtx.currentTime;
            snowGain?.gain.cancelScheduledValues(t);
            fxGain?.gain.cancelScheduledValues(t);
            snowGain && snowGain.gain.setValueAtTime(0, t);
            fxGain   && fxGain.gain.setValueAtTime(0, t);
          }
          tvOffAndRedirect('/new/index.html');
          return;
        }
        case 'mute':
          isMuted = !isMuted; refreshAudioForCurrentMode(); showVolumeOSD(); return;

        case 'vol-down':
          masterVol = clamp(masterVol - 0.1); refreshAudioForCurrentMode(); showVolumeOSD(); return;

        case 'vol-up':
          masterVol = clamp(masterVol + 0.1); refreshAudioForCurrentMode(); showVolumeOSD(); return;

        default: return;
      }
    });

    // Hold-to-repeat for CH buttons (if present)
    repeatWhileHeld(container.querySelector('[data-action="ch-down"]'), () => tuneToIndex(currentIdx - 1));
    repeatWhileHeld(container.querySelector('[data-action="ch-up"]'),   () => tuneToIndex(currentIdx + 1));
  }

  function activeRemoteEl() {
    // same test used in wireRemotes()
    return window.matchMedia('(pointer: coarse), (hover: none)').matches ? remoteM : remote;
  }
  function showActiveRemote() {
    const el = activeRemoteEl();
    if (!el) return;
    el.hidden = false;
    el.classList.add('show');
    positionRemoteAboveCardFor(el);
  }
  function hideRemotes() {
    [remote, remoteM].forEach(el => {
      if (!el) return;
      el.classList.remove('hint-bounce', 'hint-glow', 'show');
      // allow fade-out transition
      setTimeout(() => { if (el) el.hidden = true; }, 260);
    });
  }

  function wireRemotes() {
    const isMobileUI = window.matchMedia('(pointer: coarse), (hover: none)').matches;
    const active     = isMobileUI ? remoteM : remote;
    const inactive   = isMobileUI ? remote : remoteM;

    // ensure inactive stays hidden
    if (inactive) { inactive.hidden = true; inactive.classList.remove('show'); }

    // wire only the active remote
    wireRemoteFor(active, { positionDesktop: !isMobileUI });
    later(() => positionRemoteAboveCardFor(active), 650);

    // keep it aligned with the card on resize/orientation
    const onLayout = () => positionRemoteAboveCardFor(active);
    addEventListener('resize', onLayout, { passive: true });
    addEventListener('orientationchange', onLayout);
  }

  // Keyboard controls
  function setupKeyboard() {
    const CH_THROTTLE  = 180;
    const VOL_THROTTLE = 120;
    let lastChAt = 0, lastVolAt = 0;

    const chStep = (delta) => {
      const now = Date.now();
      if (now - lastChAt < CH_THROTTLE) return;
      lastChAt = now;
      forceAudioReady();
      enterManualMode();
      tuneToIndex(currentIdx + delta);
    };

    const volStep = (delta) => {
      const now = Date.now();
      if (now - lastVolAt < VOL_THROTTLE) return;
      lastVolAt = now;
      forceAudioReadyWithFallback();
      enterManualMode();
      masterVol = clamp(masterVol + delta);
      refreshAudioForCurrentMode();
      showVolumeOSD();
    };

    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (/^(Digit|Numpad)[0-9]$/.test(e.code)) {
        e.preventDefault();
        forceAudioReady();
        digitBuffer = (digitBuffer + e.code.slice(-1)).slice(0, 2);
        setChannel(parseInt(digitBuffer, 10));
        clearTimeout(digitTimer);
        digitTimer = setTimeout(commitDigits, DIGIT_COMMIT_MS);
        return;
      }

      switch (e.code) {
        case 'ArrowUp':    e.preventDefault(); chStep(+1); return;
        case 'ArrowDown':  e.preventDefault(); chStep(-1); return;

        case 'ArrowRight': e.preventDefault(); volStep(+0.1); return;
        case 'ArrowLeft':  e.preventDefault(); volStep(-0.1); return;

        case 'Enter':      e.preventDefault(); commitDigits(); return;
        case 'Backspace':  e.preventDefault(); digitBuffer = ''; clearTimeout(digitTimer); digitTimer = null; return;

        case 'KeyM':       e.preventDefault(); isMuted = !isMuted; refreshAudioForCurrentMode(); showVolumeOSD(); return;
        case 'KeyP':
        case 'Escape':
          e.preventDefault();
          toneOff(); noiseOff(); stopSnow(); setSMPTE(false);
          if (audioReady) {
            const t0 = audioCtx.currentTime;
            snowGain?.gain.cancelScheduledValues(t0);
            fxGain?.gain.cancelScheduledValues(t0);
            snowGain && snowGain.gain.setValueAtTime(0, t0);
            fxGain   && fxGain.gain.setValueAtTime(0, t0);
          }
          tvOffAndRedirect('/new/index.html');
          return;

        case 'AudioVolumeUp':   e.preventDefault(); volStep(+0.1); return;
        case 'AudioVolumeDown': e.preventDefault(); volStep(-0.1); return;
        case 'AudioVolumeMute': e.preventDefault(); isMuted = !isMuted; refreshAudioForCurrentMode(); showVolumeOSD(); return;

        default: return;
      }
    });
  }

  function forceAudioReady() {
    forceAudioReadyWithFallback();
    ensureAudioCtx();
    initNoise();
    initTone();
  }

  function tuneToIndex(idx, blip = true) {
    currentIdx = (idx + CHANNELS.length) % CHANNELS.length;
    tuneToChannelNumber(CHANNELS[currentIdx], blip);
  }

  function tuneToChannelNumber(ch, blip = true) {
    const snap = CHANNELS.indexOf(ch);
    if (snap !== -1) currentIdx = snap;
    currentChannel = CHANNELS[currentIdx];

    const mode = modeForChannel(currentChannel);
    setOSD(true);
    setChannel(currentChannel);
    applyMode(mode);
    refreshAudioForCurrentMode();

    if (blip && audioUnlocked && audioReady && mode === 'snow') {
      const t = audioCtx.currentTime;
      const start = _effective(0.35);
      const end   = _effective(0.05);
      fxGain.gain.cancelScheduledValues(t);
      fxGain.gain.setValueAtTime(start, t);
      fxGain.gain.exponentialRampToValueAtTime(Math.max(0.001, end), t + 0.12);
      fxGain.gain.setTargetAtTime(0.0, t + 0.16, 0.03);
    }
  }


  /* ==========================================================================
   * 7) Sequencer (Auto Plan)
   * ======================================================================= */

  function runPlan(plan) {
    let i = 0;

    function next() {
      if (i >= plan.length) return;
      const step = plan[i++];

      if (step.type === 'redirect') {
        setSMPTE(false); toneOff();
        stopSnow();      noiseOff();
        setOSD(false);
        tvOffAndRedirect(step.to);
        return;
      }

      setOSD(true);
      if ('channel' in step) setChannel(step.channel);

      if (step.type === 'good') {
        setSMPTE(false); toneOff();
        stopSnow();      noiseOff();
        refreshAudioForCurrentMode();
        later(next, step.duration);

      } else if (step.type === 'bars') {
        noiseOff();      stopSnow();
        setSMPTE(true);  toneOn();
        refreshAudioForCurrentMode();
        later(() => { setSMPTE(false); toneOff(); next(); }, step.duration);

      } else if (step.type === 'snow') {
        setSMPTE(false); toneOff();
        startSnow();     noiseOn();
        refreshAudioForCurrentMode();
        later(() => { stopSnow(); noiseOff(); next(); }, step.duration);
      }
    }

    // Turn CRT on early (separate from auto plan start)
    later(() => { setCRT(true); }, CRT_START_DELAY);

    // Start plan after the idle window
    later(() => {
      autoPlanStarted = true;                    // stop emphasis loop
      stopTopCountdown('auto');
      hideRemotes();
      remote.classList.remove('hint-bounce', 'hint-glow');
      setCRT(true);                              // idempotent if already on
      later(next, CRT_RAMP + 450);
    }, START_DELAY);
  }


  /* ==========================================================================
   * 8) Boot
   * ======================================================================= */

  wireRemotes();
  setupKeyboard();
  runPlan(CHANNEL_PLAN);
  startTopCountdown();

  // Helpers used above
  function commitDigits() {
    if (!digitBuffer) return;
    const ch = parseInt(digitBuffer, 10);
    if (!Number.isNaN(ch)) tuneToChannelNumber(ch);
    digitBuffer = '';
    if (digitTimer) { clearTimeout(digitTimer); digitTimer = null; }
  }

})();
