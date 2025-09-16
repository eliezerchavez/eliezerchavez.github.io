// ========= CONFIG =========
const IMG = {
    "COL-01": { logo: { src: "img/col-01.svg", bg: "#FFFFFF" }, button: { fg: "#002E6D" } },
    "COL-02": { logo: { src: "img/col-02.svg", bg: "#002E6D" }, button: { fg: "#002E6D" } },
    "GRS-01": { logo: { src: "img/grs-01.svg", bg: "#FFFFFF" }, button: { fg: "#1D252C" } },
    "GRS-02": { logo: { src: "img/grs-02.svg", bg: "#1D252C" }, button: { fg: "#1D252C" } },
    "NEG-01": { logo: { src: "img/neg-01.svg", bg: "#1D252C" }, button: { fg: "#1D252C" } },
    "OUT-01": { logo: { src: "img/out-01.svg", bg: "#FFFFFF" }, button: { fg: "#1D252C" } },
    "POS-01": { logo: { src: "img/pos-01.svg", bg: "#FFFFFF" }, button: { fg: "#002E6D" } },
    "POS-02": { logo: { src: "img/pos-02.svg", bg: "#FFFFFF" }, button: { fg: "#00C4B3" } }
};

// Grab the query string from the current URL
const params = new URLSearchParams(window.location.search);

// Showcase controls
const TARGET_MS = 3000;       // total shuffle duration
const FRAME_MS = 100;         // min time each logo stays visible
const FINAL_PAUSE_MS = 300;   // pause before revealing buttons
const FINAL_BLANK_MS = 1250;  // blank hold before final entrance
const FINAL_FADE_MS = 500;    // final slide/fade duration
const FINAL_WIPE_MS = 1250;   // duration of the wipe animation
const persistSession = false; // if true, remembers final logo for session
const FINAL_OVERRIDE = params.get('final') || null;  // e.g., "COL-02" to force final
const SHOW_TIMER = params.has('debug') || false;     // shows elapsed + tiny toast when true

// ========= STATE / DOM =========
const SESSION_KEY = 'ecLogoShowcase';
const codes = Object.keys(IMG);
const imgEl = document.getElementById('logo');
const actEl = document.getElementById('actions');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lastShown = null;
let currentRunToken = 0; // increments to cancel prior runs

// Debug timer + toast (only if SHOW_TIMER)
let timerEl = null;
let toastEl = null;
if (SHOW_TIMER) {
    timerEl = document.createElement('div');
    Object.assign(timerEl.style, {
        position: 'fixed', bottom: '10px', left: '10px',
        font: '12px/1 monospace', color: '#fff',
        background: 'rgba(0,0,0,0.55)', padding: '4px 6px',
        borderRadius: '4px', zIndex: '9999', pointerEvents: 'none'
    });
    document.body.appendChild(timerEl);

    toastEl = document.createElement('div');
    Object.assign(toastEl.style, {
        position: 'fixed', bottom: '34px', left: '10px',
        font: '12px/1 monospace', color: '#fff',
        background: 'rgba(0,0,0,0.7)', padding: '4px 6px',
        borderRadius: '4px', zIndex: '9999', opacity: '0',
        transition: 'opacity .18s ease', pointerEvents: 'none'
    });
    document.body.appendChild(toastEl);
}

// ========= UTILS =========
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function showToast(msg, ms = 800) {
    if (!SHOW_TIMER || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    setTimeout(() => { toastEl && (toastEl.style.opacity = '0'); }, ms);
}

function pickDifferent() {
    if (codes.length <= 1) return codes[0];
    let code;
    do { code = codes[Math.floor(Math.random() * codes.length)]; }
    while (code === lastShown);
    return code;
}

// Preload images quickly (don’t block >250ms)
function preloadAll() {
    const promises = codes.map(c => new Promise(resolve => {
        const src = IMG[c]?.logo?.src; if (!src) return resolve();
        const link = document.createElement('link');
        link.rel = 'preload'; link.as = 'image'; link.href = src;
        link.onload = link.onerror = resolve;
        document.head.appendChild(link);
    }));
    return Promise.race([Promise.all(promises), sleep(250)]);
}

function applyTheme(code) {
    const item = IMG[code]; if (!item) return;
    document.body.style.backgroundColor = item.logo.bg || '#FFFFFF';
    document.documentElement.style.setProperty('--btn-fg', (item.button && item.button.fg) || '#002E6D');
}

// Instant swap for shuffle frames
async function showInstant(code) {
    const item = IMG[code]; if (!item) return;
    applyTheme(code);
    const nextSrc = item.logo.src || imgEl.src;
    if (nextSrc === imgEl.src) { lastShown = code; return; }
    imgEl.src = nextSrc;
    try { await imgEl.decode(); } catch { }
    lastShown = code;
}

// One clean fade for non-finale cases
async function showFade(code) {
    const item = IMG[code]; if (!item) return;
    applyTheme(code);
    imgEl.classList.remove('fade-in');
    imgEl.classList.add('fade-out');
    await sleep(80);
    const nextSrc = item.logo.src || imgEl.src;
    imgEl.src = nextSrc;
    try { await imgEl.decode(); } catch { }
    imgEl.classList.remove('fade-out');
    imgEl.classList.add('fade-in');
    lastShown = code;
}

// PowerPoint-style "Wipe from Left" without a curtain
async function showFinalEntrance(code) {
    const item = IMG[code]; if (!item) return;

    // 0) Clean up any previous animation styles/classes
    imgEl.classList.remove('fade-in', 'fade-out');
    imgEl.style.transition = '';
    imgEl.style.opacity = '1';
    imgEl.style.transform = 'none';
    imgEl.style.clipPath = '';
    imgEl.style.webkitClipPath = '';
    imgEl.style.willChange = '';

    // 1) Set the final theme (bg + button fg)
    applyTheme(code);

    // 2) Go truly blank (logo hidden), then hold
    imgEl.style.opacity = '0';  // hide the logo completely
    await sleep(FINAL_BLANK_MS); // <- your blank pause

    // 3) Ensure the final image is loaded/decoded while hidden
    const nextSrc = item.logo.src || imgEl.src;
    if (nextSrc !== imgEl.src) imgEl.src = nextSrc;
    try { await imgEl.decode(); } catch { }

    // 4) If clip-path is supported, do a real wipe; otherwise, fall back to fade
    const canClip = CSS && (CSS.supports('clip-path', 'inset(0 0 0 0)') || CSS.supports('-webkit-clip-path', 'inset(0 0 0 0)'));
    if (!canClip) {
        // Fallback: simple fade in
        imgEl.style.opacity = '0';
        // tiny tick so the opacity=0 "sticks" before we transition
        await new Promise(r => requestAnimationFrame(r));
        imgEl.style.transition = `opacity ${FINAL_FADE_MS}ms ease`;
        imgEl.style.opacity = '1';
        lastShown = code;
        return;
    }

    // 5) Prep for wipe: make the logo visible but fully clipped
    //    (left→right reveal: start with right side fully clipped = 100%)
    imgEl.style.willChange = 'clip-path';
    imgEl.style.opacity = '1'; // logo becomes visible but fully clipped → appears blank
    imgEl.style.clipPath = 'inset(0 100% 0 0)';
    imgEl.style.webkitClipPath = 'inset(0 100% 0 0)';

    // Force reflow so the starting clip is registered
    void imgEl.getBoundingClientRect();

    // 6) Animate the wipe: unclipping from the right side to 0%
    //    This reveals the image progressively from left → right.
    await new Promise(r => requestAnimationFrame(r));
    imgEl.style.transition = `clip-path ${FINAL_WIPE_MS}ms ease, -webkit-clip-path ${FINAL_WIPE_MS}ms ease`;
    imgEl.style.clipPath = 'inset(0 0 0 0)';
    imgEl.style.webkitClipPath = 'inset(0 0 0 0)';

    // 7) Wait for the wipe to complete, then clean up
    await sleep(FINAL_WIPE_MS + 20);
    imgEl.style.transition = '';
    imgEl.style.willChange = '';
    lastShown = code;
}

function resetUIBeforeRun() {
    actEl.classList.remove('show');
    imgEl.style.transition = '';           // clear custom transition
    imgEl.style.opacity = '1';
    imgEl.style.transform = 'translateX(0)';
    lastShown = null;
}

function replayShowcase() {
    showToast('Replaying…', 700);
    currentRunToken++;           // cancel any current run
    resetUIBeforeRun();
    preloadAll().then(runShowcase);
}

// ========= SHOWCASE =========
async function runShowcase() {
    const myToken = ++currentRunToken; // claim this run

    // Session stickiness
    if (persistSession) {
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved && IMG[saved]) {
            if (myToken !== currentRunToken) return;
            await showFade(saved);
            if (myToken !== currentRunToken) return;
            actEl.classList.add('show');
            return;
        }
    }

    // Reduced motion
    if (prefersReduced) {
        const finalCode = (FINAL_OVERRIDE && IMG[FINAL_OVERRIDE]) ? FINAL_OVERRIDE : pickDifferent();
        if (myToken !== currentRunToken) return;
        await showFade(finalCode);
        if (myToken !== currentRunToken) return;
        actEl.classList.add('show');
        return;
    }

    const start = performance.now();
    let now = start;

    while (now - start < TARGET_MS - FINAL_PAUSE_MS) {
        if (myToken !== currentRunToken) return; // aborted mid-loop

        if (SHOW_TIMER && timerEl) {
            const s = ((now - start) / 1000).toFixed(1);
            timerEl.textContent = `Elapsed: ${s}s`;
        }

        const code = pickDifferent();
        const frameStart = performance.now();
        await showInstant(code);
        if (myToken !== currentRunToken) return; // aborted after frame

        const elapsed = performance.now() - frameStart;
        const remaining = Math.max(0, FRAME_MS - elapsed);
        if (remaining > 0) await sleep(remaining);

        now = performance.now();
    }

    // Final (different from lastShown unless overridden)
    const finalCode = (FINAL_OVERRIDE && IMG[FINAL_OVERRIDE]) ? FINAL_OVERRIDE : pickDifferent();
    if (myToken !== currentRunToken) return;

    if (prefersReduced) {
        await showFade(finalCode);
    } else {
        await showFinalEntrance(finalCode);
    }
    if (myToken !== currentRunToken) return;

    if (persistSession) sessionStorage.setItem(SESSION_KEY, finalCode);
    await sleep(Math.max(0, FINAL_PAUSE_MS));
    if (myToken !== currentRunToken) return;

    actEl.classList.add('show');
}

// ========= INTERACTION =========
// Keyboard: press "R" to replay
document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') replayShowcase();
});

// Click the logo to replay
imgEl.style.cursor = 'pointer';
imgEl.addEventListener('click', replayShowcase);

// ========= BOOT =========
preloadAll().then(runShowcase);
