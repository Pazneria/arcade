// Geometry kit: builds flat vertex arrays (no GPU or DOM use, so Node tests can run it too).
// Vertex layout: position(3) normal(3) colour(3) material(1).

export const M = { PLASTER: 0, CONCRETE: 1, GRAVEL: 2, TILE: 3, METAL: 4, WOOD: 5, INTERIOR: 6, LEAF: 7, BRICK: 8, STONE: 9, BARK: 10 };

export class Mesh {
  constructor() { this.v = []; }
  get triangles() { return this.v.length / 30; }
  vert(p, n, c, m) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], m); }
  tri(a, b, c, n, col, m) { this.vert(a, n, col, m); this.vert(b, n, col, m); this.vert(c, n, col, m); }
  quad(a, b, c, d, n, col, m) { this.tri(a, b, c, n, col, m); this.tri(a, c, d, n, col, m); }
  /** Quad with its normal derived from the winding. */
  face(a, b, c, d, col, m) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    this.quad(a, b, c, d, [nx / l, ny / l, nz / l], col, m);
  }
}

export const signedArea = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
/** Rings wind so that the outward normal of edge a->b is (dz, -dx). */
export const orient = (r) => (signedArea(r) > 0 ? r.slice() : r.slice().reverse());
export const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };

export function inRing(px, pz, pts) {
  let k = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) k = !k;
  }
  return k;
}

/** Sutherland-Hodgman clip keeping the side where dot(p - o, n) >= 0. */
export function clipHalf(ring, ox, oz, nx, nz) {
  const out = [], side = (p) => (p[0] - ox) * nx + (p[1] - oz) * nz;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export function earclip(ringIn) {
  const ring = orient(ringIn), idx = ring.map((_, i) => i), tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 4000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = ring[ia], b = ring[ib], c = ring[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const q of idx) {
        if (q === ia || q === ib || q === ic) continue;
        const p = ring[q];
        if (cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9) { ok = false; break; }
      }
      if (ok) { tris.push([a, b, c]); idx.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) idx.splice(0, 1); // degenerate sliver: drop it rather than hang
  }
  if (idx.length === 3) tris.push(idx.map((i) => ring[i]));
  return tris;
}

export function polyCap(mb, ring, y, col, mat, up = 1) {
  for (const [a, b, c] of earclip(ring)) mb.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [0, up, 0], col, mat);
}

/** Oriented box. (dx,dz) is the unit long axis, hl/hw are half sizes. */
export function obb(mb, x, z, dx, dz, hl, hw, y0, y1, col, mat, bottom = false) {
  const nx = dz, nz = -dx;
  const c = (s, t) => [x + dx * s + nx * t, z + dz * s + nz * t];
  const p = [c(-hl, -hw), c(hl, -hw), c(hl, hw), c(-hl, hw)];
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], e = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(e[0], e[1]) || 1;
    mb.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [-e[1] / l, 0, e[0] / l], col, mat);
  }
  mb.quad([p[0][0], y1, p[0][1]], [p[1][0], y1, p[1][1]], [p[2][0], y1, p[2][1]], [p[3][0], y1, p[3][1]], [0, 1, 0], col, mat);
  if (bottom) mb.quad([p[0][0], y0, p[0][1]], [p[1][0], y0, p[1][1]], [p[2][0], y0, p[2][1]], [p[3][0], y0, p[3][1]], [0, -1, 0], col, mat);
}
export const obbRing = (x, z, dx, dz, hl, hw) => {
  const nx = dz, nz = -dx, c = (s, t) => [x + dx * s + nx * t, z + dz * s + nz * t];
  return [c(-hl, -hw), c(hl, -hw), c(hl, hw), c(-hl, hw)];
};

/** Square-section member between two 3D points. */
export function beam(mb, a, b, w, col, mat) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1;
  const t = [d[0] / l, d[1] / l, d[2] / l];
  const r = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = [t[1] * r[2] - t[2] * r[1], t[2] * r[0] - t[0] * r[2], t[0] * r[1] - t[1] * r[0]], ul = Math.hypot(...u);
  u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const h = w / 2, off = (p, s, q) => [p[0] + u[0] * s + v[0] * q, p[1] + u[1] * s + v[1] * q, p[2] + u[2] * s + v[2] * q];
  const c = [[h, h], [-h, h], [-h, -h], [h, -h]];
  for (let i = 0; i < 4; i++) {
    const [s0, q0] = c[i], [s1, q1] = c[(i + 1) % 4], mx = (s0 + s1) / 2 / h, my = (q0 + q1) / 2 / h;
    const n = [u[0] * mx + v[0] * my, u[1] * mx + v[1] * my, u[2] * mx + v[2] * my];
    mb.quad(off(a, s0, q0), off(a, s1, q1), off(b, s1, q1), off(b, s0, q0), n, col, mat);
  }
}

/** Revolves profile [[radius, y], ...] around a vertical axis. */
export function lathe(mb, x, z, profile, seg, col, mat, smooth = true, phase = 0) {
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy) || 1, ny = -dr / l, nr = dy / l;
    for (let k = 0; k < seg; k++) {
      const a0 = phase + k / seg * Math.PI * 2, a1 = phase + (k + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const am = (a0 + a1) / 2, nf = [Math.cos(am) * nr, ny, Math.sin(am) * nr];
      const n0 = smooth ? [c0 * nr, ny, s0 * nr] : nf, n1 = smooth ? [c1 * nr, ny, s1 * nr] : nf;
      const p00 = [x + c0 * r0, y0, z + s0 * r0], p10 = [x + c1 * r0, y0, z + s1 * r0], p11 = [x + c1 * r1, y1, z + s1 * r1], p01 = [x + c0 * r1, y1, z + s0 * r1];
      mb.vert(p00, n0, col, mat); mb.vert(p10, n1, col, mat); mb.vert(p11, n1, col, mat);
      mb.vert(p00, n0, col, mat); mb.vert(p11, n1, col, mat); mb.vert(p01, n0, col, mat);
    }
  }
}

/** Lumpy foliage mass: subdivided octahedron with seeded displacement and radial normals. */
export function blob(mb, cx, cy, cz, R, sy, col, seed) {
  const verts = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, -1, 0]];
  let tris = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]].map((t) => t.map((i) => verts[i]));
  const nrm = (p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; };
  for (let k = 0; k < 2; k++) {
    const next = [];
    for (const [a, b, c] of tris) {
      const ab = nrm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]), bc = nrm([b[0] + c[0], b[1] + c[1], b[2] + c[2]]), ca = nrm([c[0] + a[0], c[1] + a[1], c[2] + a[2]]);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    tris = next;
  }
  const bump = (d) => 1 + .22 * Math.sin(d[0] * 3.1 + seed) * Math.cos(d[2] * 2.7 + seed * 1.7) + .12 * Math.sin(d[1] * 5.3 + seed * .6);
  const P = (d) => { const r = R * bump(d); return [cx + d[0] * r, cy + d[1] * r * sy, cz + d[2] * r]; };
  for (const [a, b, c] of tris) { mb.vert(P(a), a, col, M.LEAF); mb.vert(P(b), b, col, M.LEAF); mb.vert(P(c), c, col, M.LEAF); }
}

/** Hipped roof over a rectangle given as four corners in order, with the a-b side the long side. */
export function hipRoof(mb, a, b, c, d, eave, ridge, over, col, mat) {
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const lx = b[0] - a[0], lz = b[1] - a[1], L = Math.hypot(lx, lz), wx = d[0] - a[0], wz = d[1] - a[1], Wd = Math.hypot(wx, wz);
  const ux = lx / L, uz = lz / L, vx = wx / Wd, vz = wz / Wd;
  const e = [
    [a[0] - ux * over - vx * over, a[1] - uz * over - vz * over], [b[0] + ux * over - vx * over, b[1] + uz * over - vz * over],
    [c[0] + ux * over + vx * over, c[1] + uz * over + vz * over], [d[0] - ux * over + vx * over, d[1] - uz * over + vz * over],
  ].map((p) => [p[0], eave, p[1]]);
  const inset = Math.min(Wd / 2, L / 2), m0 = mid(a, d), m1 = mid(b, c);
  const r0 = [m0[0] + ux * inset, ridge, m0[1] + uz * inset], r1 = [m1[0] - ux * inset, ridge, m1[1] - uz * inset];
  const up = (n) => (n[1] < 0 ? [-n[0], -n[1], -n[2]] : n);
  const planeTri = (p, q, s) => {
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    mb.tri(p, q, s, up([n[0] / l, n[1] / l, n[2] / l]), col, mat);
  };
  planeTri(e[0], e[1], r1); planeTri(e[0], r1, r0);
  planeTri(e[2], e[3], r0); planeTri(e[2], r0, r1);
  planeTri(e[1], e[2], r1); planeTri(e[3], e[0], r0);
  mb.quad(e[0], e[1], e[2], e[3], [0, -1, 0], [col[0] * .55, col[1] * .55, col[2] * .55], M.WOOD); // eave soffit
}

/** Frame along one wall edge. +o is outward, s runs a->b, y is world height. */
export class WallFrame {
  constructor(a, b) {
    this.a = a; const dx = b[0] - a[0], dz = b[1] - a[1];
    this.L = Math.hypot(dx, dz); this.dx = dx / this.L; this.dz = dz / this.L; this.nx = this.dz; this.nz = -this.dx;
  }
  at(s, y, o = 0) { return [this.a[0] + this.dx * s + this.nx * o, y, this.a[1] + this.dz * s + this.nz * o]; }
  /** Local axis-aligned box (s, y, outward offset). */
  box(mb, s0, s1, y0, y1, o0, o1, col, mat) {
    const { dx, dz, nx, nz } = this, P = (s, y, o) => this.at(s, y, o), N = [nx, 0, nz], S = [dx, 0, dz];
    mb.quad(P(s0, y0, o1), P(s1, y0, o1), P(s1, y1, o1), P(s0, y1, o1), N, col, mat);
    mb.quad(P(s0, y0, o0), P(s0, y0, o1), P(s0, y1, o1), P(s0, y1, o0), [-dx, 0, -dz], col, mat);
    mb.quad(P(s1, y0, o0), P(s1, y0, o1), P(s1, y1, o1), P(s1, y1, o0), S, col, mat);
    mb.quad(P(s0, y1, o0), P(s1, y1, o0), P(s1, y1, o1), P(s0, y1, o1), [0, 1, 0], col, mat);
    mb.quad(P(s0, y0, o0), P(s1, y0, o0), P(s1, y0, o1), P(s0, y0, o1), [0, -1, 0], col, mat);
  }
}

const FRAME = [.2, .22, .22], GRILLE = [.13, .14, .15];

/** Wall with true rectangular holes; each hole gets reveals, frame, glazing and a closed room box. */
export function facade(mb, glass, a, b, y0, y1, openings, col, mat) {
  const f = new WallFrame(a, b), L = f.L;
  const list = openings.filter((o) => o.s0 > 0.05 && o.s1 < L - 0.05 && o.y0 >= y0 && o.y1 <= y1);
  const xs = [...new Set([0, L, ...list.flatMap((o) => [o.s0, o.s1])])].sort((p, q) => p - q);
  const ys = [...new Set([y0, y1, ...list.flatMap((o) => [o.y0, o.y1])])].sort((p, q) => p - q);
  const n = [f.nx, 0, f.nz];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const cs = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (list.some((o) => cs > o.s0 && cs < o.s1 && cy > o.y0 && cy < o.y1)) continue;
    mb.quad(f.at(xs[i], ys[j]), f.at(xs[i + 1], ys[j]), f.at(xs[i + 1], ys[j + 1]), f.at(xs[i], ys[j + 1]), n, col, mat);
  }
  for (const o of list) opening(mb, glass, f, o, col, mat);
  return f;
}

function opening(mb, glass, f, o, col, mat) {
  const R = o.reveal ?? .3, { s0, s1, y0, y1 } = o;
  const dark = [col[0] * .72, col[1] * .72, col[2] * .72], P = (s, y, q) => f.at(s, y, q);
  const n = [f.nx, 0, f.nz], S = [f.dx, 0, f.dz];
  mb.quad(P(s0, y0, 0), P(s1, y0, 0), P(s1, y0, -R), P(s0, y0, -R), [0, 1, 0], [col[0] * .9, col[1] * .9, col[2] * .9], mat);
  mb.quad(P(s0, y1, 0), P(s1, y1, 0), P(s1, y1, -R), P(s0, y1, -R), [0, -1, 0], dark, mat);
  mb.quad(P(s0, y0, 0), P(s0, y1, 0), P(s0, y1, -R), P(s0, y0, -R), S, dark, mat);
  mb.quad(P(s1, y0, 0), P(s1, y1, 0), P(s1, y1, -R), P(s1, y0, -R), [-f.dx, 0, -f.dz], dark, mat);
  if (o.door) {
    const w = (s1 - s0) / 2, c = o.doorColor ?? [.28, .27, .25];
    mb.quad(P(s0, y0, -R), P(s1, y0, -R), P(s1, y1, -R), P(s0, y1, -R), n, c, M.METAL);
    for (const q of [s0 + w * .12, s0 + w * 1.12]) for (const [a, b] of [[.08, .46], [.54, .92]]) {
      const h = y1 - y0;
      f.box(mb, q, q + w * .76, y0 + h * a, y0 + h * b, -R, -R + .05, [c[0] * 1.2, c[1] * 1.2, c[2] * 1.2], M.METAL);
    }
    f.box(mb, s0 + w - .03, s0 + w + .03, y0, y1, -R, -R + .07, GRILLE, M.METAL);
    return;
  }
  // Closed room volume behind the glass, so openings never reveal an unbuilt shell.
  // The room stays inside the wall span so it never pokes through a neighbouring corner.
  const D = o.room ?? 2.4, B = R + .02, bk = B + D, Wa = Math.min(.9, Math.max(0, s0 - .4)), Wb = Math.min(.9, Math.max(0, f.L - s1 - .4));
  const ra = s0 - Wa, rb = s1 + Wb, yb = y0 - .5, yt = y1 + .4;
  const wall = o.roomColor ?? [.2, .2, .19], ceil = [wall[0] * .7, wall[1] * .7, wall[2] * .7], floor = [.1, .1, .1];
  mb.quad(P(ra, yb, -bk), P(rb, yb, -bk), P(rb, yt, -bk), P(ra, yt, -bk), n, wall, M.INTERIOR);
  mb.quad(P(ra, yb, -B), P(ra, yt, -B), P(ra, yt, -bk), P(ra, yb, -bk), S, wall, M.INTERIOR);
  mb.quad(P(rb, yb, -B), P(rb, yt, -B), P(rb, yt, -bk), P(rb, yb, -bk), [-f.dx, 0, -f.dz], wall, M.INTERIOR);
  mb.quad(P(ra, yb, -B), P(rb, yb, -B), P(rb, yb, -bk), P(ra, yb, -bk), [0, 1, 0], floor, M.INTERIOR);
  mb.quad(P(ra, yt, -B), P(rb, yt, -B), P(rb, yt, -bk), P(ra, yt, -bk), [0, -1, 0], ceil, M.INTERIOR);
  mb.quad(P(ra, y1, -B), P(rb, y1, -B), P(rb, yt, -B), P(ra, yt, -B), [-f.nx, 0, -f.nz], ceil, M.INTERIOR);
  mb.quad(P(ra, yb, -B), P(rb, yb, -B), P(rb, y0, -B), P(ra, y0, -B), [-f.nx, 0, -f.nz], ceil, M.INTERIOR);
  mb.quad(P(ra, y0, -B), P(s0, y0, -B), P(s0, y1, -B), P(ra, y1, -B), [-f.nx, 0, -f.nz], ceil, M.INTERIOR);
  mb.quad(P(s1, y0, -B), P(rb, y0, -B), P(rb, y1, -B), P(s1, y1, -B), [-f.nx, 0, -f.nz], ceil, M.INTERIOR);
  // Frame, muntins and glazing.
  const cols = o.cols ?? 3, rows = o.rows ?? 4, fw = .06, fc = o.frame ?? FRAME, bar = o.bar ?? .035, o0 = -R, o1 = -R + .05;
  f.box(mb, s0, s1, y0, y0 + fw, o0, o1, fc, M.METAL); f.box(mb, s0, s1, y1 - fw, y1, o0, o1, fc, M.METAL);
  f.box(mb, s0, s0 + fw, y0, y1, o0, o1, fc, M.METAL); f.box(mb, s1 - fw, s1, y0, y1, o0, o1, fc, M.METAL);
  for (let i = 1; i < cols; i++) { const s = s0 + (s1 - s0) * i / cols; f.box(mb, s - bar / 2, s + bar / 2, y0, y1, o0, o1, fc, M.METAL); }
  for (let i = 1; i < rows; i++) { const y = y0 + (y1 - y0) * i / rows; f.box(mb, s0, s1, y - bar / 2, y + bar / 2, o0, o1, fc, M.METAL); }
  if (o.grille) { // outer security bars proud of the frame
    const gc = Math.max(3, Math.round((s1 - s0) / .3));
    for (let i = 1; i < gc; i++) { const s = s0 + (s1 - s0) * i / gc; f.box(mb, s - .02, s + .02, y0, y1, -R + .07, -R + .11, GRILLE, M.METAL); }
    for (const t of [.33, .66]) { const y = y0 + (y1 - y0) * t; f.box(mb, s0, s1, y - .025, y + .025, -R + .07, -R + .11, GRILLE, M.METAL); }
  }
  glass.quad(P(s0, y0, -R + .01), P(s1, y0, -R + .01), P(s1, y1, -R + .01), P(s0, y1, -R + .01), n, o.tint ?? [.42, .52, .56], 0);
}
