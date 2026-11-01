// Builds all static architecture. Footprints and absolute roof heights come from data/*.json;
// surface details are interpreted from the reference atlas and are not surveyed.
import { M, Mesh, WallFrame, orient, inRing, clipHalf, polyCap, obb, obbRing, beam, lathe, blob, hipRoof, facade, centroid } from './geom.js';

const CREAM = [.80, .76, .64], CREAM_DK = [.70, .66, .55], CONCRETE = [.60, .58, .53], STONE = [.53, .49, .42];
const STEEL = [.70, .71, .68], RUST = [.50, .36, .28], TILE = [.44, .24, .18], DARK = [.15, .15, .15];
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

export function buildWorld({ terrain: T, footprints: F, trees }) {
  const mb = new Mesh(), glass = new Mesh(), solids = [];
  const solid = (ring, y0, y1, tag) => solids.push({ ring, y0, y1, tag });
  const minG = (ring) => { let m = Infinity; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; for (let t = 0; t <= 1; t += .1) m = Math.min(m, T.height(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); } return m; };
  const maxG = (ring) => { let m = -Infinity; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; for (let t = 0; t <= 1; t += .1) m = Math.max(m, T.height(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); } return m; };
  const box = (x, z, dx, dz, hl, hw, y0, y1, col, mat, tag) => { obb(mb, x, z, dx, dz, hl, hw, y0, y1, col, mat); if (tag) solid(obbRing(x, z, dx, dz, hl, hw), y0, y1, tag); };

  /** Masonry block: windowed walls, cornices, pilasters, flat roof with parapet, matching collider. */
  function block(ringIn, o) {
    const ring = orient(ringIn), base = minG(ring) - 1.5, top = o.parapet ?? o.roof, wallCol = o.col ?? CREAM, mat = o.mat ?? M.PLASTER;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.2 || o.skip?.(a, b)) continue;
      const f = new WallFrame(a, b), ops = [], extra = o.edgeOpenings?.(a, b, f) ?? [], bay = o.bay ?? 4;
      const n = Math.max(1, Math.floor(L / bay)), sp = L / n;
      for (let k = 0; k < n && L > 3.2; k++) {
        const c = sp * (k + .5);
        for (const r of o.rows ?? []) {
          const g = T.height(...f.at(c, 0, 1).filter((_, q) => q !== 1));
          const pair = r.pair && sp > r.w * 2 + .9, widths = pair ? [c - r.w / 2 - .22, c + r.w / 2 + .22] : [c];
          for (const q of widths) {
            const op = { s0: q - r.w / 2, s1: q + r.w / 2, y0: r.sill, y1: r.sill + r.h, cols: r.cols, rows: r.rows, grille: r.grille, frame: o.frame, room: o.room };
            if (g > r.sill - .3 || extra.some((e) => op.s1 > e.s0 - .4 && op.s0 < e.s1 + .4 && op.y1 > e.y0 - .3 && op.y0 < e.y1 + .3)) continue;
            ops.push(op);
          }
        }
      }
      ops.push(...extra);
      facade(mb, glass, a, b, base, top, ops, wallCol, mat);
      if (o.pilaster && L > 6) for (let k = 0; k <= n; k++) f.box(mb, sp * k - .3, sp * k + .3, base, o.pilasterTop ?? o.roof - .5, 0, .16, wallCol, mat);
      for (const c of o.cornices ?? []) f.box(mb, -.1, L + .1, c.y, c.y + (c.h ?? .3), 0, c.o ?? .22, c.col ?? wallCol, mat);
      if (o.plinth) f.box(mb, -.05, L + .05, base, o.plinth, 0, .1, CREAM_DK, mat);
      if (o.parapet) {
        f.box(mb, -.1, L + .1, top - .14, top, -.42, .1, o.coping ?? wallCol, M.CONCRETE);
        mb.quad(f.at(0, o.roof, -.4), f.at(L, o.roof, -.4), f.at(L, top, -.4), f.at(0, top, -.4), [-f.nx, 0, -f.nz], wallCol, mat);
        if (o.stepParapet) for (let k = 0; k < n; k += 2) f.box(mb, sp * k + .4, sp * (k + 1) - .4, top, top + .24, -.3, .08, wallCol, mat);
        solid(obbRing((a[0] + b[0]) / 2 - f.nx * .2, (a[1] + b[1]) / 2 - f.nz * .2, f.dx, f.dz, L / 2, .22), o.roof, top, 'parapet');
      }
    }
    polyCap(mb, ring, o.roof, o.roofCol ?? [.44, .43, .40], o.roofMat ?? M.GRAVEL);
    solid(ring, base, o.roof, o.tag ?? 'building');
    return ring;
  }

  /** Plain raised prism (roof terraces, slabs). */
  function prism(ringIn, y0, y1, col, mat, tag) {
    const ring = orient(ringIn);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], f = new WallFrame(a, b);
      if (f.L > .01) mb.quad(f.at(0, y0), f.at(f.L, y0), f.at(f.L, y1), f.at(0, y1), [f.nx, 0, f.nz], col, mat);
    }
    polyCap(mb, ring, y1, col, mat);
    if (tag) solid(ring, y0, y1, tag);
  }

  /** Thin wall along a polyline with its top following a height function. */
  function wallLine(pts, topOf, o = {}) {
    const th = o.th ?? .5, col = o.col ?? CONCRETE, mat = o.mat ?? M.CONCRETE;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / (o.seg ?? 6)));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, l = L / n, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, top = topOf(mx, mz);
        box(mx, mz, dx, dz, l / 2 + .02, th / 2, (o.bottom ?? Math.min(T.height(mx, mz), T.height(p[0], p[1]))) - 3, top, col, mat, 'wall');
        if (o.cap) obb(mb, mx, mz, dx, dz, l / 2 + .04, th / 2 + .1, top, top + .12, col, M.CONCRETE);
        if (o.posts) for (let t = 0; t < l; t += o.posts) {
          const px = p[0] + dx * t, pz = p[1] + dz * t;
          box(px, pz, dx, dz, .05, .05, top, top + (o.postH ?? 2.6), [.3, .3, .3], M.METAL);
        }
        if (o.rails) for (const h of o.rails) beam(mb, [p[0], top + h, p[1]], [q[0], top + h, q[1]], .05, [.3, .3, .3], M.METAL);
      }
    }
  }

  // ---- Cellhouse complex (footprint 16050272) -----------------------------------------------
  const U = [.715, -.699], V = [-.699, -.715]; // NE and NW axes of the complex, from the polygon edges
  const fullRing = orient(F['16050272'].ring);
  const cut = [-2.5, -74];
  const onCut = (a, b) => [a, b].every((p) => Math.abs((p[0] - cut[0]) * V[0] + (p[1] - cut[1]) * V[1]) < .15);
  const mainRing = clipHalf(fullRing, cut[0], cut[1], -V[0], -V[1]), diningRing = clipHalf(fullRing, cut[0], cut[1], V[0], V[1]);
  const doorPoint = [56.4, -20.1];
  let spawn = null, terraceTop = 0;
  const onEntryEdge = (a, b) => Math.hypot((a[0] + b[0]) / 2 - 59.08, (a[1] + b[1]) / 2 + 22.64) < 3;
  { // Terrace height is set from measured ground at the front wall, then the door floor follows it.
    const e = [[46.3, -10.3], [71.9, -35]];
    terraceTop = maxG(e) + .55;
  }
  const mainRows = [
    { sill: 38.8, h: 2.0, w: 1.9, cols: 3, rows: 3, grille: true },
    { sill: terraceTop + .7, h: 2.3, w: 2.5, cols: 4, rows: 4, grille: true },
    { sill: 46.9, h: 2.9, w: 2.5, cols: 4, rows: 6, grille: true },
  ];
  block(mainRing, {
    tag: 'cellhouse', roof: 51.2, parapet: 52.3, rows: mainRows, bay: 3.9, pilaster: true, pilasterTop: 50.2, stepParapet: true, plinth: terraceTop + .15,
    cornices: [{ y: 50.2, h: .35, o: .3 }, { y: 45.8, h: .18, o: .1 }], skip: onCut,
    edgeOpenings: (a, b, f) => {
      if (!onEntryEdge(a, b)) return [];
      const s = (doorPoint[0] - a[0]) * f.dx + (doorPoint[1] - a[1]) * f.dz;
      return [{ s0: s - 1.3, s1: s + 1.3, y0: terraceTop, y1: terraceTop + 3.1, door: true, doorColor: [.22, .27, .24] }];
    },
  });
  block(diningRing, {
    tag: 'dining-wing', roof: 50.6, parapet: 51.7, bay: 3.9, pilaster: true, pilasterTop: 49.8, stepParapet: true,
    rows: [{ sill: 38.9, h: 1.9, w: 1.9, cols: 3, rows: 3, grille: true }, { sill: 42.4, h: 2.6, w: 2.2, cols: 3, rows: 5, grille: true, pair: false }, { sill: 46.2, h: 2.6, w: 2.2, cols: 3, rows: 5, grille: true }],
    cornices: [{ y: 49.8, h: .32, o: .3 }, { y: 41.6, h: .24, o: .14 }], skip: onCut,
  });

  // Raised centre of the roof over the cell blocks, read from the 52 m core of the maximum surface.
  const inset = 15.5; // half width of the raised core around the skylight rows
  let core = clipHalf(mainRing, 22 + U[0] * inset, -55 + U[1] * inset, -U[0], -U[1]);
  core = clipHalf(core, 22 - U[0] * inset, -55 - U[1] * inset, U[0], U[1]);
  core = clipHalf(core, 60 + V[0] * 22, -14 + V[1] * 22, V[0], V[1]);
  core = clipHalf(core, -2 + V[0] * 2, -74 + V[1] * 2, -V[0], -V[1]);
  prism(core, 51.0, 52.0, [.46, .45, .42], M.GRAVEL, 'roof-core');

  // Long low gabled skylights. Lines follow the ridges in the 2 m surface; spacing is not surveyed.
  const skylight = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, nx = dz, nz = -dx, hw = 1.7, y0 = 52.05, y1 = 53.15;
    const P = (s, t, y) => [a[0] + dx * s + nx * t, y, a[1] + dz * s + nz * t];
    const gl = [.56, .64, .67], segs = Math.floor(L / 9);
    for (let i = 0; i < segs; i++) {
      const s0 = i * (L / segs) + .6, s1 = (i + 1) * (L / segs) - .6;
      mb.face(P(s0, hw, y0), P(s1, hw, y0), P(s1, 0, y1), P(s0, 0, y1), gl, M.METAL);
      mb.face(P(s1, -hw, y0), P(s0, -hw, y0), P(s0, 0, y1), P(s1, 0, y1), gl, M.METAL);
      for (const [s, sign] of [[s0, -1], [s1, 1]]) mb.tri(P(s, hw, y0), P(s, -hw, y0), P(s, 0, y1), [dx * sign, 0, dz * sign], CREAM_DK, M.PLASTER);
      for (let s = s0; s <= s1; s += 1.2) { beam(mb, P(s, hw, y0), P(s, 0, y1 + .02), .06, [.28, .3, .3], M.METAL); beam(mb, P(s, -hw, y0), P(s, 0, y1 + .02), .06, [.28, .3, .3], M.METAL); }
      solid([P(s0, hw, 0), P(s1, hw, 0), P(s1, -hw, 0), P(s0, -hw, 0)].map((p) => [p[0], p[2]]), 52, y1 - .25, 'skylight');
    }
  };
  skylight([3.75, -70.6], [44, -28.5]);
  skylight([20, -68], [58, -30]);
  skylight([-3.7, -62], [24, -33]);
  for (const [x, z] of [[14, -44], [30, -58], [36, -40], [6, -60], [24, -47]]) { // roof ventilators
    lathe(mb, x, z, [[.55, 52], [.55, 52.9], [.8, 52.9], [.8, 53.3], [0, 53.5]], 10, [.34, .34, .33], M.METAL);
    solid(obbRing(x, z, 1, 0, .6, .6), 52, 53.3, 'vent');
  }
  // Raised SE parapet band and tall penthouse seen as local maxima of the maximum surface.
  box(47, -30.5, U[0], U[1], 3.4, 1.8, 51.2, 55.9, CREAM_DK, M.PLASTER, 'penthouse');
  box(55, -39, V[0], V[1], 5, 1.1, 51.2, 53.7, CREAM_DK, M.PLASTER, 'roof-house');

  // Entrance terrace, stairs, balustrade, lamps. Interpreted from HABS photo 1.
  {
    const ring = orient(mainRing);
    let E = null;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; if (onEntryEdge(p, q)) E = [p, q]; }
    const f = new WallFrame(E[0], E[1]), s = (doorPoint[0] - E[0][0]) * f.dx + (doorPoint[1] - E[0][1]) * f.dz;
    const midP = (o) => { const p = f.at(s, 0, o); return [p[0], p[2]]; };
    const depth = 5.4, half = 8.5, c = midP(depth / 2);
    box(c[0], c[1], f.dx, f.dz, half, depth / 2, T.height(...c) - 4, terraceTop, CONCRETE, M.CONCRETE, 'terrace');
    const stairW = 3.1, front = T.height(...midP(depth + 3)), rise = .165;
    const nSteps = Math.max(2, Math.ceil((terraceTop - front) / rise));
    for (let i = 0; i < nSteps; i++) {
      const o = depth + .34 * (i + .5), p = midP(o), top = terraceTop - rise * (i + 1);
      box(p[0], p[1], f.dx, f.dz, stairW, .17, top - 3, top, [.66, .64, .59], M.CONCRETE, 'stairs');
    }
    // Balustrade along the terrace front with a gap for the stairs, plus side walls.
    const railTop = terraceTop + .95;
    const rail = (s0, s1, o0, o1) => {
      const a0 = f.at(s0, 0, o0), a1 = f.at(s1, 0, o1), pa = [a0[0], a0[2]], pb = [a1[0], a1[2]];
      const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); if (L < .1) return;
      const dx = (pb[0] - pa[0]) / L, dz = (pb[1] - pa[1]) / L, mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
      box(mx, mz, dx, dz, L / 2, .13, terraceTop, terraceTop + .16, CREAM_DK, M.CONCRETE);
      box(mx, mz, dx, dz, L / 2 + .05, .17, railTop - .12, railTop, CREAM_DK, M.CONCRETE);
      for (let t = .25; t < L; t += .55) { const px = pa[0] + dx * t, pz = pa[1] + dz * t; obb(mb, px, pz, dx, dz, .07, .07, terraceTop + .16, railTop - .12, CREAM_DK, M.CONCRETE); }
      solid(obbRing(mx, mz, dx, dz, L / 2, .18), terraceTop, railTop, 'balustrade');
    };
    const fo = depth - .15;
    rail(s - half + .1, s - stairW - .2, fo, fo); rail(s + stairW + .2, s + half - .1, fo, fo);
    rail(s - half + .1, s - half + .1, 0.1, fo); rail(s + half - .1, s + half - .1, 0.1, fo);
    for (const side of [-1, 1]) { // stair lamp piers
      const p = midP(depth), cs = [p[0] + f.dx * side * (stairW + .3), p[1] + f.dz * side * (stairW + .3)];
      box(cs[0], cs[1], f.dx, f.dz, .3, .3, terraceTop - 1, terraceTop + 1.2, CREAM, M.PLASTER, 'lamp');
      lathe(mb, cs[0], cs[1], [[.16, terraceTop + 1.2], [.1, terraceTop + 3.9], [.12, terraceTop + 4]], 10, [.82, .8, .72], M.PLASTER);
      lathe(mb, cs[0], cs[1], [[0, terraceTop + 3.95], [.27, terraceTop + 4.15], [.27, terraceTop + 4.4], [0, terraceTop + 4.62]], 12, [.93, .92, .84], M.PLASTER);
    }
    // Door surround: pilasters, lintel and the plaque/eagle mass above the door.
    const y = terraceTop;
    f.box(mb, s - 1.75, s - 1.3, y, y + 3.7, 0, .28, CREAM, M.PLASTER); f.box(mb, s + 1.3, s + 1.75, y, y + 3.7, 0, .28, CREAM, M.PLASTER);
    f.box(mb, s - 2, s + 2, y + 3.45, y + 3.85, 0, .4, CREAM, M.PLASTER);
    f.box(mb, s - .9, s + .9, y + 3.85, y + 4.65, 0, .3, [.62, .56, .42], M.PLASTER);
    // Grounded on the plaza at the foot of the entrance stairs, facing the door.
    const d = midP(depth + .34 * nSteps + 1.6), fn = [f.nx, f.nz];
    spawn = { x: d[0], z: d[1], y: T.height(d[0], d[1]) + .1, yaw: Math.atan2(fn[0], fn[1]), pitch: .17 };
  }

  // ---- Recreation yard, from the wall-top ring in the maximum surface ------------------------
  const YN = [-69.4, -144.4], YW = [-95.6, -127.5], YS = [-51.9, -65.6], YE = [-25.7, -82.5];
  const yardRing = [YN, YE, YS, YW];
  const yardFloor = 33.8;
  prism(yardRing, yardFloor - 3, yardFloor, [.52, .51, .48], M.CONCRETE, 'yard-floor');
  const wallTop = () => 38.6;
  const yardWall = { col: [.6, .58, .52], bottom: 28, cap: true, posts: 3.5, postH: 2.6, rails: [1.2, 2.5], th: .55, seg: 8 };
  wallLine([YN, YW, YS, [-34, -77]], wallTop, yardWall);
  // Court lines
  const line = (a, b, w = .12) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); obb(mb, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (b[0] - a[0]) / L, (b[1] - a[1]) / L, L / 2, w / 2, yardFloor, yardFloor + .012, [.8, .78, .72], M.CONCRETE); };
  { const u = [.577, .817], w = [-.84, .54], at = (s, t) => [YN[0] + u[0] * s + w[0] * t, YN[1] + u[1] * s + w[1] * t];
    for (const s of [16, 34, 52]) { line(at(s, 6), at(s + 12, 6)); line(at(s + 12, 6), at(s + 12, 20)); line(at(s + 12, 20), at(s, 20)); line(at(s, 20), at(s, 6)); }
    // Bleachers: real step solids descending into the yard along the cellhouse side.
    for (let i = 0; i < 11; i++) {
      const t = 1.6 + i * .78, p = at(30, t);
      const top = 38.05 - i * .42;
      box(p[0], p[1], u[0], u[1], 37 - i * .9, .4, yardFloor - 2, top, [.62, .6, .55], M.CONCRETE, 'bleacher');
    }
  }

  // ---- Retaining walls around the plateau, following the measured rim ------------------------
  // Tops run as even grades between the plateau heights at each rim point, so walls never stair-step.
  const smoothRim = (pts, lift) => {
    const ys = pts.map(([x, z]) => { let m = -Infinity; for (let a = -3; a <= 3; a += 1.5) for (let b = -3; b <= 3; b += 1.5) m = Math.max(m, T.height(x + a, z + b)); return m + lift; });
    return (x, z) => {
      let best = 0, bd = Infinity, bt = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (d < bd) { bd = d; best = i; bt = t; }
      }
      return ys[best] + (ys[best + 1] - ys[best]) * bt;
    };
  };
  const rimA = [[-16, -47], [-5, -36], [6, -26.5], [17, -16.5], [38, -6.5], [62, .5], [88, 4]], rimB = [[88, 4], [103, 2], [111.5, -7], [113.5, -22], [111, -33]];
  wallLine(rimA, smoothRim(rimA, .9), { col: STONE, mat: M.STONE, cap: true, th: .5, seg: 1.6 });
  wallLine(rimB, smoothRim(rimB, .9), { col: STONE, mat: M.STONE, cap: true, th: .55, seg: 1.6 });

  // ---- Warden's House: intact prison-era interpretation, not the post-1970 shell --------------
  {
    const c = [97.158, -21.376], e = [.719, -.695], s = [.695, .719], hl = 10, hw = 6, g0 = T.height(...c);
    const floor = Math.max(g0, T.height(c[0] - e[0] * hl, c[1] - e[1] * hl), T.height(c[0] + s[0] * hw, c[1] + s[1] * hw)) + .35, eave = floor + 7.6;
    const P = (a, b) => [c[0] + e[0] * a + s[0] * b, c[1] + e[1] * a + s[1] * b];
    const ring = [P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw)];
    const paired = { cols: 2, rows: 3, frame: [.62, .6, .54], room: 2.2, roomColor: [.3, .28, .25], tint: [.5, .58, .6] };
    block(ring, {
      tag: 'wardens-house', roof: eave, col: [.86, .83, .73], bay: 3.3, room: 2.2, frame: paired.frame,
      rows: [{ sill: floor + .85, h: 2.1, w: 1.25, cols: 2, rows: 3, pair: true }, { sill: floor + 4.4, h: 1.9, w: 1.2, cols: 2, rows: 3, pair: true }],
      cornices: [{ y: eave - .24, h: .26, o: .32, col: [.8, .76, .66] }, { y: floor + 3.8, h: .14, o: .08 }],
      edgeOpenings: (a, b, f) => (Math.hypot((a[0] + b[0]) / 2 - P(0, -hw)[0], (a[1] + b[1]) / 2 - P(0, -hw)[1]) < 1 ? [{ s0: f.L / 2 - .7, s1: f.L / 2 + .7, y0: floor, y1: floor + 2.5, door: true, doorColor: [.3, .22, .17] }] : []),
    });
    const r = ring.map((p) => p);
    hipRoof(mb, r[0], r[1], r[2], r[3], eave, eave + 2.5, .75, TILE, M.TILE);
    solid(obbRing(c[0], c[1], e[0], e[1], hl, hw), eave, eave + 1.9, 'wardens-roof');
    // Curved Mission Revival end parapets rising through the hip.
    for (const side of [-1, 1]) {
      const base = P(side * (hl + .05), 0), n = [e[0] * side, e[1] * side], t = s;
      const prof = []; for (let i = 0; i <= 28; i++) { const u = -1 + 2 * i / 28, a = Math.abs(u); const y = (a < .34 ? 3.7 : a < .62 ? 3.7 - (a - .34) / .28 * 1.0 + Math.sin((a - .34) / .28 * Math.PI) * .32 : 2.7 - (a - .62) / .38 * 2.1); prof.push([u * (hw - .2), Math.max(.6, y)]); }
      const col = [.87, .84, .74], P3 = (q, y, o) => [base[0] + t[0] * q + n[0] * o, eave - .7 + y, base[1] + t[1] * q + n[1] * o];
      for (let i = 0; i + 1 < prof.length; i++) {
        const [q0, y0] = prof[i], [q1, y1] = prof[i + 1];
        for (const o of [.18, -.22]) mb.quad(P3(q0, 0, o), P3(q1, 0, o), P3(q1, y1, o), P3(q0, y0, o), [n[0] * Math.sign(o), 0, n[1] * Math.sign(o)], col, M.PLASTER);
        mb.face(P3(q0, y0, .18), P3(q1, y1, .18), P3(q1, y1, -.22), P3(q0, y0, -.22), [.74, .71, .62], M.CONCRETE);
      }
      // arched vent in the parapet
      const v = P3(0, 2.6, .19), vd = [t[0], t[1]];
      lathe(mb, v[0], v[2], [[.01, v[1] - .01], [.01, v[1] + .01]], 4, DARK, M.INTERIOR);
      obb(mb, v[0] + n[0] * .01, v[2] + n[1] * .01, vd[0], vd[1], .34, .03, v[1] - .55, v[1] + .3, [.16, .15, .14], M.INTERIOR);
    }
    // Veranda on the seaward side: arcaded lower piers, balcony, rail.
    const vy = floor + 3.4, vd = 2.7;
    const edge = [P(-hl + .6, hw), P(hl - .6, hw)], vf = new WallFrame(edge[0], edge[1]);
    vf.box(mb, 0, vf.L, vy, vy + .28, 0, vd, [.82, .79, .7], M.CONCRETE);
    const piers = 7;
    for (let i = 0; i <= piers; i++) {
      const q = vf.L * i / piers;
      vf.box(mb, q - .3, q + .3, floor - 1.5, vy, vd - .55, vd, [.84, .8, .7], M.PLASTER);
      const p = vf.at(q, 0, vd - .28); solid(obbRing(p[0], p[2], vf.dx, vf.dz, .3, .28), floor - 2, vy, 'veranda');
      if (i < piers) { // arch spandrel between piers
        const m = q + vf.L / piers / 2, w = vf.L / piers / 2;
        for (let k = 0; k < 8; k++) { const a0 = Math.PI * k / 8, a1 = Math.PI * (k + 1) / 8, x0 = m - Math.cos(a0) * w, x1 = m - Math.cos(a1) * w; mb.quad(vf.at(x0, vy - .9 + Math.sin(a0) * .75, vd + .01), vf.at(x1, vy - .9 + Math.sin(a1) * .75, vd + .01), vf.at(x1, vy, vd + .01), vf.at(x0, vy, vd + .01), [vf.nx, 0, vf.nz], [.84, .8, .7], M.PLASTER); }
      }
    }
    vf.box(mb, -.1, vf.L + .1, vy + .28, vy + 1.1, vd - .22, vd, [.86, .83, .73], M.PLASTER);
    solid(obbRing(...[vf.at(vf.L / 2, 0, vd / 2)].map((p) => [p[0], p[2]])[0], vf.dx, vf.dz, vf.L / 2, vd / 2), vy, vy + .28, 'veranda-deck');
    const ch = P(-3.5, -1.5); box(ch[0], ch[1], e[0], e[1], .75, .55, eave, eave + 4.2, [.56, .35, .28], M.BRICK, 'chimney');
    box(ch[0], ch[1], e[0], e[1], .85, .65, eave + 4.2, eave + 4.45, [.7, .67, .6], M.CONCRETE);
  }

  // ---- Lighthouse: approximate USCG position, 1910 inventory proportions ---------------------
  {
    const x = 77.7924, z = -11.381, g = T.height(x, z), bh = 7.2, topY = g + 27.49, bw = 4.191 / 2 + .75;
    const dx = 1, dz = 0, col = [.82, .79, .7];
    box(x, z, dx, dz, bw, bw, g - 1, g + bh, [.78, .74, .64], M.PLASTER, 'lighthouse');
    box(x, z, dx, dz, bw + .12, bw + .12, g + bh - .3, g + bh, [.86, .83, .74], M.CONCRETE);
    box(x, z, dx, dz, bw + .08, bw + .08, g - 1, g + .9, STONE, M.STONE);
    const shaftTop = g + 21.8;
    lathe(mb, x, z, [[2.1, g + bh], [1.63, shaftTop]], 8, col, M.PLASTER, false, Math.PI / 8);
    lathe(mb, x, z, [[1.63, shaftTop], [2.05, shaftTop + .7], [2.05, shaftTop + .95], [0, shaftTop + .96]], 8, [.86, .83, .74], M.CONCRETE, false, Math.PI / 8);
    for (const y of [g + 11, g + 15.5, g + 20]) { // slit windows
      const r = 2.1 - (y - g - bh) / (21.8 - bh) * .47 + .02;
      obb(mb, x, z + r, 1, 0, .22, .04, y, y + 1.1, [.1, .12, .13], M.METAL); obb(mb, x + r, z, 0, 1, .22, .04, y - 2, y - .9, [.1, .12, .13], M.METAL);
    }
    const deck = shaftTop + .96;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, a2 = (i + 1) / 12 * Math.PI * 2, R = 2.05; beam(mb, [x + Math.cos(a) * R, deck, z + Math.sin(a) * R], [x + Math.cos(a) * R, deck + 1, z + Math.sin(a) * R], .05, DARK, M.METAL); beam(mb, [x + Math.cos(a) * R, deck + 1, z + Math.sin(a) * R], [x + Math.cos(a2) * R, deck + 1, z + Math.sin(a2) * R], .05, DARK, M.METAL); }
    lathe(mb, x, z, [[1.25, deck], [1.25, deck + .5]], 8, [.76, .73, .65], M.PLASTER, false, Math.PI / 8);
    lathe(mb, x, z, [[1.15, deck + .5], [1.15, deck + 2.15]], 8, [.32, .38, .4], M.METAL, false, Math.PI / 8);
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i / 8 * Math.PI * 2; beam(mb, [x + Math.cos(a) * 1.17, deck + .5, z + Math.sin(a) * 1.17], [x + Math.cos(a) * 1.17, deck + 2.15, z + Math.sin(a) * 1.17], .07, [.12, .13, .13], M.METAL); }
    lathe(mb, x, z, [[1.3, deck + 2.15], [.34, topY - .55], [.1, topY - .4]], 8, [.2, .22, .22], M.METAL, false, Math.PI / 8);
    lathe(mb, x, z, [[.0, topY - .4], [.19, topY - .2], [0, topY]], 8, [.3, .3, .28], M.METAL);
    const oct = []; for (let i = 0; i < 8; i++) oct.push([x + Math.cos(Math.PI / 8 + i * Math.PI / 4) * 2.1, z + Math.sin(Math.PI / 8 + i * Math.PI / 4) * 2.1]);
    solid(oct, g + bh, shaftTop, 'lighthouse-shaft');
  }

  // ---- Water tower 15944616: round tank on OPEN braced legs ----------------------------------
  {
    const ring = orient(F['15944616'].ring), c = centroid(ring), g = T.height(c[0], c[1]);
    const a0 = Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0]);
    const tankR = 5.7, base = g, deckY = 52.1, eave = 59.6, apex = 61.7, col = [.74, .74, .70];
    const legAt = (hw, y) => [0, 1, 2, 3].map((i) => { const a = a0 + Math.PI / 4 + i * Math.PI / 2, r = hw * Math.SQRT2; return [c[0] + Math.cos(a) * r, y, c[1] + Math.sin(a) * r]; });
    const hTop = 3.9, hBot = 6.1, leg = (t) => hBot + (hTop - hBot) * t;
    const tier = [0, .34, .67, 1], yAt = (t) => base + (deckY - base) * t;
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 3; k++) {
        const A = legAt(leg(tier[k]), yAt(tier[k]))[i], B = legAt(leg(tier[k + 1]), yAt(tier[k + 1]))[i];
        beam(mb, A, B, .36, col, M.METAL);
        const A2 = legAt(leg(tier[k]), yAt(tier[k]))[(i + 1) % 4], B2 = legAt(leg(tier[k + 1]), yAt(tier[k + 1]))[(i + 1) % 4];
        beam(mb, A, B2, .14, col, M.METAL); beam(mb, A2, B, .14, col, M.METAL);
        beam(mb, B, B2, .2, col, M.METAL);
      }
      const L = legAt(hBot, base)[i]; solid(obbRing(L[0], L[2], 1, 0, .34, .34), base - 2, deckY, 'tower-leg');
      box(L[0], L[2], Math.cos(a0), Math.sin(a0), .55, .55, base - 1, base + .5, CONCRETE, M.CONCRETE);
    }
    beam(mb, [c[0], base, c[1]], [c[0], deckY, c[1]], .55, [.68, .68, .64], M.METAL); // central riser
    solid(obbRing(c[0], c[1], 1, 0, .34, .34), base - 2, deckY, 'tower-leg');
    lathe(mb, c[0], c[1], [[0, deckY - 2.3], [2.4, deckY - 1.9], [4.3, deckY - 1], [5.3, deckY + .2], [tankR, deckY + 1.2], [tankR, eave], [tankR + .35, eave + .05], [.2, apex], [0, apex]], 24, [.78, .76, .70], M.METAL);
    lathe(mb, c[0], c[1], [[tankR + .32, eave + .06], [.2, apex + .02]], 24, RUST, M.METAL);
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, a2 = (i + 1) / 28 * Math.PI * 2, R = tankR + 1; beam(mb, [c[0] + Math.cos(a) * R, deckY, c[1] + Math.sin(a) * R], [c[0] + Math.cos(a) * R, deckY + 1.05, c[1] + Math.sin(a) * R], .05, col, M.METAL); beam(mb, [c[0] + Math.cos(a) * R, deckY + 1.05, c[1] + Math.sin(a) * R], [c[0] + Math.cos(a2) * R, deckY + 1.05, c[1] + Math.sin(a2) * R], .05, col, M.METAL); }
    lathe(mb, c[0], c[1], [[tankR - .4, deckY], [tankR + 1.05, deckY], [tankR + 1.05, deckY + .08], [tankR - .4, deckY + .08]], 28, [.5, .5, .47], M.METAL);
    const tankRing = []; for (let i = 0; i < 12; i++) tankRing.push([c[0] + Math.cos(i * Math.PI / 6) * tankR, c[1] + Math.sin(i * Math.PI / 6) * tankR]);
    solid(tankRing, deckY - 2.3, apex, 'water-tank');
  }

  // ---- Identified footprints -----------------------------------------------------------------
  // New Industries 9925847: long two-level block with large gridded window bands.
  block(F['9925847'].ring, {
    tag: 'new-industries', roof: 22.65, parapet: 23.05, col: [.68, .62, .48], mat: M.CONCRETE, coping: [.34, .46, .42], bay: 4.3, frame: [.26, .4, .36],
    rows: [{ sill: 15.2, h: 2.5, w: 3.5, cols: 7, rows: 4 }, { sill: 19.0, h: 2.7, w: 3.5, cols: 7, rows: 4 }], cornices: [{ y: 18.1, h: .35, o: .35 }],
  });
  // Model Industries 7811972: three-level L block, ribbon windows, rooftop lookout.
  const model = block(F['7811972'].ring, {
    tag: 'model-industries', roof: 26, parapet: 26.5, col: [.74, .71, .6], mat: M.CONCRETE, bay: 3.7, frame: [.22, .24, .24],
    rows: [{ sill: 12.5, h: 2.2, w: 3.2, cols: 6, rows: 3 }, { sill: 17, h: 2.2, w: 3.2, cols: 6, rows: 3 }, { sill: 21.5, h: 2.2, w: 3.2, cols: 6, rows: 3 }],
    cornices: [{ y: 16, h: .2, o: .08 }, { y: 20.5, h: .2, o: .08 }],
  });
  {
    const p = centroid(F['7811972'].ring), q = [p[0] + 13, p[1] + 8];
    const lc = inRing(q[0], q[1], model) ? q : p;
    box(lc[0], lc[1], .83, -.56, 1.6, 1.6, 26, 29, [.72, .69, .58], M.PLASTER, 'lookout');
    const r = obbRing(lc[0], lc[1], .83, -.56, 1.6, 1.6); hipRoof(mb, r[0], r[1], r[2], r[3], 29, 30, .45, RUST, M.METAL);
  }
  // Building 64 11508068: hill-backed block, four-level walls, hipped roof and gallery on braces.
  {
    const R = F['11508068'].ring, A = R[0], B = R[1], D = R[3], Er = R[4], Fp = R[5], G = R[6];
    const eave = 27.7, ridge = 30.15, col = [.74, .68, .55];
    block(R, {
      tag: 'building-64', roof: eave, col, mat: M.BRICK, bay: 3.2, plinth: 5,
      rows: [6, 10.8, 15.2, 19.6, 23.8].map((sill) => ({ sill, h: 2.1, w: 1.15, cols: 2, rows: 3 })), cornices: [{ y: eave - .25, h: .25, o: .25, col: [.66, .6, .49] }],
    });
    const t = ((A[0] - Fp[0]) * (Er[0] - Fp[0]) + (A[1] - Fp[1]) * (Er[1] - Fp[1])) / ((Er[0] - Fp[0]) ** 2 + (Er[1] - Fp[1]) ** 2);
    const Ep = [Fp[0] + (Er[0] - Fp[0]) * t, Fp[1] + (Er[1] - Fp[1]) * t];
    hipRoof(mb, Fp, Ep, A, G, eave, ridge, .7, [.3, .3, .31], M.GRAVEL);
    hipRoof(mb, Er, A, B, D, eave, ridge - .4, .7, [.3, .3, .31], M.GRAVEL);
    solid(F['11508068'].ring, eave, ridge - .25, 'building-64-roof');
    const f = new WallFrame(G, A), y = 10.2, d = 3.3, wood = [.72, .67, .56];
    f.box(mb, 0, f.L, y, y + .28, 0, d, wood, M.WOOD);
    for (let s = 0; s <= f.L; s += 3.6) {
      f.box(mb, s - .09, s + .09, y + .28, y + 3.6, d - .22, d - .04, wood, M.WOOD);
      beam(mb, f.at(s, y - 2.7, .05), f.at(s, y, d - .2), .17, wood, M.WOOD);
      f.box(mb, s - .05, s + .05, y + .28, y + 1.3, d - .12, d - .02, wood, M.WOOD);
    }
    f.box(mb, 0, f.L, y + 1.2, y + 1.3, d - .12, d - .02, wood, M.WOOD);
    f.box(mb, 0, f.L, y + 3.6, y + 3.8, 0, d + .1, [.62, .58, .48], M.WOOD);
    const m = f.at(f.L / 2, 0, d / 2); solid(obbRing(m[0], m[2], f.dx, f.dz, f.L / 2, d / 2), y, y + .28, 'gallery');
  }

  // ---- Unidentified footprints stay plain, unnamed and conservative ---------------------------
  const plain = (id, roof, col = [.62, .6, .54]) => block(F[id].ring, { tag: `unnamed-${id}`, roof, parapet: roof + .35, col, mat: M.CONCRETE, plinth: null });
  plain('11508067', F['11508067'].roof_p50);
  plain('13936755', F['13936755'].roof_p50, [.74, .71, .62]);
  plain('15310916', F['15310916'].roof_p50);
  plain('9608170', F['9608170'].roof_p50); // no interior samples: all-footprint median, edge-contaminated
  { // 8339963 holds two clear surface levels; split where the level changes, without naming it.
    const ring = orient(F['8339963'].ring);
    const low = clipHalf(ring, -112, 0, -1, 0), high = clipHalf(ring, -112, 0, 1, 0);
    const onSplit = (a, b) => Math.abs(a[0] + 112) < .05 && Math.abs(b[0] + 112) < .05;
    block(low, { tag: 'unnamed-8339963', roof: 23.9, parapet: 24.25, col: [.62, .6, .54], mat: M.CONCRETE, skip: onSplit });
    block(high, { tag: 'unnamed-8339963', roof: 30.9, parapet: 31.25, col: [.62, .6, .54], mat: M.CONCRETE, skip: () => false });
  }
  // 16579355 is intentionally absent: low relief, unidentified, not a building and not a collider.

  // Smokestack: not in any footprint, positioned from the tallest maximum-surface peak.
  {
    const x = -120, z = -237, g = T.height(x, z), top = 54.6, col = [.76, .72, .62];
    lathe(mb, x, z, [[2.5, g - 1], [2.2, g + 2], [1.15, top - .4], [1.3, top - .3], [1.3, top], [.9, top], [.9, top - 1]], 16, col, M.CONCRETE);
    const r = []; for (let i = 0; i < 10; i++) r.push([x + Math.cos(i * Math.PI / 5) * 2.3, z + Math.sin(i * Math.PI / 5) * 2.3]);
    solid(r, g - 2, top, 'smokestack');
  }

  // ---- Vegetation at maximum-surface peaks; species and shapes are interpretive ---------------
  const leafs = [[.17, .24, .12], [.21, .27, .13], [.14, .21, .13], [.25, .29, .15]];
  for (const [x, z, ht] of trees) {
    const g = T.height(x, z), h = Math.max(2.4, ht * .92), s = hash(x, z), s2 = hash(z, x), leaf = leafs[Math.floor(s * 4)];
    if (h > 6.5) {
      lathe(mb, x, z, [[.26 + h * .014, g - .4], [.13, g + h * .7]], 6, [.24, .19, .15], M.BARK);
      solid(obbRing(x, z, 1, 0, .3, .3), g - 1, g + h * .6, 'tree');
      const n = 7 + Math.floor(s2 * 4), spread = h * (.2 + s * .12); // wind-shaped crown, heavy to the lee side
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), a = i * 2.4 + s * 6, r = spread * (1.05 - t * .8) * (.6 + hash(i, s) * .6);
        const cy = g + h * (.46 + t * .46), R = h * (.17 - t * .05) + .5, cx = x + Math.cos(a) * r + h * .05, cz = z + Math.sin(a) * r - h * .03;
        const k = .82 + t * .5; blob(mb, cx, cy, cz, R, .78, [leaf[0] * k, leaf[1] * k, leaf[2] * k], s * 9 + i);
      }
    } else {
      const R = h * .55 + .35; // shrub masses sit into the slope rather than hovering over it
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + s * 6, cx = x + Math.cos(a) * R * .6, cz = z + Math.sin(a) * R * .6;
        blob(mb, cx, T.height(cx, cz) + R * .3, cz, R * (1 - i * .12), .72, leaf, s * 7 + i);
      }
    }
  }

  return { opaque: new Float32Array(mb.v), glass: new Float32Array(glass.v), solids, spawn, terraceTop };
}
