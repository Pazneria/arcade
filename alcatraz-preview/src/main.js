// Game entry: loads data, builds the world, runs input and the frame loop.
import { buildWorld } from './world.js';
import { Terrain, Collision, Player, TUNE } from './physics.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);
const loadBin = async (u) => (await (await fetch(u)).arrayBuffer());
const loadJSON = async (u) => (await fetch(u)).json();

async function boot() {
  const [meta, footprints, trees, hBuf, sBuf] = await Promise.all([
    loadJSON('data/terrain.json'), loadJSON('data/footprints.json'), loadJSON('data/trees.json'),
    loadBin('data/terrain_height.f32'), loadBin('data/terrain_surface.rgba'),
  ]);
  const heights = new Float32Array(hBuf), terrain = new Terrain(meta, heights);
  const built = buildWorld({ terrain, footprints, trees });
  const world = { terrain, collision: new Collision(built.solids) };
  const player = new Player(world, built.spawn);
  const canvas = $('view');
  const renderer = new Renderer(canvas, meta, heights, new Uint8Array(sBuf), built);

  const keys = new Set(); let playing = false, jumpQueued = false;
  const setPlaying = (on) => { playing = on; $('menu').classList.toggle('hidden', on); keys.clear(); };
  const reqLock = () => { const r = canvas.requestPointerLock?.(); r?.catch?.(() => setPlaying(true)); };
  $('play').addEventListener('click', () => { setPlaying(true); reqLock(); });
  canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) reqLock(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === canvas) setPlaying(true); else setPlaying(false); });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw -= e.movementX * .0022; player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * .0022));
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && playing && document.pointerLockElement !== canvas) setPlaying(false);
    if (!playing) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyF') player.toggleFly();
    if (e.code === 'KeyR') player.reset();
    if (e.code === 'Space') jumpQueued = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const readInput = () => ({
    fwd: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), side: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    up: (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0), run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpQueued,
  });

  let last = performance.now(), frames = 0, fpsT = last;
  const eye = () => [player.x, player.y + TUNE.eye, player.z];
  const frame = (t) => {
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    if (playing) { player.step(dt, readInput()); jumpQueued = false; }
    renderer.render(eye(), player.yaw, player.pitch);
    frames++; if (t - fpsT > 1000) { renderer.stats.fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  $('loading').classList.add('hidden'); $('play').disabled = false; $('play').textContent = 'Enter';

  // Hook for the local automated test harness only; nothing on screen depends on it.
  window.__game = { player, world, built, renderer, meta, setPlaying, keys, eye, TUNE };
}

boot().catch((e) => { $('loading').textContent = `Could not start: ${e.message}`; console.error(e); });
