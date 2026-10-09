// Derivative of completed Claude12 / starlite-arcade-claude. See arcade-source.json.
// Authored source is preserved at its pinned Lab commit; this module is separate.
import {createSlidingExits} from './arcade-exits.js';
import { CABINET_LAYOUT, paintMarquee, paintSideSignature, buildLoungeProps } from './arcade-art.js';
export function createArcadeScene(THREE, renderer, games) {
const titles = games.map(g => g.name.toUpperCase());
const TAU = Math.PI * 2;
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020106);
const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 40);

const staticRoot = new THREE.Group(); // merged by material after construction
const dynRoot = new THREE.Group();    // animated / special objects
scene.add(staticRoot, dynRoot);

const colliders = [];
const doorPanels = new Map();
const exits = createSlidingExits((spec,open)=>doorPanels.get(spec.id)?.forEach((group,index)=>{group.position.x=spec.panels[index].travel*open;}));
colliders.push(...exits.colliders);
function doorPanel(id) {
  const group=new THREE.Group();dynRoot.add(group);
  if(!doorPanels.has(id))doorPanels.set(id,[]);doorPanels.get(id).push(group);return group;
}
function addCollider(x0, z0, x1, z1) {
  colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
}
// collider from a local rectangle of an (already positioned) object
const _cv = new THREE.Vector3();
function addLocalCollider(obj, x0, z0, x1, z1) {
  obj.updateMatrixWorld(true);
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    _cv.set(x, 0, z).applyMatrix4(obj.matrixWorld);
    a = Math.min(a, _cv.x); b = Math.min(b, _cv.z); c = Math.max(c, _cv.x); d = Math.max(d, _cv.z);
  }
  addCollider(a, b, c, d);
}

const animators = []; // (t, dt) => void
const uTime = { value: 0 };

// Room dimensions (metres). +z points out through the entrance.
const ROOM = { x0: -3.6, x1: 3.6, z0: -11, z1: 0, h: 3.0 };
const ALC = { x0: 3.6, x1: 6.3, z0: -4.9, z1: -1.5, h: 2.55 };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function mesh(geo, mat, parent = staticRoot, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function box(w, h, d, mat, parent, x, y, z, rx = 0, ry = 0, rz = 0) {
  return mesh(cachedGeometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), mat, parent, x, y, z, rx, ry, rz);
}
function cyl(rt, rb, h, seg, mat, parent, x, y, z, rx = 0, ry = 0, rz = 0, open = false) {
  return mesh(cachedGeometry(`cyl:${rt}:${rb}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)), mat, parent, x, y, z, rx, ry, rz);
}
function scaleUV(geo, su, sv, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return geo;
}
function roundRectShape(w, h, r, cx = 0, cy = 0, path = new THREE.Shape()) {
  const x = cx - w / 2, y = cy - h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

// Profile helpers for cabinets: points are [u, v] = [distance from back, height].
// Cabinet-local space: x across, y up, z forward (front = +z), origin at floor centre.
function slab(parent, D, p0, p1, width, thick, mat, x = 0) {
  const dz = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dz, dy);
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, len, thick), mat);
  m.rotation.x = Math.atan2(dz, dy);
  const mz = (p0[0] + p1[0]) / 2 - D / 2, my = (p0[1] + p1[1]) / 2;
  m.position.set(x, my + dz / len * thick / 2, mz - dy / len * thick / 2);
  parent.add(m);
  return m;
}
// a group whose local XY plane lies on the profile segment p0->p1 (y along segment, z outward)
function frameAt(parent, D, p0, p1, out = 0) {
  const dz = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dz, dy);
  const g = new THREE.Group();
  g.rotation.x = Math.atan2(dz, dy);
  g.position.set(0, (p0[1] + p1[1]) / 2 - dz / len * out, (p0[0] + p1[0]) / 2 - D / 2 + dy / len * out);
  g.userData.len = len;
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Static merge: bake world transforms and merge every static mesh by material.
// ---------------------------------------------------------------------------
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  const retiredGeometry = new Set();
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse(o => {
    if (!o.isMesh || o.userData.keep || o.isInstancedMesh) return;
    let p = o.parent, skip = false;
    while (p) { if (p.userData.keep) { skip = true; break; } p = p.parent; }
    if (skip) return;
    const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
    const total = idx ? idx.count : pos.count;
    const groups = (Array.isArray(o.material) && g.groups.length) ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const m = o.matrixWorld; nm.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    for (const gr of groups) {
      const mat = mats[gr.materialIndex]; if (!mat) continue;
      let b = buckets.get(mat);
      if (!b) { b = { p: [], n: [], u: [], ro: o.renderOrder }; buckets.set(mat, b); }
      const end = Math.min(gr.start + gr.count, total);
      for (let i = gr.start; i + 2 < end + 0; i += 3) {
        const tri = flip ? [i, i + 2, i + 1] : [i, i + 1, i + 2];
        for (const k of tri) {
          const vi = idx ? idx.getX(k) : k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(m); b.p.push(v.x, v.y, v.z);
          if (nor) { n.fromBufferAttribute(nor, vi).applyMatrix3(nm).normalize(); b.n.push(n.x, n.y, n.z); } else b.n.push(0, 1, 0);
          if (uv) b.u.push(uv.getX(vi), uv.getY(vi)); else b.u.push(0, 0);
        }
      }
    }
    victims.push(o);
  });
  for (const o of victims) { o.parent.remove(o); retiredGeometry.add(o.geometry); }
  for (const geo of retiredGeometry) geo.dispose();
  let calls = 0;
  for (const [mat, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mm = new THREE.Mesh(geo, mat);
    mm.renderOrder = b.ro || 0;
    mm.matrixAutoUpdate = false;
    root.add(mm); calls++;
  }
  return calls;
}


const geometryCache = new Map(), textureCache = new Map();
let environmentTarget, disposed = false;
const anchors = [], targetMeshes = [];
const cabinetScreens = new WeakMap();
const sideSignatures = new WeakMap();
function shortTitle(title) { const words=title.split(' '), middle=Math.ceil(words.length/2);return words.slice(0,middle).join(' ')+'\n'+words.slice(middle).join(' '); }
function cachedGeometry(key, create) { if (!geometryCache.has(key)) geometryCache.set(key, create()); return geometryCache.get(key); }
function reuseStaticMaterials(root) {
  const shared = new Map(), retired = new Set();
  const valueKey = value => value?.isTexture ? ['texture',value.uuid] : value?.isColor ? [value.r,value.g,value.b] : value;
  root.traverse(object => {
    if (!object.isMesh) return;
    let parent=object; while(parent) { if(parent.userData.keep)return; parent=parent.parent; }
    const intern = material => {
      if(material.isShaderMaterial || material===M.beamDome || material.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile)return material;
      const signature = JSON.stringify(Object.entries(material).filter(([key,value])=>!['id','uuid','version','_listeners'].includes(key)&&typeof value!=='function').map(([key,value])=>[key,valueKey(value)]));
      if(!shared.has(signature))shared.set(signature,material);
      const canonical=shared.get(signature);if(canonical!==material)retired.add(material);return canonical;
    };
    object.material=Array.isArray(object.material)?object.material.map(intern):intern(object.material);
  });
  for(const material of retired)material.dispose();
}
function addGameAnchor(object, gameIndex) {
  object.updateMatrixWorld(true);
  const width = object.userData.W || 1.16, depth = object.userData.D || 1;
  const position = new THREE.Vector3(0, 1.2, depth / 2 + 0.1).applyMatrix4(object.matrixWorld);
  const approach = new THREE.Vector3(0, 0, depth / 2 + 1.05).applyMatrix4(object.matrixWorld);
  const anchor = { id: 'game-' + gameIndex, gameIndex, position, approach, yaw: object.rotation.y, kind: 'game' };
  const surface=cabinetScreens.get(object);
  if(surface) {
    const {frame,width,height,cy,z}=surface;frame.updateMatrixWorld(true);
    const at=(x,y)=>new THREE.Vector3(x,y+cy,z).applyMatrix4(frame.matrixWorld);
    anchor.screen={width,height,center:at(0,0),normal:new THREE.Vector3(0,0,1).transformDirection(frame.matrixWorld),up:new THREE.Vector3(0,1,0).transformDirection(frame.matrixWorld),
      corners:[at(-width/2,height/2),at(width/2,height/2),at(-width/2,-height/2),at(width/2,-height/2)]};
  }
  anchors.push(anchor);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 2.0, depth + 0.2), new THREE.MeshBasicMaterial({visible:false}));
  hit.position.set(0, 1, 0.06); object.add(hit); hit.userData.keep = true; hit.userData.anchor = anchor; targetMeshes.push(hit);
  // Identity belongs to the backlit marquee and painted shoulder. The former
  // floating cream launch cards duplicated those titles and hid cabinet art.
}
function addExitAnchor(id, x, z, width) {
  const anchor = {id, kind:'home', position:new THREE.Vector3(x, 1.3, z)};
  const hit = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, 0.15), new THREE.MeshBasicMaterial({visible:false}));
  hit.position.copy(anchor.position); hit.userData.anchor = anchor; hit.userData.keep = true; staticRoot.add(hit); targetMeshes.push(hit); anchors.push(anchor);
}
function dispose() {
  if(disposed)return;disposed=true;
  exits.dispose();doorPanels.clear();
  const geometries = new Set(geometryCache.values()), materials = new Set(), textures = new Set(allTextures);
  scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) { materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); environmentTarget?.dispose(); scene.clear(); geometryCache.clear(); textureCache.clear();
}


// ---------------------------------------------------------------------------
// Procedural canvas textures (all artwork is original and generated here)
// ---------------------------------------------------------------------------
const allTextures = [];
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = false, srgb = true, aniso = 4, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(aniso, maxAniso);
  t.flipY = flipY;
  allTextures.push(t);
  return t;
}
function grain(g, w, h, amt, seed = 1, mono = true) {
  const r = rng(seed), id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    else { d[i] += n; d[i + 1] += (r() - 0.5) * amt; d[i + 2] += (r() - 0.5) * amt; }
  }
  g.putImageData(id, 0, 0);
}
const FONT = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
const MONO = 'Consolas, "Courier New", monospace';

function logoText(g, text, x, y, size, c1, c2, outline = '#1a0630', opts = {}) {
  g.save();
  g.font = `${opts.italic === false ? '' : 'italic '}900 ${size}px ${FONT}`;
  g.textAlign = opts.align || 'center'; g.textBaseline = 'middle';
  if (opts.maxW) { const w = g.measureText(text).width; if (w > opts.maxW) { g.translate(x, y); g.scale(opts.maxW / w, 1); g.translate(-x, -y); } }
  g.lineJoin = 'round';
  if (opts.glow) { g.shadowColor = opts.glow; g.shadowBlur = size * 0.35; }
  g.lineWidth = size * 0.22; g.strokeStyle = outline; g.strokeText(text, x, y + size * 0.06);
  g.shadowBlur = 0;
  g.lineWidth = size * 0.1; g.strokeStyle = opts.mid || '#ffffff'; g.strokeText(text, x, y);
  const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillText(text, x, y);
  g.restore();
}

// Game definitions -------------------------------------------------------------
const GAMES = {
  crater: { title: titles[0], short: shortTitle(titles[0]), bank: 'VOLT-TEK', c: ['#ff7a1a', '#e0303a', '#ffe6b0', '#1c1030', '#ffc12e'], glow: 0xff8a3a, portrait: true, labels: ['JUMP', 'FIRE', 'BOOST'], hs: 'TOP DRIVERS' },
  nomads: { title: titles[1], short: shortTitle(titles[1]), bank: 'VOLT-TEK', c: ['#ff3fa4', '#7b3cff', '#39e6ff', '#0b0820', '#ffe14d'], glow: 0xc060ff, portrait: true, labels: ['FIRE', 'WARP', 'SHIELD'], hs: 'GREAT NOMADS' },
  tide: { title: titles[2], short: shortTitle(titles[2]), bank: 'WAVECREST', c: ['#19d3c5', '#ff6f61', '#ffd27a', '#06283a', '#b8fff4'], glow: 0x30e0d0, portrait: false, labels: ['STEP', 'SPIN', 'CLAP', 'POSE'], hs: 'TOP DANCERS' },
  kite: { title: titles[3], short: shortTitle(titles[3]), bank: 'WAVECREST', c: ['#ffb347', '#ff5e8a', '#4b1f5c', '#1a0d2e', '#fff1d6'], glow: 0xff7a8a, portrait: false, labels: ['LUNGE', 'GUST', 'DIVE', 'LOOP'], hs: 'SKY CHAMPIONS' },
  light: { title: titles[5], short: shortTitle(titles[5]), bank: 'STARLITE', c: ['#ffcf4a', '#e2384d', '#fff3c4', '#0a1638', '#36c6e8'], glow: 0x6fb8ff, portrait: false, labels: ['BEAM', 'HORN'], hs: 'KEEPERS OF THE LIGHT' },
};

// --- small motif painters (shared by marquees, side art, posters) -------------
function drawBuggy(g, x, y, s, c) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = c[0]; g.strokeStyle = '#1a0a1a'; g.lineWidth = 0.05;
  g.beginPath(); g.moveTo(-1.1, 0); g.lineTo(-0.9, -0.45); g.lineTo(0.5, -0.5); g.lineTo(1.1, -0.15); g.lineTo(1.1, 0.1); g.lineTo(-1.1, 0.1); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#7fe6ff'; g.beginPath(); g.ellipse(-0.1, -0.5, 0.38, 0.28, 0, Math.PI, 0); g.fill(); g.stroke();
  g.strokeStyle = c[2]; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.6, -0.45); g.lineTo(0.85, -1.0); g.stroke();
  g.fillStyle = c[1]; g.beginPath(); g.arc(0.85, -1.0, 0.07, 0, TAU); g.fill();
  for (const wx of [-0.75, 0, 0.75]) {
    g.fillStyle = '#20141e'; g.beginPath(); g.arc(wx, 0.2, 0.3, 0, TAU); g.fill();
    g.fillStyle = c[2]; g.beginPath(); g.arc(wx, 0.2, 0.12, 0, TAU); g.fill();
  }
  g.restore();
}
function drawShip(g, x, y, s, col, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.fillStyle = col; g.strokeStyle = '#0b0820'; g.lineWidth = 0.06;
  g.beginPath(); g.moveTo(0, -1); g.lineTo(0.35, 0.1); g.lineTo(0.9, 0.55); g.lineTo(0.3, 0.45); g.lineTo(0, 0.75); g.lineTo(-0.3, 0.45); g.lineTo(-0.9, 0.55); g.lineTo(-0.35, 0.1); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, -0.2, 0.12, 0.25, 0, 0, TAU); g.fill();
  g.restore();
}
function drawCrab(g, x, y, s, c) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = '#3a0d14'; g.lineWidth = 0.06; g.fillStyle = c[1];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(sx * 0.5, 0.1 + k * 0.12); g.lineTo(sx * (0.95 + k * 0.08), 0.35 + k * 0.15); g.lineTo(sx * (1.05 + k * 0.05), 0.6 + k * 0.1); g.stroke(); }
    g.beginPath(); g.moveTo(sx * 0.45, -0.2); g.lineTo(sx * 0.85, -0.65); g.stroke();
    g.beginPath(); g.ellipse(sx * 0.95, -0.85, 0.3, 0.22, sx * 0.6, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = c[3]; g.beginPath(); g.moveTo(sx * 0.95, -0.85); g.lineTo(sx * 1.3, -1.05); g.lineTo(sx * 1.25, -0.8); g.fill(); g.fillStyle = c[1];
    g.beginPath(); g.moveTo(sx * 0.18, -0.35); g.lineTo(sx * 0.22, -0.7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(sx * 0.22, -0.75, 0.1, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(sx * 0.24, -0.76, 0.05, 0, TAU); g.fill(); g.fillStyle = c[1];
  }
  g.beginPath(); g.ellipse(0, 0, 0.62, 0.42, 0, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = '#3a0d14'; g.beginPath(); g.arc(0, 0.02, 0.2, 0.2, Math.PI - 0.2); g.stroke();
  g.restore();
}
function drawKite(g, x, y, s, c1, c2, rot = 0, tail = true) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.lineWidth = 0.05; g.strokeStyle = '#2a0f30';
  g.fillStyle = c1; g.beginPath(); g.moveTo(0, -1); g.lineTo(0.6, -0.2); g.lineTo(0, 1); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = c2; g.beginPath(); g.moveTo(0, -1); g.lineTo(-0.6, -0.2); g.lineTo(0, 1); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-0.6, -0.2); g.lineTo(0.6, -0.2); g.stroke();
  if (tail) {
    g.strokeStyle = '#fff1d6'; g.lineWidth = 0.035; g.beginPath(); g.moveTo(0, 1);
    for (let k = 1; k <= 12; k++) g.lineTo(Math.sin(k * 0.9) * 0.25, 1 + k * 0.18); g.stroke();
    for (let k = 3; k <= 12; k += 3) { g.fillStyle = k % 2 ? c1 : c2; const bx = Math.sin(k * 0.9) * 0.25, by = 1 + k * 0.18; g.beginPath(); g.moveTo(bx - 0.14, by - 0.08); g.lineTo(bx + 0.14, by + 0.08); g.lineTo(bx + 0.14, by - 0.08); g.lineTo(bx - 0.14, by + 0.08); g.fill(); }
  }
  g.restore();
}
function drawLighthouse(g, x, y, s, c) {
  g.save(); g.translate(x, y); g.scale(s, s);
  // beam
  const bg = g.createLinearGradient(0, -2.3, -3.5, -2.0);
  bg.addColorStop(0, 'rgba(255,243,196,0.85)'); bg.addColorStop(1, 'rgba(255,243,196,0)');
  g.fillStyle = bg; g.beginPath(); g.moveTo(0, -2.3); g.lineTo(-3.8, -3.0); g.lineTo(-3.8, -1.5); g.closePath(); g.fill();
  // tower
  g.fillStyle = '#f4efe6'; g.beginPath(); g.moveTo(-0.35, 0); g.lineTo(0.35, 0); g.lineTo(0.22, -2); g.lineTo(-0.22, -2); g.closePath(); g.fill();
  g.fillStyle = c[1];
  for (let k = 0; k < 3; k++) { const y0 = -0.3 - k * 0.6, y1 = y0 - 0.3; const w0 = 0.35 - (-y0 / 2) * 0.13, w1 = 0.35 - (-y1 / 2) * 0.13; g.beginPath(); g.moveTo(-w0, y0); g.lineTo(w0, y0); g.lineTo(w1, y1); g.lineTo(-w1, y1); g.fill(); }
  g.fillStyle = '#20253a'; g.fillRect(-0.32, -2.08, 0.64, 0.1);
  g.fillStyle = c[0]; g.fillRect(-0.18, -2.45, 0.36, 0.37);
  g.fillStyle = c[1]; g.beginPath(); g.moveTo(-0.26, -2.45); g.lineTo(0.26, -2.45); g.lineTo(0, -2.75); g.fill();
  // rock
  g.fillStyle = '#1b2236'; g.beginPath(); g.moveTo(-0.9, 0.3); g.quadraticCurveTo(-0.5, -0.2, 0, -0.05); g.quadraticCurveTo(0.6, -0.2, 1.0, 0.3); g.fill();
  g.restore();
}
function starfield(g, w, h, n, seed, alpha = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const s = r() < 0.08 ? 2.2 : 1 + r();
    g.fillStyle = `rgba(255,255,255,${(0.35 + r() * 0.65) * alpha})`;
    g.beginPath(); g.arc(r() * w, r() * h, s, 0, TAU); g.fill();
  }
}

// --- Marquees (backlit translucent) -------------------------------------------
function marqueeTextureRaw(key, aspect = 3) {
  const G = GAMES[key], H = 256, W = Math.round(H * aspect), cv = cnv(W, H), g = cv.getContext('2d');
  paintMarquee(g, G, W, H);
  grain(g, W, H, 4, 17);
  return tex(cv, { aniso: 8 });
}

// --- Side art -----------------------------------------------------------------
// canvas x: back -> front, canvas y: top -> bottom of the cabinet side
function sideArtTextureRaw(key, uMin, uMax, vMax) {
  const G = GAMES[key], c = G.c, W = 1024, H = 1024, cv = cnv(W, H), g = cv.getContext('2d');
  const r = rng(key.length * 31 + 5);
  const X = u => (u - uMin) / (uMax - uMin) * W, Y = v => (1 - v / vMax) * H;
  if (G.bank === 'VOLT-TEK') {
    // classic painted upright: solid colour with racing stripes and a big motif
    g.fillStyle = key === 'crater' ? '#1c1030' : '#0b0820'; g.fillRect(0, 0, W, H);
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, key === 'crater' ? '#7a1a2a' : '#2a0f5c'); base.addColorStop(1, key === 'crater' ? '#f06a20' : '#c02d8a');
    g.fillStyle = base; g.beginPath(); g.moveTo(0, Y(1.25)); g.lineTo(W, Y(0.55)); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    // three brand stripes
    const sc = ['#ffd23f', '#ff8a1f', '#e0303a'];
    for (let k = 0; k < 3; k++) { g.fillStyle = sc[k]; g.beginPath(); g.moveTo(0, Y(1.32) + k * 26); g.lineTo(W, Y(0.62) + k * 26); g.lineTo(W, Y(0.62) + k * 26 + 14); g.lineTo(0, Y(1.32) + k * 26 + 14); g.fill(); }
    if (key === 'crater') {
      g.fillStyle = 'rgba(255,214,150,0.18)';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(r() * W, Y(0.15 + r() * 0.5), 40 + r() * 70, 14 + r() * 20, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#ffd59a'; g.beginPath(); g.arc(X(0.25), Y(1.55), 85, 0, TAU); g.fill();
      g.strokeStyle = '#ff7a1a'; g.lineWidth = 10; g.beginPath(); g.ellipse(X(0.25), Y(1.55), 150, 34, -0.3, 0, TAU); g.stroke();
      starfield(g, W, Y(1.3), 70, 21);
      drawBuggy(g, X(0.42), Y(0.42), 120, c);
    } else {
      starfield(g, W, H, 180, 22);
      for (let i = 0; i < 5; i++) { const rg = g.createRadialGradient(X(0.1 + r() * 0.6), Y(0.4 + r() * 1.2), 0, X(0.35), Y(1.0), 260); rg.addColorStop(0, 'rgba(57,230,255,0.28)'); rg.addColorStop(1, 'rgba(57,230,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
      drawShip(g, X(0.48), Y(1.25), 120, c[2], -0.5); drawShip(g, X(0.2), Y(0.75), 60, c[4], -0.3); drawShip(g, X(0.62), Y(0.6), 38, '#ffffff', -0.7);
    }
  } else if (G.bank === 'WAVECREST') {
    // flowing wave bands
    const bg = g.createLinearGradient(0, 0, 0, H);
    if (key === 'tide') { bg.addColorStop(0, '#0f6f86'); bg.addColorStop(0.6, '#08364f'); bg.addColorStop(1, '#041a28'); }
    else { bg.addColorStop(0, '#3b1650'); bg.addColorStop(0.55, '#b83a6e'); bg.addColorStop(1, '#2a0f30'); }
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const bands = key === 'tide' ? ['#19d3c5', '#7af7ee', '#ff6f61'] : ['#ffb347', '#ffe9a8', '#39a0ff'];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = bands[k]; g.globalAlpha = 0.85; g.beginPath();
      const y0 = Y(0.55 - k * 0.12);
      g.moveTo(0, y0); for (let x = 0; x <= W; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.012 + k * 1.3) * 34);
      g.lineTo(W, y0 + 70); for (let x = W; x >= 0; x -= 16) g.lineTo(x, y0 + 40 + Math.sin(x * 0.012 + k * 1.3 + 0.4) * 34); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    if (key === 'tide') {
      for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(200,255,250,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(r() * W, Y(0.7 + r() * 1.2), 5 + r() * 16, 0, TAU); g.stroke(); }
      drawCrab(g, X(0.45), Y(1.15), 150, c);
    } else {
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(X(0.55), Y(0.95), 150, 0, TAU); g.fill();
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,240,230,0.35)'; g.beginPath(); g.ellipse(r() * W, Y(1.0 + r() * 0.8), 90, 22, 0, 0, TAU); g.fill(); }
      drawKite(g, X(0.35), Y(1.45), 120, '#e2384d', '#ffd23f', -0.35); drawKite(g, X(0.68), Y(1.2), 80, '#39a0ff', '#ffffff', 0.3);
    }
    // wavecrest chrome swoosh
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, Y(1.75)); g.bezierCurveTo(W * 0.3, Y(1.95), W * 0.6, Y(1.55), W, Y(1.7)); g.stroke();
  } else {
    // feature cabinet: deep navy with gold pinstripes, beam rays, moon & sea
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#071030'); bg.addColorStop(0.7, '#0c2250'); bg.addColorStop(1, '#06122c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    starfield(g, W, H * 0.7, 220, 31);
    for (let k = 0; k < 7; k++) {
      const a = -0.9 + k * 0.22; g.fillStyle = `rgba(255,236,170,${0.05 + (k % 2) * 0.05})`;
      g.beginPath(); g.moveTo(X(0.95), Y(2.0)); g.lineTo(X(0.95) + Math.cos(Math.PI + a) * 1600, Y(2.0) + Math.sin(Math.PI + a) * 1600); g.lineTo(X(0.95) + Math.cos(Math.PI + a + 0.08) * 1600, Y(2.0) + Math.sin(Math.PI + a + 0.08) * 1600); g.fill();
    }
    g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(X(0.25), Y(1.75), 70, 0, TAU); g.fill();
    g.fillStyle = '#0a1a40'; g.beginPath(); g.arc(X(0.25) + 28, Y(1.75) - 14, 62, 0, TAU); g.fill();
    g.fillStyle = '#123e6a'; g.fillRect(0, Y(0.55), W, H);
    g.strokeStyle = 'rgba(120,210,255,0.5)'; g.lineWidth = 5;
    for (let k = 0; k < 8; k++) { g.beginPath(); for (let x = 0; x <= W; x += 12) g.lineTo(x, Y(0.52) + k * 26 + Math.sin(x * 0.03 + k) * 6); g.stroke(); }
    drawLighthouse(g, X(0.62), Y(0.62), 150, c);
    g.strokeStyle = '#ffcf4a'; g.lineWidth = 6; g.strokeRect(24, 24, W - 48, H - 48);
    g.lineWidth = 2; g.strokeRect(38, 38, W - 76, H - 76);
  }
  // wear: kick scuffs along the bottom, chips at the front edge, light scratches
  g.fillStyle = '#0a0a0e'; g.fillRect(0, Y(0.1), W, H);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = Y(0.1) - r() * 70 * r();
    g.strokeStyle = `rgba(${r() < 0.5 ? '20,15,20' : '230,220,210'},${0.15 + r() * 0.3})`; g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 10); g.stroke();
  }
  for (let i = 0; i < 26; i++) { const x = W - r() * 40 * r(), y = Y(0.3 + r() * 1.4); g.fillStyle = 'rgba(25,18,14,0.75)'; g.beginPath(); g.ellipse(x, y, 3 + r() * 7, 2 + r() * 4, r(), 0, TAU); g.fill(); }
  for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H; g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 30); g.stroke(); }
  paintSideSignature(g, G, uMin, uMax, vMax, W, H);
  grain(g, W, H, 10, 9);
  return tex(cv, { aniso: 8 });
}

// --- Control panel overlays ------------------------------------------------------
// layout items: {x, y (from front edge), r, kind:'stick'|'btn'|'start'|'spin'|'dome', label}
function cpoTextureRaw(key, Wd, L, layout) {
  const G = GAMES[key], c = G.c, W = 1024, H = Math.round(1024 * L / Wd / 2) * 2 || 512, cv = cnv(W, Math.max(256, H)), g = cv.getContext('2d');
  const HH = cv.height, P = (x, y) => [(x / Wd + 0.5) * W, (1 - y / L) * HH], S = W / Wd;
  const bg = g.createLinearGradient(0, 0, W, HH);
  if (key === 'crater') { bg.addColorStop(0, '#2a1230'); bg.addColorStop(1, '#5a1a20'); }
  else if (key === 'nomads') { bg.addColorStop(0, '#120a34'); bg.addColorStop(1, '#3a0f4a'); }
  else if (key === 'tide') { bg.addColorStop(0, '#08364f'); bg.addColorStop(1, '#0f5a6a'); }
  else if (key === 'kite') { bg.addColorStop(0, '#3b1650'); bg.addColorStop(1, '#6a1f4a'); }
  else { bg.addColorStop(0, '#081634'); bg.addColorStop(1, '#0d2a5a'); }
  g.fillStyle = bg; g.fillRect(0, 0, W, HH);
  const r = rng(key.length * 7);
  // background motifs
  if (G.bank === 'VOLT-TEK') { const sc = ['#ffd23f', '#ff8a1f', '#e0303a']; for (let k = 0; k < 3; k++) { g.fillStyle = sc[k]; g.fillRect(0, HH * 0.12 + k * 14, W, 7); } }
  else if (G.bank === 'WAVECREST') { g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 5; for (let k = 0; k < 5; k++) { g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, HH * (0.15 + k * 0.18) + Math.sin(x * 0.015 + k) * 10); g.stroke(); } }
  else { starfield(g, W, HH, 90, 5, 0.6); g.strokeStyle = '#ffcf4a'; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, HH - 20); }
  g.font = `bold ${Math.round(S * 0.013)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let bi = 0;
  for (const it of layout) {
    const [x, y] = P(it.x, it.y), rr = it.r * S;
    // worn halo: art rubbed away by hands
    const wear = it.kind === 'stick' || it.kind === 'spin' ? 2.6 : 1.9;
    const wg = g.createRadialGradient(x, y, rr * 0.8, x, y, rr * wear);
    wg.addColorStop(0, 'rgba(190,185,190,0.38)'); wg.addColorStop(1, 'rgba(190,185,190,0)');
    g.fillStyle = wg; g.beginPath(); g.arc(x, y, rr * wear, 0, TAU); g.fill();
    if (it.kind === 'stick' || it.kind === 'spin') {
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, rr * 1.55, 0, TAU); g.stroke();
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(x + Math.cos(a) * rr * 1.75, y + Math.sin(a) * rr * 1.75); g.lineTo(x + Math.cos(a + 0.12) * rr * 1.95, y + Math.sin(a + 0.12) * rr * 1.95); g.lineTo(x + Math.cos(a - 0.12) * rr * 1.95, y + Math.sin(a - 0.12) * rr * 1.95); g.fill(); }
    } else {
      g.strokeStyle = it.kind === 'dome' ? '#ffcf4a' : 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rr * 1.35, 0, TAU); g.stroke();
      const lab = it.label || (it.kind === 'start' ? (it.x < 0 ? '1P' : '2P') : G.labels[bi++ % G.labels.length]);
      g.fillStyle = '#fff'; g.fillText(lab, x, y + rr * 2.0);
    }
  }
  // palm-rest wear along the front edge and a few scratches
  const fw = g.createLinearGradient(0, HH, 0, HH * 0.75); fw.addColorStop(0, 'rgba(200,195,200,0.25)'); fw.addColorStop(1, 'rgba(200,195,200,0)');
  g.fillStyle = fw; g.fillRect(0, HH * 0.75, W, HH * 0.25);
  for (let i = 0; i < 50; i++) { const x = r() * W, y = r() * HH; g.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 12); g.stroke(); }
  // cigarette-burn-free, but a coffee ring someone left years ago
  g.strokeStyle = 'rgba(80,50,30,0.25)'; g.lineWidth = 3; g.beginPath(); g.arc(W * 0.9, HH * 0.3, 26, 0.3, 5.6); g.stroke();
  grain(g, W, HH, 8, 4);
  return tex(cv, { aniso: 8 });
}

// --- Screen bezels with printed instructions -------------------------------------
function bezelTexture(key, wB, hB, wO, hO) {
  const G = GAMES[key], c = G.c, W = 1024, H = Math.round(1024 * hB / wB), cv = cnv(W, H), g = cv.getContext('2d');
  g.fillStyle = '#08070c'; g.fillRect(0, 0, W, H);
  const ox = (wB - wO) / 2 / wB * W, oy = (hB - hO) / 2 / hB * H, ow = wO / wB * W, oh = hO / hB * H;
  g.strokeStyle = c[0]; g.lineWidth = 6; g.strokeRect(ox - 14, oy - 14, ow + 28, oh + 28);
  g.strokeStyle = c[1]; g.lineWidth = 3; g.strokeRect(ox - 26, oy - 26, ow + 52, oh + 52);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const side = Math.min(ox, W * 0.3);
  const txt = G.bank === 'STARLITE'
    ? ['TURN THE DIAL', 'TO STEER THE', 'LIGHTHOUSE BEAM', '', 'PRESS BEAM', 'TO GUIDE SHIPS', 'HOME SAFELY']
    : G.portrait ? ['1 PLAYER', '', 'JOYSTICK', 'MOVES', '', `${G.labels[0]} /`, `${G.labels[1]}`] : ['1 OR 2', 'PLAYERS', '', 'MATCH THE', 'BEAT /', 'BEAT THE', 'WIND'];
  if (side > 60) {
    g.font = `bold ${Math.round(side * 0.13)}px ${FONT}`;
    txt.forEach((t, i) => g.fillText(t, side / 2, oy + oh * 0.15 + i * side * 0.17));
    g.fillStyle = c[0];
    g.font = `bold ${Math.round(side * 0.14)}px ${FONT}`;
    ['25¢', 'PER', 'PLAY'].forEach((t, i) => g.fillText(t, W - side / 2, oy + oh * 0.25 + i * side * 0.2));
  }
  if (oy > 40) {
    g.font = `bold ${Math.round(oy * 0.42)}px ${FONT}`; g.fillStyle = c[0];
    g.fillText(G.title, W / 2, oy / 2);
    g.font = `bold ${Math.round((H - oy - oh) * 0.32)}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('© STARLITE AMUSEMENT CO. — FOR AMUSEMENT ONLY', W / 2, H - (H - oy - oh) / 2);
  }
  grain(g, W, H, 6, 2);
  return tex(cv, { aniso: 4 });
}

// --- Screen sheet: logo, hud, insert coin, high scores -------------------------
function screenSheetRaw(key) {
  const G = GAMES[key], c = G.c, W = 512, H = 512, cv = cnv(W, H), g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const parts = G.short.split('\n');
  logoText(g, parts[0], W / 2, 62, 76, c[4] || '#fff', c[0], '#000', { maxW: 470 });
  logoText(g, parts[1] || '', W / 2, 146, 76, '#ffffff', c[1], '#000', { maxW: 470 });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 26px ${MONO}`;
  g.fillStyle = '#ff4040'; g.fillText('1UP', 70, 220); g.fillStyle = '#fff'; g.fillText('004250', 70, 246 - 4);
  g.fillStyle = '#ff4040'; g.fillText('HI-SCORE', 300, 220); g.fillStyle = '#fff'; g.fillText('051270', 300, 246 - 4);
  g.font = `bold 34px ${MONO}`; g.fillStyle = c[4] || '#ffe14d'; g.fillText('INSERT  COIN', W / 2, 285);
  g.font = `bold 28px ${MONO}`; g.fillStyle = c[0]; g.fillText(G.hs, W / 2, 330);
  const names = [['JMR', '051270'], ['AVA', '044810'], ['DOT', '039950'], ['KAI', '031200'], ['LOU', '027640']];
  g.font = `bold 26px ${MONO}`;
  names.forEach(([n, s], i) => { g.fillStyle = ['#ffe14d', '#ffffff', '#7fe6ff', '#ff9ed2', '#9dff8a'][i]; g.fillText(`${i + 1}. ${n}  ${s}`, W / 2, 372 + i * 30); });
  const t = tex(cv, { aniso: 4 });
  return t;
}

// --- Room surfaces ---------------------------------------------------------------
function carpetTexture() {
  const S = 1024, cv = cnv(S, S), g = cv.getContext('2d'), r = rng(7);
  g.fillStyle = '#231c48'; g.fillRect(0, 0, S, S);
  const cols = ['#ff3fa4', '#33e1ff', '#ffd23f', '#7cff6b', '#9a5bff', '#ff7a2f'];
  const tiled = fn => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  for (let i = 0; i < 400; i++) { const x = r() * S, y = r() * S, col = cols[i % cols.length], rr = 1.5 + r() * 3; tiled(() => { g.globalAlpha = 0.7; g.fillStyle = col; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.globalAlpha = 1; }); }
  for (let i = 0; i < 64; i++) {
    const x = r() * S, y = r() * S, type = Math.floor(r() * 5), col = cols[Math.floor(r() * cols.length)], s = 22 + r() * 34, rot = r() * TAU, col2 = cols[(i + 2) % cols.length];
    tiled(() => {
      g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
      if (type === 0) { g.beginPath(); for (let k = 0; k <= 24; k++) { const t = k / 24; g.lineTo(-s * 1.5 + t * s * 3, Math.sin(t * TAU * 1.5) * s * 0.35); } g.stroke(); }
      else if (type === 1) { g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.87, s * 0.5); g.lineTo(-s * 0.87, s * 0.5); g.closePath(); g.stroke(); }
      else if (type === 2) { g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.fill(); g.strokeStyle = col2; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 0, s * 1.05, s * 0.28, 0, 0, TAU); g.stroke(); }
      else if (type === 3) { g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? s * 0.25 : s * 0.62, a = k / 10 * TAU; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
      else { g.beginPath(); g.moveTo(-s, -s * 0.3); g.lineTo(-s * 0.3, s * 0.3); g.lineTo(s * 0.2, -s * 0.3); g.lineTo(s, s * 0.3); g.stroke(); }
      g.restore();
    });
  }
  grain(g, S, S, 34, 3, false);
  return tex(cv, { repeat: true, aniso: 16 });
}
function wearTexture(spots) {
  // grayscale wear over world rect x[-3.6, 6.3], z[-11, 0]
  const W = 512, H = 568, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(99);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const X = x => (x + 3.6) / 9.9 * W, Z = z => (z + 11) / 11 * H, s = W / 9.9;
  for (const [x, z, rad, a] of spots) {
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rad * s);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(X(x), Z(z), rad * s, 0, TAU); g.fill();
  }
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = d[i] * (0.75 + r() * 0.5); d[i] = d[i + 1] = d[i + 2] = Math.min(255, n); }
  g.putImageData(id, 0, 0);
  const t = tex(cv, { srgb: false, flipY: false });
  return t;
}
function muralTexture() {
  const W = 1024, H = 512, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(42);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b0820'); bg.addColorStop(1, '#1c1238');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const tiledX = fn => { for (const ox of [-W, 0, W]) { g.save(); g.translate(ox, 0); fn(); g.restore(); } };
  for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H, s = r() < 0.1 ? 2.5 : 1.2; tiledX(() => { g.fillStyle = `rgba(220,230,255,${0.3 + r() * 0.5})`; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }); }
  const planets = [[160, 180, 60, '#ff3fa4', '#7b3cff'], [620, 330, 36, '#33e1ff', '#1a6fff'], [880, 140, 22, '#ffd23f', '#ff7a2f']];
  for (const [x, y, rad, a, b] of planets) tiledX(() => {
    const pg = g.createRadialGradient(x - rad * 0.4, y - rad * 0.4, rad * 0.1, x, y, rad); pg.addColorStop(0, a); pg.addColorStop(1, b);
    g.fillStyle = pg; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, rad * 1.8, rad * 0.4, -0.25, 0, TAU); g.stroke();
  });
  for (let i = 0; i < 4; i++) { const x = r() * W, y = 60 + r() * 300; tiledX(() => { const cg = g.createLinearGradient(x, y, x - 140, y + 50); cg.addColorStop(0, 'rgba(160,255,240,0.8)'); cg.addColorStop(1, 'rgba(160,255,240,0)'); g.strokeStyle = cg; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 140, y + 50); g.stroke(); g.fillStyle = '#e0fffa'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }); }
  // squiggle border band at the bottom (matches carpet)
  g.strokeStyle = '#ff3fa4'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, H - 26 + Math.sin(x / W * TAU * 8) * 8); g.stroke();
  g.strokeStyle = '#33e1ff'; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, H - 12 + Math.sin(x / W * TAU * 8 + 1.5) * 5); g.stroke();
  grain(g, W, H, 10, 8);
  return tex(cv, { repeat: true, aniso: 8 });
}
function wainscotTexture() {
  const W = 512, H = 512, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(5);
  g.fillStyle = '#2a1838'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) { const x = i * W / 4; g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, 0, 4, H); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 4, 0, 2, H); }
  for (let i = 0; i < 120; i++) { const x = r() * W, y = H - r() * r() * 200; g.strokeStyle = `rgba(${r() < 0.7 ? '10,5,12' : '200,180,210'},${0.1 + r() * 0.25})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 6); g.stroke(); }
  grain(g, W, H, 12, 6);
  return tex(cv, { repeat: true, aniso: 8 });
}
function ceilingTexture() {
  const W = 512, H = 512, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(3);
  g.fillStyle = '#26232f'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.08 + r() * 0.12})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
  g.fillStyle = '#6a6672'; g.fillRect(0, 0, W, 6); g.fillRect(0, H / 2 - 3, W, 6); g.fillRect(0, 0, 6, H); g.fillRect(W / 2 - 3, 0, 6, H);
  return tex(cv, { repeat: true, aniso: 8 });
}
function brushedTexture(base = 150) {
  const W = 256, H = 256, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(base);
  g.fillStyle = `rgb(${base},${base},${base + 6})`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { const y = r() * H, v = (r() - 0.5) * 60; g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v) / 255})`; g.fillRect(0, y, W, 1); }
  return tex(cv, { repeat: true });
}
function grilleTexture() {
  const W = 256, H = 256, cv = cnv(W, H), g = cv.getContext('2d');
  g.fillStyle = '#3a3a42'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#060608';
  for (let y = 8; y < H; y += 16) for (let x = 8 + ((y / 16) % 2) * 8; x < W; x += 16) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
  return tex(cv, { repeat: true });
}
function laminateTexture() {
  const W = 512, H = 512, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(77);
  g.fillStyle = '#1d4f5c'; g.fillRect(0, 0, W, H);
  const cols = ['#ff6f9f', '#ffd23f', '#e8f3ff', '#ff7a2f'];
  const tiled = fn => { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * H, t = Math.floor(r() * 3), col = cols[i % 4], rot = r() * TAU, s = 10 + r() * 16;
    tiled(() => { g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4; g.lineCap = 'round';
      if (t === 0) { g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fill(); }
      else if (t === 1) { g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s / 2, -s, 0, 0); g.quadraticCurveTo(s / 2, s, s, 0); g.stroke(); }
      else { g.fillRect(-s / 2, -2, s, 4); }
      g.restore(); });
  }
  grain(g, W, H, 8, 1);
  return tex(cv, { repeat: true, aniso: 4 });
}
function countertopTexture() {
  const W = 512, H = 512, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(12);
  g.fillStyle = '#d9cfc0'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) { g.fillStyle = ['rgba(90,80,70,0.5)', 'rgba(180,140,60,0.6)', 'rgba(255,255,255,0.6)', 'rgba(40,90,110,0.4)'][i % 4]; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
  return tex(cv, { repeat: true, aniso: 8 });
}
function woodTexture() {
  const W = 256, H = 256, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(8);
  g.fillStyle = '#6b4126'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { const y = r() * H; g.strokeStyle = `rgba(${r() < 0.5 ? '40,20,10' : '150,100,60'},${0.2 + r() * 0.3})`; g.lineWidth = 1 + r() * 2; g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3); g.stroke(); }
  return tex(cv, { repeat: true });
}
function glowTexture() {
  const S = 128, cv = cnv(S, S), g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(cv, { srgb: false });
}
function shadowTexture() {
  const S = 128, cv = cnv(S, S), g = cv.getContext('2d');
  // soft rounded-rect contact shadow
  g.filter = 'blur(10px)'; g.fillStyle = '#000'; g.fillRect(22, 22, S - 44, S - 44); g.filter = 'none';
  return tex(cv, { srgb: false });
}
function washTexture() {
  const W = 16, H = 128, cv = cnv(W, H), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return tex(cv, { srgb: false });
}
function neonTexture(text, color, w = 1024, h = 256, mirror = false, size = 150, font = 'italic 900') {
  const cv = cnv(w, h), g = cv.getContext('2d');
  if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
  g.font = `${font} ${size}px ${text.length > 8 ? '"Segoe Script", "Brush Script MT", cursive' : FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(text).width; if (tw > w * 0.9) { g.translate(w / 2, 0); g.scale(w * 0.9 / tw, 1); g.translate(-w / 2, 0); }
  g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = 30; g.strokeStyle = color; g.lineWidth = 14; g.strokeText(text, w / 2, h / 2);
  g.shadowBlur = 12; g.lineWidth = 8; g.strokeText(text, w / 2, h / 2);
  g.shadowBlur = 0; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeText(text, w / 2, h / 2);
  return tex(cv);
}
function streetTexture() {
  const W = 1024, H = 512, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(60);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.55); sky.addColorStop(0, '#04050f'); sky.addColorStop(1, '#1a2040');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // buildings across the street
  let x = 0;
  while (x < W) {
    const bw = 90 + r() * 140, bh = 120 + r() * 160, y0 = H * 0.62 - bh;
    g.fillStyle = `rgb(${14 + r() * 10},${14 + r() * 10},${24 + r() * 14})`; g.fillRect(x, y0, bw - 4, bh);
    for (let wy = y0 + 14; wy < H * 0.62 - 30; wy += 26) for (let wx = x + 10; wx < x + bw - 20; wx += 22) if (r() < 0.35) { g.fillStyle = r() < 0.5 ? 'rgba(255,200,120,0.85)' : 'rgba(150,200,255,0.6)'; g.fillRect(wx, wy, 11, 14); }
    x += bw;
  }
  // laundromat sign across the street
  g.save(); g.shadowColor = '#7cff9b'; g.shadowBlur = 18; g.fillStyle = '#c8ffd8'; g.font = `bold 34px ${FONT}`; g.textAlign = 'center'; g.fillText('SUDS & SPIN 24H', W * 0.3, H * 0.47); g.restore();
  g.fillStyle = 'rgba(255,240,200,0.12)'; g.fillRect(W * 0.18, H * 0.5, W * 0.24, H * 0.12);
  // sidewalk and road
  g.fillStyle = '#16151c'; g.fillRect(0, H * 0.62, W, H * 0.38);
  g.fillStyle = '#2a2830'; g.fillRect(0, H * 0.62, W, 10);
  g.fillStyle = 'rgba(255,220,120,0.6)'; for (let k = 0; k < 8; k++) g.fillRect(k * 140 + 20, H * 0.8, 70, 5);
  // reflections of the lamps on wet asphalt
  for (const lx of [W * 0.12, W * 0.72]) {
    g.fillStyle = '#2c2c36'; g.fillRect(lx - 3, H * 0.2, 6, H * 0.43);
    const lg = g.createRadialGradient(lx, H * 0.2, 0, lx, H * 0.2, 90); lg.addColorStop(0, 'rgba(255,214,150,0.95)'); lg.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = lg; g.beginPath(); g.arc(lx, H * 0.2, 90, 0, TAU); g.fill();
    const rg = g.createLinearGradient(0, H * 0.64, 0, H); rg.addColorStop(0, 'rgba(255,200,130,0.35)'); rg.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = rg; g.fillRect(lx - 24, H * 0.64, 48, H * 0.36);
  }
  // a parked hatchback silhouette
  g.fillStyle = '#0b0b12'; g.beginPath(); g.moveTo(W * 0.5, H * 0.74); g.lineTo(W * 0.52, H * 0.66); g.lineTo(W * 0.6, H * 0.64); g.lineTo(W * 0.66, H * 0.68); g.lineTo(W * 0.68, H * 0.74); g.fill();
  g.fillStyle = 'rgba(255,60,60,0.8)'; g.fillRect(W * 0.675, H * 0.7, 8, 5);
  grain(g, W, H, 8, 2);
  return tex(cv);
}
function posterTexture(kind) {
  const W = 512, H = 720, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(kind.length * 13);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'rules') {
    g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e2384d'; g.fillRect(0, 0, W, 110);
    g.fillStyle = '#fff'; g.font = `900 52px ${FONT}`; g.fillText('HOUSE RULES', W / 2, 58);
    g.fillStyle = '#222'; g.font = `bold 30px ${FONT}`;
    ['1. HAVE FUN, BE KIND', '2. NO DRINKS ON', '    THE MACHINES', '3. ONE TOKEN = 25¢', '4. TOKENS CAN\'T BE', '    REFUNDED', '5. ASK AT THE COUNTER', '    IF A GAME EATS', '    YOUR TOKEN!'].forEach((t, i) => { g.textAlign = 'left'; g.fillText(t, 40, 170 + i * 52); });
    g.textAlign = 'center'; g.fillStyle = '#7b3cff'; g.font = `italic bold 28px ${FONT}`; g.fillText('— THE MGMT ♥', W / 2, H - 50);
  } else if (kind === 'night') {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a0f5c'); bg.addColorStop(1, '#ff3fa4'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    starfield(g, W, H * 0.5, 80, 3);
    logoText(g, 'TOKEN', W / 2, 150, 96, '#ffe14d', '#ff7a1a', '#1a0630');
    logoText(g, 'TUESDAYS', W / 2, 260, 80, '#ffffff', '#33e1ff', '#1a0630');
    g.fillStyle = '#fff'; g.font = `900 120px ${FONT}`; g.fillText('2 FOR 1', W / 2, 430);
    g.font = `bold 32px ${FONT}`; g.fillText('6 PM — CLOSE', W / 2, 540);
    g.font = `bold 24px ${FONT}`; g.fillText('BRING A FRIEND · BEAT A SCORE', W / 2, 600);
  } else if (kind === 'light') {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#040a24'); bg.addColorStop(1, '#1f6f9a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    starfield(g, W, H * 0.6, 120, 9);
    drawLighthouse(g, W * 0.68, H * 0.82, 120, GAMES.light.c);
    g.fillStyle = '#0b3a5c'; g.fillRect(0, H * 0.84, W, H * 0.16);
    logoText(g, 'NOW PLAYING', W / 2, 70, 48, '#ffffff', '#36c6e8', '#000');
    logoText(g, 'LUNAR', W * 0.35, 150, 70, '#ffcf4a', '#e2384d', '#000');
    logoText(g, 'LIGHTHOUSE', W * 0.42, 225, 62, '#fff3c4', '#ffcf4a', '#000');
  } else { // high-score board
    g.fillStyle = '#0d0a1c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(12, 12, W - 24, H - 24);
    logoText(g, 'HALL OF FAME', W / 2, 70, 50, '#ffe14d', '#ff7a1a', '#000');
    g.font = `bold 26px ${MONO}`;
    let y = 140;
    for (const k of ['light', 'crater', 'nomads', 'tide', 'kite']) {
      g.fillStyle = GAMES[k].c[0]; g.fillText(GAMES[k].title, W / 2, y); y += 34;
      g.fillStyle = '#ddd'; g.fillText(`${['JMR', 'AVA', 'DOT', 'KAI', 'LOU'][Math.floor(r() * 5)]} ....... ${String(20000 + Math.floor(r() * 60000)).padStart(6, '0')}`, W / 2, y); y += 70;
    }
  }
  grain(g, W, H, 10, 4);
  return tex(cv, { aniso: 4 });
}
function labelTextureRaw(lines, bg, fg, w = 256, h = 128, size = 34) {
  const cv = cnv(w, h), g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${size}px ${FONT}`;
  lines.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  return tex(cv);
}
function coinDoorTexture() {
  const W = 256, H = 384, cv = cnv(W, H), g = cv.getContext('2d'), r = rng(17);
  g.fillStyle = '#2b2b31'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) { const y = r() * H; g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(0, y, W, 1); }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(14, 14, W - 28, H - 28);
  // scratches around the slots where tokens miss
  for (const sx of [W * 0.3, W * 0.7]) for (let i = 0; i < 26; i++) { const x = sx + (r() - 0.5) * 70, y = H * 0.3 + (r() - 0.5) * 90; g.strokeStyle = `rgba(220,220,230,${0.15 + r() * 0.3})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `bold 18px ${FONT}`; g.textAlign = 'center';
  g.fillText('TOKENS ONLY', W / 2, H * 0.72);
  g.font = `bold 13px ${FONT}`; g.fillText('PUSH TO RETURN', W / 2, H * 0.53);
  return tex(cv);
}
function coinInsertTexture(txt, col) {
  const W = 64, H = 128, cv = cnv(W, H), g = cv.getContext('2d');
  g.fillStyle = col; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#100'; g.fillRect(W / 2 - 4, 14, 8, 50);
  g.fillStyle = '#fff'; g.font = `bold 22px ${FONT}`; g.textAlign = 'center'; g.fillText(txt, W / 2, 100);
  return tex(cv);
}
function stripesTexture(a, b, n = 6) {
  const cv = cnv(64, 256), g = cv.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 256 / n, 64, 256 / n); }
  return tex(cv);
}

function marqueeTexture(...args) { const key = 'marqueeTexture:' + JSON.stringify(args) + (GAMES[args[0]]?.title || ''); if (!textureCache.has(key)) textureCache.set(key, marqueeTextureRaw(...args)); return textureCache.get(key); }

function sideArtTexture(...args) { const key = 'sideArtTexture:' + JSON.stringify(args) + (GAMES[args[0]]?.title || ''); if (!textureCache.has(key)) textureCache.set(key, sideArtTextureRaw(...args)); return textureCache.get(key); }

function cpoTexture(...args) { const key = 'cpoTexture:' + JSON.stringify(args); if (!textureCache.has(key)) textureCache.set(key, cpoTextureRaw(...args)); return textureCache.get(key); }

function screenSheet(...args) { const key = 'screenSheet:' + JSON.stringify(args) + (GAMES[args[0]]?.title || ''); if (!textureCache.has(key)) textureCache.set(key, screenSheetRaw(...args)); return textureCache.get(key); }

function labelTexture(...args) { const key = 'labelTexture:' + JSON.stringify(args) + (GAMES[args[0]]?.title || ''); if (!textureCache.has(key)) textureCache.set(key, labelTextureRaw(...args)); return textureCache.get(key); }


// ---------------------------------------------------------------------------
// CRT attract screens: procedural GLSL per game (no texture re-uploads per frame)
// ---------------------------------------------------------------------------
const SCREEN_COMMON = /* glsl */`
varying vec2 vUv;
uniform float uTime;
uniform float uOffset;
uniform sampler2D uSheet;
uniform vec2 uRes;
uniform float uAspect;
float AA;
float h11(float p){ return fract(sin(p*127.1)*43758.5453); }
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.03+3.1)*0.3 + vnoise(p*4.1+7.7)*0.15; }
float fillS(float d){ return 1.0 - smoothstep(-AA, AA, d); }
float sdBox(vec2 p, vec2 b){ vec2 d=abs(p)-b; return length(max(d,0.0))+min(max(d.x,d.y),0.0); }
float sdCircle(vec2 p, float r){ return length(p)-r; }
float sdTri(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;
  vec2 pq0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.);
  vec2 pq1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.);
  vec2 pq2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
  float s=sign(e0.x*e2.y-e0.y*e2.x);
  vec2 d=min(min(vec2(dot(pq0,pq0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(pq1,pq1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(pq2,pq2),s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);
}
vec3 stars(vec2 p, float dens, float t){
  vec2 g = floor(p*dens), f = fract(p*dens)-0.5;
  float h = h21(g); if(h < 0.82) return vec3(0.0);
  vec2 o = vec2(h21(g+1.3), h21(g+2.7))-0.5;
  float d = length(f - o*0.6);
  float tw = 0.75 + 0.25*sin(t*1.5 + h*40.0);
  return vec3(smoothstep(0.12, 0.0, d)*tw*(0.5+0.5*h));
}
// sample a region of the text sheet: canvas pixel rows [y0,y1], placed in screen rect r=(x0,y0,x1,y1)
vec4 sheet(vec2 p, vec4 r, float sy0, float sy1){
  vec2 q = (p - r.xy) / (r.zw - r.xy);
  if(q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0) return vec4(0.0);
  vec2 s = vec2(q.x, 1.0 - mix(sy1, sy0, q.y)/512.0);
  return texture2D(uSheet, s);
}
`;

const GAME_GLSL = {
  crater: /* glsl */`
vec3 game(vec2 p, float t){
  // p.x in [0,uAspect], p.y in [0,1]
  vec3 col = mix(vec3(0.02,0.0,0.06), vec3(0.18,0.05,0.22), smoothstep(1.0,0.35,p.y));
  col += stars(p + vec2(t*0.01,0.0), 26.0, t);
  vec2 ep = p - vec2(0.56, 0.8); float e = sdCircle(ep, 0.075);
  vec3 earth = mix(vec3(0.1,0.35,0.9), vec3(0.2,0.8,0.4), step(0.55, vnoise(ep*40.0)));
  earth *= smoothstep(-0.05, 0.05, ep.x + ep.y*0.3 + 0.03);
  col = mix(col, earth, fillS(e));
  float x = p.x + t*0.06;
  float ridge = 0.46 + 0.07*sin(x*7.0) + 0.04*sin(x*17.0+1.0);
  col = mix(col, vec3(0.28,0.08,0.22), fillS(p.y - ridge));
  float gx = p.x + t*0.22;
  float ground = 0.30 + 0.02*sin(gx*11.0) + 0.012*sin(gx*29.0);
  vec3 gcol = mix(vec3(0.75,0.36,0.16), vec3(0.45,0.18,0.12), smoothstep(ground, ground-0.25, p.y));
  float cx = fract(gx*1.3)-0.5; float crater = sdBox(vec2(cx*0.77, p.y-(ground-0.035)), vec2(0.07,0.012));
  gcol = mix(gcol, vec3(0.2,0.07,0.08), fillS(crater));
  col = mix(col, gcol, fillS(p.y - ground));
  // buggy
  float bx = 0.28, bgx = bx + t*0.22;
  float by = 0.30 + 0.02*sin(bgx*11.0) + 0.012*sin(bgx*29.0) + 0.045 + abs(sin(t*3.0))*0.012;
  vec2 b = p - vec2(bx, by);
  float body = sdBox(b - vec2(0.0,0.01), vec2(0.07,0.018));
  float dome = sdCircle(b - vec2(-0.01,0.03), 0.026);
  col = mix(col, vec3(0.5,0.9,1.0), fillS(max(dome, -b.y+0.03)));
  col = mix(col, vec3(1.0,0.48,0.1), fillS(body));
  for(int i=0;i<3;i++){ vec2 w = b - vec2(-0.05+0.05*float(i), -0.017); float wd = sdCircle(w, 0.017);
    float sp = step(0.0, sin(atan(w.y,w.x)*4.0 + t*14.0));
    col = mix(col, mix(vec3(0.12,0.08,0.1), vec3(0.9,0.85,0.7), sp*step(length(w),0.01)), fillS(wd)); }
  // shots and saucer
  float sx = 0.4 + 0.22*sin(t*0.7);
  vec2 s = p - vec2(sx, 0.86 + 0.02*sin(t*2.0));
  col = mix(col, vec3(0.6,1.0,0.5), fillS(sdBox(s, vec2(0.045,0.008))));
  col = mix(col, vec3(0.9,1.0,0.9), fillS(sdCircle(s-vec2(0.0,0.01), 0.018)));
  float shot = fract(t*0.8);
  col += vec3(1.0,0.9,0.3)*fillS(sdBox(p - vec2(bx+0.02, by+0.05+shot*0.5), vec2(0.004,0.012)));
  return col;
}`,
  nomads: /* glsl */`
vec3 game(vec2 p, float t){
  float n = fbm(p*3.0 + vec2(0.0, t*0.03));
  vec3 col = mix(vec3(0.01,0.0,0.04), vec3(0.35,0.05,0.35), n*n*0.9);
  col += vec3(0.05,0.12,0.25)*fbm(p*5.0 - vec2(t*0.02,0.0));
  col += stars(p + vec2(0.0, t*0.05), 22.0, t)*0.7 + stars(p + vec2(0.3, t*0.12), 12.0, t);
  float sway = sin(t*0.8)*0.07;
  for(int j=0;j<3;j++) for(int i=0;i<5;i++){
    vec2 c = vec2(0.1 + float(i)*0.135 + sway, 0.62 + float(j)*0.085);
    float dive = step(4.0, mod(t + float(i*3+j)*1.7, 9.0));
    vec2 q = p - c; q.x *= 1.0 + 0.15*sin(t*6.0 + float(i));
    float s = sdTri(q, vec2(-0.03,0.02), vec2(0.03,0.02), vec2(0.0,-0.025));
    s = min(s, sdBox(q - vec2(0.0,0.018), vec2(0.04,0.006)));
    vec3 ec = j==1 ? vec3(0.2,0.9,1.0) : (j==0 ? vec3(1.0,0.25,0.65) : vec3(1.0,0.85,0.2));
    col = mix(col, ec, fillS(s));
  }
  float px = 0.375 + 0.25*sin(t*0.9);
  vec2 q = p - vec2(px, 0.12);
  float ship = sdTri(q, vec2(-0.04,-0.025), vec2(0.04,-0.025), vec2(0.0,0.045));
  col = mix(col, vec3(0.95,0.95,1.0), fillS(ship));
  col += vec3(1.0,0.5,0.1)*fillS(sdCircle(q - vec2(0.0,-0.035), 0.008 + 0.003*sin(t*30.0)));
  for(int k=0;k<3;k++){ float f = fract(t*0.9 + float(k)*0.33);
    float bxp = 0.375 + 0.25*sin((t - f/0.9)*0.9);
    col += vec3(0.6,1.0,1.0)*fillS(sdBox(p - vec2(bxp, 0.17 + f*0.7), vec2(0.003,0.012))); }
  return col;
}`,
  tide: /* glsl */`
vec3 game(vec2 p, float t){
  vec3 col = mix(vec3(0.0,0.12,0.22), vec3(0.05,0.55,0.62), p.y);
  float c = sin(p.x*22.0 + sin(p.y*17.0 + t)*1.4 + t*0.8) * sin(p.y*19.0 + sin(p.x*13.0 - t*0.7)*1.6);
  col += vec3(0.25,0.5,0.45)*smoothstep(0.75,1.0,c)*0.5*p.y;
  float rays = smoothstep(0.6,1.0, sin((p.x - p.y*0.4)*18.0 + t*0.3)) * smoothstep(0.3,1.0,p.y);
  col += vec3(0.2,0.35,0.3)*rays*0.35;
  float sand = 0.2 + 0.015*sin(p.x*30.0);
  col = mix(col, mix(vec3(0.95,0.75,0.42), vec3(0.75,0.5,0.3), step(0.5, fract(p.x*30.0+p.y*10.0))*0.3), fillS(p.y - sand));
  for(int i=0;i<4;i++){ float x0 = 0.15 + float(i)*0.35;
    float w = sin(p.y*10.0 + t*1.6 + float(i))*0.02*p.y*3.0;
    float d = abs(p.x - x0 - w) - 0.008*(1.2-p.y);
    col = mix(col, vec3(0.1,0.6,0.3), fillS(max(d, p.y - (0.55 + 0.1*h11(float(i)))))); }
  float beat = pow(abs(sin(t*3.1416)), 4.0);
  vec2 cp = p - vec2(uAspect*0.5, 0.33 + 0.02*beat);
  cp.x += 0.04*sin(t*1.5708);
  float body = sdBox(cp*vec2(1.0,1.6), vec2(0.07,0.02)) - 0.03;
  float clawL = sdCircle(cp - vec2(-0.13, 0.08 + 0.05*sin(t*3.14)), 0.035);
  float clawR = sdCircle(cp - vec2( 0.13, 0.08 - 0.05*sin(t*3.14)), 0.035);
  float legs = 1.0;
  for(int k=0;k<3;k++){ float lx = 0.05 + float(k)*0.025; legs = min(legs, min(sdBox(cp - vec2(-lx-0.04,-0.045), vec2(0.03,0.004)), sdBox(cp - vec2(lx+0.04,-0.045), vec2(0.03,0.004)))); }
  vec3 crab = vec3(1.0,0.38,0.3);
  col = mix(col, crab*0.8, fillS(legs));
  col = mix(col, crab, fillS(min(body, min(clawL, clawR))));
  col = mix(col, vec3(1.0), fillS(min(sdCircle(cp-vec2(-0.03,0.06),0.012), sdCircle(cp-vec2(0.03,0.06),0.012))));
  col = mix(col, vec3(0.0), fillS(min(sdCircle(cp-vec2(-0.028,0.062),0.006), sdCircle(cp-vec2(0.032,0.062),0.006))));
  for(int i=0;i<8;i++){ float fi = float(i); float y = fract(t*0.12 + h11(fi)) ; vec2 bp = p - vec2(h11(fi+3.0)*uAspect + 0.01*sin(t*2.0+fi), y);
    col += vec3(0.7,1.0,1.0)*0.6*(1.0 - smoothstep(0.0, AA*2.0, abs(length(bp) - 0.012))); }
  // rhythm lane
  float lane = sdBox(p - vec2(uAspect*0.5, 0.08), vec2(uAspect*0.45, 0.04));
  col = mix(col, vec3(0.02,0.05,0.1), fillS(lane)*0.75);
  vec2 tp = p - vec2(0.18, 0.08);
  col += vec3(1.0,0.9,0.4)*(0.4 + 0.6*beat)*(1.0 - smoothstep(0.0, AA*2.5, abs(length(tp) - 0.03)));
  for(int k=0;k<5;k++){ float x = 0.18 + fract(-t*0.25 + float(k)*0.2)*1.05; vec2 ap = p - vec2(x, 0.08);
    float ar = sdTri(ap, vec2(-0.02,0.0), vec2(0.015,0.022), vec2(0.015,-0.022));
    col = mix(col, k%2==0 ? vec3(1.0,0.4,0.6) : vec3(0.4,1.0,0.9), fillS(ar)); }
  return col;
}`,
  kite: /* glsl */`
vec3 kite(vec2 p, vec2 c, float r, vec3 a, vec3 b, inout vec3 col){
  vec2 q = p - c; q = mat2(cos(r),-sin(r),sin(r),cos(r))*q;
  float d = sdTri(q, vec2(0.0,0.07), vec2(0.045,0.01), vec2(0.0,-0.08));
  float e = sdTri(q, vec2(0.0,0.07), vec2(-0.045,0.01), vec2(0.0,-0.08));
  col = mix(col, a, fillS(d)); col = mix(col, b, fillS(e));
  return col;
}
vec3 game(vec2 p, float t){
  vec3 col = mix(vec3(1.0,0.62,0.3), vec3(0.32,0.1,0.42), smoothstep(0.25,1.0,p.y));
  vec2 sp = p - vec2(uAspect*0.5, 0.3);
  float sun = sdCircle(sp, 0.17);
  float band = step(0.5, fract((p.y)*28.0)) * step(p.y, 0.3);
  col = mix(col, mix(vec3(1.0,0.92,0.6), vec3(1.0,0.5,0.55), smoothstep(0.45,0.15,p.y)), fillS(sun)*(1.0-band*0.9));
  for(int i=0;i<5;i++){ float fi=float(i); vec2 cp = p - vec2(fract(h11(fi)+t*0.02*(1.0+fi*0.3))*(uAspect+0.4)-0.2, 0.55+h11(fi+9.0)*0.35);
    float cl = sdCircle(cp*vec2(0.5,1.6), 0.03); cl = min(cl, sdCircle((cp-vec2(0.04,0.01))*vec2(0.5,1.6), 0.025));
    col = mix(col, vec3(1.0,0.86,0.82), fillS(cl)*0.65); }
  float hill = 0.18 + 0.05*sin(p.x*6.0+1.0) + 0.03*sin(p.x*15.0);
  col = mix(col, vec3(0.18,0.06,0.2), fillS(p.y - hill));
  float hill2 = 0.1 + 0.04*sin(p.x*9.0+3.0);
  col = mix(col, vec3(0.08,0.02,0.1), fillS(p.y - hill2));
  vec2 k1 = vec2(uAspect*0.5 - 0.28 + 0.12*sin(t*0.7), 0.62 + 0.12*sin(t*1.4));
  vec2 k2 = vec2(uAspect*0.5 + 0.28 + 0.12*sin(t*0.7+2.0), 0.6 + 0.12*sin(t*1.4+1.0));
  // strings
  float s1 = abs(dot(normalize(vec2(k1.y-0.0, -(k1.x-0.05))), p - vec2(0.05,0.0)));
  float s2 = abs(dot(normalize(vec2(k2.y-0.0, -(k2.x-(uAspect-0.05)))), p - vec2(uAspect-0.05,0.0)));
  col = mix(col, vec3(1.0), (1.0-smoothstep(0.0,AA*1.5,s1))*step(p.y,k1.y)*0.5);
  col = mix(col, vec3(1.0), (1.0-smoothstep(0.0,AA*1.5,s2))*step(p.y,k2.y)*0.5);
  for(int i=1;i<8;i++){ float fi=float(i);
    vec2 tp1 = k1 + vec2(-0.012*fi + 0.015*sin(t*4.0 - fi), -0.02*fi);
    vec2 tp2 = k2 + vec2(0.012*fi + 0.015*sin(t*4.0 - fi + 1.0), -0.02*fi);
    col = mix(col, i%2==0 ? vec3(1.0,0.85,0.2) : vec3(0.9,0.2,0.3), fillS(sdCircle(p - tp1, 0.008)));
    col = mix(col, i%2==0 ? vec3(1.0) : vec3(0.2,0.6,1.0), fillS(sdCircle(p - tp2, 0.008))); }
  kite(p, k1, 0.3*sin(t*1.1), vec3(0.9,0.2,0.3), vec3(1.0,0.85,0.2), col);
  kite(p, k2, 0.3*sin(t*1.1+1.5), vec3(0.2,0.6,1.0), vec3(1.0), col);
  float hpL = 0.6 + 0.3*sin(t*0.5); float hpR = 0.6 + 0.3*cos(t*0.45);
  col = mix(col, vec3(0.1), fillS(sdBox(p - vec2(0.2, 0.93), vec2(0.15, 0.015))));
  col = mix(col, vec3(1.0,0.3,0.4), fillS(sdBox(p - vec2(0.05 + 0.15*hpL, 0.93), vec2(0.15*hpL, 0.01))));
  col = mix(col, vec3(0.1), fillS(sdBox(p - vec2(uAspect-0.2, 0.93), vec2(0.15, 0.015))));
  col = mix(col, vec3(0.3,0.7,1.0), fillS(sdBox(p - vec2(uAspect-0.05 - 0.15*hpR, 0.93), vec2(0.15*hpR, 0.01))));
  return col;
}`,
  light: /* glsl */`
vec3 game(vec2 p, float t){
  vec3 col = mix(vec3(0.01,0.02,0.07), vec3(0.06,0.12,0.3), smoothstep(1.0,0.4,p.y));
  col += stars(p, 30.0, t)*0.9;
  vec2 mp = p - vec2(0.25, 0.78);
  float moon = sdCircle(mp, 0.085);
  vec3 mc = vec3(1.0,0.97,0.85) * (0.85 + 0.15*vnoise(mp*60.0));
  col = mix(col, mc, fillS(moon));
  col += vec3(0.5,0.55,0.7)*0.25*smoothstep(0.3, 0.0, length(mp));
  float horizon = 0.42;
  if(p.y < horizon){
    float d = horizon - p.y;
    vec3 sea = mix(vec3(0.03,0.1,0.22), vec3(0.01,0.03,0.08), d*2.0);
    float w = sin(p.x*60.0/(d*6.0+0.3) + t*1.5 + sin(p.x*13.0)) * 0.5 + 0.5;
    sea += vec3(0.1,0.2,0.3)*w*(0.3 - d*0.5);
    float refl = smoothstep(0.06, 0.0, abs(p.x - 0.25 + 0.01*sin(p.y*120.0 + t*3.0))) * step(0.5, fract(p.y*60.0 + t*0.5));
    sea += vec3(0.9,0.9,0.8)*refl*0.6;
    col = sea;
  }
  // lighthouse on rocks
  vec2 lp = p - vec2(uAspect*0.74, horizon);
  float rock = sdCircle(lp*vec2(0.6,1.4) + vec2(0.0,0.05), 0.08);
  col = mix(col, vec3(0.05,0.06,0.1), fillS(rock));
  float tower = sdTri(lp, vec2(-0.04,0.0), vec2(0.04,0.0), vec2(0.0,0.5));
  tower = max(tower, lp.y - 0.27);
  vec3 tc = mix(vec3(0.95,0.93,0.88), vec3(0.85,0.18,0.25), step(0.5, fract(lp.y*12.0)));
  col = mix(col, tc*0.85, fillS(tower));
  vec2 lamp = lp - vec2(0.0, 0.29);
  col = mix(col, vec3(1.0,0.95,0.7), fillS(sdBox(lamp, vec2(0.018,0.02))));
  col = mix(col, vec3(0.6,0.1,0.15), fillS(sdTri(lamp - vec2(0.0,0.02), vec2(-0.026,0.0), vec2(0.026,0.0), vec2(0.0,0.03))));
  // sweeping beam
  float ang = t*0.9;
  float dir = cos(ang) >= 0.0 ? 1.0 : -1.0;
  float spread = abs(cos(ang));
  vec2 bp = p - (vec2(uAspect*0.74, horizon) + vec2(0.0,0.29));
  float a = atan(bp.y, bp.x*dir);
  float beam = smoothstep(0.09, 0.0, abs(a - 0.05*sin(ang))) * smoothstep(0.0, 0.05, bp.x*dir) * spread;
  col += vec3(1.0,0.95,0.7)*beam*0.55*exp(-length(bp)*1.2);
  col += vec3(1.0,0.95,0.75)*smoothstep(0.06,0.0,length(bp))*(0.5+0.5*spread);
  // boats bobbing, lit when the beam passes
  for(int i=0;i<3;i++){ float fi=float(i);
    float bx = fract(0.1 + fi*0.31 + t*0.012*(1.0+fi*0.4))*(uAspect*0.65);
    vec2 q = p - vec2(bx, horizon - 0.05 - fi*0.07 + 0.006*sin(t*2.0+fi));
    float hull = sdTri(q, vec2(-0.04,0.0), vec2(0.04,0.0), vec2(0.0,-0.02));
    hull = min(hull, sdBox(q - vec2(0.0,0.007), vec2(0.04,0.007)));
    float sail = sdTri(q - vec2(0.0,0.012), vec2(0.0,0.0), vec2(0.0,0.07), vec2(0.035,0.0));
    vec2 bq = q + vec2(bx,0.0) - vec2(uAspect*0.74,0.29) + vec2(0.0,horizon);
    float lit = beam > 0.01 ? 1.0 : 0.0;
    float hitb = smoothstep(0.12,0.0, abs(atan(q.y + horizon - 0.05 - (horizon+0.29), (q.x + bx - uAspect*0.74)*dir) - 0.05*sin(ang))) * spread;
    vec3 hc = mix(vec3(0.15,0.12,0.18), vec3(0.95,0.75,0.4), hitb);
    col = mix(col, hc, fillS(hull));
    col = mix(col, mix(vec3(0.5,0.55,0.7), vec3(1.0,0.97,0.85), hitb), fillS(sail)); }
  // gulls
  for(int i=0;i<3;i++){ float fi=float(i); vec2 g = p - vec2(fract(t*0.03 + fi*0.37)*uAspect, 0.6 + 0.08*fi + 0.01*sin(t*3.0+fi));
    float wing = abs(g.y - abs(g.x)*0.6*(0.6+0.4*sin(t*8.0+fi))) ; col = mix(col, vec3(0.9), (1.0-smoothstep(0.0,AA*1.5,wing))*step(abs(g.x),0.02)); }
  return col;
}`,
};

function screenMaterial(key, offset) {
  const G = GAMES[key];
  const aspect = G.portrait ? 0.75 : 4 / 3;
  const res = G.portrait ? [224, 288] : [320, 240];
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uOffset: { value: offset }, uSheet: { value: screenSheet(key) }, uRes: { value: new THREE.Vector2(...res) }, uAspect: { value: aspect } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: SCREEN_COMMON + GAME_GLSL[key] + /* glsl */`
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc*(1.0 + 0.045*dot(cc,cc)*4.0);
  float inside = smoothstep(0.0,0.012,uv.x)*smoothstep(1.0,0.988,uv.x)*smoothstep(0.0,0.012,uv.y)*smoothstep(1.0,0.988,uv.y);
  vec2 fw = fwidth(uv*uRes);
  float near = clamp(1.6 - max(fw.x,fw.y), 0.0, 1.0);             // pixel-art only when we can resolve it
  vec2 q = mix(uv, (floor(uv*uRes)+0.5)/uRes, near);
  AA = max(1.5/uRes.y, length(fwidth(uv))*0.9);
  vec2 p = vec2(q.x*uAspect, q.y);
  float t = uTime + uOffset;
  float cyc = mod(t, 22.0);
  vec3 col = game(p, t);
  // HUD on top
  vec4 hud = sheet(q, vec4(0.03, 0.9, 0.97, 0.985), 200.0, 260.0);
  col = mix(col, hud.rgb, hud.a);
  float blink = step(0.35, fract(t*0.5));
  vec4 coin = sheet(q, vec4(0.15, 0.03, 0.85, 0.09), 262.0, 305.0);
  col = mix(col, coin.rgb, coin.a*blink*step(cyc, 13.0));
  // title card and high-score table phases
  float title = smoothstep(13.0,13.4,cyc)*(1.0-smoothstep(17.6,18.0,cyc));
  float table = smoothstep(17.6,18.0,cyc)*(1.0-smoothstep(21.6,22.0,cyc));
  if(title + table > 0.0){
    vec3 dim = col*0.25;
    vec4 logo = sheet(q, uAspect < 1.0 ? vec4(0.02,0.52,0.98,0.84) : vec4(0.08,0.45,0.92,0.92), 8.0, 196.0);
    vec3 tcol = mix(dim, logo.rgb, logo.a);
    vec4 c2 = sheet(q, vec4(0.15, 0.18, 0.85, 0.27), 262.0, 305.0);
    tcol = mix(tcol, c2.rgb, c2.a*blink);
    vec4 hs = sheet(q, uAspect < 1.0 ? vec4(0.02,0.18,0.98,0.72) : vec4(0.12,0.08,0.88,0.84), 310.0, 512.0);
    vec3 hcol = mix(vec3(0.0,0.0,0.03), hs.rgb, hs.a);
    col = mix(col, tcol, title);
    col = mix(col, hcol, table);
  }
  // scanlines fade out once they would alias
  float sl = q.y*uRes.y;
  float scan = 0.5 + 0.5*cos(6.2831853*sl);
  col *= mix(1.0, 0.72 + 0.28*scan, near);
  // RGB phosphor mask, close range only
  float m = mod(floor(uv.x*uRes.x*3.0), 3.0);
  vec3 mask = m < 1.0 ? vec3(1.08,0.94,0.94) : (m < 2.0 ? vec3(0.94,1.08,0.94) : vec3(0.94,0.94,1.08));
  col *= mix(vec3(1.0), mask, near*0.8);
  float vig = 1.0 - 0.45*dot(cc,cc)*2.5;
  col = pow(max(col,0.0), vec3(2.2)) * vig * 1.35 * inside + vec3(0.004,0.006,0.008);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  return mat;
}
// bulged CRT surface
function crtGeometry(w, h, bulge = 0.018) {
  const geo = new THREE.PlaneGeometry(w, h, 18, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2), y = pos.getY(i) / (h / 2);
    pos.setZ(i, bulge * (1 - 0.5 * x * x) * (1 - 0.5 * y * y));
  }
  geo.computeVertexNormals();
  return geo;
}


// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const M = {};
let TX = {};
function initMaterials() {
  TX.glow = glowTexture(); TX.shadow = shadowTexture(); TX.wash = washTexture();
  TX.brushed = brushedTexture(150); TX.brushedDark = brushedTexture(70);
  TX.grille = grilleTexture(); TX.coinDoor = coinDoorTexture();
  const S = (o) => new THREE.MeshStandardMaterial(o);
  M.black = S({ color: 0x121116, roughness: 0.55, metalness: 0.0 });
  M.matte = S({ color: 0x050506, roughness: 0.95 });
  M.backPaint = S({ color: 0x1b1a20, roughness: 0.8 });
  M.kick = S({ color: 0x18171c, roughness: 0.7 });
  M.chrome = S({ color: 0xe8e8ee, roughness: 0.16, metalness: 1.0, map: TX.brushed });
  M.steel = S({ color: 0xb0b0b8, roughness: 0.35, metalness: 1.0, map: TX.brushed });
  M.darkMetal = S({ color: 0x9a9aa4, roughness: 0.45, metalness: 0.85, map: TX.brushedDark });
  M.coinDoor = S({ map: TX.coinDoor, roughness: 0.42, metalness: 0.75 });
  M.rubber = S({ color: 0x0c0c0e, roughness: 0.92 });
  M.grille = S({ map: TX.grille, roughness: 0.5, metalness: 0.6 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.6 });
  M.tA = S({ color: 0xf2b705, roughness: 0.32 });            // Volt-Tek yellow T-molding
  M.tB = S({ color: 0xe6f4f6, roughness: 0.25, metalness: 0.2 }); // Wavecrest pearl
  M.gold = S({ color: 0xd9a83a, roughness: 0.28, metalness: 0.9 });
  M.shadow = new THREE.MeshBasicMaterial({ map: TX.shadow, color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.plastic = {};
  for (const [k, c] of Object.entries({ red: 0xe0202a, yellow: 0xffc400, blue: 0x1f6fff, green: 0x22c45a, white: 0xf2f2f2, black: 0x111111, orange: 0xff6a10, purple: 0x8a3cff, teal: 0x18c8c0, pink: 0xff4f9a }))
    M.plastic[k] = S({ color: c, roughness: 0.22, metalness: 0.0 });
  M.coinLit = {};
}
function glowMat(color, opacity = 0.5, map = TX.glow) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });
}
function emissiveMat(map, intensity = 1.0, color = 0xffffff) {
  return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: color, emissiveIntensity: intensity, color: 0x202020, roughness: 0.35 });
}

// ---------------------------------------------------------------------------
// Cabinet parts
// ---------------------------------------------------------------------------
function sidePanels(parent, shape, W, D, thick, artL, artR, trim, bevel = 0.005) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 });
  geo.rotateY(-Math.PI / 2); geo.translate(0, 0, -D / 2);
  mesh(geo, [artL, trim], parent, -W / 2 + thick + bevel, 0, 0);
  mesh(geo, [artR, trim], parent, W / 2 - bevel, 0, 0);
  // The shared extrusion reverses lettering on its outward +x cap. Reuse a
  // small crop of the authored signature at the same physical shoulder; leave
  // both full illustrations and the narrow upper silhouettes unchanged.
  const signature = sideSignatures.get(artR);
  if (signature) {
    // Clip the small opaque crop to the real profile, including the curved
    // feature shoulder. Reflect only its viewing direction, never its placement.
    let points = shape.getPoints(18).map(p => [p.x,p.y]);
    for (const [axis,bound,greater] of [[0,signature.u-signature.width/2,true],[0,signature.u+signature.width/2,false],
      [1,signature.y-signature.height/2,true],[1,signature.y+signature.height/2,false]]) {
      const output = [], inside = p => greater ? p[axis]>=bound : p[axis]<=bound;
      for (let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length],ai=inside(a),bi=inside(b);
        if (ai) output.push(a);
        if (ai!==bi) {const t=(bound-a[axis])/(b[axis]-a[axis]);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
      }
      points=output;
    }
    const decalShape = new THREE.Shape(points.map(([u,v]) => new THREE.Vector2(signature.u-u,v-signature.y)));
    const decalGeometry = new THREE.ShapeGeometry(decalShape),position=decalGeometry.attributes.position,uv=decalGeometry.attributes.uv;
    for (let i=0;i<position.count;i++) uv.setXY(i,position.getX(i)/signature.width+.5,position.getY(i)/signature.height+.5);
    const decal = mesh(decalGeometry,
      signature.material, parent, W / 2 + .003, signature.y, signature.u - D / 2, 0, Math.PI / 2);
    decal.name = 'readable-cabinet-side';
    decal.userData.signature = {title:signature.title,width:signature.width,height:signature.height};
  }
  return thick + 2 * bevel;
}
function artMaterials(key, uMin, uMax, vMax) {
  const t = sideArtTexture(key, uMin, uMax, vMax);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / (uMax - uMin), 1 / vMax); t.offset.set(-uMin / (uMax - uMin), 0);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.0 });
  if (!sideSignatures.has(t)) {
    const G = GAMES[key], range = uMax - uMin, W = t.image.width, H = t.image.height;
    const u = G.bank === 'STARLITE' ? .22 : .245, v = G.bank === 'STARLITE' ? 1.70 : 1.67;
    const span = G.bank === 'STARLITE' ? .46 : .42, scaleY = range / vMax * H / W;
    const sw = span / range * W + 30, sh = 182 * scaleY;
    const cv = cnv(512, 128);
    cv.getContext('2d').drawImage(t.image,(u-uMin)/range*W-sw/2,(1-v/vMax)*H-86*scaleY,sw,sh,0,0,512,128);
    const map = tex(cv,{aniso:8});
    sideSignatures.set(t,{title:G.title,u,y:v-5*range/W,width:sw/W*range,height:sh/H*vMax,
      material:new THREE.MeshStandardMaterial({map,roughness:.42,metalness:0.0})});
  }
  sideSignatures.set(m,sideSignatures.get(t));
  return [m, m];
}
function addCoinDoor(parent, x, y, z, s = 1, insertCol = '#c0101a') {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  box(0.29, 0.38, 0.006, M.darkMetal, g, 0, 0, 0.003);
  box(0.265, 0.355, 0.012, M.coinDoor, g, 0, 0, 0.008);
  const key = insertCol;
  if (!M.coinLit[key]) M.coinLit[key] = emissiveMat(coinInsertTexture('25¢', insertCol), 2.2);
  for (const sx of [-0.065, 0.065]) {
    box(0.044, 0.085, 0.016, M.chrome, g, sx, 0.085, 0.014);
    box(0.034, 0.07, 0.004, M.coinLit[key], g, sx, 0.085, 0.0235);
    box(0.034, 0.022, 0.012, M.chrome, g, sx, 0.012, 0.018);
  }
  cyl(0.013, 0.013, 0.014, 16, M.chrome, g, 0, -0.1, 0.018, Math.PI / 2);
  box(0.003, 0.012, 0.002, M.matte, g, 0, -0.1, 0.0255);
  const gl = mesh(new THREE.PlaneGeometry(0.22, 0.14), glowMat(new THREE.Color(insertCol).multiplyScalar(0.8), 0.35), g, 0, 0.085, 0.03);
  return g;
}
// controls on a control-panel frame (local xy = panel top, +z up out of the panel)
function addControls(frame, L, layout, style) {
  for (const it of layout) {
    const x = it.x, y = it.y - L / 2;
    if (it.kind === 'stick') {
      cyl(0.03, 0.03, 0.003, 24, M.rubber, frame, x, y, 0.0015, Math.PI / 2);
      cyl(0.0055, 0.0055, 0.07, 10, M.chrome, frame, x, y, 0.035, Math.PI / 2);
      if (style === 'bat') {
        cyl(0.011, 0.012, 0.055, 16, M.plastic[it.color || 'black'], frame, x, y, 0.085, Math.PI / 2);
        mesh(new THREE.SphereGeometry(0.011, 16, 8), M.plastic[it.color || 'black'], frame, x, y, 0.1125);
      } else {
        mesh(new THREE.SphereGeometry(0.019, 20, 14), M.plastic[it.color || 'red'], frame, x, y, 0.085);
      }
    } else if (it.kind === 'spin') {
      cyl(0.05, 0.05, 0.004, 32, M.rubber, frame, x, y, 0.002, Math.PI / 2);
      cyl(0.042, 0.044, 0.03, 36, M.steel, frame, x, y, 0.02, Math.PI / 2);
      cyl(0.036, 0.042, 0.006, 36, M.chrome, frame, x, y, 0.038, Math.PI / 2);
      cyl(0.008, 0.008, 0.012, 12, M.plastic.red, frame, x + 0.022, y, 0.044, Math.PI / 2);
    } else if (it.kind === 'dome') {
      cyl(it.r * 1.25, it.r * 1.3, 0.008, 32, M.chrome, frame, x, y, 0.004, Math.PI / 2);
      const dm = mesh(new THREE.SphereGeometry(it.r, 32, 16, 0, TAU, 0, Math.PI / 2), it.mat, frame, x, y, 0.006, Math.PI / 2);
    } else {
      const r = it.r, mat = M.plastic[it.color || 'red'];
      cyl(r * 1.32, r * 1.38, 0.007, 28, mat, frame, x, y, 0.0035, Math.PI / 2);
      cyl(r * 0.95, r * 0.95, 0.012, 28, mat, frame, x, y, 0.012, Math.PI / 2);
      cyl(r * 1.0, r * 1.0, 0.003, 28, M.plastic.black, frame, x, y, 0.0072, Math.PI / 2);
    }
  }
}
function screenAssembly(parent, D, p0, p1, innerW, key, ow, oh, cy, light, offset, glassOut = 0.006) {
  const f = frameAt(parent, D, p0, p1, 0), len = f.userData.len;
  // A small functional surface anchor follows cabinet placement and screen tilt.
  cabinetScreens.set(parent,{frame:f,width:ow-.02,height:oh-.02,cy,z:glassOut+.002});
  // bezel card with a rounded opening
  const sh = new THREE.Shape(); sh.moveTo(-innerW / 2, -len / 2); sh.lineTo(innerW / 2, -len / 2); sh.lineTo(innerW / 2, len / 2); sh.lineTo(-innerW / 2, len / 2); sh.closePath();
  sh.holes.push(roundRectShape(ow, oh, 0.03, 0, cy, new THREE.Path()));
  const bt = bezelTexture(key, innerW, len, ow, oh);
  bt.repeat.set(1 / innerW, 1 / len); bt.offset.set(0.5, 0.5);
  mesh(new THREE.ShapeGeometry(sh, 8), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.55 }), f, 0, 0, -0.002);
  // tube surround
  const dz = 0.06;
  box(ow + 0.04, 0.02, dz, M.matte, f, 0, cy + oh / 2 + 0.01, -dz / 2 - 0.003);
  box(ow + 0.04, 0.02, dz, M.matte, f, 0, cy - oh / 2 - 0.01, -dz / 2 - 0.003);
  box(0.02, oh, dz, M.matte, f, -ow / 2 - 0.01, cy, -dz / 2 - 0.003);
  box(0.02, oh, dz, M.matte, f, ow / 2 + 0.01, cy, -dz / 2 - 0.003);
  const crt = mesh(crtGeometry(ow + 0.02, oh + 0.02, 0.02), screenMaterial(key, offset), f, 0, cy, -0.05);
  crt.userData.keep = true;
  mesh(new THREE.PlaneGeometry(innerW, len), M.glass, f, 0, 0, glassOut);
  // glass retaining strips
  box(innerW, 0.012, 0.01, M.black, f, 0, len / 2 - 0.006, glassOut);
  box(innerW, 0.012, 0.01, M.chrome, f, 0, -len / 2 + 0.006, glassOut);
  if (light) {
    const pl = new THREE.PointLight(GAMES[key].glow, light, 3.2, 2);
    pl.position.set(0, cy, 0.38); f.add(pl);
    f.userData.light = pl;
  }
  return f;
}
function marqueePanel(parent, D, p0, p1, innerW, key, intensity = 1.6) {
  const f = frameAt(parent, D, p0, p1, 0), len = f.userData.len;
  box(innerW, len, 0.02, M.matte, f, 0, 0, -0.03);
  mesh(new THREE.PlaneGeometry(innerW, len - 0.02), emissiveMat(marqueeTexture(key, innerW / (len - 0.02)), intensity), f, 0, 0, -0.004);
  box(innerW, 0.016, 0.012, M.chrome, f, 0, len / 2 - 0.008, 0.002);
  box(innerW, 0.016, 0.012, M.chrome, f, 0, -len / 2 + 0.008, 0.002);
  mesh(new THREE.PlaneGeometry(innerW, len - 0.02), M.glass, f, 0, 0, 0.0);
  return f;
}
function addFeet(parent, W, D, inset = 0.06) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(0.018, 0.022, 0.012, 12, M.rubber, parent, sx * (W / 2 - inset), 0.006, sz * (D / 2 - inset));
  }
}
function blobShadow(parent, w, d, z = 0, op = 0.85) {
  const m = mesh(new THREE.PlaneGeometry(w, d), M.shadow, parent, 0, 0.003, z, -Math.PI / 2);
  return m;
}

// ---------------------------------------------------------------------------
// Bank A: Volt-Tek classic uprights (angular, portrait screen, 1P stick + 3 buttons)
// ---------------------------------------------------------------------------
function buildVoltTek(key, offset, btnColors, stickColor) {
  const g = new THREE.Group();
  const W = 0.64, D = 0.84, H = 1.84;
  const P = [[0, 0], [0.72, 0], [0.72, 0.84], [0.84, 0.88], [0.84, 0.96], [0.57, 1.04], [0.54, 1.08], [0.41, 1.5], [0.48, 1.55], [0.53, 1.78], [0.45, 1.84], [0, 1.84]];
  const shape = new THREE.Shape(); shape.moveTo(...P[0]); for (let i = 1; i < P.length; i++) shape.lineTo(...P[i]); shape.closePath();
  const [aL, aR] = artMaterials(key, 0, 0.84, 1.84);
  const st = sidePanels(g, shape, W, D, 0.012, aL, aR, M.tA, 0.004);
  const Wi = W - 2 * st;
  const front = new THREE.MeshStandardMaterial({ color: key === 'crater' ? 0x6a1420 : 0x2a1260, roughness: 0.45 });
  slab(g, D, [0.72, 0], [0.72, 0.1], Wi, 0.02, M.kick);
  slab(g, D, [0.72, 0.1], [0.72, 0.84], Wi, 0.02, front);
  // stripes across the lower front
  const sc = [M.plastic.yellow, M.plastic.orange, M.plastic.red];
  for (let k = 0; k < 3; k++) box(Wi, 0.012, 0.002, sc[k], g, 0, 0.74 - k * 0.022, 0.72 - D / 2 + 0.001);
  addCoinDoor(g, 0, 0.42, 0.72 - D / 2, 1, '#c0101a');
  slab(g, D, [0.72, 0.84], [0.84, 0.88], Wi, 0.02, M.black);
  slab(g, D, [0.84, 0.88], [0.84, 0.96], Wi + 0.002, 0.02, front);
  // control panel with overlay
  const layout = [
    { kind: 'stick', x: -0.15, y: 0.14, r: 0.02, color: stickColor },
    { kind: 'btn', x: 0.02, y: 0.11, r: 0.015, color: btnColors[0] },
    { kind: 'btn', x: 0.085, y: 0.135, r: 0.015, color: btnColors[1] },
    { kind: 'btn', x: 0.15, y: 0.15, r: 0.015, color: btnColors[2] },
    { kind: 'start', x: -0.23, y: 0.235, r: 0.01, color: 'white', label: '1P' },
  ];
  const L = Math.hypot(0.27, 0.08);
  const cpo = cpoTexture(key, Wi, L, layout);
  const cp = slab(g, D, [0.84, 0.96], [0.57, 1.04], Wi, 0.02, M.black);
  cp.material = [M.black, M.black, M.black, M.black, new THREE.MeshStandardMaterial({ map: cpo, roughness: 0.38 }), M.black];
  const cpf = frameAt(g, D, [0.84, 0.96], [0.57, 1.04], 0);
  addControls(cpf, L, layout, 'ball');
  box(Wi, 0.008, 0.012, M.chrome, cpf, 0, -L / 2 + 0.004, 0.0); // front edge trim
  slab(g, D, [0.57, 1.04], [0.54, 1.08], Wi, 0.02, M.black);
  const sf = screenAssembly(g, D, [0.54, 1.08], [0.41, 1.5], Wi, key, 0.33, 0.38, 0.0, 0, offset);
  slab(g, D, [0.41, 1.5], [0.48, 1.55], Wi, 0.012, M.grille);
  marqueePanel(g, D, [0.48, 1.55], [0.53, 1.78], Wi, key, 1.7);
  slab(g, D, [0.53, 1.78], [0.45, 1.84], Wi, 0.02, M.black);
  slab(g, D, [0.45, 1.84], [0, 1.84], Wi, 0.02, M.black);
  slab(g, D, [0, 1.84], [0, 0], Wi, 0.02, M.backPaint);
  addFeet(g, W, D);
  blobShadow(g, W + 0.35, D + 0.4, 0.05);
  // manufacturer badge
  const badge = new THREE.MeshStandardMaterial({ map: labelTexture(['VOLT-TEK'], '#d8d8de', '#7a1020', 256, 64, 34), roughness: 0.3, metalness: 0.6 });
  box(0.12, 0.03, 0.003, badge, g, 0.0, 0.18, 0.72 - D / 2 + 0.002);
  g.userData = { W, D, cpOver: 0.0, light: sf.userData.light };
  return g;
}

// ---------------------------------------------------------------------------
// Bank B: Wavecrest uprights (curved hood, landscape screen, wide 2P panel)
// ---------------------------------------------------------------------------
function buildWavecrest(key, offset, p1c, p2c) {
  const g = new THREE.Group();
  const W = 0.74, D = 0.82, H = 1.94;
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.78, 0); s.lineTo(0.78, 0.08); s.lineTo(0.74, 0.84); s.lineTo(0.6, 1.0); s.lineTo(0.56, 1.06); s.lineTo(0.43, 1.5);
  s.quadraticCurveTo(0.56, 1.52, 0.64, 1.6); s.lineTo(0.67, 1.8);
  s.quadraticCurveTo(0.68, 1.94, 0.5, 1.94); s.bezierCurveTo(0.3, 1.94, 0.1, 1.95, 0.02, 1.86); s.lineTo(0, 1.8); s.closePath();
  const [aL, aR] = artMaterials(key, 0, 0.78, 1.94);
  const st = sidePanels(g, s, W, D, 0.014, aL, aR, M.tB, 0.006);
  const Wi = W - 2 * st;
  const paint = new THREE.MeshStandardMaterial({ color: key === 'tide' ? 0x0b4d63 : 0x5a1d58, roughness: 0.32, metalness: 0.1 });
  slab(g, D, [0.78, 0], [0.78, 0.08], Wi, 0.02, M.kick);
  const fp = slab(g, D, [0.78, 0.08], [0.74, 0.84], Wi, 0.02, paint);
  const ff = frameAt(g, D, [0.78, 0.08], [0.74, 0.84], 0);
  addCoinDoor(ff, 0, -0.02, 0, 1, '#1a8a40');
  // wave stripe
  box(Wi, 0.02, 0.003, M.plastic.teal, ff, 0, 0.3, 0.001); box(Wi, 0.01, 0.003, M.plastic.pink, ff, 0, 0.27, 0.001);
  // wide control panel (overhangs the sides)
  const cpS = new THREE.Shape();
  cpS.moveTo(0.6, 0.84); cpS.lineTo(0.86, 0.86); cpS.quadraticCurveTo(0.93, 0.88, 0.91, 0.95); cpS.lineTo(0.89, 0.99); cpS.lineTo(0.58, 1.07); cpS.lineTo(0.55, 0.98); cpS.closePath();
  const CW = W + 0.1;
  const cpg = new THREE.ExtrudeGeometry(cpS, { depth: CW - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 });
  cpg.rotateY(-Math.PI / 2); cpg.translate(0, 0, -D / 2);
  mesh(cpg, [paint, M.black], g, CW / 2 - 0.008, 0, 0);
  const layout = [];
  for (const sx of [-1, 1]) {
    const pc = sx < 0 ? p1c : p2c;
    layout.push({ kind: 'stick', x: sx * 0.3, y: 0.15, r: 0.02, color: 'black' });
    layout.push({ kind: 'btn', x: sx * 0.2, y: 0.115, r: 0.014, color: pc[0] });
    layout.push({ kind: 'btn', x: sx * 0.145, y: 0.13, r: 0.014, color: pc[1] });
    layout.push({ kind: 'btn', x: sx * 0.2, y: 0.18, r: 0.014, color: pc[2] });
    layout.push({ kind: 'btn', x: sx * 0.145, y: 0.195, r: 0.014, color: pc[3] });
    layout.push({ kind: 'start', x: sx * 0.04, y: 0.24, r: 0.009, color: 'white' });
  }
  const L = Math.hypot(0.31, 0.08);
  const cpo = cpoTexture(key, CW - 0.02, L, layout);
  const cpf = frameAt(g, D, [0.89, 0.99], [0.58, 1.07], 0.0085);
  mesh(new THREE.PlaneGeometry(CW - 0.02, L), new THREE.MeshStandardMaterial({ map: cpo, roughness: 0.3 }), cpf, 0, 0, 0);
  addControls(cpf, L, layout, 'bat');
  // stick to cpf's frame: bat-tops use the colour list
  slab(g, D, [0.58, 1.07], [0.56, 1.06], Wi, 0.02, M.black);
  const sf = screenAssembly(g, D, [0.56, 1.06], [0.43, 1.5], Wi, key, 0.5, 0.375, 0.0, 0, offset);
  // hood underside with a soft downlight onto the panel
  slab(g, D, [0.43, 1.5], [0.64, 1.6], Wi, 0.02, M.black);
  const hf = frameAt(g, D, [0.43, 1.5], [0.64, 1.6], 0.002);
  box(Wi - 0.08, 0.025, 0.004, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8fff8).multiplyScalar(1.6) }), hf, 0, 0.05, -0.001);
  marqueePanel(g, D, [0.64, 1.6], [0.67, 1.8], Wi, key, 1.6);
  const topPts = [[0.67, 1.8], [0.64, 1.91], [0.5, 1.94], [0.3, 1.945], [0.1, 1.93], [0.02, 1.86], [0, 1.8]];
  for (let i = 0; i < topPts.length - 1; i++) slab(g, D, topPts[i], topPts[i + 1], Wi, 0.02, M.black);
  slab(g, D, [0, 1.8], [0, 0], Wi, 0.02, M.backPaint);
  addFeet(g, W, D);
  blobShadow(g, W + 0.4, D + 0.45, 0.06);
  const badge = new THREE.MeshStandardMaterial({ map: labelTexture(['WAVECREST'], '#e6f4f6', '#0b4d63', 256, 64, 30), roughness: 0.3, metalness: 0.5 });
  box(0.14, 0.03, 0.003, badge, ff, 0, -0.33, 0.002);
  g.userData = { W, D, cpOver: 0.11, light: sf.userData.light };
  return g;
}

// ---------------------------------------------------------------------------
// Feature cabinet: LUNAR LIGHTHOUSE (swept fins, arched marquee, beacon tower)
// ---------------------------------------------------------------------------
function buildLighthouse(offset) {
  const g = new THREE.Group();
  const W = 1.16, D = 1.0, key = 'light', c = GAMES.light.c;
  const s = new THREE.Shape();
  s.moveTo(0.0, 0); s.lineTo(1.0, 0); s.lineTo(1.0, 0.1); s.lineTo(0.96, 0.84); s.lineTo(0.76, 1.06); s.lineTo(0.74, 1.08); s.lineTo(0.56, 1.62);
  s.lineTo(0.88, 1.74); s.lineTo(0.9, 1.93); s.quadraticCurveTo(0.6, 2.02, 0.3, 1.97);
  s.quadraticCurveTo(0.02, 1.9, -0.24, 1.32); s.quadraticCurveTo(-0.05, 1.18, 0.0, 0.95); s.closePath();
  const [aL, aR] = artMaterials(key, -0.24, 1.0, 2.02);
  const st = sidePanels(g, s, W, D, 0.03, aL, aR, M.gold, 0.008);
  const Wi = W - 2 * st;
  const navy = new THREE.MeshStandardMaterial({ color: 0x0c1d48, roughness: 0.35, metalness: 0.15 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x0a0f22, roughness: 0.5 });
  slab(g, D, [1.0, 0], [1.0, 0.1], Wi, 0.02, M.kick);
  slab(g, D, [1.0, 0.1], [0.96, 0.84], Wi, 0.02, navy);
  const ff = frameAt(g, D, [1.0, 0.1], [0.96, 0.84], 0);
  addCoinDoor(ff, 0, -0.04, 0, 1.05, '#d08a10');
  // porthole speakers
  for (const sx of [-0.33, 0.33]) {
    mesh(new THREE.TorusGeometry(0.075, 0.012, 10, 40), M.gold, ff, sx, 0.12, 0.004);
    mesh(new THREE.CircleGeometry(0.075, 32), M.grille, ff, sx, 0.12, 0.002);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; mesh(new THREE.SphereGeometry(0.006, 8, 6), M.chrome, ff, sx + Math.cos(a) * 0.075, 0.12 + Math.sin(a) * 0.075, 0.012); }
  }
  // gold pinstripes on the front
  box(Wi, 0.006, 0.002, M.gold, ff, 0, 0.3, 0.001); box(Wi, 0.006, 0.002, M.gold, ff, 0, -0.33, 0.001);
  // console control panel
  const cpS = new THREE.Shape();
  cpS.moveTo(0.82, 0.8); cpS.lineTo(1.1, 0.83); cpS.quadraticCurveTo(1.2, 0.85, 1.18, 0.93); cpS.lineTo(1.16, 0.99); cpS.lineTo(0.76, 1.1); cpS.lineTo(0.74, 0.98); cpS.closePath();
  const CW = W + 0.18;
  const cpg = new THREE.ExtrudeGeometry(cpS, { depth: CW - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 12 });
  cpg.rotateY(-Math.PI / 2); cpg.translate(0, 0, -D / 2);
  mesh(cpg, [navy, M.gold], g, CW / 2 - 0.01, 0, 0);
  // under-console glow strip
  box(CW - 0.1, 0.012, 0.01, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40d8ff).multiplyScalar(2.0) }), g, 0, 0.83, 1.06 - D / 2);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xffa010, emissiveIntensity: 1.2, roughness: 0.2, transparent: false });
  M.beamDome = domeMat;
  const layout = [
    { kind: 'dome', x: 0, y: 0.19, r: 0.05, mat: domeMat, label: 'BEAM' },
    { kind: 'start', x: -0.1, y: 0.33, r: 0.01, color: 'white' }, { kind: 'start', x: 0.1, y: 0.33, r: 0.01, color: 'white' },
  ];
  for (const sx of [-1, 1]) {
    layout.push({ kind: 'spin', x: sx * 0.42, y: 0.18, r: 0.045 });
    layout.push({ kind: 'btn', x: sx * 0.26, y: 0.14, r: 0.017, color: sx < 0 ? 'red' : 'blue' });
    layout.push({ kind: 'btn', x: sx * 0.19, y: 0.2, r: 0.017, color: sx < 0 ? 'yellow' : 'white' });
  }
  const L = Math.hypot(0.4, 0.11);
  const cpo = cpoTexture(key, CW - 0.03, L, layout);
  const cpf = frameAt(g, D, [1.16, 0.99], [0.76, 1.1], 0.0105);
  mesh(new THREE.PlaneGeometry(CW - 0.03, L), new THREE.MeshStandardMaterial({ map: cpo, roughness: 0.3 }), cpf, 0, 0, 0);
  addControls(cpf, L, layout, 'ball');
  slab(g, D, [0.76, 1.1], [0.74, 1.08], Wi, 0.02, M.black);
  const sf = screenAssembly(g, D, [0.74, 1.08], [0.56, 1.62], Wi, key, 0.66, 0.46, 0.0, 3.4, offset);
  // hood underside with gold downlight
  slab(g, D, [0.56, 1.62], [0.88, 1.74], Wi, 0.02, deck);
  const hf = frameAt(g, D, [0.56, 1.62], [0.88, 1.74], 0.002);
  box(Wi - 0.12, 0.02, 0.004, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.5) }), hf, 0, 0.08, -0.001);
  // top & back
  slab(g, D, [0.9, 1.93], [0.45, 1.98], Wi, 0.02, M.black);
  slab(g, D, [0.45, 1.98], [0.02, 1.62], Wi, 0.02, M.black);
  slab(g, D, [0.02, 1.62], [0.02, 0], Wi, 0.02, M.backPaint);
  // back service details
  const bf = frameAt(g, D, [0.02, 1.62], [0.02, 0], 0);
  const backTex = labelTexture(['⚠ CAUTION', 'HIGH VOLTAGE', 'INSIDE', '', 'SERVICE BY', 'STARLITE STAFF', 'ONLY'], '#e8c020', '#111', 256, 384, 26);
  box(0.16, 0.24, 0.002, new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 }), bf, -0.25, -0.35, 0.002);
  const serial = labelTexture(['STARLITE AMUSEMENT CO.', 'MODEL LL-2  SER. 00417', '120V 60Hz 3.2A'], '#c8c8cc', '#222', 512, 160, 30);
  box(0.16, 0.05, 0.002, new THREE.MeshStandardMaterial({ map: serial, roughness: 0.3, metalness: 0.7 }), bf, 0.25, -0.45, 0.002);
  for (let k = 0; k < 9; k++) box(0.42, 0.012, 0.004, M.matte, bf, 0, 0.45 - k * 0.03, 0.001);
  box(0.6, 0.8, 0.004, M.darkMetal, bf, 0, -0.05, 0.0005).scale.set(1, 1, 1);
  cyl(0.012, 0.012, 0.01, 12, M.chrome, bf, 0.27, 0.0, 0.005, Math.PI / 2);
  // arched marquee header
  const hw = Wi + 0.02, archH = 0.16, archPk = 0.52;
  const arch = new THREE.Shape(); arch.moveTo(-hw / 2, 0); arch.lineTo(hw / 2, 0); arch.lineTo(hw / 2, archH); arch.quadraticCurveTo(0, archPk, -hw / 2, archH); arch.closePath();
  const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 32 });
  const hdr = new THREE.Group(); hdr.position.set(0, 1.745, 0.88 - D / 2 - 0.22 - 0.012); g.add(hdr);
  mesh(ag, [navy, M.gold], hdr, 0, 0, 0);
  const inset = new THREE.Shape(); const iw = hw - 0.05;
  inset.moveTo(-iw / 2, 0.02); inset.lineTo(iw / 2, 0.02); inset.lineTo(iw / 2, archH - 0.005); inset.quadraticCurveTo(0, archPk - 0.05, -iw / 2, archH - 0.005); inset.closePath();
  const mt = marqueeTexture('light', iw / 0.34); mt.repeat.set(1 / iw, 1 / 0.34); mt.offset.set(0.5, -0.02 / 0.34);
  mesh(new THREE.ShapeGeometry(inset, 32), emissiveMat(mt, 2.0), hdr, 0, 0, 0.2345);
  // chase bulbs following the arch
  const pts = [];
  for (let i = 0; i <= 22; i++) { const t = i / 22; const a = new THREE.Vector2(hw / 2, archH), cpt = new THREE.Vector2(0, archPk), b = new THREE.Vector2(-hw / 2, archH);
    pts.push([(1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * cpt.x + t * t * b.x, (1 - t) * (1 - t) * a.y + 2 * t * (1 - t) * cpt.y + t * t * b.y]); }
  for (let i = 1; i <= 3; i++) { pts.unshift([hw / 2, archH - i * 0.05]); pts.push([-hw / 2, archH - i * 0.05]); }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
  const dm = new THREE.Object3D();
  pts.forEach(([x, y], i) => { const nx = x * 0.985, ny = y + (y > archH - 0.001 ? 0.012 : 0); dm.position.set(nx, ny, 0.24); dm.updateMatrix(); bulbs.setMatrixAt(i, dm.matrix); bulbs.setColorAt(i, new THREE.Color(1, 0.8, 0.4)); });
  bulbs.userData.keep = true; hdr.add(bulbs);
  g.userData.bulbs = bulbs; g.userData.nBulbs = pts.length;
  // lighthouse tower
  const tw = new THREE.Group(); tw.position.set(0, 1.745 + 0.34 + 0.01, hdr.position.z + 0.11); g.add(tw);
  const stripe = new THREE.MeshStandardMaterial({ map: stripesTexture('#f4efe6', '#d0283c', 6), roughness: 0.45 });
  cyl(0.13, 0.15, 0.04, 32, navy, tw, 0, 0.02, 0);
  cyl(0.085, 0.11, 0.3, 32, stripe, tw, 0, 0.19, 0);
  cyl(0.13, 0.13, 0.016, 32, M.darkMetal, tw, 0, 0.348, 0);
  mesh(new THREE.TorusGeometry(0.125, 0.004, 6, 40), M.steel, tw, 0, 0.395, 0, Math.PI / 2);
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; cyl(0.003, 0.003, 0.045, 6, M.steel, tw, Math.cos(a) * 0.125, 0.375, Math.sin(a) * 0.125); }
  const lantern = new THREE.MeshStandardMaterial({ color: 0x222833, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, envMapIntensity: 1.5 });
  cyl(0.07, 0.07, 0.11, 24, lantern, tw, 0, 0.415, 0, 0, 0, 0, true);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; cyl(0.004, 0.004, 0.11, 6, M.darkMetal, tw, Math.cos(a) * 0.07, 0.415, Math.sin(a) * 0.07); }
  cyl(0.09, 0.09, 0.012, 24, M.darkMetal, tw, 0, 0.476, 0);
  mesh(new THREE.ConeGeometry(0.095, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xa01826, roughness: 0.35, metalness: 0.4 }), tw, 0, 0.53, 0);
  mesh(new THREE.SphereGeometry(0.016, 12, 8), M.gold, tw, 0, 0.59, 0);
  const lamp = mesh(new THREE.SphereGeometry(0.034, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.6).multiplyScalar(3) }), tw, 0, 0.415, 0);
  lamp.userData.keep = true;
  // rotating beacon beams (soft additive cones)
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.86, 0.55) } },
    vertexShader: `varying float vA; varying vec3 vN; varying vec3 vV; void main(){ vA = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; varying vec3 vN; varying vec3 vV; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(vA, 2.2) * f * f * 0.45; gl_FragColor = vec4(uColor*a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(0.22, 1.3, 20, 1, true); beamGeo.translate(0, -0.65, 0); beamGeo.rotateZ(Math.PI / 2);
  const beams = new THREE.Group(); beams.position.set(0, 0.415, 0); tw.add(beams); beams.userData.keep = true;
  const b1 = mesh(beamGeo, beamMat, beams); const b2 = mesh(beamGeo, beamMat, beams, 0, 0, 0, 0, Math.PI, 0);
  g.userData.beams = beams;
  const spot = new THREE.SpotLight(0xffd9a0, 6, 14, 0.2, 0.7, 1.4);
  spot.position.set(0, 0.415, 0); tw.add(spot);
  const tgt = new THREE.Object3D(); beams.add(tgt); tgt.position.set(4, -1.2, 0); spot.target = tgt;
  g.userData.spot = spot;
  const halo = mesh(new THREE.PlaneGeometry(0.5, 0.5), glowMat(0xffd890, 0.5), tw, 0, 0.415, 0.0);
  halo.userData.keep = true; g.userData.halo = halo;
  // display dais
  const dais = new THREE.Group(); g.add(dais);
  const dw = W + 0.42, dz0 = -D / 2 - 0.3, dz1 = 1.16 - D / 2 + 0.22, dd = dz1 - dz0;
  box(dw, 0.06, dd, new THREE.MeshStandardMaterial({ color: 0x15132a, roughness: 0.6 }), dais, 0, 0.03, (dz0 + dz1) / 2);
  box(dw + 0.012, 0.012, dd + 0.012, M.chrome, dais, 0, 0.062, (dz0 + dz1) / 2);
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40d8ff).multiplyScalar(1.5) });
  box(dw - 0.02, 0.008, 0.004, led, dais, 0, 0.028, dz1 + 0.003);
  box(0.004, 0.008, dd - 0.02, led, dais, -dw / 2 - 0.003, 0.028, (dz0 + dz1) / 2);
  box(0.004, 0.008, dd - 0.02, led, dais, dw / 2 + 0.003, 0.028, (dz0 + dz1) / 2);
  const fglow = glowMat(0x40c8ff, 0.22, TX.wash);
  mesh(new THREE.PlaneGeometry(dw, 0.5), fglow, dais, 0, 0.004, dz1 + 0.25, -Math.PI / 2);
  g.position.y = 0;
  addFeet(g, W, D, 0.08);
  g.children.forEach(ch => { if (ch !== dais) ch.position.y += 0.06; });
  blobShadow(dais, dw + 0.4, dd + 0.4, (dz0 + dz1) / 2);
    g.userData.W = W; g.userData.D = D; g.userData.dais = [dw, dz0, dz1]; g.userData.light = sf.userData.light;
  return g;
}


// ---------------------------------------------------------------------------
// Room shell, entrance, counter alcove and props
// ---------------------------------------------------------------------------
const WALL_BANDS = [];
function initRoomMaterials() {
  TX.mural = muralTexture(); TX.wains = wainscotTexture(); TX.ceil = ceilingTexture();
  M.wains = new THREE.MeshLambertMaterial({ map: TX.wains });
  M.mural = new THREE.MeshLambertMaterial({ map: TX.mural });
  M.soffit = new THREE.MeshLambertMaterial({ color: 0x0b0a12 });
  M.ceil = new THREE.MeshLambertMaterial({ map: TX.ceil });
  M.base = new THREE.MeshLambertMaterial({ color: 0x0d0c10 });
  M.rail = new THREE.MeshStandardMaterial({ color: 0x8a8a96, roughness: 0.35, metalness: 0.9, map: TX.brushed });
  M.alu = new THREE.MeshStandardMaterial({ color: 0xa8a8b0, roughness: 0.32, metalness: 0.9, map: TX.brushed });
  M.wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.6 });
  M.laminate = new THREE.MeshStandardMaterial({ map: laminateTexture(), roughness: 0.4 });
  M.countertop = new THREE.MeshStandardMaterial({ map: countertopTexture(), roughness: 0.3 });
  WALL_BANDS.push([0, 1.1, M.wains, 1.2, 1.1], [1.1, 2.62, M.mural, 3.0, 1.52], [2.62, 3.0, M.soffit, 1, 1]);
}
// wall strip from (x0,z0) to (x1,z1), facing n = (-dz, dx); s0 = running distance for UV continuity
function wallStrip(x0, z0, x1, z1, y0, y1, s0 = 0, trims = true) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const ry = Math.atan2(-uz, ux), nx = -uz, nz = ux;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  for (const [b0, b1, mat, tw, th] of WALL_BANDS) {
    const a = Math.max(y0, b0), b = Math.min(y1, b1);
    if (b - a < 0.001) continue;
    const geo = new THREE.PlaneGeometry(len, b - a);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (s0 + uv.getX(i) * len) / tw, (a - b0 + uv.getY(i) * (b - a)) / th);
    mesh(geo, mat, staticRoot, mx, (a + b) / 2, mz, 0, ry, 0);
  }
  if (trims) {
    if (y0 <= 0.001) box(len, 0.1, 0.014, M.base, staticRoot, mx + nx * 0.007, 0.05, mz + nz * 0.007, 0, ry, 0);
    if (y0 <= 1.1 && y1 >= 1.14) box(len, 0.04, 0.02, M.rail, staticRoot, mx + nx * 0.01, 1.12, mz + nz * 0.01, 0, ry, 0);
    if (y0 <= 2.62 && y1 >= 2.64) box(len, 0.03, 0.03, M.alu, staticRoot, mx + nx * 0.015, 2.62, mz + nz * 0.015, 0, ry, 0);
  }
}
function wallPlane(mat, w, h, x, y, z, ry) { return mesh(new THREE.PlaneGeometry(w, h), mat, staticRoot, x, y, z, 0, ry, 0); }

function carpetMaterial(wearTex) {
  const m = new THREE.MeshLambertMaterial({ map: carpetTexture(), color: 0x8c88a0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWear = { value: wearTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uWear;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wear = texture2D(uWear, vec2((vWPos.x + 3.6) / 9.9, (vWPos.z + 11.0) / 11.0)).r;
        vec3 flatc = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2)));
        diffuseColor.rgb = mix(diffuseColor.rgb, flatc * 1.25 + vec3(0.012, 0.011, 0.014), wear * 0.85);`)
      ;
  };
  return m;
}

function buildRoom() {
  initRoomMaterials();
  const { x0, x1, z0, z1, h } = ROOM;
  // --- floor with wear paths
  const spots = [];
  spots.push([0, -0.55, 1.0, 0.9]);
  for (let z = -1; z > -8.2; z -= 0.35) spots.push([Math.sin(z * 1.3) * 0.25, z, 0.8, 0.22]);
  for (let a = 0; a < TAU; a += 0.2) spots.push([Math.cos(a) * 1.35, -9.25 + Math.sin(a) * 1.35, 0.5, 0.26]);
  for (const z of CABINET_LAYOUT.left) spots.push([-2.4, z, 0.45, 0.75], [-2.55, z, 0.3, 0.5]);
  for (const z of CABINET_LAYOUT.right) spots.push([2.25, z, 0.45, 0.75], [2.4, z, 0.3, 0.5]);
  spots.push([0, -7.95, 0.7, 0.85], [-0.4, -7.95, 0.4, 0.6], [0.4, -7.95, 0.4, 0.6]);
  for (let x = 0.3; x < 4.4; x += 0.35) spots.push([x, -3.0 - Math.sin(x) * 0.25, 0.6, 0.2]);
  spots.push([4.2, -3.2, 0.6, 0.7], [4.15, -4.3, 0.35, 0.6]);
  for (let z = -2.5; z > -7.5; z -= 0.4) spots.push([-1.3, z, 0.5, 0.12], [1.3, z - 0.5, 0.5, 0.12]);
  const wear = wearTexture(spots);
  const carpet = carpetMaterial(wear);
  carpet.map.repeat.set(9.9 / 1.7, 11 / 1.7);
  mesh(new THREE.PlaneGeometry(9.9, 11), carpet, staticRoot, 1.35, 0, -5.5, -Math.PI / 2);
  mesh(new THREE.PlaneGeometry(1, .65), carpet, staticRoot, -2.75, 0, -11.325, -Math.PI / 2);
  // --- ceilings
  const cg = new THREE.PlaneGeometry(x1 - x0, z1 - z0); scaleUV(cg, (x1 - x0) / 1.2, (z1 - z0) / 1.2);
  mesh(cg, M.ceil, staticRoot, 0, h, (z0 + z1) / 2, Math.PI / 2);
  const acg = new THREE.PlaneGeometry(ALC.x1 - ALC.x0, ALC.z1 - ALC.z0); scaleUV(acg, (ALC.x1 - ALC.x0) / 1.2, (ALC.z1 - ALC.z0) / 1.2);
  mesh(acg, M.ceil, staticRoot, (ALC.x0 + ALC.x1) / 2, ALC.h, (ALC.z0 + ALC.z1) / 2, Math.PI / 2);
  // troffer lights (dim, warm)
  const troffer = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(0.85) });
  for (const [x, z] of [[-1.2, -2.6], [1.2, -2.6], [-1.2, -6.8], [1.2, -6.8]]) {
    box(0.62, 0.02, 0.32, M.alu, staticRoot, x, h - 0.006, z);
    box(0.56, 0.01, 0.26, troffer, staticRoot, x, h - 0.016, z);
  }
  // --- walls (room on the left of travel direction => normal points inward)
  wallStrip(x0, z1, x0, z0, 0, h, 0);                       // left
  wallStrip(x0, z0, -3.25, z0, 0, h, 11);                  // rear exit opening
  wallStrip(-3.25, z0, -2.25, z0, 2.2, h, 11.35, false);
  wallStrip(-2.25, z0, x1, z0, 0, h, 12.35);
  wallStrip(x1, z0, x1, ALC.z0, 0, h, 18.2);                // right, back part
  wallStrip(x1, ALC.z0, x1, ALC.z1, ALC.h, h, 24.3, false); // header over the alcove
  wallStrip(x1, ALC.z1, x1, z1, 0, h, 27.7);                // right, front part
  // entrance wall pieces (door x[-1,1] y<2.25, window x[1.4,3.2] y[0.95,2.35])
  wallStrip(x1, z1, 3.2, z1, 0, h, 30);
  wallStrip(3.2, z1, 1.4, z1, 0, 0.95, 30.4); wallStrip(3.2, z1, 1.4, z1, 2.35, h, 30.4);
  wallStrip(1.4, z1, 1.0, z1, 0, h, 32.2);
  wallStrip(1.0, z1, -1.0, z1, 2.25, h, 32.6);
  wallStrip(-1.0, z1, x0, z1, 0, h, 34.6);
  // alcove walls
  wallStrip(ALC.x0, ALC.z0, ALC.x1, ALC.z0, 0, ALC.h, 0);
  wallStrip(ALC.x1, ALC.z0, ALC.x1, ALC.z1, 0, ALC.h, 2.7);
  wallStrip(ALC.x1, ALC.z1, ALC.x0, ALC.z1, 0, ALC.h, 6.1);
  // alcove opening trim
  box(0.06, 0.06, ALC.z1 - ALC.z0 + 0.06, M.alu, staticRoot, x1 - 0.01, ALC.h - 0.03, (ALC.z0 + ALC.z1) / 2);
  for (const z of [ALC.z0, ALC.z1]) box(0.06, ALC.h, 0.06, M.alu, staticRoot, x1, ALC.h / 2, z);
  // colliders for the shell
  addCollider(-6, 0, -1, 2);addCollider(1, 0, 8, 2);
  addCollider(-6, -13, -3.25, z0);addCollider(-2.25, -13, 8, z0);
  addCollider(-6, -13, x0, 2);
  // Short landing boundaries also contain a failed/blocked navigation attempt.
  addCollider(-1, .65, 1, 2);addCollider(-3.25, -13, -2.25, -11.65);
  addCollider(-1.04,-.06,-.96,.06);addCollider(.96,-.06,1.04,.06);
  addCollider(-3.25,-11.02,-3.2,-10.96);addCollider(-2.3,-11.02,-2.25,-10.96);
  addCollider(x1, -13, 8, ALC.z0); addCollider(x1, ALC.z1, 8, 2); addCollider(ALC.x1, -13, 8, 2);

  buildEntrance();
  buildNeon();
  buildCounter();
  buildProps();
  return wear;
}

function buildEntrance() {
  // outside: sidewalk + street backdrop seen through the glass
  const side = new THREE.MeshLambertMaterial({ color: 0x2a2830 });
  mesh(new THREE.PlaneGeometry(14, 6), side, staticRoot, 0, -0.01, 3, -Math.PI / 2);
  const st = streetTexture();
  mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: st }), staticRoot, 0, 2.6, 6.5);
  const outsideLight = new THREE.MeshBasicMaterial({ color: 0x0 });
  // door frame
  const fr = M.alu, z = 0;
  box(0.08, 2.3, 0.12, fr, staticRoot, -1.0, 1.15, z); box(0.08, 2.3, 0.12, fr, staticRoot, 1.0, 1.15, z);
  box(2.08, 0.08, 0.12, fr, staticRoot, 0, 2.25, z);
  for (const sx of [-1, 1]) {
    const cx = sx * 0.5, panel=doorPanel('home-entrance');
    box(0.9, 0.12, 0.05, fr, panel, cx, 0.06, z); box(0.9, 0.06, 0.05, fr, panel, cx, 2.18, z);
    box(0.05, 2.2, 0.05, fr, panel, cx + 0.45 * sx, 1.1, z);
    box(0.02, 2.22, 0.1, fr, panel, sx*.01, 1.11, z);
    mesh(new THREE.PlaneGeometry(0.88, 2.0), M.glass, panel, cx, 1.12, z - 0.01, 0, Math.PI, 0);
    // push bar
    box(0.62, 0.035, 0.035, M.chrome, panel, cx, 1.02, z - 0.08);
    for (const bx of [-0.3, 0.3]) box(0.03, 0.04, 0.07, M.chrome, panel, cx + bx, 1.02, z - 0.045);
    // kick plate
    box(0.86, 0.22, 0.004, M.steel, panel, cx, 0.24, z - 0.03);
  }
  // hours decal (reads correctly from outside, mirrored from inside)
  const hours = new THREE.MeshBasicMaterial({ map: (() => { const t = labelTexture(['STARLITE ARCADE', 'OPEN DAILY 2PM – 11PM', 'TOKENS · PRIZES · FUN'], 'rgba(0,0,0,0)', 'rgba(255,255,255,0.9)', 512, 160, 28); return t; })(), transparent: true, depthWrite: false });
  mesh(new THREE.PlaneGeometry(0.6, 0.19), hours, doorPanels.get('home-entrance')[0], -0.5, 1.55, -0.02, 0, Math.PI, 0);
  // window
  box(1.9, 0.08, 0.14, fr, staticRoot, 2.3, 0.95, 0); box(1.9, 0.08, 0.14, fr, staticRoot, 2.3, 2.35, 0);
  box(0.08, 1.48, 0.14, fr, staticRoot, 1.4, 1.65, 0); box(0.08, 1.48, 0.14, fr, staticRoot, 3.2, 1.65, 0); box(0.04, 1.4, 0.1, fr, staticRoot, 2.3, 1.65, 0);
  mesh(new THREE.PlaneGeometry(1.8, 1.4), M.glass, staticRoot, 2.3, 1.65, -0.01, 0, Math.PI, 0);
  box(1.9, 0.03, 0.22, M.alu, staticRoot, 2.3, 0.94, -0.08); // sill
  // OPEN neon in the window (mirrored from inside)
  const open = neonTexture('OPEN', '#ff3048', 512, 200, true, 140);
  const om = mesh(new THREE.PlaneGeometry(0.8, 0.31), new THREE.MeshBasicMaterial({ map: open, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }), staticRoot, 2.3, 1.75, -0.06, 0, Math.PI, 0);
  mesh(new THREE.PlaneGeometry(1.4, 0.9), glowMat(0xff2040, 0.25), staticRoot, 2.3, 1.75, -0.07, 0, Math.PI, 0);
  box(0.82, 0.33, 0.01, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5, transparent: true, opacity: 0.6 }), staticRoot, 2.3, 1.75, -0.045);
  for (const sx of [-0.3, 0.3]) cyl(0.002, 0.002, 0.6, 4, M.steel, staticRoot, 2.3 + sx, 2.05, -0.05);

  // door mat
  const matC = cnv(256, 128), mg = matC.getContext('2d'); mg.fillStyle = '#1e1d22'; mg.fillRect(0, 0, 256, 128);
  for (let y = 4; y < 128; y += 6) { mg.fillStyle = 'rgba(255,255,255,0.06)'; mg.fillRect(0, y, 256, 2); }
  const wg = mg.createRadialGradient(128, 64, 0, 128, 64, 90); wg.addColorStop(0, 'rgba(120,110,100,0.35)'); wg.addColorStop(1, 'rgba(0,0,0,0)'); mg.fillStyle = wg; mg.fillRect(0, 0, 256, 128);
  mg.font = `bold 22px ${FONT}`; mg.fillStyle = 'rgba(255,209,102,0.55)'; mg.textAlign = 'center'; mg.fillText('★ PRESS START ★', 128, 70);
  const matTex = tex(matC, { aniso: 8 });
  box(1.8, 0.012, 0.95, new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95 }), staticRoot, 0, 0.006, -0.62);
  blobShadow(staticRoot, 1.9, 1.05, -0.62);
}

function neonTube(points, color, radius = 0.011) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.2);
  const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 6, false);
  mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6) }), staticRoot);
}
function buildNeon() {
  // long wall tubes with wall-wash
  const mag = 0xff3fa4, cyan = 0x33d6ff;
  const lTube = new THREE.MeshBasicMaterial({ color: new THREE.Color(mag).multiplyScalar(2.6) });
  const rTube = new THREE.MeshBasicMaterial({ color: new THREE.Color(cyan).multiplyScalar(2.6) });
  cyl(0.012, 0.012, 9.6, 8, lTube, staticRoot, -3.55, 2.72, -5.5, Math.PI / 2);
  cyl(0.012, 0.012, 5.4, 8, rTube, staticRoot, 3.55, 2.72, -7.9, Math.PI / 2);
  for (let z = -1; z > -10.5; z -= 1.2) box(0.04, 0.02, 0.02, M.alu, staticRoot, -3.58, 2.72, z);
  for (let z = -5.4; z > -10.5; z -= 1.2) box(0.04, 0.02, 0.02, M.alu, staticRoot, 3.58, 2.72, z);
  const washL = glowMat(mag, 0.32, TX.wash), washR = glowMat(cyan, 0.3, TX.wash);
  mesh(new THREE.PlaneGeometry(9.6, 1.5), washL, staticRoot, -3.585, 1.98, -5.5, 0, Math.PI / 2, 0);
  mesh(new THREE.PlaneGeometry(5.4, 1.5), washR, staticRoot, 3.585, 1.98, -7.9, 0, -Math.PI / 2, 0);
  const capL = glowMat(mag, 0.35, TX.wash), capR = glowMat(cyan, 0.35, TX.wash);
  mesh(new THREE.PlaneGeometry(9.6, 0.32), capL, staticRoot, -3.59, 2.87, -5.5, Math.PI, Math.PI / 2, 0);
  mesh(new THREE.PlaneGeometry(5.4, 0.32), capR, staticRoot, 3.59, 2.87, -7.9, Math.PI, -Math.PI / 2, 0);
  const lL = new THREE.PointLight(mag, 2.6, 7, 1.6); lL.position.set(-3.1, 2.45, -5.2); scene.add(lL);
  const lR = new THREE.PointLight(cyan, 2.4, 7, 1.6); lR.position.set(3.1, 2.45, -8.2); scene.add(lR);
  // far wall: crescent moon and stars framing the feature cabinet
  const zf = ROOM.z0 + 0.04, moon = [];
  for (let i = 0; i <= 24; i++) { const a = -2.2 + i / 24 * 4.4; moon.push([-1.75 + Math.cos(a) * 0.38, 2.35 + Math.sin(a) * 0.38, zf]); }
  for (let i = 24; i >= 0; i--) { const a = -1.55 + i / 24 * 3.1; moon.push([-1.62 + Math.cos(a) * 0.27, 2.35 + Math.sin(a) * 0.3, zf]); }
  neonTube(moon, 0xffd166);
  const star = (cx, cy, r) => { const p = []; for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + k / 10 * TAU, rr = k % 2 ? r * 0.42 : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, zf]); } return p; };
  const starTube = (pts, col) => { const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.0), 60, 0.01, 6, false); mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.6) }), staticRoot); };
  starTube(star(1.5, 2.55, 0.2), 0x33d6ff); starTube(star(2.1, 2.2, 0.12), 0xff3fa4); starTube(star(1.15, 2.05, 0.09), 0xffd166);
  mesh(new THREE.PlaneGeometry(1.6, 1.6), glowMat(0xffc860, 0.28), staticRoot, -1.7, 2.35, zf + 0.01);
  mesh(new THREE.PlaneGeometry(1.4, 1.2), glowMat(0x50c0ff, 0.2), staticRoot, 1.6, 2.35, zf + 0.01);
  // far wall mural board behind the cabinet: a framed painted panorama
  const pano = cnv(1024, 256), pg = pano.getContext('2d');
  const pgr = pg.createLinearGradient(0, 0, 0, 256); pgr.addColorStop(0, '#05081c'); pgr.addColorStop(1, '#123e6a'); pg.fillStyle = pgr; pg.fillRect(0, 0, 1024, 256);
  starfield(pg, 1024, 180, 160, 77);
  pg.strokeStyle = 'rgba(120,210,255,0.45)'; pg.lineWidth = 3; for (let k = 0; k < 6; k++) { pg.beginPath(); for (let x = 0; x <= 1024; x += 12) pg.lineTo(x, 190 + k * 11 + Math.sin(x * 0.04 + k) * 4); pg.stroke(); }
  for (let k = 0; k < 5; k++) { pg.fillStyle = 'rgba(255,240,190,0.08)'; pg.beginPath(); pg.moveTo(512, 120); pg.lineTo(0, 40 + k * 30); pg.lineTo(0, 55 + k * 30); pg.fill(); pg.beginPath(); pg.moveTo(512, 120); pg.lineTo(1024, 40 + k * 30); pg.lineTo(1024, 55 + k * 30); pg.fill(); }
  const pt = tex(pano, { aniso: 8 });
  mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.7 }), staticRoot, 0.2, 1.62, ROOM.z0 + 0.02);
  box(4.7, 0.04, 0.04, M.gold, staticRoot, 0.2, 2.21, ROOM.z0 + 0.03); box(4.7, 0.04, 0.04, M.gold, staticRoot, 0.2, 1.03, ROOM.z0 + 0.03);
  // ceiling fill lights (warm, dim)
  const c1 = new THREE.PointLight(0xffd6b0, 4.5, 9, 1.5); c1.position.set(0, 2.85, -2.6); scene.add(c1);
  const c2 = new THREE.PointLight(0xffd6b0, 2.6, 9, 1.5); c2.position.set(0, 2.85, -6.4); scene.add(c2);
  // feature downlight: a warm pool on the far cabinet so it reads from the door
  const fs = new THREE.SpotLight(0xffe2c0, 30, 9, 0.42, 0.55, 1.5); fs.position.set(0, 2.96, -7.3);
  fs.target.position.set(0, 0.9, -9.1); scene.add(fs, fs.target);
  box(0.16, 0.05, 0.16, M.alu, staticRoot, 0, 2.975, -7.3);
  mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.75).multiplyScalar(2) }), staticRoot, 0, 2.948, -7.3, Math.PI / 2);
}

function buildCounter() {
  const cx0 = 4.62, cx1 = 5.22, cz0 = -4.6, cz1 = -1.9, ch = 1.0;
  const g = staticRoot, cz = (cz0 + cz1) / 2, len = cz1 - cz0;
  // body with laminate front
  box(cx1 - cx0 - 0.04, ch - 0.1, len, M.black, g, (cx0 + cx1) / 2 + 0.02, (ch - 0.1) / 2 + 0.1, cz);
  const lg = new THREE.PlaneGeometry(len, ch - 0.14); scaleUV(lg, len / 0.9, (ch - 0.14) / 0.9);
  mesh(lg, M.laminate, g, cx0 + 0.001, (ch - 0.14) / 2 + 0.1, cz, 0, -Math.PI / 2, 0);
  box(0.02, 0.1, len, M.base, g, cx0 + 0.04, 0.05, cz); // recessed toe kick
  box(0.012, 0.04, len, M.alu, g, cx0 - 0.004, 0.97 - 0.02, cz);
  // countertop with bullnose and a worn front edge
  const topG = new THREE.BoxGeometry(cx1 - cx0 + 0.1, 0.04, len + 0.08); scaleUV(topG, 1.5, 1.5);
  box(cx1 - cx0 + 0.1, 0.04, len + 0.08, M.countertop, g, (cx0 + cx1) / 2 - 0.03, ch + 0.02, cz).geometry = topG;
  cyl(0.02, 0.02, len + 0.08, 16, M.countertop, g, cx0 - 0.08, ch + 0.02, cz, Math.PI / 2);
  const worn = new THREE.MeshStandardMaterial({ color: 0xece4d6, roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  mesh(new THREE.PlaneGeometry(0.12, 1.2), worn, g, cx0 - 0.02, ch + 0.0405, -3.2, -Math.PI / 2);
  box(0.012, 0.045, len + 0.08, M.alu, g, cx0 - 0.1, ch + 0.02, cz);
  // glass prize case on the counter
  const caseX = 4.95, caseZ = -4.15;
  box(0.5, 0.03, 0.62, M.alu, g, caseX, ch + 0.055, caseZ);
  box(0.5, 0.03, 0.62, M.alu, g, caseX, ch + 0.44, caseZ);
  for (const [dx, dz] of [[-0.24, -0.3], [0.24, -0.3], [-0.24, 0.3], [0.24, 0.3]]) box(0.02, 0.38, 0.02, M.alu, g, caseX + dx, ch + 0.25, caseZ + dz);
  const caseGlass = M.glass;
  mesh(new THREE.PlaneGeometry(0.62, 0.36), caseGlass, g, caseX - 0.25, ch + 0.25, caseZ, 0, -Math.PI / 2, 0);
  mesh(new THREE.PlaneGeometry(0.5, 0.36), caseGlass, g, caseX, ch + 0.25, caseZ + 0.31);
  mesh(new THREE.PlaneGeometry(0.5, 0.36), caseGlass, g, caseX, ch + 0.25, caseZ - 0.31, 0, Math.PI, 0);
  const r = rng(404);
  const toyCols = ['pink', 'yellow', 'teal', 'purple', 'orange', 'green', 'blue', 'red'];
  for (let i = 0; i < 9; i++) {
    const tx = caseX - 0.15 + (i % 3) * 0.15, tz = caseZ - 0.2 + Math.floor(i / 3) * 0.2;
    if (i % 3 === 1) mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 20), M.plastic[toyCols[i % 8]], g, tx, ch + 0.1, tz, -Math.PI / 2);
    else if (i % 2) mesh(new THREE.SphereGeometry(0.035, 14, 10), M.plastic[toyCols[i % 8]], g, tx, ch + 0.105, tz);
    else box(0.07, 0.09, 0.05, M.plastic[toyCols[(i + 3) % 8]], g, tx, ch + 0.115, tz, 0, r());
  }
  box(0.44, 0.01, 0.02, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(1.5) }), g, caseX, ch + 0.42, caseZ - 0.27);
  // token dispenser
  const td = new THREE.Group(); td.position.set(4.95, ch + 0.04, -2.35); g.add(td);
  box(0.3, 0.42, 0.3, M.steel, td, 0, 0.21, 0);
  box(0.22, 0.1, 0.004, new THREE.MeshStandardMaterial({ map: labelTexture(['TOKENS', '4 FOR $1'], '#ffd23f', '#1a0630', 256, 128, 40), roughness: 0.4 }), td, 0, 0.32, 0.152).rotation.y = 0;
  td.rotation.y = -Math.PI / 2;
  box(0.18, 0.05, 0.1, M.chrome, td, 0, 0.06, 0.17);
  box(0.06, 0.08, 0.004, emissiveMat(coinInsertTexture('$1', '#20a040'), 1.6), td, 0, 0.2, 0.152);
  // tokens cup and loose tokens
  const tokenMat = new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 1.0, roughness: 0.3 });
  cyl(0.045, 0.04, 0.09, 20, new THREE.MeshStandardMaterial({ color: 0x2060c0, roughness: 0.3 }), g, 4.8, ch + 0.085, -2.85);
  for (let i = 0; i < 12; i++) cyl(0.012, 0.012, 0.003, 14, tokenMat, g, 4.8 + (r() - 0.5) * 0.05, ch + 0.13 + i * 0.002, -2.85 + (r() - 0.5) * 0.05, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
  for (let i = 0; i < 7; i++) cyl(0.012, 0.012, 0.003, 14, tokenMat, g, 4.72 + r() * 0.12, ch + 0.0415 + i * 0.0031 * (i < 4 ? 1 : 0), -3.05 + (i < 4 ? 0 : r() * 0.1));
  // register
  const rg = new THREE.Group(); rg.position.set(5.0, ch + 0.04, -3.45); rg.rotation.y = -Math.PI / 2; g.add(rg);
  box(0.36, 0.1, 0.32, new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5 }), rg, 0, 0.05, 0);
  box(0.34, 0.08, 0.2, new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6 }), rg, 0, 0.13, -0.02, -0.4);
  for (let i = 0; i < 12; i++) box(0.035, 0.012, 0.03, M.plastic[i % 4 === 3 ? 'red' : 'white'], rg, -0.09 + (i % 4) * 0.055, 0.17 + Math.floor(i / 4) * 0.018, 0.04 - Math.floor(i / 4) * 0.045, -0.4);
  box(0.16, 0.06, 0.03, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.0, 0.5).multiplyScalar(0.9) }), rg, 0, 0.23, -0.12, -0.3);
  // bell
  cyl(0.04, 0.045, 0.012, 20, M.darkMetal, g, 4.78, ch + 0.046, -3.85);
  mesh(new THREE.SphereGeometry(0.035, 20, 10, 0, TAU, 0, Math.PI / 2), M.chrome, g, 4.78, ch + 0.052, -3.85);
  // price sign tent
  const ps = labelTexture(['PRIZES', '10 TIX · STICKER', '50 TIX · BOUNCY', '200 TIX · PLUSH', '500 TIX · BIG ONE'], '#fff6e0', '#3a1a5c', 256, 256, 24);
  const tent = new THREE.MeshStandardMaterial({ map: ps, roughness: 0.7 });
  box(0.004, 0.16, 0.16, tent, g, 4.74, ch + 0.12, -3.62, 0, 0, -0.25);
  // shelves of prizes on the back wall
  const shelfX = ALC.x1 - 0.17;
  for (const y of [1.15, 1.55, 1.95]) {
    box(0.32, 0.025, 2.6, M.wood, g, shelfX, y, -3.2);
    for (let k = 0; k < 9; k++) {
      const z = -4.35 + k * 0.29 + (r() - 0.5) * 0.05, t = Math.floor(r() * 4), col = M.plastic[toyCols[Math.floor(r() * 8)]];
      if (t === 0) { // plush blob with ears
        mesh(new THREE.SphereGeometry(0.075, 14, 10), col, g, shelfX - 0.02, y + 0.085, z).scale.set(1, 0.95, 1);
        mesh(new THREE.SphereGeometry(0.055, 12, 8), col, g, shelfX - 0.03, y + 0.19, z);
        for (const e of [-1, 1]) mesh(new THREE.SphereGeometry(0.02, 8, 6), col, g, shelfX - 0.03, y + 0.235, z + e * 0.035);
        for (const e of [-1, 1]) mesh(new THREE.SphereGeometry(0.008, 6, 4), M.plastic.black, g, shelfX - 0.08, y + 0.2, z + e * 0.02);
      } else if (t === 1) box(0.12, 0.16 + r() * 0.1, 0.1, col, g, shelfX, y + 0.1, z, 0, (r() - 0.5) * 0.3);
      else if (t === 2) { cyl(0.05, 0.05, 0.14, 16, M.glass, g, shelfX, y + 0.08, z); for (let b = 0; b < 5; b++) mesh(new THREE.SphereGeometry(0.018, 8, 6), M.plastic[toyCols[b]], g, shelfX + (r() - 0.5) * 0.04, y + 0.03 + b * 0.022, z + (r() - 0.5) * 0.04); }
      else { mesh(new THREE.SphereGeometry(0.04, 12, 8), M.plastic.yellow, g, shelfX - 0.02, y + 0.05, z); mesh(new THREE.SphereGeometry(0.025, 10, 8), M.plastic.yellow, g, shelfX - 0.04, y + 0.1, z); mesh(new THREE.ConeGeometry(0.012, 0.025, 8), M.plastic.orange, g, shelfX - 0.07, y + 0.1, z, 0, 0, Math.PI / 2); }
    }
  }
  for (const z of [-4.5, -1.9]) box(0.3, 0.9, 0.02, M.wood, g, shelfX, 1.55, z);
  // prize neon + TOKENS neon on the header
  const tk = neonTexture('TOKENS', '#ffd23f', 1024, 256, false, 170);
  mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: tk, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2, 2, 2) }), g, ROOM.x1 - 0.02, 2.78, -3.2, 0, -Math.PI / 2, 0);
  mesh(new THREE.PlaneGeometry(2.4, 0.7), glowMat(0xffb020, 0.22), g, ROOM.x1 - 0.025, 2.78, -3.2, 0, -Math.PI / 2, 0);
  const pz = neonTexture('Prizes!', '#ff5fd0', 1024, 256, false, 170, 'bold');
  mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: pz, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8) }), g, ALC.x1 - 0.02, 2.28, -3.2, 0, -Math.PI / 2, 0);
  // pendant lamps
  for (const z of [-3.9, -2.5]) {
    cyl(0.003, 0.003, 0.5, 4, M.matte, g, 4.95, ALC.h - 0.25, z);
    mesh(new THREE.ConeGeometry(0.13, 0.14, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc23a2a, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }), g, 4.95, ALC.h - 0.55, z);
    mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5).multiplyScalar(3) }), g, 4.95, ALC.h - 0.6, z);
  }
  const pl = new THREE.PointLight(0xffb070, 8.5, 5.5, 1.7); pl.position.set(4.95, ALC.h - 0.7, -3.2); scene.add(pl);
  // staff stool behind the counter and a customer stool at the end
  stool(5.75, -2.9, 0.62); stool(4.25, -1.95, 0.72);
  // change machine
  const ch2 = new THREE.Group(); ch2.position.set(4.12, 0, ALC.z0 + 0.2); g.add(ch2);
  box(0.46, 1.35, 0.36, new THREE.MeshStandardMaterial({ color: 0x1f3a6a, roughness: 0.4, metalness: 0.3 }), ch2, 0, 0.675, 0);
  box(0.4, 0.3, 0.004, emissiveMat(labelTexture(['CHANGE', '$1 · $5 · $10', 'BILLS → TOKENS'], '#ffe14d', '#1a0630', 256, 192, 30), 1.2), ch2, 0, 1.1, 0.181);
  box(0.12, 0.05, 0.03, M.chrome, ch2, 0, 0.82, 0.19);
  box(0.09, 0.008, 0.004, new THREE.MeshBasicMaterial({ color: 0x40ff80 }), ch2, 0, 0.85, 0.206);
  box(0.24, 0.1, 0.12, M.steel, ch2, 0, 0.4, 0.22);
  box(0.2, 0.02, 0.1, M.matte, ch2, 0, 0.36, 0.23);
  blobShadow(ch2, 0.7, 0.6, 0.05);
  addCollider(3.85, ALC.z0, 4.4, ALC.z0 + 0.45);
  addCollider(cx0 - 0.1, ALC.z0, ALC.x1, ALC.z1);
  blobShadow(staticRoot, 0.9, len + 0.3, cz).position.x = (cx0 + cx1) / 2;
}
function stool(x, z, h) {
  const g = staticRoot;
  cyl(0.2, 0.22, 0.03, 24, M.steel, g, x, 0.015, z);
  cyl(0.022, 0.022, h - 0.07, 12, M.chrome, g, x, h / 2, z);
  mesh(new THREE.TorusGeometry(0.16, 0.01, 8, 28), M.chrome, g, x, h * 0.4, z, Math.PI / 2);
  cyl(0.18, 0.17, 0.07, 28, new THREE.MeshStandardMaterial({ color: 0xb01828, roughness: 0.35 }), g, x, h, z);
  mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshStandardMaterial({ color: 0xd04050, roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false }), g, x, h + 0.036, z, -Math.PI / 2);
  mesh(new THREE.TorusGeometry(0.18, 0.008, 6, 32), M.chrome, g, x, h - 0.035, z, Math.PI / 2);
  blobShadow(g, 0.6, 0.6, z).position.x = x;
  addCollider(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
}

function buildProps() {
  const g = staticRoot, r = rng(55);
  // posters
  const poster = (kind, x, y, z, ry, w = 0.6) => {
    const t = posterTexture(kind);
    mesh(new THREE.PlaneGeometry(w, w * 1.4), new THREE.MeshStandardMaterial({ map: t, roughness: 0.65 }), g, x, y, z, 0, ry, 0);
    const nx = Math.sin(ry) * 0.012, nz = Math.cos(ry) * 0.012;
    box(w + 0.04, 0.02, 0.02, M.alu, g, x - nx * 0, y + w * 0.7 + 0.01, z, 0, ry, 0);
    box(w + 0.04, 0.02, 0.02, M.alu, g, x, y - w * 0.7 - 0.01, z, 0, ry, 0);
  };
  poster('rules', -3.585, 1.75, -1.7, Math.PI / 2);
  poster('night', -3.585, 1.75, -2.75, Math.PI / 2);
  poster('fame', -3.585, 1.75, -9.4, Math.PI / 2, 0.7);
  poster('light', 3.585, 1.75, -9.4, -Math.PI / 2, 0.7);
  poster('fame', -2.4, 1.7, -0.015, Math.PI, 0.6);
  // soda machine (fictional brand) on the left wall
  const sm = new THREE.Group(); sm.position.set(-3.6 + 0.42, 0, -7.4); sm.rotation.y = Math.PI / 2; g.add(sm);
  const sc = cnv(512, 1024), sg = sc.getContext('2d');
  const sgr = sg.createLinearGradient(0, 0, 0, 1024); sgr.addColorStop(0, '#ff4f6a'); sgr.addColorStop(1, '#a01030'); sg.fillStyle = sgr; sg.fillRect(0, 0, 512, 1024);
  sg.save(); sg.translate(256, 420); sg.rotate(-0.25); logoText(sg, 'FIZZ', 0, -80, 150, '#ffffff', '#ffe0e0', '#5a0010'); logoText(sg, 'POP!', 0, 80, 150, '#ffe14d', '#ffb000', '#5a0010'); sg.restore();
  for (let i = 0; i < 30; i++) { sg.strokeStyle = 'rgba(255,255,255,0.5)'; sg.lineWidth = 3; sg.beginPath(); sg.arc(r() * 512, 650 + r() * 300, 4 + r() * 12, 0, TAU); sg.stroke(); }
  const smt = tex(sc, { aniso: 4 });
  box(0.82, 1.82, 0.78, new THREE.MeshStandardMaterial({ color: 0xc01830, roughness: 0.35 }), sm, 0, 0.92, 0);
  box(0.56, 1.5, 0.01, emissiveMat(smt, 0.9), sm, -0.08, 1.0, 0.395);
  const btns = labelTexture(['COLA', 'LEMON', 'GRAPE', 'ORANGE', 'ROOT BEER', 'WATER'], '#1a1a1a', '#ffffff', 128, 512, 26);
  box(0.12, 0.7, 0.012, emissiveMat(btns, 0.7), sm, 0.31, 1.3, 0.396);
  box(0.08, 0.12, 0.02, M.chrome, sm, 0.31, 0.85, 0.4);
  box(0.5, 0.16, 0.05, M.matte, sm, -0.08, 0.16, 0.39);
  mesh(new THREE.PlaneGeometry(1.2, 1.4), glowMat(0xff4060, 0.12), sm, -0.08, 1.0, 0.42);
  blobShadow(sm, 1.1, 1.0, 0.0);
  addCollider(-3.6, -7.4 - 0.45, -3.6 + 0.85, -7.4 + 0.45);
  // trash can with a liner, bench, plant, fire extinguisher
  cyl(0.19, 0.17, 0.62, 24, new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.6, metalness: 0.4, map: TX.brushedDark }), g, -3.3, 0.31, -8.4);
  mesh(new THREE.TorusGeometry(0.19, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }), g, -3.3, 0.62, -8.4, Math.PI / 2);
  blobShadow(g, 0.6, 0.6, -8.4).position.x = -3.3;
  addCollider(-3.6, -8.65, -3.08, -8.15);
  // Art geometry stays inside the existing prop collision footprints.
  buildLoungeProps({THREE, root:g, M, mesh, box, cyl, blobShadow, cachedGeometry});
  addCollider(-3.25, -0.55, -1.85, 0);
  addCollider(-3.6, -1.15, -3.1, -0.75);
  // fire extinguisher
  cyl(0.075, 0.075, 0.45, 18, new THREE.MeshStandardMaterial({ color: 0xc81010, roughness: 0.3 }), g, 3.48, 0.75, -0.8);
  cyl(0.03, 0.04, 0.08, 10, M.matte, g, 3.48, 1.02, -0.8);
  box(0.02, 0.3, 0.15, M.steel, g, 3.59, 0.85, -0.8);
  // exit door on the far wall
  const ex = -2.75, zf = ROOM.z0 + 0.01;
  for(const sx of [-.475,.475])box(.05,2.2,.06,M.alu,g,ex+sx,1.1,zf);
  box(1,.05,.06,M.alu,g,ex,2.175,zf);
  const exitPanel=doorPanel('home-exit');
  box(0.9, 2.1, 0.05, new THREE.MeshStandardMaterial({ color: 0x3a3c48, roughness: 0.5, metalness: 0.4 }), exitPanel, ex, 1.05, zf + 0.02);
  box(0.75, 0.05, 0.05, M.chrome, exitPanel, ex, 1.0, zf + 0.08);
  for (const sx of [-0.36, 0.36]) box(0.05, 0.08, 0.06, M.darkMetal, exitPanel, ex + sx, 1.0, zf + 0.06);
  box(0.8, 0.18, 0.004, new THREE.MeshStandardMaterial({ color: 0x808088, roughness: 0.5, metalness: 0.6 }), exitPanel, ex, 0.15, zf + 0.047);
  const exitT = labelTexture(['EXIT'], '#0b3a18', '#7dff9a', 256, 96, 64);
  box(0.36, 0.14, 0.06, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }), g, ex, 2.4, zf + 0.03);
  mesh(new THREE.PlaneGeometry(0.32, 0.11), new THREE.MeshBasicMaterial({ map: exitT, color: new THREE.Color(1.6, 1.6, 1.6) }), g, ex, 2.4, zf + 0.062);
  mesh(new THREE.PlaneGeometry(0.9, 0.5), glowMat(0x40ff70, 0.16), g, ex, 2.4, zf + 0.07);
  // wall clock above the entrance
  const clk = cnv(256, 256), kg = clk.getContext('2d');
  kg.fillStyle = '#f4ecd8'; kg.beginPath(); kg.arc(128, 128, 124, 0, TAU); kg.fill();
  kg.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; kg.fillRect(128 + Math.cos(a) * 100 - 3, 128 + Math.sin(a) * 100 - 3, 6, 6); }
  kg.strokeStyle = '#222'; kg.lineWidth = 8; kg.beginPath(); kg.moveTo(128, 128); kg.lineTo(128 + Math.cos(-1.2) * 60, 128 + Math.sin(-1.2) * 60); kg.stroke();
  kg.lineWidth = 5; kg.beginPath(); kg.moveTo(128, 128); kg.lineTo(128 + Math.cos(0.9) * 90, 128 + Math.sin(0.9) * 90); kg.stroke();
  kg.fillStyle = '#e2384d'; kg.font = `bold 20px ${FONT}`; kg.textAlign = 'center'; kg.fillText('STARLITE', 128, 90);
  mesh(new THREE.CircleGeometry(0.17, 32), new THREE.MeshStandardMaterial({ map: tex(clk), roughness: 0.4 }), g, 0, 2.55, -0.04, 0, Math.PI, 0);
  mesh(new THREE.TorusGeometry(0.17, 0.015, 8, 32), M.chrome, g, 0, 2.55, -0.04);
  // power cord protector from the feature cabinet to the far wall
  box(0.09, 0.012, 0.95, M.rubber, g, 0.32, 0.006, -10.52);
  box(0.06, 0.08, 0.03, new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 }), g, 0.32, 0.3, ROOM.z0 + 0.015);
  const cord = new THREE.CatmullRomCurve3([new THREE.Vector3(0.32, 0.25, -10.06), new THREE.Vector3(0.32, 0.03, -10.04), new THREE.Vector3(0.32, 0.016, -10.2)]);
  mesh(new THREE.TubeGeometry(cord, 12, 0.008, 6), M.rubber, g);
  const cord2 = new THREE.CatmullRomCurve3([new THREE.Vector3(0.32, 0.016, -10.95), new THREE.Vector3(0.32, 0.1, -10.985), new THREE.Vector3(0.32, 0.29, -10.98)]);
  mesh(new THREE.TubeGeometry(cord2, 12, 0.008, 6), M.rubber, g);
}

function buildEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 12), new THREE.MeshBasicMaterial({ color: 0x07060c, side: THREE.BackSide }));
  env.add(room);
  const strip = (color, k, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) })); m.position.set(x, y, z); env.add(m); };
  strip(0xff3fa4, 3, 0.05, 0.05, 10, -3.9, 1.2, 0);
  strip(0x33d6ff, 3, 0.05, 0.05, 10, 3.9, 1.2, 0);
  strip(0xffe0c0, 1.6, 0.8, 0.02, 0.4, -1.2, 1.55, -2); strip(0xffe0c0, 1.6, 0.8, 0.02, 0.4, 1.2, 1.55, 2);
  strip(0xffc860, 2.0, 1.2, 0.5, 0.05, 0, 0.6, -5.9);
  strip(0x6fb8ff, 1.5, 1.6, 0.8, 0.05, 2.0, 0.2, 5.9);
  strip(0xff8a3a, 1.2, 0.05, 0.6, 0.6, -3.9, 0.3, 3);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.03);
  pm.dispose();
  env.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  environmentTarget = rt;
  return rt.texture;
}


let feature, cabinets = [], screenLights = [];
function build() {
  initMaterials();
  scene.environment = buildEnvironment();
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0x9098d0, 0x302038, 0.9));
  buildRoom();
  // Bank A (left wall, facing +x): Volt-Tek classics
  const a1 = buildVoltTek('crater', 0.0, ['yellow', 'orange', 'red'], 'red');
  const a2 = buildVoltTek('nomads', 5.3, ['pink', 'purple', 'teal'], 'black');
  [[a1, CABINET_LAYOUT.left[0]], [a2, CABINET_LAYOUT.left[1]]].forEach(([c, z]) => { c.position.set(ROOM.x0 + 0.03 + c.userData.D / 2, 0, z); c.rotation.y = Math.PI / 2; staticRoot.add(c); cabinets.push(c); });
  // Bank B (right wall, facing -x): Wavecrest curves
  const b1 = buildWavecrest('tide', 2.1, ['teal', 'pink', 'yellow', 'white'], ['teal', 'pink', 'yellow', 'white']);
  const b2 = buildWavecrest('kite', 8.7, ['red', 'yellow', 'orange', 'white'], ['blue', 'white', 'teal', 'purple']);
  [[b1, CABINET_LAYOUT.right[0]], [b2, CABINET_LAYOUT.right[1]]].forEach(([c, z]) => { c.position.set(ROOM.x1 - 0.03 - c.userData.D / 2, 0, z); c.rotation.y = -Math.PI / 2; staticRoot.add(c); cabinets.push(c); });
  // feature cabinet at the far end, on axis with the entrance
  feature = buildLighthouse(3.7);
  feature.position.set(0, 0, CABINET_LAYOUT.feature); staticRoot.add(feature);
  GAMES.nomads.title = titles[4]; GAMES.nomads.short = shortTitle(titles[4]);
  const extra = buildVoltTek('nomads', 11.2, ['pink', 'purple', 'teal'], 'black');
  GAMES.nomads.title = titles[1]; GAMES.nomads.short = shortTitle(titles[1]);
  extra.position.set(ROOM.x0 + 0.03 + extra.userData.D / 2, 0, CABINET_LAYOUT.left[2]); extra.rotation.y = Math.PI / 2; staticRoot.add(extra);
  // Current catalog indices stay stable independently of scene order.
  const slots = [cabinets[0], cabinets[1], cabinets[2], cabinets[3], extra, feature];
  slots.forEach((object, gameIndex) => addGameAnchor(object, gameIndex));
  cabinets.push(extra);
  addExitAnchor('home-entrance', 0, -0.02, 1.72);
  addExitAnchor('home-exit', -2.75, -10.88, 1.0);
  // colliders for cabinets
  for (const c of cabinets) addLocalCollider(c, -c.userData.W / 2 - 0.01, -c.userData.D / 2, c.userData.W / 2 + 0.01, c.userData.D / 2 + c.userData.cpOver + 0.02);
  const [dw, dz0, dz1] = feature.userData.dais;
  addLocalCollider(feature, -dw / 2, dz0, dw / 2, dz1);
  for (const c of [...cabinets, feature]) if (c.userData.light) screenLights.push([c.userData.light, c.userData.light.intensity, screenLights.length * 2.1]);
  // one shared screen-glow light per bank (keeps the per-pixel light count low)
  for (const [col, x, z] of [[0xe07ab8, ROOM.x0 + 1.25, CABINET_LAYOUT.left[1]], [0x7ad8d0, ROOM.x1 - 1.3, (CABINET_LAYOUT.right[0] + CABINET_LAYOUT.right[1]) / 2]]) {
    const l = new THREE.PointLight(col, 3.2, 3.6, 2); l.position.set(x, 1.3, z); scene.add(l);
    screenLights.push([l, l.intensity, Math.random() * 10]);
  }
  // keep the animated parts out of the merge
  feature.userData.keep = false;
  reuseStaticMaterials(staticRoot);
  const calls = mergeStatic(staticRoot);
  return calls;
}


const _bc = new THREE.Color(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function animate(t, dt) {
  uTime.value = t;
  const fu = feature.userData;
  fu.beams.rotation.y = t * 0.75;
  // lantern halo brightens when a beam swings toward the viewer
  fu.halo.getWorldPosition(_v1); _v2.copy(camera.position).sub(_v1).setY(0).normalize();
  const bx = Math.cos(fu.beams.rotation.y), bz = -Math.sin(fu.beams.rotation.y);
  const facing = Math.abs(bx * _v2.x + bz * _v2.z);
  fu.halo.material.opacity = 0.25 + 0.6 * Math.pow(facing, 8);
  fu.halo.quaternion.copy(camera.quaternion);
  // chase lights
  const n = fu.nBulbs;
  for (let i = 0; i < n; i++) {
    const ph = ((i - t * 7) % 4 + 4) % 4;
    const on = ph < 1.2 ? 1 : 0.18;
    _bc.setRGB(2.6 * on + 0.1, 1.9 * on + 0.05, 0.8 * on);
    fu.bulbs.setColorAt(i, _bc);
  }
  fu.bulbs.instanceColor.needsUpdate = true;
  M.beamDome.emissiveIntensity = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.6));
  for (const [l, base, ph] of screenLights) l.intensity = base * (0.92 + 0.08 * Math.sin(t * 0.9 + ph));
}

try {
const calls = build();
return {scene, camera, colliders, anchors, targetMeshes, exits, animate, textures:allTextures, calls, dispose};
} catch(error) { dispose(); throw error; }
}
