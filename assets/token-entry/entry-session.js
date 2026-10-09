// A real preload and a host-driven animation meet here. No timers or render loop.
export const TOKEN_DURATION = 0.92;
export const REDUCED_DURATION = 0.10;

function abortError(reason) {
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  const error = new Error(typeof reason === 'string' ? reason : 'Token entry cancelled');
  error.name = 'AbortError';
  return error;
}

export function createEntrySession({duration = TOKEN_DURATION, reducedDuration = REDUCED_DURATION,
  reducedMotion = false, onStart, onInsert, onComplete, onCancel, onError, onState, onHookError} = {}) {
  if (![duration, reducedDuration].every(n => Number.isFinite(n) && n >= 0)) throw new TypeError('Invalid token duration');
  let current = null, phase = 'idle', serial = 0, disposed = false;
  const hooks = {onStart, onInsert, onComplete, onCancel, onError, onState};
  function emit(name, event) {
    try { hooks[name]?.(event); }
    catch (error) { try { onHookError?.(error, name); } catch { /* Host hooks cannot strand a session. */ } }
  }
  function snapshot() {
    return Object.freeze({phase, id: current?.id ?? serial, ready: current?.ready ?? phase === 'complete',
      inserted: current?.inserted ?? phase === 'complete', active: !!current});
  }
  function state(next) { phase = next; emit('onState', snapshot()); }
  function detach(run) { run.external?.removeEventListener('abort', run.abort); }
  function finish(run) {
    if (current !== run || !run.ready || !run.inserted) return;
    current = null; detach(run); state('complete');
    emit('onComplete', Object.freeze({id: run.id, value: run.value}));
    run.resolve(run.value);
  }
  function fail(run, error) {
    if (current !== run) return;
    current = null; detach(run); run.controller.abort(error); state('error');
    emit('onError', Object.freeze({id: run.id, error})); run.reject(error);
  }
  function cancel(reason = 'Token entry cancelled') {
    const run = current; if (!run) return false;
    const error = abortError(reason);
    current = null; detach(run); run.controller.abort(error); state('cancelled');
    emit('onCancel', Object.freeze({id: run.id, reason: error})); run.reject(error);
    return true;
  }
  function start({signal, preload} = {}) {
    if (disposed) return Promise.reject(new Error('Token entry is disposed'));
    if (current) return current.promise;
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const reduced = typeof reducedMotion === 'function' ? !!reducedMotion() : !!reducedMotion;
    const run = {id: ++serial, controller: new AbortController(), external: signal, resolve, reject, promise,
      elapsed: 0, duration: reduced ? reducedDuration : duration, reduced, ready: false, inserted: false};
    run.abort = () => cancel(signal.reason); current = run;
    signal?.addEventListener('abort', run.abort, {once: true}); state('inserting');
    if (current !== run) return promise;
    emit('onStart', Object.freeze({id: run.id, signal: run.controller.signal, reducedMotion: reduced, duration: run.duration}));
    if (current !== run) return promise;
    try {
      const work = typeof preload === 'function' ? preload({signal: run.controller.signal, id: run.id}) : preload;
      if (!work || typeof work.then !== 'function') throw new TypeError('preload must be a readiness Promise or return one');
      Promise.resolve(work).then(value => {
        if (current !== run) return;
        run.ready = true; run.value = value; finish(run);
      }, error => fail(run, error));
    } catch (error) { fail(run, error); }
    return promise;
  }
  function update(dt) {
    if (!current || current.inserted) return false;
    if (!Number.isFinite(dt) || dt < 0) throw new TypeError('update expects finite nonnegative seconds');
    const run = current; run.elapsed = Math.min(run.duration, run.elapsed + dt);
    if (run.elapsed >= run.duration) {
      run.inserted = true; emit('onInsert', Object.freeze({id: run.id, ready: run.ready}));
      if (current !== run) return false;
      if (!run.ready) state('waiting');
      finish(run);
    }
    return true;
  }
  function reset() { if (disposed) return; cancel('Token entry reset'); if (!current) state('idle'); }
  function dispose() { if (disposed) return; disposed = true; cancel('Token entry disposed'); state('disposed'); }
  return {start, update, cancel, reset, dispose, get active() {return !!current;}, get state() {return snapshot();},
    get frame() { return current && !current.inserted ? {elapsed: current.elapsed, duration: current.duration,
      reducedMotion: current.reduced, inserted: current.inserted} : null; }};
}

const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

// Slot-local +z faces the player; the disc begins in XY and rolls into YZ.
// No bounce, spin loop, hand, camera transform, or indefinite waiting animation.
export function sampleTokenPose(elapsed, {duration = TOKEN_DURATION, reducedMotion = false, radius = 0.052} = {}) {
  const t = duration === 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  if (reducedMotion) return {position: [0, 0, 0.14], rotation: [0, 0, -0.08], visible: t < 1};
  let position, rotation;
  if (t < 0.16) {
    const u = smooth(t / 0.16);
    position = [mix(0.13, 0.12, u), mix(0.115, 0.09, u), mix(0.27, 0.25, u)];
    rotation = [mix(-0.14, -0.1, u), mix(-0.35, -0.25, u), mix(-0.24, -0.17, u)];
  } else if (t < 0.63) {
    const u = smooth((t - 0.16) / 0.47);
    position = [mix(0.12, 0, u), mix(0.09, 0, u), mix(0.25, radius + 0.03, u)];
    rotation = [mix(-0.1, 0, u), mix(-0.25, Math.PI / 2, u), mix(-0.17, 0, u)];
  } else {
    const u = (t - 0.63) / 0.37;
    // A firm push followed by deceleration: the lip holds alignment throughout.
    const push = 1 - Math.pow(1 - u, 2);
    position = [0, 0, mix(radius + 0.03, -radius - 0.013, push)];
    rotation = [0, Math.PI / 2, 0];
  }
  return {position, rotation, visible: t < 1};
}
