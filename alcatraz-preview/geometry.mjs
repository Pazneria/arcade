import * as THREE from './vendor/three.module.min.mjs';

// Scene coordinates are metres: x east, y NAVD88, z south. No vertical scale.
export function terrainGeometry(data){
 const t=data.terrain,rows=t.values.length,cols=t.values[0].length,positions=new Float32Array(rows*cols*3);let landCells=0;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const i=(r*cols+c)*3;positions[i]=t.x0+c*t.spacing;positions[i+1]=t.values[r][c]??0;positions[i+2]=t.z0+r*t.spacing;}
 const idx=[];for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++)if(t.cell_land[r][c]){const a=r*cols+c,b=a+1,d=a+cols,e=d+1;idx.push(a,e,b,a,d,e);landCells++}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(idx),1));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.userData={landCells,spacing:t.spacing,crs:'EPSG:7131',verticalDatum:'NAVD88'};return geometry;
}
// Visual-only closure down to approximate regional water elevation. This is not bathymetry.
// It is temporary and will be replaced when supported underwater data are available.
// Only edges adjacent to inferred-water samples are closed; unknown remains open.
export function shorelineSkirtGeometry(data,level=.969){
 const t=data.terrain,rows=t.values.length,cols=t.values[0].length,vertices=[];let edges=0;
 const valid=(r,c)=>r>=0&&c>=0&&r<rows-1&&c<cols-1&&t.cell_land[r][c];
 const inferredWater=(r,c)=>r>=0&&c>=0&&r<rows&&c<cols&&t.class[r][c]===2;
 function wall(r1,c1,r2,c2){const a=t.values[r1][c1],b=t.values[r2][c2];if(a===null||b===null||Math.max(a,b)<=level)return;const x1=t.x0+c1*t.spacing,z1=t.z0+r1*t.spacing,x2=t.x0+c2*t.spacing,z2=t.z0+r2*t.spacing,y1=Math.max(a,level),y2=Math.max(b,level);vertices.push(x1,y1,z1,x2,y2,z2,x2,level,z2,x1,y1,z1,x2,level,z2,x1,level,z1);edges++}
 for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++)if(valid(r,c)){if(!valid(r-1,c)&&inferredWater(r-1,c)&&inferredWater(r-1,c+1))wall(r,c,r,c+1);if(!valid(r+1,c)&&inferredWater(r+2,c)&&inferredWater(r+2,c+1))wall(r+1,c+1,r+1,c);if(!valid(r,c-1)&&inferredWater(r,c-1)&&inferredWater(r+1,c-1))wall(r+1,c,r,c);if(!valid(r,c+1)&&inferredWater(r,c+2)&&inferredWater(r+1,c+2))wall(r,c+1,r+1,c+1)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();g.userData={boundaryEdges:edges,closureLevel:level,interpretation:'visual closure to approximate regional water level; not bathymetry'};return g;
}
export function polygonArea(poly){let s=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];s+=a[0]*b[1]-b[0]*a[1]}return Math.abs(s)/2}
function footprintShape(outline){const shape=new THREE.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();return shape}
function boxRuns(model,lower){
 // Greedy same-region rectangles reduce touching internal faces. All source cells
 // remain wholly inside the footprint. Raised sections overlap the base by 1 cm,
 // so their bottoms are buried rather than coplanar/z-fighting with the base roof.
 const remaining=new Map(model.cells.filter(c=>c.elevation_navd88>lower+.02).map(c=>[`${c.row},${c.col}`,c])),runs=[];
 while(remaining.size){const start=remaining.values().next().value,match=(r,c)=>{const q=remaining.get(`${r},${c}`);return q&&q.region===start.region&&q.elevation_navd88===start.elevation_navd88};let width=1;while(match(start.row,start.col+width))width++;let height=1;outer:for(;;){for(let dc=0;dc<width;dc++)if(!match(start.row+height,start.col+dc))break outer;height++}for(let dr=0;dr<height;dr++)for(let dc=0;dc<width;dc++)remaining.delete(`${start.row+dr},${start.col+dc}`);runs.push({x:start.x+(width-1),z:start.z+(height-1),width:width*2,depth:height*2,top:start.elevation_navd88,region:start.region,count:width*height})}
 return runs;
}
export function buildStructures(data,stats,materials){
 const group=new THREE.Group();group.name='source-derived-structures';const info=[];const byId=new Map(stats.features.map(f=>[f.properties.objectid,f.properties]));
 for(const b of data.buildings){const m=data.roof_massing?.models?.[b.id],p=byId.get(b.id)??(Number.isFinite(b.foundation_min)?{bareearth_elevation_within_footprint:{min:b.foundation_min}}:null);if(!p)throw Error(`Missing foundation stats for ${b.id}`);
  if(b.id===15944616){ // Likely water tower: round tank and open supports, not a solid box.
   const xs=b.outline.map(v=>v[0]),zs=b.outline.map(v=>v[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,radius=Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))*.46,top=b.roof_elevation_navd88,base=b.base,tankHeight=5,capHeight=1.0,tankBottom=top-tankHeight-capHeight;
   const tank=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,tankHeight,20),materials.tank);tank.position.set(cx,tankBottom+tankHeight/2,cz);group.add(tank);
   const cap=new THREE.Mesh(new THREE.ConeGeometry(radius,capHeight,20),materials.tank);cap.position.set(cx,tankBottom+tankHeight+capHeight/2,cz);group.add(cap);
   for(const [dx,dz] of [[-1,-1],[-1,1],[1,-1],[1,1]]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,tankBottom-base,8),materials.metal);leg.position.set(cx+dx*radius*.65,(tankBottom+base)/2,cz+dz*radius*.65);group.add(leg)}
   function brace(a,b){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=new THREE.Vector3().subVectors(vb,va),mesh=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,v.length(),6),materials.metal);mesh.position.copy(va.add(vb).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());group.add(mesh)}
   const k=radius*.65;for(const sign of [-1,1]){brace([cx-k,base,cz+sign*k],[cx+k,tankBottom,cz+sign*k]);brace([cx+k,base,cz+sign*k],[cx-k,tankBottom,cz+sign*k]);brace([cx+sign*k,base,cz-k],[cx+sign*k,tankBottom,cz+k]);brace([cx+sign*k,base,cz+k],[cx+sign*k,tankBottom,cz-k])}
   info.push({id:b.id,kind:'probable-water-tower',radius,base,top,approximation:'tank proportions, supports and bracing are illustrative; source top and ground elevations retained'});continue;
  }
  const base=p.bareearth_elevation_within_footprint.min-1,top=m?Math.min(...m.regions.map(r=>r.elevation_navd88)):b.roof_elevation_navd88;if(!(Number.isFinite(base)&&Number.isFinite(top)&&top>base))throw Error(`Invalid solid levels for ${b.id}`);
  const geom=new THREE.ExtrudeGeometry(footprintShape(b.outline),{depth:top-base,bevelEnabled:false,steps:1,curveSegments:1});geom.rotateX(-Math.PI/2);geom.translate(0,base,0);geom.computeBoundingBox();const mesh=new THREE.Mesh(geom,materials.building);mesh.name=`footprint-${b.id}`;mesh.userData={id:b.id,base,top,source:'imagery footprint and 2023 2m maximum-surface median',baseClosure:'buried below minimum interpolated bare-earth sample; not surveyed foundation'};group.add(mesh);
  let runs=[];if(m){runs=boxRuns(m,top);for(const r of runs){const bottom=top-.01,h=r.top-bottom;const box=new THREE.Mesh(new THREE.BoxGeometry(r.width,h,r.depth),materials.roof);box.position.set(r.x,(r.top+bottom)/2,r.z);box.name=`roof-region-${b.id}-${r.region}`;box.userData={id:b.id,top:r.top,bottom,sourceCells:r.count};group.add(box)}}
  info.push({id:b.id,kind:'closed-footprint-extrusion',base,top,area:polygonArea(b.outline),roofRuns:runs.length,roofCells:runs.reduce((a,r)=>a+r.count,0),uncertain:b.id===9608170});
 }
 group.userData={structures:info};return group;
}
export function makeMaterials(){return {terrain:new THREE.MeshStandardMaterial({color:0x777f67,roughness:1}),skirt:new THREE.MeshStandardMaterial({color:0x6a6b5b,roughness:1,side:THREE.DoubleSide}),building:new THREE.MeshStandardMaterial({color:0xb6b1a1,roughness:.93}),roof:new THREE.MeshStandardMaterial({color:0xa9a79c,roughness:.95}),tank:new THREE.MeshStandardMaterial({color:0x99978d,roughness:.9}),metal:new THREE.MeshStandardMaterial({color:0x666b68,roughness:.8})}}
