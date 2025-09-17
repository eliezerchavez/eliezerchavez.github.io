/* Tiny structured logger (console-only)
 * Usage:
 *   LOG.setEnabled(true|false)
 *   LOG.setEpoch(performance.now())
 *   LOG.log('message', {details})
 *   LOG.info('Label', {anything})
 *   await LOG.timeAsync('task', asyncFn)
 *   LOG.wrapMethods(obj, 'Prefix')  // wraps async/sync methods to log calls + duration
 */
(function (global) {
  const url = new URLSearchParams(global.location ? global.location.search : '');
  let ENABLED = ['log', 'trace', 'verbose'].includes((url.get('log') || '').toLowerCase());
  let EPOCH = (global.performance && performance.now) ? performance.now() : Date.now();

  const secs = (ms) => (ms / 1000).toFixed(2) + 's';
  const ts = () => `[+${secs(((global.performance && performance.now) ? performance.now() : Date.now()) - EPOCH)}]`;

  function setEnabled(v) { ENABLED = !!v; }
  function setEpoch(t) { EPOCH = typeof t === 'number' ? t : EPOCH; }
  function log(...args) { if (!ENABLED) return; console.log(ts(), ...args); }
  function info(label, obj) { if (!ENABLED) return; console.groupCollapsed(ts(), label); console.log(obj); console.groupEnd(); }

  async function timeAsync(label, fn) {
    if (!ENABLED) return fn();
    const t = (global.performance && performance.now) ? performance.now() : Date.now();
    try { return await fn(); }
    finally {
      const dt = ((global.performance && performance.now) ? performance.now() : Date.now()) - t;
      log(`${label} finished in ${secs(dt)}`);
    }
  }

  // Wrap all function props of an object and log calls + duration
  function wrapMethods(obj, prefix = '') {
    for (const [name, fn] of Object.entries(obj || {})) {
      if (typeof fn !== 'function') continue;
      obj[name] = function wrapped(...args) {
        info(`${prefix ? prefix + '.' : ''}${name}() called`, { args });
        const out = fn.apply(this, args);
        if (out && typeof out.then === 'function') {
          return timeAsync(`${prefix ? prefix + '.' : ''}${name}()`, () => out);
        }
        // sync function
        log(`${prefix ? prefix + '.' : ''}${name}() finished`);
        return out;
      };
    }
    return obj;
  }

  const API = { setEnabled, setEpoch, log, info, timeAsync, wrapMethods };
  // UMD-ish
  global.LOG = API;
})(typeof window !== 'undefined' ? window : globalThis);
