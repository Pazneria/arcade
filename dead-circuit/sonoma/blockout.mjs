import { projectFeatures } from './layout.mjs';

// One game unit is one source meter, matching the first-person camera and
// human-sized enemies. The 320 m slice is not compressed or grid-snapped.
export const METERS_PER_UNIT = 1;
export const WORLD_SIZE = 320;
const toWorld = ([x, z]) => [WORLD_SIZE / 2 + x / METERS_PER_UNIT, WORLD_SIZE / 2 + z / METERS_PER_UNIT];
const insideWorld = ([x, z]) => x > 0 && z > 0 && x < WORLD_SIZE && z < WORLD_SIZE;

// Liang-Barsky clips a real line segment against the world rectangle while
// preserving its bearing. Boundary intersections are interpolated, not drawn.
export function clipLine(coordinates) {
  const segments = [];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i], dx = b[0] - a[0], dz = b[1] - a[1];
    let lo = 0, hi = 1, visible = true;
    for (const [p, q] of [[-dx, a[0]], [dx, WORLD_SIZE-a[0]], [-dz, a[1]], [dz, WORLD_SIZE-a[1]]]) {
      if (p === 0) { if (q < 0) visible = false; continue; }
      const r = q / p;
      if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
      if (lo > hi) visible = false;
    }
    if (visible && hi > lo) segments.push([[a[0]+lo*dx,a[1]+lo*dz],[a[0]+hi*dx,a[1]+hi*dz]]);
  }
  return segments;
}

export function createSonomaBlockout(features) {
  const { included, excluded } = projectFeatures(features);
  const result = { plaza: null, buildings: [], obstacles: [], streets: [], paths: [], excluded: [...excluded], spawn: [160, 100] };
  for (const feature of included) {
    const coordinates = feature.coordinates.map(toWorld);
    if ((feature.category === 'plaza' || feature.category === 'building') && !coordinates.every(insideWorld)) {
      result.excluded.push({ osm_id: feature.osm_id, category: feature.category, reason: 'outside 320m world slice' });
      continue;
    }
    const item = { id: feature.osm_id, coordinates, partial: !!feature.partial };
    if (feature.category === 'plaza') result.plaza = item;
    else if (feature.category === 'building') {
      if(feature.osm_id==='27498189'){
        // Restore the source footprint; archived experiments retain their scale.
        const xs=coordinates.map(p=>p[0]),zs=coordinates.map(p=>p[1]),center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2],factor=1;
        result.buildings.push({...item,coordinates:coordinates.map(([x,z])=>[center[0]+(x-center[0])*factor,center[1]+(z-center[1])*factor]),visualBaseCoordinates:coordinates,scaleCenter:center,horizontalScale:factor,height:10});
      }else result.buildings.push({...item,height:7}); // heights approximate
    }
    else if (feature.category === 'frontage_street') for(const segment of clipLine(coordinates)) result.streets.push({ ...item, coordinates:segment, name: feature.tags.name });
    else if (feature.category === 'pedestrian') for(const segment of clipLine(coordinates)) result.paths.push({ ...item, coordinates:segment });
  }
  if (!result.plaza) throw new Error('Plaza is outside world slice');
  // Approximate south-side parking, not a surveyed OSM object. The sedan's
  // footprint is shared by visual construction and navigation collision.
  const hall=result.buildings.find(b=>b.id==='27498189');if(hall){const ring=hall.coordinates,a=ring[15],b=ring[16],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),t=[dx/length,dz/length],out=[dz/length,-dx/length],center=[(a[0]+b[0])/2-t[0]*8+out[0]*10,(a[1]+b[1])/2-t[1]*8+out[1]*10],corners=[[-2.25,-.9],[2.25,-.9],[2.25,.9],[-2.25,.9],[-2.25,-.9]].map(([x,z])=>[center[0]+t[0]*x+out[0]*z,center[1]+t[1]*x+out[1]*z]);result.parkedCar={center,tangent:t,outward:out,coordinates:corners,length:4.5,width:1.8};result.obstacles.push({id:'south-parked-car',coordinates:corners})}
  if (isBlocked(result, ...result.spawn, .28)) throw new Error('Proposed spawn intersects a footprint');
  return result;
}

function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

export function isBlocked(layout, x, z, radius = 0) {
  if (![x, z, radius].every(Number.isFinite) || radius < 0) throw new TypeError('Expected finite position and nonnegative radius');
  if (x - radius <= 0 || z - radius <= 0 || x + radius >= WORLD_SIZE || z + radius >= WORLD_SIZE) return true;
  for (const { coordinates } of [...layout.buildings,...(layout.obstacles||[])]) {
    let inside = false;
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const a = coordinates[j], b = coordinates[i];
      if (distanceToSegment(x, z, a, b) <= radius) return true;
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// A cell is blocked precisely when its square intersects the footprint. This
// avoids the extra corners included by the former circumscribed-circle test.
export function footprintIntersectsCell(polygon, x, z) {
  const contains=(px,pz)=>{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i];if((a[1]>pz)!==(b[1]>pz)&&px<(b[0]-a[0])*(pz-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside};
  if([[x,z],[x+1,z],[x,z+1],[x+1,z+1]].some(([px,pz])=>contains(px,pz)))return true;
  for(const [px,pz] of polygon)if(px>=x&&px<=x+1&&pz>=z&&pz<=z+1)return true;
  for(let i=1;i<polygon.length;i++){
    const a=polygon[i-1],b=polygon[i],dx=b[0]-a[0],dz=b[1]-a[1];let lo=0,hi=1,hit=true;
    for(const [p,q] of [[-dx,a[0]-x],[dx,x+1-a[0]],[-dz,a[1]-z],[dz,z+1-a[1]]]){
      if(p===0){if(q<0)hit=false;continue}const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)hit=false;
    }
    if(hit)return true;
  }
  return false;
}

// Conservative one-unit cells support the existing horde path field. Cells
// intersecting a footprint are solid; exact rendered polygons are unchanged.
export function createSonomaNavigation(layout) {
  const grid = Array.from({length:WORLD_SIZE}, (_,z) => Array.from({length:WORLD_SIZE}, (_,x) =>
    x===0||z===0||x===WORLD_SIZE-1||z===WORLD_SIZE-1 ? 3 : 0));
  for(const {coordinates} of [...layout.buildings,...(layout.obstacles||[])]){
    const xs=coordinates.map(p=>p[0]),zs=coordinates.map(p=>p[1]);
    for(let z=Math.max(1,Math.floor(Math.min(...zs)));z<=Math.min(WORLD_SIZE-2,Math.floor(Math.max(...zs)));z++)
      for(let x=Math.max(1,Math.floor(Math.min(...xs)));x<=Math.min(WORLD_SIZE-2,Math.floor(Math.max(...xs)));x++)
        if(footprintIntersectsCell(coordinates,x,z))grid[z][x]=3;
  }
  const [sx,sz] = layout.spawn.map(Math.floor);
  if (grid[sz]?.[sx] !== 0) throw new Error('Spawn blocked by navigation raster');
  const queue = [[sx,sz]], seen = new Set([`${sx},${sz}`]);
  for (let i=0;i<queue.length;i++) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const x=queue[i][0]+dx,z=queue[i][1]+dz,k=`${x},${z}`;
    if (grid[z]?.[x]===0&&!seen.has(k)){seen.add(k);queue.push([x,z])}
  }
  if (queue.length<500) throw new Error('Insufficient connected walkable area');
  const pick=(targetX,targetZ,used,station=false)=>{
    const sorted=queue.filter(([x,z])=>!used.has(`${x},${z}`)).sort((a,b)=>
      (a[0]-targetX)**2+(a[1]-targetZ)**2-((b[0]-targetX)**2+(b[1]-targetZ)**2));
    for (const [x,z] of sorted) {
      if (station && ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>seen.has(`${x+dx},${z+dz}`))) continue;
      used.add(`${x},${z}`);return [x,z];
    }
    throw new Error('No reachable placement');
  };
  const used=new Set([`${sx},${sz}`]);
  const stations=[[100,115],[215,200],[215,115]].map(p=>pick(...p,used,true));
  for(let i=0;i<stations.length;i++){let [x,z]=stations[i];grid[z][x]=[6,7,8][i]}
  const supplies=[[90,200],[230,155],[155,240]].map(p=>pick(...p,used));
  const beacon=pick(110,155,used), secret=pick(200,230,used);
  return {grid, spawn:layout.spawn.slice(), stations, supplies, beacon, secret, reachableCells:queue.length};
}
