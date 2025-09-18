// ======================================
// DOM + FLAGS
// ======================================
const imgEl = document.getElementById('logo');
const tagEl = document.getElementById('tagline');
const actEl = document.getElementById('actions');
const repEl = document.getElementById('replay');
const fooEl = document.querySelector('.site-footer');
const dbgEl = document.getElementById('debugBox');
const boxEl = document.querySelector('.logo-box');
const tmkEl = document.querySelector('.trademark');

const qs = new URLSearchParams(window.location.search);
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ======================================
// CONFIG
// ======================================
const CONFIG = {
    SHOWCASE: {
        DURATION: Number(qs.get('duration')) || 3000,
        FRAME_MIN: 100,
        FINAL_HOLD: 700,
        THEME: (qs.get('theme') || '').toUpperCase()
    },
    ANIMATION: {
        NAME: (qs.get('animation') || '').toLowerCase(),
    },
    SEQUENCE: {
        TAGLINE_DELAY: 250,
        ACTION_DELAY: 500,
        REPLAY_DELAY: 1000
    },
    COLOR: {
        BACKGROUND: '#FFFFFF',
        FOREGROUND: '#002E6D',
        LOGO: { GLOW: '#1D252C' },
        FOOTER: '#1D252C'
    },
    DEBUG: (qs.has('debug') && !['0', 'false'].includes(qs.get('debug')?.toLowerCase()))
};

// ======================================
// RUNTIME STORE
// ======================================
const RUNTIME = {
    theme: '—',          // final theme code
    animation: '—',      // final animation name
    times: {
        start: 0,          // perf.now() at run start
        showcase: 0,       // ms (duration of shuffle)
        tagline: null,     // ms since start when shown
        actions: null,     // ms since start when shown
        replay: null,      // ms since start when visible
        total: 0           // ms since start (last milestone)
    },
    events: []           // [{name, t, sinceStart, data?}, ...]
};

function rtReset() {
    RUNTIME.theme = '—';
    RUNTIME.animation = '—';
    RUNTIME.times = {
        start: performance.now(),
        showcase: 0,
        tagline: null,
        actions: null,
        replay: null,
        total: 0
    };
    RUNTIME.events.length = 0;
}

// Generic milestone recorder (and optional console event)
function mark(name, data) {
    const t = performance.now();
    const sinceStart = t - (RUNTIME.times.start || t);
    RUNTIME.times[name] = sinceStart;
    RUNTIME.times.total = sinceStart;

    const evt = { name, t, sinceStart, ...(data ? { data } : {}) };
    RUNTIME.events.push(evt);

    // forward to your console logger if present (supports either LOG or log)
    if (window.LOG?.info) window.LOG.info(`event:${name}`, evt);
    if (window.log?.event) window.log.event(name, evt);
}

// wire logger now that CONFIG is known
window.LOG?.setEnabled?.(CONFIG.DEBUG || ['log', 'trace', 'verbose'].includes((qs.get('log') || '').toLowerCase()));

// ======================================
// CAPABILITIES
// ======================================
const MOTION_FORCE =
    ['force', 'on', '1', 'true', 'yes'].includes((qs.get('motion') || '').toLowerCase()) ||
    !!CONFIG.ANIMATION.NAME;

const canClip =
    typeof CSS !== 'undefined' &&
    (CSS.supports('clip-path', 'inset(0 0 0 0)') ||
        CSS.supports('-webkit-clip-path', 'inset(0 0 0 0)'));

// ======================================
// THEME MAP
// ======================================
const THEME = {
    "COL-01": { bg: { color: "#FFFFFF" }, logo: { glow: { color: "#1D252C" } }, button: { color: "#002E6D" }, tagline: { color: "#002E6D" }, footer: { color: "#1D252C" } },
    "COL-02": { bg: { color: "#002E6D" }, logo: { glow: { color: "#FFFFFF" } }, button: { color: "#002E6D" }, tagline: { color: "#FFFFFF" }, footer: { color: "#FFFFFF" } },
    "GRS-01": { bg: { color: "#FFFFFF" }, logo: { glow: { color: "#1D252C" } }, button: { color: "#1D252C" }, tagline: { color: "#1D252C" }, footer: { color: "#1D252C" } },
    "GRS-02": { bg: { color: "#1D252C" }, logo: { glow: { color: "#FFFFFF" } }, button: { color: "#1D252C" }, tagline: { color: "#FFFFFF" }, footer: { color: "#FFFFFF" } },
    "NEG-01": { bg: { color: "#1D252C" }, logo: { glow: { color: "#FFFFFF" } }, button: { color: "#1D252C" }, tagline: { color: "#FFFFFF" }, footer: { color: "#FFFFFF" } },
    "OUT-01": { bg: { color: "#FFFFFF" }, logo: { glow: { color: "#1D252C" } }, button: { color: "#1D252C" }, tagline: { color: "#1D252C" }, footer: { color: "#1D252C" } },
    "POS-01": { bg: { color: "#FFFFFF" }, logo: { glow: { color: "#1D252C" } }, button: { color: "#002E6D" }, tagline: { color: "#002E6D" }, footer: { color: "#1D252C" } },
    "POS-02": { bg: { color: "#1D252C" }, logo: { glow: { color: "#FFFFFF" } }, button: { color: "#1D252C" }, tagline: { color: "#00C4B3" }, footer: { color: "#FFFFFF" } }
};

// ======================================
// UTILS
// ======================================
const secs = (ms) => (ms / 1000).toFixed(2) + 's';
const sleep = (ms) => new Promise(res => (globalThis.setTimeout || window.setTimeout).call(globalThis, res, ms));
const raf = () => new Promise(r => requestAnimationFrame(r));
const randFloat = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(randFloat(min, max + 1));
const setStyle = (el, obj) => { for (const k in obj) el.style[k] = obj[k]; };
const getImgSrc = (code) => (code ? '/img/' + code.toLowerCase() + '.svg' : null);

const hexToRgbTuple = (hex) => {
    if (!hex) return [255, 255, 255];
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const int = parseInt(h, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

async function transition(el, { dur = 600, ease = 'ease', from = {}, props = [], to = {} }) {
    el.style.transition = 'none';
    setStyle(el, from);
    await raf(); await raf(); // commit start styles

    el.style.transition = props.length
        ? props.map(p => `${p} ${dur}ms ${ease}`).join(', ')
        : `all ${dur}ms ${ease}`;

    setStyle(el, to);
    await sleep(dur + 20);
    el.style.transition = 'none';
}

// ======================================
/* THEME / IMAGES */
// ======================================
function applyTheme(code) {
    const item = THEME[code];
    if (!item) return;
    document.body.style.backgroundColor = item.bg?.color || CONFIG.COLOR.BACKGROUND;
    document.documentElement.style.setProperty('--tag-color', item.tagline?.color || CONFIG.COLOR.FOREGROUND);
    document.documentElement.style.setProperty('--btn-color', item.button?.color || CONFIG.COLOR.FOREGROUND);
    document.documentElement.style.setProperty('--foo-color', item.footer?.color || CONFIG.COLOR.FOOTER);
    LOG.log('Theme applied', { code, bg: item.bg?.color, btn: item.button?.color, tag: item.tagline?.color });
}

async function ensureLogoSource(code) {
    const next = getImgSrc(code);
    if (next && imgEl.src !== next) {
        imgEl.src = next;
        if (imgEl.decode) { try { await imgEl.decode(); } catch { } }
    }
}

async function showInstant(code) {
    const item = THEME[code];
    if (!item) return;
    applyTheme(code);
    const next = getImgSrc(code);
    if (next) {
        imgEl.src = next;
        if (imgEl.decode) { try { await imgEl.decode(); } catch { } }
        LOG.log('Logo frame shown', { code, src: next });
    }
}

// ======================================
// ANIMATIONS
// ======================================
const ANIMATION = {
    appear: async (code, el) => {
        await ensureLogoSource(code);
        setStyle(el, { opacity: '1', transition: 'none' });
    },
    blur: async (code, el, dur = 750, startBlur = 3) => {
        await ensureLogoSource(code);
        await transition(el, {
            dur,
            from: { filter: `blur(${startBlur}px)`, opacity: '1' },
            props: ['filter'],
            to: { filter: 'blur(0px)' }
        });
    },
    fade: async (code, el, dur = 600) => {
        await ensureLogoSource(code);
        await transition(el, {
            dur,
            from: { opacity: '0' },
            props: ['opacity'],
            to: { opacity: '1' }
        });
    },
    scale: async (code, el, dur = 650, fromScale = 0.985) => {
        await ensureLogoSource(code);
        await transition(el, {
            dur,
            from: { opacity: '1', transform: `scale(${fromScale})` },
            props: ['transform'],
            to: { transform: 'scale(1)' }
        });
    },
    slide: async (code, el, dur = 700, distance = 14) => {
        await ensureLogoSource(code);
        await transition(el, {
            dur,
            from: { opacity: '1', transform: `translateY(${distance}px)` },
            props: ['transform'],
            to: { transform: 'translateY(0)' }
        });
    },
    // Curtain-based wipe to allow glow spill beyond box while hiding reveal seam
    wipe: async (code, el, dur = 900, { bg } = {}) => {
        await ensureLogoSource(code);

        const host = el.closest('.logo-box') || el.parentElement || document.body;
        const bgColor = bg || getComputedStyle(document.body).backgroundColor || CONFIG.COLOR.BACKGROUND;

        const curtain = document.createElement('div');
        Object.assign(curtain.style, {
            position: 'absolute',
            inset: '-2px -3px -2px -3px',
            background: bgColor,
            transform: 'translate3d(0,0,0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            pointerEvents: 'none',
            zIndex: '2'
        });

        host.appendChild(curtain);

        el.style.transition = 'none';
        el.style.opacity = '1';

        await raf(); await raf();

        curtain.style.transition = `transform ${dur}ms ease`;
        curtain.style.transform = 'translate3d(120%,0,0)';

        await sleep(dur + 24);
        curtain.remove();
    }
};

// Auto-wrap all animation functions for console tracing
window.LOG?.wrapMethods?.(ANIMATION, 'ANIMATION');

// ======================================
// PICKERS
// ======================================
function pickRandomDifferent(prev) {
    const codes = Object.keys(THEME);
    if (codes.length <= 1) return codes[0];
    let code;
    do { code = codes[Math.floor(Math.random() * codes.length)]; } while (code === prev);
    return code;
}

let lastAnimation = null;
function pickFinalAnimation() {
    if (CONFIG.ANIMATION.NAME && ANIMATION[CONFIG.ANIMATION.NAME]) {
        lastAnimation = CONFIG.ANIMATION.NAME;
        return lastAnimation;
    }
    const pool = ['fade', ...(canClip ? ['wipe'] : []), 'slide', 'scale', 'blur'];
    if (lastAnimation) {
        const candidates = pool.filter(n => n !== lastAnimation);
        if (candidates.length) {
            lastAnimation = candidates[Math.floor(Math.random() * candidates.length)];
            return lastAnimation;
        }
    }
    lastAnimation = pool[Math.floor(Math.random() * pool.length)];
    return lastAnimation;
}

// ======================================
// FLOW HELPERS
// ======================================
async function preloadLogos(timeoutMs = 300) {
    const impl = async () => {
        const codes = Object.keys(THEME);
        const hints = codes.map(code => new Promise(resolve => {
            const src = getImgSrc(code); if (!src) return resolve();
            const link = document.createElement('link');
            link.as = 'image';
            link.href = src;
            link.rel = 'preload';
            link.onload = link.onerror = resolve;
            document.head.appendChild(link);
        }));
        const loads = codes.map(code => new Promise(resolve => {
            const src = getImgSrc(code); if (!src) return resolve();
            const im = new Image();
            im.onload = im.onerror = resolve;
            im.src = src;
        }));
        return Promise.race([
            Promise.all([...hints, ...loads]),
            new Promise(r => setTimeout(r, timeoutMs))
        ]);
    };
    return window.LOG?.timeAsync ? LOG.timeAsync('preloadLogos', impl) : impl();
}

async function shuffleForDuration(totalMs = CONFIG.SHOWCASE.DURATION, frameMs = CONFIG.SHOWCASE.FRAME_MIN) {
    let last = null;
    const start = performance.now();

    while (performance.now() - start < totalMs) {
        const code = pickRandomDifferent(last);
        const frameStart = performance.now();
        await showInstant(code);
        last = code;

        const elapsed = performance.now() - frameStart;
        const wait = Math.max(0, frameMs - elapsed);
        if (wait > 0) await sleep(wait);
    }
    return last;
}

async function finalReveal(code) {
    setStyle(imgEl, {
        clipPath: 'none', filter: 'none', opacity: '0', transform: 'none',
        transition: 'none', webkitClipPath: 'none', willChange: ''
    });

    applyTheme(code);
    await sleep(CONFIG.SHOWCASE.FINAL_HOLD);
    await raf(); await raf();

    const glowHex = THEME[code]?.logo?.glow.color || CONFIG.COLOR.LOGO.GLOW;
    const [gr, gg, gb] = hexToRgbTuple(glowHex);
    document.documentElement.style.setProperty('--glow-rgb', `${gr}, ${gg}, ${gb}`);

    const name = pickFinalAnimation();
    RUNTIME.animation = name;
    window.LOG?.info?.('animation.selected', { animation: name });
    window.log?.info?.('animation.selected', { animation: name });
    mark('animation', { animation: name });
    dbgPush(`Animation: ${name}`);

    const dur = Math.round(randFloat(560, 920));
    const distance = randInt(10, 18);
    const scaleFrom = randFloat(0.975, 0.99);
    const blurStart = randFloat(2.5, 3.5);
    LOG.info('[finalReveal] params', { name, dur, distance, scaleFrom, blurStart });

    if (prefersReduced && !MOTION_FORCE) {
        await ANIMATION.appear(code, imgEl);
    } else {
        if (name === 'slide') await ANIMATION.slide(code, imgEl, dur, distance);
        else if (name === 'scale') await ANIMATION.scale(code, imgEl, dur, scaleFrom);
        else if (name === 'blur') await ANIMATION.blur(code, imgEl, dur, blurStart);
        else await ANIMATION[name](code, imgEl, dur);
    }

    imgEl.classList.remove('logo-glow'); void imgEl.offsetWidth; imgEl.classList.add('logo-glow');

    await sleep(80);
    if ((!prefersReduced || MOTION_FORCE) && boxEl) {
        boxEl.style.setProperty('--logo-url', `url("${imgEl.src}")`);
        boxEl.classList.remove('lucas'); void boxEl.offsetWidth;
        boxEl.style.setProperty('--lucas-sweep-ms', '1200ms');
        boxEl.classList.add('lucas');
    }
}

// ======================================
// DEBUG (panel — minimal fields)
// ======================================
let dbgBuffer = [];
let dbgTickerId = null;

function dbgPush(line) {
    if (!CONFIG.DEBUG || !dbgEl) return;
    const now = performance.now() - (RUNTIME.times.start || 0);
    dbgBuffer.push(`[+${secs(now)}] ${line}`);
    dbgEl.hidden = false;
    dbgEl.textContent = dbgBuffer.join('\n');
    dbgEl.scrollTop = dbgEl.scrollHeight;
}

function dbgStopTicker() {
    if (dbgTickerId) {
        clearInterval(dbgTickerId);
        dbgTickerId = null;
    }
}

function setFooterHeightVar() {
    const h = fooEl ? fooEl.offsetHeight : 0;
    document.documentElement.style.setProperty('--footer-h', `${h}px`);
}

// ======================================
// MAIN FLOW
// ======================================
let isRunning = false;

async function runShowcaseFlow() {
    if (isRunning) return;
    isRunning = true;

    if (tmkEl) tmkEl.style.opacity = 0;
    if (tagEl) tagEl.style.opacity = 0;
    if (actEl) { actEl.classList.remove('show'); actEl.style.opacity = 0; }
    if (repEl) repEl.style.opacity = 0;
    if (fooEl) fooEl.style.opacity = 0;

    rtReset();
    if (CONFIG.DEBUG) { dbgBuffer = []; dbgPush('Flow started'); }

    await preloadLogos();

    const s0 = performance.now();
    const lastShuffleCode = await shuffleForDuration();
    const showcaseMs = performance.now() - s0;
    RUNTIME.times.showcase = showcaseMs;
    RUNTIME.times.total = showcaseMs;
    mark('showcase', { duration: showcaseMs, lastFrame: lastShuffleCode });
    if (CONFIG.DEBUG) dbgPush(`Showcase done in ${secs(showcaseMs)}`);

    const finalCode = CONFIG.SHOWCASE.THEME || pickRandomDifferent(lastShuffleCode);
    RUNTIME.theme = finalCode;
    window.LOG?.info?.('theme.selected', { theme: finalCode });
    window.log?.info?.('theme.selected', { theme: finalCode });

    await finalReveal(finalCode);
    if (tmkEl) tmkEl.style.opacity = 1;
    mark('theme', { theme: finalCode });
    dbgPush(`Theme: ${finalCode}`);

    await sleep(CONFIG.SEQUENCE.TAGLINE_DELAY);
    if (tagEl) {
        tagEl.style.transition = 'opacity .35s ease, transform .35s ease';
        tagEl.style.opacity = 1;
        mark('tagline');
        if (CONFIG.DEBUG) dbgPush('Tagline shown');
    }

    await sleep(CONFIG.SEQUENCE.ACTION_DELAY);
    if (actEl) {
        actEl.style.transition = 'opacity .2s ease';
        actEl.style.opacity = 1;
        actEl.classList.add('show');
        mark('actions');
        if (CONFIG.DEBUG) dbgPush('Actions shown');
    }

    await sleep(CONFIG.SEQUENCE.REPLAY_DELAY);
    if (repEl) repEl.style.opacity = 1;
    if (fooEl) {
        fooEl.style.opacity = 1;
        setFooterHeightVar();
    }
    mark('replay');
    if (CONFIG.DEBUG) { dbgPush('Replay visible'); dbgStopTicker(); }

    isRunning = false;
}

// ======================================
// EVENTS
// ======================================
if (repEl) repEl.addEventListener('click', runShowcaseFlow);

window.addEventListener('load', setFooterHeightVar);
window.addEventListener('resize', setFooterHeightVar);

if (window.ResizeObserver && fooEl) {
    new ResizeObserver(setFooterHeightVar).observe(fooEl);
}

document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (/^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

    if (e.key === 'r' || e.key === 'R' || e.key === 'Enter' || e.key === ' ') {
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
        runShowcaseFlow();
    }
});

document.addEventListener('DOMContentLoaded', runShowcaseFlow);
