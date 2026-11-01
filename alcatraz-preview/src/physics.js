// Terrain sampling, static collision and the first-person controller. No DOM or GPU use.
import { inRing } from './geom.js';

export const TUNE = {
  walk: 3.0, run: 5.1, fly: 9, flyFast: 34, gravity: 13, jump: 5.2, eye: 1.68, height: 1.8, radius: 0.32,
  stepUp: 0.46, // stairs and kerbs are climbed without jumping
  maxRiseRatio: 2.4, // terrain only refuses near-vertical faces, no 35 degree cutoff
  boundary: 1500,
};

export class Terrain {
  constructor(meta, heights) { Object.assign(this, { w: meta.width, h: meta.height, x0: meta.x0, z0: meta.z0, plain: meta.plain }); this.data = heights; }
  /** Bilinear between pixel centres; beyond the gameplay grid the plain simply continues. */
  height(x, z) {
    const fx = x - this.x0, fz = z - this.z0;
    if (fx < 0 || fz < 0 || fx >= this.w - 1 || fz >= this.h - 1) return this.plain;
    const c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, d = this.data, w = this.w, i = r * w + c;
    return (d[i] * (1 - u) + d[i + 1] * u) * (1 - v) + (d[i + w] * (1 - u) + d[i + w + 1] * u) * v;
  }
}

const CELL = 10;
export class Collision {
  constructor(solids) {
    this.solids = solids; this.grid = new Map();
    for (const s of solids) {
      s.minx = Infinity; s.maxx = -Infinity; s.minz = Infinity; s.maxz = -Infinity;
      for (const [x, z] of s.ring) { s.minx = Math.min(s.minx, x); s.maxx = Math.max(s.maxx, x); s.minz = Math.min(s.minz, z); s.maxz = Math.max(s.maxz, z); }
      for (let a = Math.floor((s.minx - 1) / CELL); a <= Math.floor((s.maxx + 1) / CELL); a++) {
        for (let b = Math.floor((s.minz - 1) / CELL); b <= Math.floor((s.maxz + 1) / CELL); b++) {
          const k = a * 4096 + b; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(s);
        }
      }
    }
  }
  near(x, z) { return this.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) ?? []; }
  /** Highest walkable top under (x,z) that is reachable from feet height. */
  top(x, z, feet) {
    let best = -Infinity;
    for (const s of this.near(x, z)) {
      if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
      if (s.y1 <= feet + TUNE.stepUp && s.y1 > best && inRing(x, z, s.ring)) best = s.y1;
    }
    return best;
  }
  /** Moves a circle out of every solid that overlaps the body's vertical span. */
  push(pos, feet, head) {
    const R = TUNE.radius; let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.near(pos[0], pos[1])) {
        if (s.y1 <= feet + TUNE.stepUp || s.y0 >= head) continue;
        if (pos[0] < s.minx - R || pos[0] > s.maxx + R || pos[1] < s.minz - R || pos[1] > s.maxz + R) continue;
        const inside = inRing(pos[0], pos[1], s.ring);
        let best = Infinity, bx = 0, bz = 0;
        for (let i = 0; i < s.ring.length; i++) {
          const a = s.ring[i], b = s.ring[(i + 1) % s.ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((pos[0] - a[0]) * dx + (pos[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(pos[0] - qx, pos[1] - qz);
          if (d < best) { best = d; bx = qx; bz = qz; }
        }
        if (inside) {
          const l = best || 1; pos[0] = bx + (bx - pos[0]) / l * R; pos[1] = bz + (bz - pos[1]) / l * R; moved = hit = true;
        } else if (best < R) {
          const l = best || 1; pos[0] = bx + (pos[0] - bx) / l * R; pos[1] = bz + (pos[1] - bz) / l * R; moved = hit = true;
        }
      }
      if (!moved) break;
    }
    return hit;
  }
}

export class Player {
  constructor(world, spawn) {
    Object.assign(this, { world, spawn, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, grounded: true, fly: false });
    this.reset();
  }
  reset() {
    const s = this.spawn;
    this.x = s.x; this.z = s.z; this.yaw = s.yaw; this.pitch = s.pitch ?? 0; this.vx = this.vy = this.vz = 0; this.fly = false;
    this.y = this.groundUnder(s.x, s.z, s.y ?? 1e4); this.grounded = true;
  }
  groundUnder(x, z, feet) { return Math.max(this.world.terrain.height(x, z), this.world.collision.top(x, z, feet)); }
  toggleFly() {
    this.fly = !this.fly; this.vx = this.vy = this.vz = 0;
    if (!this.fly) this.grounded = false; // gravity carries the player to the surface below
  }
  /** input: {fwd, side, up, run, jump} with values in -1..1 */
  step(dt, input) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n; i++) this.sub(dt / n, input);
  }
  sub(dt, inp) {
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * inp.fwd + cos * inp.side, wz = -cos * inp.fwd - sin * inp.side;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    const { collision, terrain } = this.world, H = TUNE.height;
    if (this.fly) {
      const sp = inp.run ? TUNE.flyFast : TUNE.fly;
      const a = Math.min(1, dt * 10);
      this.vx += (wx * sp - this.vx) * a; this.vz += (wz * sp - this.vz) * a; this.vy += (inp.up * sp - this.vy) * a;
      const p = [this.x + this.vx * dt, this.z + this.vz * dt];
      collision.push(p, this.y, this.y + H);
      this.x = p[0]; this.z = p[1]; this.y += this.vy * dt;
      this.y = Math.max(this.y, this.groundUnder(this.x, this.z, this.y));
      this.y = Math.min(this.y, 420);
    } else {
      const sp = inp.run ? TUNE.run : TUNE.walk, a = Math.min(1, dt * (this.grounded ? 14 : 3));
      this.vx += (wx * sp - this.vx) * a; this.vz += (wz * sp - this.vz) * a;
      const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt, p = [nx, nz];
      collision.push(p, this.y, this.y + H);
      // Near-vertical terrain faces stop the player; everything else is walkable.
      const moved = Math.hypot(p[0] - this.x, p[1] - this.z), rise = terrain.height(p[0], p[1]) - this.y;
      if (rise <= TUNE.stepUp || rise <= moved * TUNE.maxRiseRatio + 0.02 || !this.grounded && rise < 0.1) { this.x = p[0]; this.z = p[1]; } else { this.vx = this.vz = 0; }
      if (this.grounded && inp.jump) { this.vy = TUNE.jump; this.grounded = false; }
      const g = this.groundUnder(this.x, this.z, this.y);
      if (this.grounded) {
        // Stay glued when walking downhill so slopes never turn into hops.
        if (g >= this.y - Math.max(0.3, moved * 2.6)) { this.y = g; this.vy = 0; } else this.grounded = false;
      }
      if (!this.grounded) {
        this.vy = Math.max(this.vy - TUNE.gravity * dt, -40); this.y += this.vy * dt;
        const g2 = this.groundUnder(this.x, this.z, this.y - Math.min(0, this.vy * dt));
        if (this.y <= g2 && this.vy <= 0) { this.y = g2; this.vy = 0; this.grounded = true; }
      }
    }
    const r = Math.hypot(this.x, this.z);
    if (r > TUNE.boundary) { this.x *= TUNE.boundary / r; this.z *= TUNE.boundary / r; }
  }
}
