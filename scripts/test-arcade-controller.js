const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

// CPU event surfaces and a manually advanced RAF queue. No DOM implementation,
// browser, WebGL context, renderer, server, or GPU work is created by this test.
class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, values = {}) {
    const event = { target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
  get listenerCount() { return [...this.listeners.values()].reduce((count, set) => count + set.size, 0); }
}
class ElementSurface extends Surface { closest() { return null; } }

function harness(THREE, createArcadeController, failureStage = null) {
  const windowSurface = new Surface(), documentSurface = new Surface(), canvas = new ElementSurface();
  const children = new Set(), frames = new Map(), pauses = [], failures = [];
  const stats = { renders: 0, worldDisposals: 0, rendererDisposals: 0, contextLosses: 0,
    pointerExits: 0, animationLoops: [], failRender: false, failSize: false };
  let nextFrame = 1;
  Object.assign(documentSurface, { hidden: false, pointerLockElement: null, exitPointerLock() {
    stats.pointerExits++; this.pointerLockElement = null; this.emit('pointerlockchange');
  } });
  Object.assign(canvas, {
    setAttribute() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    remove() { children.delete(this); },
    async requestPointerLock() { documentSurface.pointerLockElement = this; documentSurface.emit('pointerlockchange'); },
  });
  Object.assign(globalThis, {
    window: windowSurface, document: documentSurface, Element: ElementSurface,
    matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const renderer = {
    domElement: canvas, setPixelRatio() {},
    setSize() { if (failureStage === 'setSize' || stats.failSize) throw new Error('Injected setSize failure'); },
    render() {
      stats.renders++;
      if (failureStage === 'render' || stats.failRender) throw new Error('Injected render failure');
    },
    setAnimationLoop(value) { stats.animationLoops.push(value); },
    dispose() { stats.rendererDisposals++; },
    forceContextLoss() { stats.contextLosses++; },
  };
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(70, 1, 0.03, 40),
    anchors: [{ gameIndex: 0, approach: new THREE.Vector3(0, 0, -2), position: new THREE.Vector3(0, 1.2, -3) }],
    targetMeshes: [], colliders: [], animate() {}, dispose() { stats.worldDisposals++; } };
  const create = () => createArcadeController(THREE, renderer, world, {
    container: { append(node) { children.add(node); } }, onTarget() {}, onInspect() {}, onHome() {},
    onPause() { pauses.push(true); }, onFailure(error) { failures.push(error); },
  });
  return { create, renderer, world, stats, canvas, window: windowSurface, document: documentSurface,
    children, frames, pauses, failures,
    tick(now) {
      const item = frames.entries().next().value;
      if (!item) return false;
      frames.delete(item[0]); item[1](now); return true;
    },
    get listenerCount() { return canvas.listenerCount + windowSurface.listenerCount + documentSurface.listenerCount; },
  };
}

async function run() {
  const THREE = await import(moduleUrl(fs.readFileSync(path.join(root, 'assets/vendor/three.module.js'), 'utf8')));
  const motionUrl = moduleUrl(fs.readFileSync(path.join(root, 'assets/arcade-motion.js'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'assets/arcade-controller.js'), 'utf8')
    .replace(/(['"])\.\/arcade-motion\.js\1/g, JSON.stringify(motionUrl));
  const { createArcadeController } = await import(moduleUrl(source));

  for (const failureStage of ['setSize', 'render']) {
    const h = harness(THREE, createArcadeController, failureStage);
    assert.throws(h.create, /Injected/, 'Startup failure must propagate to the app fallback');
    assert.equal(h.listenerCount, 0, 'Failed startup must remove every event listener');
    assert.equal(h.children.size, 0, 'Failed startup must remove its canvas');
    assert.equal(h.frames.size, 0);
    assert.equal(h.stats.worldDisposals, 1);
    assert.equal(h.stats.rendererDisposals, 1);
    assert.equal(h.stats.contextLosses, 1);
    assert.deepEqual(h.stats.animationLoops, [null]);
  }

  {
    const h = harness(THREE, createArcadeController), controller = h.create();
    assert.equal(h.children.size, 1); assert(h.listenerCount > 0);
    controller.resume(); assert.equal(h.frames.size, 1);
    const key = h.window.emit('keydown', { code: 'KeyW', repeat: false });
    assert(key.defaultPrevented, 'Movement keys suppress page scrolling while exploring');
    controller.setTouchMove(1); h.tick(100); h.tick(150);
    assert(controller.player.z < -0.95, 'Held input moves the player');
    controller.pause(); const stopped = { x: controller.player.x, z: controller.player.z };
    assert.equal(controller.active, false); assert.equal(h.frames.size, 0);
    const renders = h.stats.renders; assert.equal(h.tick(200), false); assert.equal(h.stats.renders, renders);
    h.window.emit('keydown', { code: 'KeyW' });
    controller.resume(); h.tick(250); h.tick(300);
    assert.deepEqual({ x: controller.player.x, z: controller.player.z }, stopped,
      'Pause clears held keys/touch movement and ignores movement entered while paused');

    h.canvas.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    h.canvas.emit('pointermove', { pointerId: 1, clientX: 140, clientY: 100 });
    controller.pause(); const yaw = controller.player.yaw;
    controller.resume(); h.canvas.emit('pointermove', { pointerId: 1, clientX: 200, clientY: 100 });
    assert.equal(controller.player.yaw, yaw, 'Pause clears unfinished drag gestures');

    controller.setTouchMove(1); h.canvas.emit('pointercancel');
    h.tick(350); h.tick(400);
    assert.deepEqual({ x: controller.player.x, z: controller.player.z }, stopped,
      'Cancelled pointers stop touch movement');

    h.window.emit('keydown', { code: 'KeyW' }); h.document.hidden = true;
    h.document.emit('visibilitychange');
    assert.equal(controller.active, false); assert.equal(h.frames.size, 0); assert.equal(h.pauses.length, 1);
    controller.resume(); assert.equal(h.frames.size, 0, 'A hidden document cannot resume its renderer');
    h.document.hidden = false; controller.resume(); h.tick(450); h.tick(500);
    assert.deepEqual({ x: controller.player.x, z: controller.player.z }, stopped,
      'Visibility interruption clears held movement');
    await controller.capture(); assert.equal(h.document.pointerLockElement, h.canvas);
    controller.dispose(); controller.dispose(); controller.resume();
    assert.equal(controller.active, false); assert.equal(h.frames.size, 0); assert.equal(h.listenerCount, 0);
    assert.equal(h.children.size, 0); assert.equal(h.stats.worldDisposals, 1);
    assert.equal(h.stats.rendererDisposals, 1); assert.equal(h.stats.contextLosses, 1);
    assert.equal(h.stats.pointerExits, 1); assert.deepEqual(h.stats.animationLoops, [null]);
  }

  {
    const h = harness(THREE, createArcadeController), controller = h.create();
    h.stats.failRender = true; controller.resume(); h.tick(100);
    assert.equal(h.failures.length, 1, 'Frame failure must notify the app fallback exactly once');
    assert.match(h.failures[0].message, /Injected render/);
    assert.equal(controller.active, false); assert.equal(h.frames.size, 0);
    assert.equal(h.tick(150), false, 'Failure cannot leave another render frame scheduled');
    controller.dispose(); assert.equal(h.listenerCount, 0);
  }
  for (const [name, failure, activate] of [
    ['inspection', 'failRender', (h, controller) => controller.focusGame(0)],
    ['reset', 'failRender', (h, controller) => controller.reset()],
    ['paused resize render', 'failRender', h => h.window.emit('resize')],
    ['resize dimensions', 'failSize', h => h.window.emit('resize')],
  ]) {
    const h = harness(THREE, createArcadeController), controller = h.create();
    h.stats[failure] = true;
    assert.doesNotThrow(() => activate(h, controller), `${name} failures must reach fallback without escaping an event`);
    assert.equal(h.failures.length, 1, `${name} failure must notify the app fallback exactly once`);
    assert.match(h.failures[0].message, /Injected/);
    assert.equal(controller.active, false); assert.equal(h.frames.size, 0);
    controller.dispose(); assert.equal(h.listenerCount, 0); assert.equal(h.children.size, 0);
  }
  {
    const h = harness(THREE, createArcadeController), controller = h.create();
    controller.resume(); controller.setTouchMove(1);
    const event = h.canvas.emit('webglcontextlost');
    assert(event.defaultPrevented); assert.equal(controller.active, false);
    assert.equal(h.frames.size, 0); assert.equal(h.failures.length, 1);
    controller.dispose(); assert.equal(h.listenerCount, 0);
  }
  console.log('Arcade CPU controller startup cleanup, input interruption, disposal and failure checks passed.');
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
