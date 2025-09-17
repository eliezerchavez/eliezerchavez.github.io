/* Hybrid structured logger (console-only)
 * Exposes BOTH:
 *   window.LOG  -> { setEnabled, setEpoch, log, info, timeAsync, wrapMethods }
 *   window.log  -> { info, warn, error, event, trace }
 *
 * Enabling:
 *   ?log=on|1|true|trace|verbose  OR  ?debug
 * Programmatic:
 *   LOG.setEnabled(true|false), LOG.setEpoch(performance.now())
 */
(function (global) {
  const q = new URLSearchParams(global.location ? global.location.search : '');
  const wantsLog = (q.get('log') || '').toLowerCase();
  let ENABLED =
    ['on', '1', 'true', 'trace', 'verbose'].includes(wantsLog) ||
    ['1', 'true'].includes((q.get('debug') || '').toLowerCase());
  let EPOCH = (global.performance && performance.now) ? performance.now() : Date.now();
  const NS = '[app]';

  // --- helpers ---
  const now = () => ((global.performance && performance.now) ? performance.now() : Date.now());
  const secs = (ms) => (ms / 1000).toFixed(2) + 's';
  const ts = () => `[+${secs(now() - EPOCH)}]`;

  function setEnabled(v) { ENABLED = !!v; }
  function setEpoch(t) { if (typeof t === 'number') EPOCH = t; }

  // --- core primitives (all no-op if disabled) ---
  function baseLog(...args) { if (!ENABLED) return; console.log(ts(), ...args); }
  function baseInfo(label, obj) {
    if (!ENABLED) return;
    // collapsed group to keep console tidy
    console.groupCollapsed(ts(), label);
    if (obj !== undefined) console.log(obj);
    console.groupEnd();
  }

  async function timeAsync(label, fn) {
    if (!ENABLED) return fn();
    const t0 = now();
    try { return await fn(); }
    finally { baseLog(`${label} finished in ${secs(now() - t0)}`); }
  }

  function wrapMethods(obj, prefix = '') {
    for (const [name, fn] of Object.entries(obj || {})) {
      if (typeof fn !== 'function') continue;
      obj[name] = function wrapped(...args) {
        baseInfo(`${prefix ? prefix + '.' : ''}${name}() called`, { args });
        const out = fn.apply(this, args);
        if (out && typeof out.then === 'function') {
          return timeAsync(`${prefix ? prefix + '.' : ''}${name}()`, () => out);
        }
        baseLog(`${prefix ? prefix + '.' : ''}${name}() finished`);
        return out;
      };
    }
    return obj;
  }

  // --- “new” façade (event/trace + levels) ---
  const logFacade = {
    info(evt, payload)  { if (!ENABLED) return; console.info(ts(), NS, evt, payload ?? ''); },
    warn(evt, payload)  { if (!ENABLED) return; console.warn(ts(), NS, evt, payload ?? ''); },
    error(evt, payload) { if (!ENABLED) return; console.error(ts(), NS, evt, payload ?? ''); },
    event(name, data)   { if (!ENABLED) return; console.debug(ts(), NS, `event:${name}`, data ?? ''); },
    trace(fnName, args, extra) {
      if (!ENABLED) return;
      const safeArgs = Array.from(args ?? []).map(a => a);
      console.debug(ts(), NS, `call:${fnName}`, { args: safeArgs, ...(extra || {}) });
    }
  };

  // --- “legacy” façade (your existing API) ---
  const legacy = { setEnabled, setEpoch, log: baseLog, info: baseInfo, timeAsync, wrapMethods };

  // export both
  global.LOG = legacy;
  global.log = logFacade;
})(typeof window !== 'undefined' ? window : globalThis);
