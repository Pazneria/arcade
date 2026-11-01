import * as THREE from './vendor/three.module.min.js';

// Only draw muzzle-to-impact lines that travel forward and remain proportionate at close range.
export function coherentTracer(muzzle,target,forward){let x=target.x-muzzle.x,y=target.y-muzzle.y,z=target.z-muzzle.z,along=x*forward.x+y*forward.y+z*forward.z;if(along<=.08)return false;let lateral=Math.sqrt(Math.max(0,x*x+y*y+z*z-along*along));return lateral<=Math.max(.15,along*.75)}

// This staging adapter consumes the existing simulation's map and entity snapshots.
// It does not own movement, collision, input, scoring, or save state.
export function projection(fovFactor, width, height, pitch) {
  if (!(fovFactor > 0 && width > 0 && height > 0)) throw new RangeError('invalid projection');
  const projectionPixels = width / (2 * fovFactor);
  return { verticalFov: 2 * Math.atan(fovFactor * height / width) * 180 / Math.PI,
    pitchRadians: Math.atan(pitch * height * .65 / projectionPixels) };
}
export function wallCells(map) {
  const groups = new Map();
  for (let z = 0; z < map.length; z++) for (let x = 0; x < map[z].length; x++) {
    const type = map[z][x];
    if (!type) continue;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push({x, z});
  }
  return groups;
}
// Glazed, non-traversable windows decorate solid type-4 cells; only exposed faces get trim.
export function windowFaces(map){let faces=[];for(let z=0;z<map.length;z++)for(let x=0;x<map[z].length;x++)if(map[z][x]===4)for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){let row=map[z+dz];if(row&&row[x+dx]===0)faces.push({x,z,dx,dz})}return faces}
export const OUTPOST_ROOFS=[{x0:4.8,x1:16.2,z0:3.8,z1:15.2,ridge:10.5,eave:2.5,peak:3.55},{x0:18.8,x1:29.2,z0:18.8,z1:29.2,ridge:24,eave:2.5,peak:3.35}];
// Periodic low-contrast terrain variation: deterministic and seamless at tile boundaries.
export function terrainPixels(size=64){if(size<4||(size&(size-1)))throw new RangeError('terrain size must be a power of two');let data=new Uint8Array(size*size*4);for(let z=0;z<size;z++)for(let x=0;x<size;x++){let a=x*2*Math.PI/size,b=z*2*Math.PI/size,w=Math.sin(a*3+Math.sin(b*2))*.5+Math.cos(b*3-a)*.3,grain=(((x*73856093)^(z*19349663))>>>0)%7-3,i=(z*size+x)*4,v=Math.round(226+w*8+grain);data[i]=Math.max(0,Math.min(255,v-2));data[i+1]=Math.max(0,Math.min(255,v+2));data[i+2]=Math.max(0,Math.min(255,v-4));data[i+3]=255}return data}
// Route rectangles use the same world coordinates as the simulation's 2D drawing.
export function routeVertices(routes){let path=[],pathColors=[],tracks=[];const mainColor=new THREE.Color(0x88877b),sideColor=new THREE.Color(0x89795f);function quad(out,a,b,c,d,y){for(const v of [a,b,c,a,c,d])out.push(v[0],y,v[1])}for(const r of routes){const {x1,z1,x2,z2,sx,sz}=r;quad(path,[x1+sx,z1+sz],[x2+sx,z2+sz],[x2-sx,z2-sz],[x1-sx,z1-sz],.012);let color=Math.hypot(sx,sz)*2>=4?mainColor:sideColor;for(let i=0;i<6;i++)pathColors.push(color.r,color.g,color.b);for(const side of [-.55,.55]){let ox=sx*side,oz=sz*side,wx=sx*.045,wz=sz*.045;quad(tracks,[x1+ox+wx,z1+oz+wz],[x2+ox+wx,z2+oz+wz],[x2+ox-wx,z2+oz-wz],[x1+ox-wx,z1+oz-wz],.016)}}return {path,pathColors,tracks}}
// All landmark anchors sit on existing solid map cells; added geometry begins at wall height.
export const LANDMARK_ANCHORS=Object.freeze([{name:'water-tower',x:40.5,z:8.5},{name:'depot',x:51.5,z:29.5},{name:'rail',x:36.5,z:45.5},{name:'shrine',x:28.5,z:49.5}]);
export function buildLandmarks(map,geometry){
  const group=new THREE.Group();group.name='world-landmarks';const styles={metal:0x435750,timber:0x62584a,brass:0xb5a479,water:0x72948e,stone:0x858370},materials=Object.fromEntries(Object.entries(styles).map(([k,color])=>[k,new THREE.MeshLambertMaterial({color})])),items={metal:[],timber:[],brass:[],water:[],stone:[]};
  const valid=(x,z)=>map[Math.floor(z)]?.[Math.floor(x)]>0&&map[Math.floor(z)][Math.floor(x)]!==5;
  function add(style,x,y,z,sx,sy,sz,angle=0){items[style].push({x,y,z,sx,sy,sz,angle})}
  for(const spot of LANDMARK_ANCHORS){let {x,z,name}=spot;if(!valid(x,z))continue;
    if(name==='water-tower'){for(const dx of [-.32,.32])for(const dz of [-.32,.32])add('metal',x+dx,4.05,z+dz,.09,3.1,.09);add('metal',x,5.65,z,1.1,.12,1.1);add('metal',x,4.05,z,.08,2.5,.08,.42);add('metal',x,4.05,z,.08,2.5,.08,-.42)}
    else if(name==='depot'){for(const dx of [-1,1])add('timber',x+dx,3.15,z,.11,1.3,.12);add('timber',x,3.86,z,2.5,.65,.16);add('brass',x,3.87,z+.09,1.9,.07,.025);add('metal',x,2.72,z,3.5,.14,1.35)}
    else if(name==='rail'){for(const dx of [-1,1])add('metal',x+dx,3.15,z,.12,1.3,.14);add('metal',x,3.86,z,2.5,.2,.2);add('brass',x,3.66,z+.12,1.25,.22,.035)}
    else if(name==='shrine'){add('stone',x,2.91,z,.62,.82,.62);add('stone',x,3.38,z,.74,.12,.74);add('brass',x,3.05,z+.32,.13,.38,.035)}
  }
  const dummy=new THREE.Object3D();for(const [style,boxes] of Object.entries(items)){if(!boxes.length)continue;let mesh=new THREE.InstancedMesh(geometry,materials[style],boxes.length);mesh.name='landmark-'+style;boxes.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,v.angle);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true;group.add(mesh)}
  const water=LANDMARK_ANCHORS[0];if(valid(water.x,water.z)){let tank=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,1.1,10),materials.water);tank.name='water-tank';tank.position.set(water.x,6.25,water.z);group.add(tank);let band=new THREE.Mesh(new THREE.CylinderGeometry(.60,.60,.10,10),materials.metal);band.position.set(water.x,6.22,water.z);group.add(band)}
  // Dispose unused palette entries as well when an unusual map omits a landmark.
  group.userData.landmarkMaterials=Object.values(materials);return group;
}
// Low-profile service fittings use the utility building's solid east wall.
export function buildWaterworksExterior(map,buildings,geometry){const group=new THREE.Group(),parts=[];group.name='waterworks-exterior';const b=buildings.find(v=>v.role==='civic');if(!b)return group;const wallX=b.x1,outerX=wallX+1;function valid(z){return map[z]?.[wallX]===b.wall&&map[z]?.[outerX]===0}if(valid(b.z0+1)){const z=b.z0+1.5;parts.push({kind:'service-panel',x:outerX+.023,y:1.35,z,sx:.018,sy:.46,sz:.42,color:0x697871,wallX,wallZ:b.z0+1});for(const dz of [-.11,.11])parts.push({kind:'panel-mark',x:outerX+.037,y:1.35,z:z+dz,sx:.008,sy:.25,sz:.045,color:0x3d514d,wallX,wallZ:b.z0+1})}if(valid(b.z0+2)){const z=b.z0+2.5;parts.push({kind:'riser',x:outerX+.035,y:1.27,z,sx:.05,sy:1.75,sz:.06,color:0x687973,wallX,wallZ:b.z0+2});parts.push({kind:'pipe-band',x:outerX+.037,y:1.65,z,sx:.06,sy:.08,sz:.09,color:0x455a54,wallX,wallZ:b.z0+2})}group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='waterworks-service-fittings';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Fitted shutters and porch brackets give the house a quieter residential frontage.
export function buildResidentialFrontage(map,buildings,geometry){const group=new THREE.Group(),parts=[];group.name='residential-frontage';const b=buildings.find(v=>v.role==='residential');if(!b)return group;for(let x=b.x0+1;x<b.x1;x+=3){if(map[b.z0]?.[x]!==4||![x-1,x+1].every(q=>map[b.z0]?.[q]>0&&map[b.z0][q]!==5)||map[b.z0-1]?.[x]!==0)continue;for(const side of [-1,1])parts.push({kind:'shutter',x:x+.5+side*.54,y:1.45,z:b.z0-.03,sx:.12,sy:.92,sz:.018,color:0x756b5c,wallZ:b.z0})}const entries=b.doors.filter(([x,z])=>z===b.z0&&map[z]?.[x]===0).map(([x])=>x).sort((a,b)=>a-b);if(entries.length===2&&entries[1]===entries[0]+1){for(const x of [entries[0]-.30,entries[1]+1.30]){let wx=Math.floor(x);if(map[b.z0]?.[wx]>0&&map[b.z0][wx]!==5&&map[b.z0-1]?.[wx]===0)parts.push({kind:'porch-bracket',x,y:2.35,z:b.z0-.03,sx:.08,sy:.32,sz:.02,color:0x847565,wallZ:b.z0})}}group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='residential-shutters-and-brackets';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Narrow fascia and a fitted service conduit are mounted on solid market frontage.
export function buildMarketFrontage(map,buildings,geometry){const group=new THREE.Group(),parts=[];group.name='market-frontage';const b=buildings.find(v=>v.role==='shop');if(!b)return group;for(let x=b.x0+1;x<b.x1;x++){if(!map[b.z0]?.[x]||map[b.z0][x]===5||map[b.z0-1]?.[x]!==0)continue;for(const [y,sy,color] of [[2.09,.035,0x938574],[.75,.045,0x6e695b]])parts.push({kind:'fascia',x:x+.5,y,z:b.z0-.025,sx:.90,sy,sz:.018,color,wallX:x,wallZ:b.z0})}let x=b.x1-1;if(map[b.z0]?.[x]===11&&map[b.z0-1]?.[x]===0)parts.push({kind:'conduit',x:x+.80,y:1.40,z:b.z0-.03,sx:.04,sy:1.05,sz:.035,color:0x63726b,wallX:x,wallZ:b.z0});group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='market-fascia-and-conduit';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Shallow wall-mounted litter bins occupy existing collision clearance at quiet edges.
export function buildStreetFurniture(map,geometry){const group=new THREE.Group(),parts=[];group.name='street-furniture';const fixtures=[{wallX:3,wallZ:27,dx:-1,dz:0},{wallX:56,wallZ:53,dx:0,dz:1}];for(const f of fixtures){if(!map[f.wallZ]?.[f.wallX]||map[f.wallZ][f.wallX]===5||map[f.wallZ+f.dz]?.[f.wallX+f.dx]!==0)continue;const x=f.wallX+.5+f.dx*.52,z=f.wallZ+.5+f.dz*.52,xf=f.dx!==0;parts.push({...f,kind:'bin',x,y:.95,z,sx:xf?.035:.38,sy:.52,sz:xf?.38:.035,color:0x59675d});parts.push({...f,kind:'slot',x:x+f.dx*.022,y:1.09,z:z+f.dz*.022,sx:xf?.008:.24,sy:.045,sz:xf?.24:.008,color:0x2b3b34})}group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='wall-mounted-street-bins';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Rail-yard fittings attach to the existing solid cover, never the open route.
export function buildRailYardDetails(map,geometry){const group=new THREE.Group(),parts=[];group.name='rail-yard-details';for(const x of [36,37,38,39]){if(map[45]?.[x]!==3||map[46]?.[x]!==0)continue;parts.push({kind:'brace',x:x+.50,y:1.22,z:46.018,sx:.065,sy:1.75,sz:.024,color:0x59615b,wallX:x,wallZ:45});if(x===37||x===38)parts.push({kind:'plate',x:x+.50,y:1.79,z:46.034,sx:.36,sy:.14,sz:.012,color:0x96896c,wallX:x,wallZ:45})}if(map[49]?.[28]!==0&&map[50]?.[28]===0)for(const dx of [-.11,.11])parts.push({kind:'marked-stone',x:28.5+dx,y:1.12,z:50.008,sx:.14,sy:.035,sz:.012,color:0x96896c,wallX:28,wallZ:49});group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='rail-yard-cover-fittings';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Repair and storage fittings are fixed to permanent exterior wall cells.
export function buildOutpostAnnexFittings(map,geometry){const group=new THREE.Group(),parts=[];group.name='outpost-annex-fittings';if(map[11]?.[5]===3&&map[11]?.[4]===0){parts.push({kind:'repair-panel',x:4.975,y:1.35,z:11.5,sx:.018,sy:.48,sz:.50,color:0x66746d,wallX:5,wallZ:11});for(const dz of [-.12,.12])parts.push({kind:'repair-handle',x:4.961,y:1.35,z:11.5+dz,sx:.008,sy:.30,sz:.045,color:0x40534b,wallX:5,wallZ:11})}for(const x of [21,26])if(map[28]?.[x]===3&&map[29]?.[x]===0){parts.push({kind:'storage-panel',x:x+.5,y:.96,z:29.023,sx:.55,sy:.64,sz:.018,color:0x756b57,wallX:x,wallZ:28});parts.push({kind:'storage-rim',x:x+.5,y:1.32,z:29.025,sx:.62,sy:.07,sz:.022,color:0x5c5c4d,wallX:x,wallZ:28})}group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='outpost-annex-repair-storage';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Sparse weathered boards on solid perimeter walls suggest old barricades.
export function buildPerimeterRemnants(map,geometry){const group=new THREE.Group(),parts=[];group.name='perimeter-remnants';const fixtures=[{wallX:12,wallZ:0,dx:0,dz:1},{wallX:51,wallZ:0,dx:0,dz:1},{wallX:0,wallZ:38,dx:1,dz:0}];for(const f of fixtures){if(map[f.wallZ]?.[f.wallX]!==1||map[f.wallZ+f.dz]?.[f.wallX+f.dx]!==0)continue;const xf=f.dx!==0,x=f.wallX+.5+f.dx*.525,z=f.wallZ+.5+f.dz*.525;parts.push({...f,kind:'perimeter-board',x,y:1.98,z,sx:xf?.018:.72,sy:.12,sz:xf?.72:.018,color:0x827662});for(const along of [-.24,.24])parts.push({...f,kind:'perimeter-fastener',x:x+f.dx*.014+(xf?0:along),y:1.98,z:z+f.dz*.014+(xf?along:0),sx:xf?.008:.035,sy:.035,sz:xf?.035:.008,color:0x505b51})}group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='perimeter-barricade-remnants';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
// Static wall fittings share geometry in wood and metal batches, preserving
// their transforms and colors while reducing separate draw submissions.
export function buildTownFittingBatch(map,buildings,geometry){const group=new THREE.Group(),sources=[buildRailYardDetails(map,geometry),buildMarketFrontage(map,buildings,geometry),buildResidentialFrontage(map,buildings,geometry),buildWaterworksExterior(map,buildings,geometry),buildStreetFurniture(map,geometry),buildOutpostAnnexFittings(map,geometry),buildPerimeterRemnants(map,geometry)],meshes=sources.flatMap(v=>v.children.filter(o=>o.isInstancedMesh)),woodKinds=new Set(['fascia','shutter','porch-bracket','storage-panel','storage-rim','perimeter-board']),tinyKinds=new Set(['slot','panel-mark','pipe-band','repair-handle','perimeter-fastener']),items={wood:[],metal:[]};group.name='town-fittings';group.userData.sourceCounts=meshes.map(m=>({name:m.name,count:m.count}));for(const source of sources){const mesh=source.children.find(o=>o.isInstancedMesh);if(!mesh)continue;for(let i=0;i<mesh.count;i++){const p=source.userData.parts[i];items[woodKinds.has(p.kind)?'wood':'metal'].push({mesh,index:i,part:p})}}const matrix=new THREE.Matrix4(),color=new THREE.Color();group.userData.detailBatches=[];for(const kind of ['wood','metal']){const list=items[kind];if(!list.length)continue;const batch=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:kind==='wood'?.98:.86,metalness:kind==='wood'?0:.08}),list.length),entries=[];batch.name='town-fitted-'+kind;list.forEach(({mesh,index,part},i)=>{mesh.getMatrixAt(index,matrix);batch.setMatrixAt(i,matrix);mesh.getColorAt(index,color);batch.setColorAt(i,color);entries.push({matrix:matrix.clone(),color:color.clone(),x:part.x,z:part.z,detail:tinyKinds.has(part.kind),visible:true})});batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.instanceColor.setUsage(THREE.DynamicDrawUsage);batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;group.userData.detailBatches.push({mesh:batch,entries});group.add(batch)}for(const mesh of meshes){mesh.parent.remove(mesh);mesh.dispose();mesh.material.dispose()}for(const source of sources)group.add(source);return group}
// Hide only tiny fittings, with a four-unit hysteresis band and no new materials.
export function syncTownFittingDetails(group,player){if(!Number.isFinite(player?.x)||!Number.isFinite(player?.z))return 0;let changes=0;for(const batch of group.userData.detailBatches||[]){let dirty=false;for(const item of batch.entries){if(!item.detail)continue;const dx=item.x-player.x,dz=item.z-player.z,d2=dx*dx+dz*dz,visible=item.visible?d2<=24*24:d2<20*20;if(visible!==item.visible){item.visible=visible;dirty=true;changes++}}if(!dirty)continue;let n=0;for(const item of batch.entries){if(!item.visible)continue;batch.mesh.setMatrixAt(n,item.matrix);batch.mesh.setColorAt(n,item.color);n++}batch.mesh.count=n;batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.instanceColor.needsUpdate=true;if(n)batch.mesh.computeBoundingSphere()}return changes}
// Wall-mounted scene dressing stays inside existing collision margins; floor marks are flush.
// Fixture tint is specified in sRGB and converted once to Three.js linear vertex colors.
const practicalLightColor=new THREE.Color(0xe5cda0);
export const INTERIOR_LAMP_POSITIONS=Object.freeze([[12,6.5],[23.5,22.5],[48,7.5],[7,29.5],[54,50.5]]);
export const INTERIOR_FIXTURES=Object.freeze([{name:'notice',x:11,z:4,dx:0,dz:1},{name:'panel',x:5,z:10,dx:1,dz:0},{name:'shelf',x:7,z:14,dx:0,dz:-1},{name:'chart',x:21,z:19,dx:0,dz:1},{name:'tools',x:19,z:21,dx:1,dz:0},{name:'shelf',x:28,z:20,dx:-1,dz:0},{name:'market-shelf',x:5,z:26,dx:0,dz:1},{name:'market-shelf',x:8,z:26,dx:0,dz:1},{name:'market-board',x:3,z:28,dx:1,dz:0},{name:'home-sideboard',x:52,z:53,dx:0,dz:-1},{name:'home-cabinet',x:55,z:53,dx:0,dz:-1},{name:'home-picture',x:57,z:49,dx:-1,dz:0},{name:'home-window-board',x:51,z:47,dx:0,dz:1},{name:'utility-control',x:46,z:4,dx:0,dz:1},{name:'utility-cabinet',x:49,z:4,dx:0,dz:1},{name:'utility-pipe',x:44,z:7,dx:1,dz:0},{name:'workbench-frame',x:10,z:4,dx:0,dz:1},{name:'workshop-tools',x:9,z:4,dx:0,dz:1},{name:'workshop-storage',x:12,z:14,dx:0,dz:-1},{name:'annex-station-frame',x:28,z:24,dx:-1,dz:0},{name:'annex-storage',x:21,z:28,dx:0,dz:-1},{name:'annex-storage',x:25,z:28,dx:0,dz:-1}]);
function interiorFloorClear(map,x0,x1,z0,z1){for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(map[z]?.[x]!==0)return false;return true}
export function interiorSpecs(map,buildings=[]){let result=[];function mount(a,style,along,y,width,height,depth,out){let xf=a.dx!==0,x=a.x+.5+a.dx*(.5+out)+(xf?0:along),z=a.z+.5+a.dz*(.5+out)+(xf?along:0);result.push({kind:'wall',anchor:a,style,x,y,z,sx:xf?depth:width,sy:height,sz:xf?width:depth,outward:out,depth})}
  for(const a of INTERIOR_FIXTURES){if(!map[a.z]?.[a.x]||map[a.z][a.x]===5||map[a.z+a.dz]?.[a.x+a.dx]!==0)continue;
    if(a.name==='notice'||a.name==='chart'){mount(a,'wood',0,1.68,.75,.58,.035,.02);for(const [offset,h] of [[-.23,1.73],[0,1.61],[.23,1.74]])mount(a,'paper',offset,h,.15,.21,.012,.045)}
    else if(a.name==='panel'||a.name==='tools'){mount(a,'metal',0,1.65,.68,.49,.035,.02);for(const offset of [-.20,0,.20])mount(a,'wood',offset,1.65,.07,.30,.012,.045)}
    else if(a.name==='market-shelf'){for(const y of [.82,1.32]){mount(a,'wood',0,y,.82,.045,.16,.08);for(const [offset,style] of [[-.25,'paper'],[0,'glass'],[.25,'paper']])if(y<1||offset!==0)mount(a,style,offset,y+.11,.14,.18,.08,.10)}}
    else if(a.name==='market-board'){mount(a,'wood',0,1.55,.72,.55,.035,.02);for(const [offset,y] of [[-.2,1.61],[0,1.51],[.2,1.62]])mount(a,'paper',offset,y,.14,.20,.012,.045)}
    else if(a.name==='home-sideboard'){mount(a,'wood',0,.56,.86,.76,.16,.08);mount(a,'metal',0,.93,.90,.045,.17,.085);for(const offset of [-.22,.22])mount(a,'metal',offset,.57,.025,.48,.012,.165)}
    else if(a.name==='home-cabinet'){mount(a,'wood',0,1.04,.78,1.58,.16,.08);mount(a,'metal',0,1.04,.02,1.4,.012,.165)}
    else if(a.name==='home-picture'){mount(a,'wood',0,1.56,.72,.54,.035,.02);mount(a,'paper',0,1.56,.58,.40,.012,.045)}
    else if(a.name==='home-window-board'){for(const y of [1.22,1.70])mount(a,'wood',0,y,.88,.085,.05,.06)}
    else if(a.name==='utility-control'){mount(a,'metal',0,1.46,.82,.68,.04,.02);mount(a,'glass',0,1.57,.52,.19,.012,.048);for(const offset of [-.22,0,.22])mount(a,'paper',offset,1.31,.10,.09,.012,.048)}
    else if(a.name==='utility-cabinet'){mount(a,'metal',0,.98,.76,1.45,.14,.07);mount(a,'paper',0,1.38,.30,.18,.012,.145);mount(a,'wood',.27,.94,.025,.35,.012,.145)}
    else if(a.name==='utility-pipe'){mount(a,'metal',0,1.22,.10,1.78,.08,.08);for(const y of [.62,1.54])mount(a,'wood',0,y,.22,.075,.09,.09);mount(a,'metal',.105,1.72,.21,.018,.012,.10);mount(a,'paper',.23,1.72,.20,.14,.012,.11)}
    else if(a.name==='workbench-frame'){mount(a,'metal',0,1.25,.88,.64,.012,.006)}
    else if(a.name==='workshop-tools'){mount(a,'wood',0,1.51,.82,.70,.035,.02);for(const [offset,y,h] of [[-.24,1.50,.38],[0,1.58,.45],[.24,1.47,.34]])mount(a,'metal',offset,y,.055,h,.015,.045);mount(a,'paper',0,1.25,.19,.12,.012,.045)}
    else if(a.name==='workshop-storage'){mount(a,'wood',0,.71,.80,1.05,.14,.07);for(const y of [.48,.92])mount(a,'metal',0,y,.68,.025,.012,.145)}
    else if(a.name==='annex-station-frame'){mount(a,'metal',0,1.25,.88,.64,.012,.006)}
    else if(a.name==='annex-storage'){mount(a,'wood',0,.62,.82,.88,.14,.07);for(const y of [.34,.90])mount(a,'metal',0,y,.70,.035,.012,.145);mount(a,'paper',0,.62,.20,.12,.012,.15)}
    else{mount(a,'wood',0,1.47,.82,.055,.18,.09);for(const [offset,h] of [[-.26,1.60],[.02,1.57],[.26,1.61]])mount(a,'glass',offset,h,.10,.19,.10,.11)}
  }
  for(const [x,z] of INTERIOR_LAMP_POSITIONS){if(map[Math.floor(z)]?.[Math.floor(x)]!==0)continue;result.push({kind:'ceiling',style:'metal',x,y:2.39,z,sx:.46,sy:.07,sz:.24});result.push({kind:'ceiling',style:'light',x,y:2.33,z,sx:.34,sy:.05,sz:.15})}
  if(interiorFloorClear(map,20,27,20,27))result.push({kind:'floor',style:'wood',tint:0x686b5e,x:24,y:.006,z:24,sx:8,sy:.002,sz:8});
  if(interiorFloorClear(map,6,14,5,13))result.push({kind:'floor',style:'wood',tint:0x75664f,x:10.5,y:.006,z:9.5,sx:9,sy:.002,sz:9});
  if(interiorFloorClear(map,45,50,5,9))result.push({kind:'floor',style:'wood',tint:0x687b75,x:48,y:.006,z:7.5,sx:6,sy:.002,sz:5});
  if(interiorFloorClear(map,4,9,27,31))result.push({kind:'floor',style:'wood',tint:0x96886f,x:7,y:.006,z:29.5,sx:6,sy:.002,sz:5});
  if(interiorFloorClear(map,51,56,48,52))result.push({kind:'floor',style:'wood',tint:0x877562,x:54,y:.006,z:50.5,sx:6,sy:.002,sz:5});
  if([49,50].every(z=>[52,53,54].every(x=>map[z]?.[x]===0)))result.push({kind:'floor',style:'wood',x:53.5,y:.012,z:50,sx:1.5,sy:.002,sz:1.05});
  for(const [x,z] of [[12.2,7.2],[23.2,24.8],[25.7,21.4]]){if(map[Math.floor(z)]?.[Math.floor(x)]!==0)continue;result.push({kind:'floor',style:'stain',x,y:.019,z,sx:.48,sy:.002,sz:.24})}for(const beam of interiorBeamSpecs(map,buildings))result.push({...beam,kind:'ceiling-beam',style:'wood'});return result;
}
function fillInteriorBatch(batch,dummy,tint,palette){let n=0;for(const v of batch.parts){if(v.detailVisible===false)continue;dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();batch.mesh.setMatrixAt(n,dummy.matrix);if(batch.style==='wood')batch.mesh.setColorAt(n,tint.set(v.tint??(v.kind==='ceiling-beam'?0x625c4d:palette.wood)));n++}batch.mesh.count=n;batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;if(n)batch.mesh.computeBoundingSphere()}
export function buildInteriors(map,geometry,buildings=[]){const group=new THREE.Group();group.name='interior-dressing';const specs=interiorSpecs(map,buildings),palette={wood:0x695c4b,metal:0x485851,paper:0xb7ad91,glass:0x778a85,light:0xe5cda0,stain:0x35443a},materials={},batches=[];for(const [key,color] of Object.entries(palette))materials[key]=key==='light'?new THREE.MeshBasicMaterial({color}):key==='wood'||key==='metal'?new THREE.MeshStandardMaterial({color:key==='wood'?0xffffff:color,roughness:key==='wood'?.97:.88,metalness:key==='wood'?0:.08,emissive:key==='wood'?0x6b4d36:0x48645e,emissiveIntensity:.08}):new THREE.MeshLambertMaterial({color,...(key==='stain'?{transparent:true,opacity:.30,depthWrite:false}:{})});let dummy=new THREE.Object3D(),tint=new THREE.Color();for(const style of Object.keys(palette)){let parts=specs.filter(v=>v.style===style);if(!parts.length)continue;let mesh=new THREE.InstancedMesh(geometry,materials[style],parts.length);mesh.name='interior-'+style;for(const v of parts)if(v.kind==='wall'&&Math.max(v.sx,v.sz)<=.22&&v.sy<=.25)v.detailVisible=true;let batch={mesh,parts,style};if(parts.some(v=>v.detailVisible!==undefined))mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);fillInteriorBatch(batch,dummy,tint,palette);batches.push(batch);group.add(mesh)}group.userData.materials=Object.values(materials);group.userData.specs=specs;group.userData.batches=batches;group.userData.detailScratch={dummy,tint,palette};return group}
// Tiny fitted items disappear only well beyond normal combat range, with distance hysteresis.
export function syncInteriorDetails(group,player){if(!Number.isFinite(player?.x)||!Number.isFinite(player?.z))return 0;let changes=0;const {dummy,tint,palette}=group.userData.detailScratch;for(const batch of group.userData.batches){let dirty=false;for(const v of batch.parts){if(v.detailVisible===undefined)continue;let dx=v.x-player.x,dz=v.z-player.z,d2=dx*dx+dz*dz,visible=v.detailVisible?d2<=24*24:d2<20*20;if(visible!==v.detailVisible){v.detailVisible=visible;dirty=true;changes++}}if(dirty)fillInteriorBatch(batch,dummy,tint,palette)}return changes}
// Shallow crossbeams meet solid side walls and stay below the roof eaves but above the player.
export function interiorBeamSpecs(map,buildings=[]){const rooms=[{x0:5,x1:15,z0:4,z1:14},{x0:19,x1:28,z0:19,z1:28},...buildings],parts=[];for(const room of rooms)for(const z of [room.z0+1.5,room.z1-.5]){let row=map[Math.floor(z)],left=row?.[room.x0],right=row?.[room.x1];if(!left||!right||left===5||right===5)continue;let clear=true;for(let x=room.x0+1;x<room.x1;x++)if(row[x]!==0){clear=false;break}if(clear)parts.push({x:(room.x0+1+room.x1)/2,y:2.42,z,sx:room.x1-room.x0-1,sy:.12,sz:.12,left:room.x0,right:room.x1})}return parts}
// Keep shader fallbacks atomic when a Three.js chunk or a prior hook changes.
const shaderWarnings=new Set(),additiveFogHooks=new WeakMap();
function oneShaderToken(source,token){return typeof source==='string'&&source.indexOf(token)!==-1&&source.indexOf(token)===source.lastIndexOf(token)}
function warnShaderFallback(name){if(shaderWarnings.has(name))return;shaderWarnings.add(name);console.warn(`Dead Circuit: ${name} shader hook skipped; using the unmodified material.`)}
// Additive lights must fade toward black in fog, not add the fog color again.
export function useAdditiveFog(material){if(additiveFogHooks.get(material)===material.onBeforeCompile)return material;const priorHook=material.onBeforeCompile,priorKey=material.customProgramCacheKey();material.onBeforeCompile=function(shader,renderer){priorHook.call(this,shader,renderer);const fragment=shader.fragmentShader,source=THREE.ShaderChunk.fog_fragment,needle='mix( gl_FragColor.rgb, fogColor, fogFactor )';if(!oneShaderToken(fragment,'#include <fog_fragment>')||!oneShaderToken(source,needle)){warnShaderFallback('additive fog');return}shader.fragmentShader=fragment.replace('#include <fog_fragment>',source.replace(needle,'mix( gl_FragColor.rgb, vec3( 0.0 ), fogFactor )'))};material.customProgramCacheKey=()=>`additive-fog-black-v1:${priorKey}`;additiveFogHooks.set(material,material.onBeforeCompile);material.needsUpdate=true;return material}
// Subtle, baked floor cues beneath existing fixtures; no dynamic light crosses a wall.
export function buildInteriorLightPools(map){const group=new THREE.Group();group.name='interior-light-pools';const radius=.65,geometry=new THREE.CircleGeometry(radius,20),positions=geometry.attributes.position,colors=new Float32Array(positions.count*3);for(let i=0;i<positions.count;i++){let center=i===0;colors[i*3]=center?practicalLightColor.r:0;colors[i*3+1]=center?practicalLightColor.g:0;colors[i*3+2]=center?practicalLightColor.b:0}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.08,blending:THREE.AdditiveBlending,depthWrite:false,fog:true,side:THREE.DoubleSide}),valid=[];for(const [x,z] of INTERIOR_LAMP_POSITIONS){let clear=true;for(let zz=Math.floor(z-radius);zz<=Math.floor(z+radius);zz++)for(let xx=Math.floor(x-radius);xx<=Math.floor(x+radius);xx++)if(map[zz]?.[xx]!==0)clear=false;if(clear)valid.push({x,z})}if(valid.length){let pools=new THREE.InstancedMesh(geometry,material,valid.length),dummy=new THREE.Object3D();pools.name='room-light-decals';pools.renderOrder=3;valid.forEach((v,i)=>{dummy.position.set(v.x,.024,v.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix)});pools.instanceMatrix.needsUpdate=true;group.add(pools)}useAdditiveFog(material);group.userData.geometry=geometry;group.userData.material=material;group.userData.positions=valid;return group}
// Street dressing is flat on open floor or flush to a solid building face.
// Wall-mounted street fixtures sit outside existing solids; their floor cues are
// omitted unless every cell under the small disc is clear.
export function buildStreetLights(map,geometry){const group=new THREE.Group();group.name='street-fixture-lights';const specs=[{wallX:10,wallZ:28,x:11.05,z:28.5,poolX:11.7,poolZ:28.5},{wallX:44,wallZ:5,x:43.95,z:5.5,poolX:43.3,poolZ:5.5}],radius=.55,valid=specs.filter(v=>{if(!map[v.wallZ]?.[v.wallX]||map[v.wallZ][v.wallX]===5)return false;for(let z=Math.floor(v.poolZ-radius);z<=Math.floor(v.poolZ+radius);z++)for(let x=Math.floor(v.poolX-radius);x<=Math.floor(v.poolX+radius);x++)if(map[z]?.[x]!==0)return false;return true});group.userData.positions=valid;if(!valid.length)return group;const housing=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0x43504a}),valid.length),lens=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xe5cda0}),valid.length),disc=new THREE.CircleGeometry(radius,20),colors=new Float32Array(disc.attributes.position.count*3);for(let i=0;i<disc.attributes.position.count;i++){colors[i*3]=i===0?practicalLightColor.r:0;colors[i*3+1]=i===0?practicalLightColor.g:0;colors[i*3+2]=i===0?practicalLightColor.b:0}disc.setAttribute('color',new THREE.BufferAttribute(colors,3));const pools=new THREE.InstancedMesh(disc,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,fog:true,side:THREE.DoubleSide}),valid.length),dummy=new THREE.Object3D();housing.name='street-fixture-housings';lens.name='street-fixture-lenses';pools.name='street-fixture-pools';useAdditiveFog(pools.material);pools.renderOrder=3;valid.forEach((v,i)=>{dummy.position.set(v.x,2.22,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(.12,.24,.32);dummy.updateMatrix();housing.setMatrixAt(i,dummy.matrix);dummy.position.x=v.x+(v.x>v.wallX+.5?.065:-.065);dummy.scale.set(.015,.14,.22);dummy.updateMatrix();lens.setMatrixAt(i,dummy.matrix);dummy.position.set(v.poolX,.024,v.poolZ);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix)});for(const mesh of [housing,lens,pools])mesh.instanceMatrix.needsUpdate=true;group.add(housing,lens,pools);return group}
function addGroundGuides(group,dummy,name,points,color,width,depth){if(!points.length)return;let markers=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshLambertMaterial({color}),points.length);markers.name=name;points.forEach((v,i)=>{dummy.position.set(v.x,.022,v.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(width,depth,1);dummy.updateMatrix();markers.setMatrixAt(i,dummy.matrix)});markers.instanceMatrix.needsUpdate=true;group.add(markers)}
function annexExitClear(map){return [21,22].every(z=>[27,28,29].every(x=>map[z]?.[x]===0))}
// Geometry-derived, feathered strips stay inside open cells and never cover a gate.
const CONTACT_SOLIDS=new Set([2,3,4,6,7,8,10,11,12]),CONTACT_DIRECTIONS=[[0,-1,0],[-1,0,Math.PI/2],[0,1,Math.PI],[1,0,-Math.PI/2]];
function groundContactFaces(map){const faces=[];let solids=0;for(let z=1;z<map.length-1;z++)for(let x=1;x<(map[z]?.length??0)-1;x++){if(!CONTACT_SOLIDS.has(map[z][x]))continue;solids++;for(const [dx,dz,angle] of CONTACT_DIRECTIONS)if(map[z+dz]?.[x+dx]===0)faces.push({x:x+.5+dx*.59,z:z+.5+dz*.59,wallX:x,wallZ:z,dx,dz,angle})}return {faces,capacity:solids*4}}
function updateGroundContacts(shade,faces){if(faces.length>shade.instanceMatrix.count)return false;const dummy=shade.userData.contactDummy;faces.forEach((v,i)=>{dummy.position.set(v.x,.023,v.z);dummy.rotation.set(-Math.PI/2,0,v.angle);dummy.scale.set(.96,.18,1);dummy.updateMatrix();shade.setMatrixAt(i,dummy.matrix)});shade.count=faces.length;shade.instanceMatrix.needsUpdate=true;shade.userData.faces=faces;return true}
export function buildGroundContacts(map){const {faces,capacity}=groundContactFaces(map);if(!faces.length)return null;const g=new THREE.PlaneGeometry(1,1),c=g.attributes.position,rgba=new Float32Array(c.count*4);for(let i=0;i<c.count;i++){rgba[i*4]=.12;rgba[i*4+1]=.17;rgba[i*4+2]=.14;rgba[i*4+3]=c.getY(i)<0?.16:0}g.setAttribute('color',new THREE.BufferAttribute(rgba,4));const shade=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,fog:true,side:THREE.DoubleSide}),capacity);shade.name='town-contact-shading';shade.renderOrder=2.5;shade.instanceMatrix.setUsage(THREE.DynamicDrawUsage);shade.userData.contactDummy=new THREE.Object3D();updateGroundContacts(shade,faces);return shade}
// Flush curb seams and small drain grates sit in open sidewalk-edge cells.
export function buildStreetEdges(map,buildings){const group=new THREE.Group(),parts=[];group.name='street-edge-details';for(const b of buildings){const candidates=[];for(let x=b.x0+1;x<b.x1;x++){if(map[b.z1]?.[x]===0||map[b.z1]?.[x]===5||map[b.z1+1]?.[x]!==0)continue;candidates.push(x);parts.push({kind:'curb',x:x+.5,z:b.z1+1.86,y:.0205,sx:.86,sz:.045,color:0x878b7d,wallX:x,wallZ:b.z1})}if(candidates.length){const x=candidates[Math.floor(candidates.length/2)]+.5;for(const dx of [-.12,0,.12])parts.push({kind:'drain',x:x+dx,z:b.z1+1.94,y:.021,sx:.035,sz:.10,color:0x515e55,wallX:Math.floor(x),wallZ:b.z1})}}group.userData.parts=parts;if(!parts.length)return group;const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.98,metalness:0}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='street-curb-and-drain';parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(p.sx,p.sz,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
export function buildTownStreets(map,buildings,boxGeometry){const group=new THREE.Group();group.name='town-streets';if(!buildings.length)return group;const sidewalkCells=[],signs=[],contactCells=[];for(const b of buildings){for(let x=b.x0;x<=b.x1;x++)if(map[b.z0]?.[x]>0&&map[b.z0-1]?.[x]===0)contactCells.push({x:x+.5,z:b.z0-.12,wallX:x,wallZ:b.z0});const z=b.z1+1;for(let x=b.x0;x<=b.x1;x++)if(map[z]?.[x]===0)sidewalkCells.push({x:x+.5,z:z+.5});let x=b.x0+2;while(x<b.x1&&!map[b.z0]?.[x])x++;if(x<b.x1&&map[b.z0]?.[x])signs.push({x:x+.5,z:b.z0-.018,role:b.role,label:b.sign})}let dummy=new THREE.Object3D();if(sidewalkCells.length){let geometry=new THREE.PlaneGeometry(1,1),material=new THREE.MeshLambertMaterial({color:0xffffff}),walk=new THREE.InstancedMesh(geometry,material,sidewalkCells.length);walk.name='town-sidewalks';let sidewalkTint=new THREE.Color(),sidewalkPalette=[0x7a8075,0x85877b,0x747d73];sidewalkCells.forEach((v,i)=>{walk.setColorAt(i,sidewalkTint.set(sidewalkPalette[(Math.floor(v.x)+Math.floor(v.z))%sidewalkPalette.length]));dummy.position.set(v.x,.005,v.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(1,.72,1);dummy.updateMatrix();walk.setMatrixAt(i,dummy.matrix)});walk.instanceMatrix.needsUpdate=true;if(walk.instanceColor)walk.instanceColor.needsUpdate=true;group.add(walk)}const contactShade=buildGroundContacts(map);if(contactShade)group.add(contactShade);if(signs.length){let material=new THREE.MeshLambertMaterial({color:0xffffff}),panel=new THREE.InstancedMesh(boxGeometry,material,signs.length),tint=new THREE.Color();panel.name='town-street-signs';signs.forEach((v,i)=>{dummy.position.set(v.x,2.23,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(.72,.24,.035);dummy.updateMatrix();panel.setMatrixAt(i,dummy.matrix);panel.setColorAt(i,tint.set(v.role==='shop'?0xb49368:v.role==='civic'?0x8da49c:0xa89b83))});panel.instanceMatrix.needsUpdate=true;if(panel.instanceColor)panel.instanceColor.needsUpdate=true;group.add(panel);const glyphs={S:['111','100','111','001','111'],H:['101','101','111','101','101'],O:['111','101','101','101','111'],P:['111','101','111','100','100'],A:['010','101','111','101','101'],L:['100','100','100','100','111'],M:['101','111','111','101','101'],E:['111','100','110','100','111'],R:['110','101','110','101','101'],K:['101','101','110','101','101'],T:['111','010','010','010','010'],W:['101','101','111','111','101']},pixels=[];for(const v of signs){let text=v.label||(v.role==='shop'?'MARKET':v.role==='civic'?'WATER':'HOME'),step=Math.min(.038,.56/(text.length*4-1));for(let n=0;n<text.length;n++){let glyph=glyphs[text[n]];for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(glyph[row][col]==='1')pixels.push({x:v.x-(text.length*4-1)*step/2+(n*4+col)*step,y:2.305-row*.037,z:v.z-.024,size:step*.7})}}let ink=new THREE.InstancedMesh(boxGeometry,new THREE.MeshBasicMaterial({color:0x26342d}),pixels.length);ink.name='town-sign-lettering';pixels.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.size,.027,.012);dummy.updateMatrix();ink.setMatrixAt(i,dummy.matrix)});ink.instanceMatrix.needsUpdate=true;group.add(ink)}const marketGuides=[];for(const x of [13,28])if(map[31]?.[x]===0&&map[30]?.[x]===0)marketGuides.push({x:x+.5,z:31.5});addGroundGuides(group,dummy,'market-square-route-markers',marketGuides,0xa39c81,1.2,.13);group.userData.marketGuides=marketGuides;const homeGuides=[];for(let x=47;x<=53;x+=2)if(map[46]?.[x]===0)homeGuides.push({x:x+.5,z:46.5});addGroundGuides(group,dummy,'residential-path-markers',homeGuides,0xb1a58d,.9,.14);group.userData.homeGuides=homeGuides;const waterGuides=[];for(let x=34;x<=46;x+=3)if(map[12]?.[x]===0&&map[11]?.[x]===0)waterGuides.push({x:x+.5,z:12.5});addGroundGuides(group,dummy,'waterworks-path-markers',waterGuides,0x8fa79b,1,.17);group.userData.waterGuides=waterGuides;const railSleeperZ=[42.5,44,45.5].filter(z=>[31,32,33].every(x=>map[Math.floor(z)]?.[x]===0));if(railSleeperZ.length){let ties=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshLambertMaterial({color:0x77796b}),railSleeperZ.length);ties.name='rail-junction-ground-ties';railSleeperZ.forEach((z,i)=>{dummy.position.set(32.5,.022,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(2.25,.16,1);dummy.updateMatrix();ties.setMatrixAt(i,dummy.matrix)});ties.instanceMatrix.needsUpdate=true;group.add(ties)}group.userData.railSleeperZ=railSleeperZ;if([21,22].every(z=>[0,5].includes(map[z]?.[28])&&map[z]?.[27]===0&&map[z]?.[29]===0)){let apron=new THREE.Mesh(new THREE.PlaneGeometry(3,1.6),new THREE.MeshLambertMaterial({color:0x8b8777}));apron.name='annex-exit-threshold';apron.rotation.x=-Math.PI/2;apron.position.set(28.5,.018,22);apron.visible=annexExitClear(map);group.add(apron)}if(map[6]?.[15]===0&&map[7]?.[15]===0){let threshold=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.7),new THREE.MeshLambertMaterial({color:0x8b8876}));threshold.name='outpost-workbench-exit-threshold';threshold.rotation.x=-Math.PI/2;threshold.position.set(15.5,.018,7);group.add(threshold)}let open=true;for(let z=29;z<=35;z++)for(let x=29;x<=35;x++)if(map[z]?.[x]!==0)open=false;if(open){let plaque=new THREE.Mesh(new THREE.PlaneGeometry(6.4,6.4),new THREE.MeshLambertMaterial({color:0x777e70}));plaque.name='town-square-paving';plaque.rotation.x=-Math.PI/2;plaque.position.set(32.5,.019,32.5);group.add(plaque);}group.userData.sidewalkCells=sidewalkCells;group.userData.signs=signs;group.userData.contactCells=contactCells;return group}
// Wall-mounted town details fit inside the player collision margin; porches are flat.
export function townFacadeSpecs(map,buildings){let details=[],porches=[];for(const b of buildings){let wallX=b.x0,wallZ=b.z0;if(map[wallZ]?.[wallX]>0){let x=wallX+.5,z=wallZ-.065,color=b.role==='shop'?0x956a57:b.role==='civic'?0x70827c:0x817666;details.push({x,y:1.35,z,sx:.42,sy:.52,sz:.12,color,wallX,wallZ});details.push({x,y:1.39,z:z-.064,sx:.29,sy:.035,sz:.008,color:0xc0b99d,wallX,wallZ});details.push({x:x+.28,y:1.35,z,sx:.035,sy:.75,sz:.10,color:0x465a50,wallX,wallZ})}let pair=b.doors.slice(0,2);if(pair.length===2&&pair[0][1]===pair[1][1]&&Math.abs(pair[0][0]-pair[1][0])===1){let edge=pair[0][1],outside=edge===b.z0?edge-1:edge===b.z1?edge+1:null;if(outside!==null&&pair.every(([x])=>map[outside]?.[x]===0))porches.push({x:(pair[0][0]+pair[1][0]+1)/2,z:outside+.5,wallZ:edge,role:b.role})}}return {details,porches}}
export function buildTownFacades(map,buildings,boxGeometry){const group=new THREE.Group();group.name='town-facades';const spec=townFacadeSpecs(map,buildings),dummy=new THREE.Object3D(),tint=new THREE.Color();if(spec.details.length){let mesh=new THREE.InstancedMesh(boxGeometry,new THREE.MeshLambertMaterial({color:0xffffff}),spec.details.length);mesh.name='town-wall-details';spec.details.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(v.color))});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;group.add(mesh)}if(spec.porches.length){let mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshLambertMaterial({color:0xffffff}),spec.porches.length);mesh.name='town-porch-paving';spec.porches.forEach((v,i)=>{mesh.setColorAt(i,tint.set(v.role==='shop'?0x918571:v.role==='civic'?0x818b82:0x998976));dummy.position.set(v.x,.009,v.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(1.8,.7,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;group.add(mesh)}group.userData.spec=spec;return group}
// Civilian window vignettes are flush with solid glazing, outside walking space.
// Fascia and shallow canopies sit above head height and never add collision.
export function townRoofDetails(buildings){let parts=[];for(const b of buildings){let color=b.role==='shop'?0x795b4e:b.role==='civic'?0x697c77:0x817366,cx=(b.x0+b.x1+1)/2,cz=(b.z0+b.z1+1)/2,width=b.x1-b.x0+1.4,depth=b.z1-b.z0+1.4;for(const x of [b.x0-.2,b.x1+1.2])parts.push({role:b.role,kind:'eave',x,y:2.56,z:cz,sx:.12,sy:.10,sz:depth,color});for(const z of [b.z0-.14,b.z1+1.14])parts.push({role:b.role,kind:'gable-fascia',x:cx,y:2.56,z,sx:width-.12,sy:.10,sz:.12,color});if(b.role==='shop')parts.push({role:b.role,kind:'awning',x:cx,y:2.70,z:b.z1+1.35,sx:2.8,sy:.10,sz:.50,color});if(b.role==='residential')parts.push({role:b.role,kind:'porch-canopy',x:(b.doors[0][0]+b.doors[1][0]+1)/2,y:2.66,z:b.z0-.35,sx:2.6,sy:.10,sz:.50,color})}return parts}
export function buildTownRoofDetails(buildings,boxGeometry){const group=new THREE.Group();group.name='town-roof-details';const parts=townRoofDetails(buildings);if(parts.length){let mesh=new THREE.InstancedMesh(boxGeometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96,metalness:0}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='town-fascia-and-canopies';parts.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(v.color))});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;group.add(mesh)}group.userData.parts=parts;return group}
// Frame only real two-cell openings; jambs stay inside solid neighbors.
export function buildTownDoorways(map,buildings,boxGeometry){const group=new THREE.Group();group.name='town-doorways';const doors=[],frames=[];for(const b of buildings)for(let i=0;i+1<b.doors.length;i+=2){let a=b.doors[i],q=b.doors[i+1],horizontal=a[1]===q[1]&&Math.abs(a[0]-q[0])===1,vertical=a[0]===q[0]&&Math.abs(a[1]-q[1])===1;if(!horizontal&&!vertical)continue;let edge=horizontal?a[1]:a[0],low=horizontal?Math.min(a[0],q[0]):Math.min(a[1],q[1]);if(horizontal&&edge!==b.z0&&edge!==b.z1||vertical&&edge!==b.x0&&edge!==b.x1)continue;let clear=horizontal?[low,low+1].every(x=>map[edge]?.[x]===0&&map[edge-1]?.[x]===0&&map[edge+1]?.[x]===0):[low,low+1].every(z=>map[z]?.[edge]===0&&map[z]?.[edge-1]===0&&map[z]?.[edge+1]===0),flanked=horizontal?map[edge]?.[low-1]>0&&map[edge]?.[low+2]>0:map[low-1]?.[edge]>0&&map[low+2]?.[edge]>0;if(!clear||!flanked)continue;doors.push({horizontal,edge,low,role:b.role});if(horizontal){for(const x of [low-.035,low+2.035])frames.push({x,y:1.25,z:edge+.5,sx:.07,sy:2.5,sz:1.04});frames.push({x:low+1,y:2.58,z:edge+.5,sx:2,sy:.16,sz:1.04})}else{for(const z of [low-.035,low+2.035])frames.push({x:edge+.5,y:1.25,z,sx:1.04,sy:2.5,sz:.07});frames.push({x:edge+.5,y:2.58,z:low+1,sx:1.04,sy:.16,sz:2})}}if(doors.length){let dummy=new THREE.Object3D(),framing=new THREE.InstancedMesh(boxGeometry,new THREE.MeshStandardMaterial({color:0x716c5c,roughness:.96,metalness:0}),frames.length),thresholds=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshLambertMaterial({color:0x968d78}),doors.length);framing.name='town-doorframes';thresholds.name='town-door-thresholds';frames.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();framing.setMatrixAt(i,dummy.matrix)});doors.forEach((v,i)=>{dummy.position.set(v.horizontal?v.low+1:v.edge+.5,.018,v.horizontal?v.edge+.5:v.low+1);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(v.horizontal?1.8:1.04,v.horizontal?1.04:1.8,1);dummy.updateMatrix();thresholds.setMatrixAt(i,dummy.matrix)});framing.instanceMatrix.needsUpdate=true;thresholds.instanceMatrix.needsUpdate=true;group.add(framing,thresholds)}group.userData.doors=doors;group.userData.frames=frames;return group}
export function townWindowStorySpecs(map,buildings){let parts=[];for(const b of buildings)for(let wx=b.x0+1;wx<b.x1;wx+=3){if(map[b.z0]?.[wx]!==4)continue;let x=wx+.5,z=b.z0-.034;function add(dx,y,sx,sy,color){parts.push({x:x+dx,y,z,sx,sy,sz:.018,color,wallX:wx,wallZ:b.z0,role:b.role})}if(b.role==='shop'){add(0,1.13,.57,.035,0x85705a);add(-.17,1.26,.10,.23,0x74877b);add(.01,1.23,.11,.17,0xae9b77);add(.18,1.28,.09,.27,0x687b70)}else if(b.role==='civic'){add(0,1.43,.48,.40,0x667b75);add(-.10,1.47,.12,.17,0xc2b99b);add(.10,1.39,.13,.15,0xa99e83)}else if(b.role==='residential'){add(-.25,1.47,.14,.72,0x8e796c);add(.25,1.47,.14,.72,0x8e796c);add(0,1.05,.48,.035,0xa99d83)}}return parts}
export function buildTownWindowStories(map,buildings,geometry){const group=new THREE.Group();group.name='town-window-stories';const parts=townWindowStorySpecs(map,buildings);if(parts.length){let mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),parts.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='town-window-details';parts.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(v.color))});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;group.add(mesh)}group.userData.parts=parts;return group}
// Sparse wheel-wear strokes follow roads and avoid junctions and solid cells.
export function buildRoadWear(map,routes){const group=new THREE.Group(),marks=[];group.name='road-wear';function crossesOtherRoute(x,z,source){for(const r of routes){if(r===source)continue;const vx=r.x2-r.x1,vz=r.z2-r.z1,len2=vx*vx+vz*vz;if(len2<1e-8)continue;const t=Math.max(0,Math.min(1,((x-r.x1)*vx+(z-r.z1)*vz)/len2)),dx=x-(r.x1+t*vx),dz=z-(r.z1+t*vz);if(dx*dx+dz*dz<(Math.hypot(r.sx,r.sz)+.6)**2)return true}return false}for(const r of routes){const vx=r.x2-r.x1,vz=r.z2-r.z1,len=Math.hypot(vx,vz);if(len<6)continue;const ux=vx/len,uz=vz/len;for(const [i,t] of [.27,.69].entries()){const x=r.x1+vx*t+r.sx*(i===0?.18:-.18),z=r.z1+vz*t+r.sz*(i===0?.18:-.18),length=i===0?1.05:1.35;if(crossesOtherRoute(x,z,r))continue;let clear=true;for(const f of [-.5,0,.5])if(map[Math.floor(z+uz*length*f)]?.[Math.floor(x+ux*length*f)]!==0)clear=false;if(clear)marks.push({x,z,length,width:i===0?.09:.13,angle:Math.atan2(-ux,-uz),ux,uz})}}group.userData.marks=marks;if(!marks.length)return group;const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshLambertMaterial({color:0x4e5c50,transparent:true,opacity:.18,depthWrite:false}),marks.length),dummy=new THREE.Object3D();mesh.name='road-wear-strokes';mesh.renderOrder=2.2;marks.forEach((v,i)=>{dummy.position.set(v.x,.0175,v.z);dummy.rotation.set(-Math.PI/2,0,v.angle);dummy.scale.set(v.width,v.length,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true;group.add(mesh);return group}
// Sparse walk-through ground cover plus wall-mounted fence trim; no new colliders.
export function exteriorSpecs(map,buildings=[]){let tufts=[],rocks=[],fences=[];const avoid=[[10,15],[15,10],[15,7],[19,24],[24,19],[42.5,12.5],[52.5,34.5],[31.5,49.5],[37.5,34.5]];
  for(let z=3;z<map.length-3;z+=3)for(let x=3;x<map[z].length-3;x+=3){if(map[z][x]!==0||(x>4&&x<17&&z>3&&z<16)||(x>18&&x<30&&z>18&&z<30)||buildings.some(b=>x>=b.x0&&x<=b.x1&&z>=b.z0-1&&z<=b.z1+1))continue;let seed=((x*73856093)^(z*19349663))>>>0,wx=x+.25+(seed%50)/100,wz=z+.25+((seed>>>8)%50)/100;if(avoid.some(([ax,az])=>(wx-ax)**2+(wz-az)**2<9))continue;if(seed%7===0&&tufts.length<72)tufts.push({x:wx,z:wz,height:.12+(seed%4)*.02,angle:(seed%31)*.1});else if(seed%13===0&&rocks.length<36)rocks.push({x:wx,z:wz,width:.12+(seed%4)*.025,height:.035+(seed%3)*.01})}
  for(const [x,z] of [[49,29],[50,29],[51,29],[52,29],[25,45],[26,45],[27,45],[28,45]])if(map[z]?.[x]&&map[z+1]?.[x]===0)fences.push({x,z,dx:0,dz:1});return {tufts,rocks,fences};
}
// Small walk-through plantings hug solid exterior walls, away from doorways.
export function buildTownPlantClusters(map,buildings){const group=new THREE.Group(),plants=[];group.name='town-plant-clusters';for(const b of buildings){let selected=0,last=-99;for(let x=b.x0+1;x<b.x1&&selected<2;x++){if(map[b.z0]?.[x]<=0||map[b.z0]?.[x]===5||map[b.z0-1]?.[x]!==0||x-last<2||b.doors.some(([dx,dz])=>(x+.5-(dx+.5))**2+(b.z0-.25-(dz+.5))**2<6.25))continue;const seed=((x*73856093)^(b.z0*19349663))>>>0;if(seed%3===0)continue;last=x;selected++;const base=x+.35+(seed%20)/100;for(let i=0;i<3;i++){const dx=[-.13,.02,.16][i],h=[.13,.20,.15][(i+seed)%3],width=[.13,.16,.12][(i+seed)%3];plants.push({x:base+dx,z:b.z0-.18-((seed>>>(i*3))%6)/100,height:h,width,anchorX:x,anchorZ:b.z0,color:[0x536b51,0x68775a,0x465e4e][(seed+i)%3]})}}}group.userData.plants=plants;if(!plants.length)return group;const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:0xffffff}),plants.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='town-low-planting';plants.forEach((p,i)=>{dummy.position.set(p.x,p.height*.5+.018,p.z);dummy.rotation.set(0,(i%3)*.43,0);dummy.scale.set(p.width,p.height*.5,p.width*.75);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(p.color))});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;group.add(mesh);return group}
export function buildExterior(map,geometry,buildings=[]){const group=new THREE.Group();group.name='exterior-dressing';const specs=exteriorSpecs(map,buildings),tuftGeometry=new THREE.PlaneGeometry(1,1),rockGeometry=new THREE.IcosahedronGeometry(1,0),tuftMaterial=new THREE.MeshLambertMaterial({color:0x526750,side:THREE.DoubleSide}),rockMaterial=new THREE.MeshLambertMaterial({color:0x68776c}),fenceMaterial=new THREE.MeshLambertMaterial({color:0x59675c}),dummy=new THREE.Object3D();
  const tufts=new THREE.InstancedMesh(tuftGeometry,tuftMaterial,Math.max(1,specs.tufts.length*2));tufts.name='exterior-tufts';tufts.count=specs.tufts.length*2;let n=0;for(const t of specs.tufts)for(const angle of [t.angle,t.angle+Math.PI/2]){dummy.position.set(t.x,t.height/2+.001,t.z);dummy.rotation.set(0,angle,0);dummy.scale.set(.16,t.height,1);dummy.updateMatrix();tufts.setMatrixAt(n++,dummy.matrix)}tufts.instanceMatrix.needsUpdate=true;group.add(tufts);
  const rocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,Math.max(1,specs.rocks.length));rocks.name='exterior-rocks';rocks.count=specs.rocks.length;specs.rocks.forEach((r,i)=>{dummy.position.set(r.x,r.height,r.z);dummy.rotation.set(0,0,0);dummy.scale.set(r.width,r.height,r.width*.75);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix)});rocks.instanceMatrix.needsUpdate=true;group.add(rocks);
  const fences=new THREE.InstancedMesh(geometry,fenceMaterial,Math.max(1,specs.fences.length*3));fences.name='exterior-fences';fences.count=specs.fences.length*3;n=0;for(const f of specs.fences){for(const [along,y,w,h] of [[0,1.05,.92,.07],[0,1.65,.92,.07],[-.40,1.35,.07,.68]]){dummy.position.set(f.x+.5+along,y,f.z+1.018);dummy.rotation.set(0,0,0);dummy.scale.set(w,h,.025);dummy.updateMatrix();fences.setMatrixAt(n++,dummy.matrix)}}fences.instanceMatrix.needsUpdate=true;group.add(fences);
  // Dress the existing solid border from its inside face; no new collision is introduced.
  const boundarySize=map.length,boundaryClosed=boundarySize>2&&map.every((row,z)=>row.length===boundarySize&&row[0]&&row[boundarySize-1]&&(z!==0&&z!==boundarySize-1||row.every(Boolean)));
  if(boundaryClosed){const pieces=[];for(let face=0;face<4;face++){const horizontal=face<2,edge=face===0||face===2?1.016:boundarySize-1.016;pieces.push({x:horizontal?boundarySize/2:edge,z:horizontal?edge:boundarySize/2,sx:horizontal?boundarySize-2:.032,sz:horizontal?.032:boundarySize-2,y:1.48,sy:.07});for(let along=4;along<boundarySize-2;along+=4)pieces.push({x:horizontal?along:edge,z:horizontal?edge:along,sx:horizontal?.07:.032,sz:horizontal?.032:.07,y:1.25,sy:.8})}let trim=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0x68736a}),pieces.length);trim.name='town-boundary-fence-trim';pieces.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(v.sx,v.sy,v.sz);dummy.updateMatrix();trim.setMatrixAt(i,dummy.matrix)});trim.instanceMatrix.needsUpdate=true;group.add(trim);
    const treetops=[];for(let face=0;face<4;face++)for(let along=4;along<boundarySize-4;along+=6){let seed=((along*73856093)^((face+1)*19349663))>>>0,offset=((seed%9)-4)*.22,h=2.4+((seed>>>4)%12)*.11,width=.8+((seed>>>9)%5)*.1,edge=face===0||face===2?-1.6:boundarySize+1.6;treetops.push({x:face<2?along+offset:edge,z:face<2?edge:along+offset,h,width,turn:((seed>>>13)%16)*.19,tint:(seed>>>18)%3})}let tops=new THREE.InstancedMesh(new THREE.ConeGeometry(.75,1,6),new THREE.MeshLambertMaterial({color:0xffffff}),treetops.length),tint=new THREE.Color(),palette=[0x485f55,0x52695c,0x40574e];tops.name='town-boundary-treetops';treetops.forEach((v,i)=>{dummy.position.set(v.x,2.5+v.h/2,v.z);dummy.rotation.set(0,v.turn,0);dummy.scale.set(v.width,v.h,v.width);dummy.updateMatrix();tops.setMatrixAt(i,dummy.matrix);tops.setColorAt(i,tint.set(palette[v.tint]))});tops.instanceMatrix.needsUpdate=true;if(tops.instanceColor)tops.instanceColor.needsUpdate=true;group.add(tops)}
  // Low distant ridges lie beyond the closed 64x64 boundary, never in playable space.
  const vertices=[],N=map.length,steps=16;function ridge(face){for(let j=0;j<steps;j++){let a=j*N/steps,b=(j+1)*N/steps,ha=5+2.3*Math.sin(j*.83+face)+1.1*Math.sin(j*1.71+face*.4),hb=5+2.3*Math.sin((j+1)*.83+face)+1.1*Math.sin((j+1)*1.71+face*.4),point=(v,y)=>face===0?[v,y,-8]:face===1?[v,y,N+8]:face===2?[-8,y,v]:[N+8,y,v],p=point(a,0),q=point(b,0),r=point(b,hb),t=point(a,ha);vertices.push(...p,...q,...r,...p,...r,...t)}}for(let f=0;f<4;f++)ridge(f);let horizonGeometry=new THREE.BufferGeometry();horizonGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));horizonGeometry.computeVertexNormals();let horizonMaterial=new THREE.MeshLambertMaterial({color:0x4e6664,side:THREE.DoubleSide}),horizon=new THREE.Mesh(horizonGeometry,horizonMaterial);horizon.name='distant-ridges';group.add(horizon);
  group.userData.specs=specs;return group;
}
export const ATMOSPHERE=Object.freeze({zenith:0x203342,horizon:0x74868a,fogNear:32,fogFar:84,hemiSky:0xc6d8d1,hemiGround:0x273b30,hemiIntensity:1.65,weaponHemiIntensity:1.85,sunColor:0xffddb0,sunIntensity:.85});
// Projectile life and speed set the maximum travel; each warning edge is clipped against walls.
export function eliteWarningLengths(e,trace,solid,speed=6,life=2,radius=.55){let max=Math.max(0,speed*life),sx=-e.specialDz*radius,sz=e.specialDx*radius,clip=(side,limit)=>{let x=e.x+sx*side,z=e.z+sz*side;if(side&&solid?.(x,z))return 0;let distance=trace?trace(x,z,e.specialDx,e.specialDz,limit).d:limit;return Math.max(0,Math.min(limit,Number.isFinite(distance)?distance:0))};let center=clip(0,max);return {left:clip(-1,center),center,right:clip(1,center),sx,sz}}
// Interaction labels use a ray to the near face (or item center), not through-wall billboards.
export function wallFacingPoint(x,z,px,pz){let cx=x+.5,cz=z+.5,dx=px-cx,dz=pz-cz;if(Math.abs(dx)>Math.abs(dz))return {x:x+(dx>0?1.04:-.04),z:Math.max(z+.1,Math.min(z+.9,pz))};return {x:Math.max(x+.1,Math.min(x+.9,px)),z:z+(dz>0?1.04:-.04)}}
export function labelPlacement(item,player,fovFactor,trace){let point=item.kind==='wall'?wallFacingPoint(item.x,item.z,player.x,player.z):{x:item.x,z:item.z},dx=point.x-player.x,dz=point.z-player.z,distance=Math.hypot(dx,dz),forward=dx*Math.sin(player.yaw)-dz*Math.cos(player.yaw),side=dx*Math.cos(player.yaw)+dz*Math.sin(player.yaw);if(distance<.15||distance>10||forward<=.2||Math.abs(side)>forward*fovFactor+.5)return null;if(trace){let ray=trace(player.x,player.z,dx/distance,dz/distance,distance);if(ray.type&&ray.d<distance-.03)return null}return {x:point.x,z:point.z,distance,forward,side,y:item.y??2.08}}
export function labelWorldWidth(forward,width,fovFactor){if(!(forward>0&&width>0&&fovFactor>0))return 0;return Math.max(.08,Math.min(1.4,150*forward/(width/(2*fovFactor))))}
const EMPTY=Object.freeze([]),COIN_GLYPH=Object.freeze([[-.12,.14,.17,.028,0],[-.035,.07,.028,.14,0],[-.12,0,.17,.028,0],[-.205,-.07,.028,.14,0],[-.12,-.14,.17,.028,0],[.12,0,.035,.25,.65],[.12,0,.035,.25,-.65]]),CACHE_FACES=Object.freeze([[-.46,0],[.46,0],[0,-.31],[0,.31]]),STATION_FACES=Object.freeze([[-.51,0],[.51,0],[0,-.51],[0,.51]]),WARNING_SIDES=Object.freeze([-1,0,1]),CACHE_KEYS=Object.freeze(['x','z','used']),STATION_KEYS=Object.freeze(['x','z','type']);
const colors = {1:0x455958,2:0x716953,3:0x817d6b,4:0x817d6b,5:0x70553c,6:0x817d6b,7:0x817d6b,8:0x817d6b,9:0x455958,10:0x677579,11:0x8d7863,12:0x827c70};
function box(group, geometry, color, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({color}));
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
}
// Materials are shared by the bounded pool; per-enemy flash swaps references instead of mutating shared colors.
function zombiePalette(){let mat=color=>new THREE.MeshLambertMaterial({color}),fabric=color=>new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0,vertexColors:true}),skinMat=color=>new THREE.MeshStandardMaterial({color,roughness:.98,metalness:0}),pants=fabric(0x46504c),dark=mat(0x28362e),patch=mat(0x865e50),hair=[mat(0x403b36),mat(0x62584b),mat(0x777970)];dark.vertexColors=patch.vertexColors=true;for(const material of hair){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1}return {skin:skinMat(0xb5ad96),handSkin:skinMat(0xa9a18d),socket:skinMat(0x625f55),lip:skinMat(0x817567),normal:[fabric(0x756069),fabric(0x657986),fabric(0x907860)],brute:fabric(0x895e50),workwear:fabric(0x6d6353),flanker:fabric(0x927c68),elite:fabric(0x887475),pants,pantsVariants:[pants,fabric(0x50545a),fabric(0x635a4d)],hair,dark,patch,impact:new THREE.MeshBasicMaterial({color:0xc49068}),lethalImpact:new THREE.MeshBasicMaterial({color:0xddb57e}),lantern:mat(0xb19a68),alert:mat(0xd0a276)}}
// Advance gait from actual displacement, not wall-clock time; pause freezes the pose.
export function advanceZombieGait(state,enemy,dt) {
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  if(state.enemy!==enemy||state.kind!==enemy.kind){state.enemy=enemy;state.kind=enemy.kind;state.x=enemy.x;state.z=enemy.z;state.phase=Number.isFinite(enemy.phase)?enemy.phase:0;state.amount=0;state.shoulder=0;state.bruteRoll=0;state.idlePhase=state.phase;state.idleWeight=0;state.leftStride=0;state.rightStride=0;const variant=Number.isFinite(enemy.variant)?Math.max(0,Math.min(1,enemy.variant)):.5;state.posture=(variant-.5)*.05;state.carriage=(variant-.5)*.12;state.strideScale=.94+.12*variant;state.dx=state.dz=0;state.reset=true;return state}
  if(dt===0){state.dx=state.dz=0;state.reset=false;return state}
  const dx=enemy.x-state.x,dz=enemy.z-state.z,distance=Math.hypot(dx,dz);state.x=enemy.x;state.z=enemy.z;state.reset=false;
  // Large relocation is a pool/spawn discontinuity, not a step.
  // Suppress tiny collision-separation jitter, but keep genuine travel distance-led.
  const travel=distance<=.5&&distance>dt*.025?distance:0,target=Math.min(1,travel/(dt*.8));state.dx=travel?dx:0;state.dz=travel?dz:0;
  // Ease into the first distance-driven step, then settle quickly when blocked.
  const blendRate=target>state.amount?8:20;state.amount=target+(state.amount-target)*Math.exp(-dt*blendRate);const idleTarget=travel===0?1:0;state.idleWeight=idleTarget+(state.idleWeight-idleTarget)*Math.exp(-dt*8);if(travel===0)state.idlePhase=(state.idlePhase+dt*1.1)%(Math.PI*2);state.phase=(state.phase+travel*(enemy.kind==='brute'?4.4:5.2))%(Math.PI*2);
  return state;
}
// Filter the distance-driven limb targets after irregular frames, without
// changing gait phase or buffering movement to replay after a pause.
export function advanceZombieStride(state,left,right,dt) {
  const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)),blend=1-Math.exp(-step*18);
  state.leftStride+=(left-state.leftStride)*blend;state.rightStride+=(right-state.rightStride)*blend;
  return state;
}
// Settled corpses contract toward their ground contact during their final .12s.
export function zombieCollapseEase(t,kind){t=Math.max(0,Math.min(1,t));if(kind==='brute')t=Math.pow(t,1.15);return t*t*t*(10+t*(-15+6*t))}
export function corpseCleanupScale(age){const t=Math.max(0,Math.min(1,(age-.78)/.12));return 1-t*t*(3-2*t)}
// Shared arithmetic helpers avoid allocating closures per visible actor/frame.
function zombieSole(angle){return .64-.59*Math.cos(angle)-.05*Math.sin(angle)-.06}
function zombieAngleDifference(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b))}
function zombieSmooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v)}
// Keep the lowest level boot on the flat town surface without moving the hitbox/head.
export function zombieFootGround(left,right,surface=.016) {
  return surface-Math.min(zombieSole(left),zombieSole(right));
}
// Visual heading follows actual path motion; blocked actors keep their last footing.
export function advanceZombieHeading(state,enemy,player,dt,attack=0) {
  const toward=Math.atan2(player.x-enemy.x,player.z-enemy.z),step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  if(state.reset||!Number.isFinite(state.heading)){state.heading=Number.isFinite(enemy.spawnHeading)?enemy.spawnHeading:toward;state.upper=0;state.turnStride=1;return state}
  if(!step)return state;
  const moving=Math.hypot(state.dx,state.dz)>1e-5,locked=enemy.kind==='elite'&&enemy.specialWindup>0&&Math.hypot(enemy.specialDx||0,enemy.specialDz||0)>.001,target=locked?Math.atan2(enemy.specialDx,enemy.specialDz):attack>0?toward:moving?Math.atan2(state.dx,state.dz):state.heading;
  // Shorten the cosmetic stride on sharp path changes; never alter world travel.
  const turn=moving?Math.abs(zombieAngleDifference(Math.atan2(state.dx,state.dz),state.heading)):0;
  state.turnStride=1-.35*Math.min(1,turn/(Math.PI/2));
  state.heading+=zombieAngleDifference(target,state.heading)*(1-Math.exp(-step*(attack>0?18:8)));
  const anticipate=moving||attack>0?Math.max(-.12,Math.min(.12,zombieAngleDifference(toward,state.heading)*.22)):0;
  state.upper+=(anticipate-state.upper)*(1-Math.exp(-step*7));
  return state;
}
// Windup peaks on the simulation's damage frame, then recovers over its lunge timer.
export function zombieAttackPose(enemy,out={},dt=0) {
  let strength=0,prepare=0;
  if(enemy.specialWindup>0){strength=1-Math.min(1,enemy.specialWindup/1.1);out.specialWas=true;out.specialRecovery=0}
  else {
    if(out.specialWas){out.specialWas=false;out.specialRecovery=.18}
    if(enemy.windup>0){const t=1-Math.min(1,enemy.windup/(enemy.windupMax||.5));strength=.4*zombieSmooth(t*2)+.6*zombieSmooth((t-.62)/.38);if(enemy.kind==='shambler'||enemy.kind==='brute')prepare=Math.sin(Math.PI*t)*(enemy.kind==='brute'?.04:.025)}
    else if(enemy.lunge>0){strength=zombieSmooth(enemy.lunge/.18);if(enemy.kind==='shambler'||enemy.kind==='brute')prepare=(enemy.kind==='brute'?.025:.018)*Math.sin(Math.PI*strength)}
    if(out.specialRecovery>0){strength=Math.max(strength,zombieSmooth(out.specialRecovery/.18));out.specialRecovery=Math.max(0,out.specialRecovery-Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)))}
  }
  // A windup can disappear without a lunge on a presentation/state reset. Ease
  // from the last pose rather than inventing a strike or changing combat state.
  if(out.wasWindup&&!(enemy.windup>0)&&!(enemy.lunge>0)&&!(enemy.specialWindup>0)){out.cancelTime=.16;out.cancelStrength=out.strength||0;out.cancelShoulder=out.shoulder||0}
  if(enemy.windup>0||enemy.lunge>0||enemy.specialWindup>0)out.cancelTime=0;
  let shoulder=(enemy.kind==='brute'?.09:.07)*strength+prepare;
  if(out.cancelTime>0){const blend=zombieSmooth(out.cancelTime/.16);strength=out.cancelStrength*blend;shoulder=out.cancelShoulder*blend;out.cancelTime=Math.max(0,out.cancelTime-Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)))}
  out.wasWindup=enemy.windup>0;out.strength=strength;out.lean=(enemy.kind==='brute'?.18:.16)*strength;out.shoulder=shoulder;return out;
}
// Blend reactions independently of navigation; rapid hits retarget rather than snap.
export function advanceZombieHit(state,enemy,dt) {
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  if(state.enemy!==enemy||state.kind!==enemy.kind){state.enemy=enemy;state.kind=enemy.kind;state.side=0;state.head=0}
  const intensity=Math.max(0,Math.min(1,(enemy.stagger||0)/.2));
  const side=(enemy.hitSide||1)*intensity,head=enemy.hitHead?intensity:0;
  const sideBlend=1-Math.exp(-dt*(side*state.side<0?16:intensity>Math.abs(state.side)?28:14));
  const headBlend=1-Math.exp(-dt*(head>state.head?28:14));
  state.side+=(side-state.side)*sideBlend;state.head+=(head-state.head)*headBlend;
  return state;
}
// Unit-height tapered torso with rounded corners; one shared mesh for the horde.
function roundedZombieGeometry(rings){const profile=[[-.36,-.5],[.36,-.5],[.5,-.32],[.5,.32],[.36,.5],[-.36,.5],[-.5,.32],[-.5,-.32]],vertices=[],indices=[];for(const [y,halfWidth,halfDepth] of rings)for(const [x,z] of profile)vertices.push(x*halfWidth*2,y,z*halfDepth*2);for(let r=0;r<rings.length-1;r++)for(let i=0;i<profile.length;i++){let next=(i+1)%profile.length,a=r*8+i,b=r*8+next,c=(r+1)*8+i,d=(r+1)*8+next;indices.push(a,c,b,b,c,d)}let bottom=vertices.length/3;vertices.push(0,-.5,0);let top=vertices.length/3;vertices.push(0,.5,0);for(let i=0;i<8;i++){let next=(i+1)%8;indices.push(bottom,i,next,top,(rings.length-1)*8+next,(rings.length-1)*8+i)}let result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));result.setIndex(indices);result.computeVertexNormals();return result}
// Soft, deterministic fabric variation stays in vertex colors; no per-zombie textures.
function shadeZombieFabric(geometry){const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){let shade=.965+.012*Math.sin(p.getY(i)*7)+.008*p.getX(i);colors[i*3]=colors[i*3+1]=colors[i*3+2]=shade}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry}
const ZOMBIE_TORSO_RINGS=[[-.5,.38,.43],[-.34,.40,.46],[.08,.46,.50],[.30,.50,.48],[.46,.43,.43],[.5,.35,.37]];
export function makeZombieTorsoGeometry(){return shadeZombieFabric(roundedZombieGeometry(ZOMBIE_TORSO_RINGS))}
function zombieRingValue(rings,y,axis){if(y<=rings[0][0])return rings[0][axis];for(let i=1;i<rings.length;i++)if(y<=rings[i][0]){let t=(y-rings[i-1][0])/(rings[i][0]-rings[i-1][0]);return rings[i-1][axis]+t*(rings[i][axis]-rings[i-1][axis])}return rings[rings.length-1][axis]}
function zombieShirtFront(y){let py=Math.max(-.5,Math.min(.5,(y-1.065)/.83)),depth=zombieRingValue(ZOMBIE_TORSO_RINGS,py,2);return .025+.36*depth*Math.cos(.09)+(y-1.065)*Math.sin(.09)}
// Shared, low-contrast vertex shading and fitted seams avoid per-zombie textures.
function shadeZombieClothDetail(g){let p=g.getAttribute('position'),colors=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){let v=.965+.008*Math.sin(p.getX(i)*19+p.getY(i)*7);colors[i*3]=colors[i*3+1]=colors[i*3+2]=v}g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g}
export function makeZombieSeamGeometry(){let positions=[],indices=[],ys=[.985,1.065,1.1314,1.314,1.415];for(const y of ys)positions.push(-.007,y,zombieShirtFront(y)+.010,.007,y,zombieShirtFront(y)+.010);for(let i=0;i<ys.length-1;i++){let a=i*2,b=a+1,c=a+2,d=a+3;indices.push(a,b,c,b,d,c)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return shadeZombieClothDetail(g)}
export function makeZombieHemGeometry(style){let positions=[],indices=[],xs=[-.14,-.07,0,.07,.14],patterns=[[-.002,.002,-.003,.001,-.001],[.001,-.002,.002,-.003,.001],[-.001,.002,0,-.002,.002]],offsets=patterns[style]||patterns[0];for(let i=0;i<xs.length;i++){let x=xs[i],top=.731,bottom=.710+offsets[i];positions.push(x,top,zombieShirtFront(top)+.010,x,bottom,zombieShirtFront(bottom)+.010)}for(let i=0;i<xs.length-1;i++){let a=i*2,b=a+1,c=a+2,d=a+3;indices.push(a,b,c,b,d,c)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return shadeZombieClothDetail(g)}
// Two shallow fitted panels share one mirrored mesh; lapels use a narrower strip.
export function makeZombieJacketGeometry(kind){let rows=kind==='lapel'?[[1.38,.035,.14],[1.19,.045,.15],[1.08,.06,.095]]:[[1.37,.035,.225],[1.11,.055,.24],[.75,.065,.18]],offset=kind==='lapel'?.014:.003,positions=[],indices=[];for(const [y,inner,outer] of rows)positions.push(inner,y,zombieShirtFront(y)+offset,outer,y,zombieShirtFront(y)+offset);for(let i=0;i<rows.length-1;i++){let a=i*2,b=a+1,c=a+2,d=a+3;indices.push(a,c,b,b,c,d)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return shadeZombieClothDetail(g)}

export function makeZombieLimbGeometry(kind){return shadeZombieFabric(roundedZombieGeometry(kind==='arm'?[[-.5,.30,.32],[-.39,.34,.35],[-.23,.42,.43],[-.06,.34,.35],[.08,.37,.39],[.27,.50,.50],[.5,.44,.46]]:[[-.5,.30,.32],[-.38,.33,.35],[-.22,.43,.45],[-.08,.35,.36],[.06,.37,.39],[.28,.48,.49],[.5,.50,.50]]))}
export function makeZombieWorkSleeveGeometry(){return roundedZombieGeometry([[-.5,.48,.48],[0,.5,.5],[.5,.48,.48]])}
// Shallow canvas apron and straps sit on the existing torso and follow its motion.
export function makeZombieBruteWorkwearGeometry(kind){let rows=kind==='strap'?[[.48,.24,.34],[.30,.24,.34],[.16,.21,.31]]:[[.30,-.36,.36],[.08,-.39,.39],[-.30,-.34,.34],[-.45,-.29,.29]],positions=[],indices=[];for(const [y,left,right] of rows){let z=zombieRingValue(ZOMBIE_TORSO_RINGS,y,2)+.025;positions.push(left,y,z,right,y,z)}for(let i=0;i<rows.length-1;i++){let a=i*2,b=a+1,c=a+2,d=a+3;indices.push(a,c,b,b,c,d)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g}
// Slim side seams follow the torso's rounded corners without covering moving limbs.
export function makeZombieFlankerSideGeometry(){let rows=[[.32,.37,.45],[.10,.35,.43],[-.28,.30,.37],[-.42,.28,.34]],positions=[],indices=[];for(const [y,inner,outer] of rows){let w=zombieRingValue(ZOMBIE_TORSO_RINGS,y,1),d=zombieRingValue(ZOMBIE_TORSO_RINGS,y,2);for(const x of [inner,outer]){let t=Math.max(0,Math.min(1,(x/w-.72)/.28)),z=d*(1-.36*t)+.025;positions.push(x,y,z)}}for(let i=0;i<rows.length-1;i++){let a=i*2,b=a+1,c=a+2,d=a+3;indices.push(a,c,b,b,c,d)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g}
// A small chamfered pocket follows the chest surface rather than floating as a block.
export function makeZombieWorkPocketGeometry(){let points=[[.09,1.19],[.105,1.165],[.155,1.165],[.17,1.19],[.17,1.275],[.09,1.275]],positions=[],indices=[];for(const [x,y] of points)positions.push(x,y,zombieShirtFront(y)+.006);for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return shadeZombieClothDetail(g)}
// Low-detail mitten with an integrated thumb; the opposite hand mirrors the same mesh.
export function makeZombieHandGeometry(){const shape=new THREE.Shape();shape.moveTo(-.32,-.45);shape.lineTo(.22,-.45);shape.lineTo(.27,-.20);shape.lineTo(.42,-.04);shape.lineTo(.44,.10);shape.lineTo(.38,.18);shape.lineTo(.27,.06);shape.lineTo(.27,.43);shape.lineTo(-.32,.43);shape.lineTo(-.39,.25);shape.lineTo(-.39,-.25);shape.closePath();let g=new THREE.ExtrudeGeometry(shape,{depth:.8,steps:1,bevelEnabled:true,bevelSegments:1,bevelThickness:.1,bevelSize:.05,curveSegments:1});g.translate(0,0,-.4);return g}
// A flat sole and raised heel flow into a rounded lower toe within the old shoe volume.
export function makeZombieShoeGeometry(){const shape=new THREE.Shape();shape.moveTo(-.45,-.45);shape.lineTo(.45,-.45);shape.lineTo(.45,-.14);shape.lineTo(.34,.05);shape.lineTo(-.12,.18);shape.lineTo(-.25,.45);shape.lineTo(-.45,.45);shape.closePath();let g=new THREE.ExtrudeGeometry(shape,{depth:.8,steps:1,bevelEnabled:true,bevelSegments:1,bevelThickness:.1,bevelSize:.05,curveSegments:1});g.translate(0,0,-.4);g.rotateY(-Math.PI/2);return g}
// A restrained rounded skull and narrower lower face stay within the original unit head bounds.
const ZOMBIE_SKULL_RINGS=[[-.5,.32,.34],[-.36,.38,.40],[-.18,.44,.46],[.12,.50,.50],[.30,.47,.48],[.44,.40,.43],[.5,.31,.34]];
export function makeZombieSkullGeometry(){return roundedZombieGeometry(ZOMBIE_SKULL_RINGS)}
// Three thin scalp-conforming hairstyles, including a broken sparse hairline.
export function makeZombieHairGeometry(style){const outline=[[-.36,-.5],[.36,-.5],[.5,-.32],[.5,.32],[.36,.5],[-.36,.5],[-.5,.32],[-.5,-.32]],segments=style===1?[0,1,4,5]:[0,1,2,3,4,5,6,7],positions=[],indices=[];for(let row=0;row<4;row++)for(const [x,z] of outline){let y=row===0?(style===2?.26+(x>0?.06:0):style===1?.35:.30):[0,.38,.46,.50][row],w=zombieRingValue(ZOMBIE_SKULL_RINGS,y,1),d=zombieRingValue(ZOMBIE_SKULL_RINGS,y,2);positions.push(x*2*w*1.012,y,z*2*d*1.012)}for(let row=0;row<3;row++)for(const i of segments){let next=(i+1)%8,a=row*8+i,b=row*8+next,c=(row+1)*8+i,d=(row+1)*8+next;indices.push(a,c,b,b,c,d)}if(style!==1){let center=positions.length/3;positions.push(0,.5,0);for(let i=0;i<8;i++)indices.push(center,24+(i+1)%8,24+i)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g}
function zombieSkullFront(y){let py=Math.max(-.5,Math.min(.5,(y-1.655)/.35));return .075+.30*zombieRingValue(ZOMBIE_SKULL_RINGS,py,2)}
// One immutable spawn seed yields stable combinations without rerolling pooled rigs.
export function zombieAppearance(seed,out={}){let v=Number.isFinite(seed)?Math.max(0,Math.min(1-Number.EPSILON,seed)):1-Number.EPSILON;out.outfit=v<.33?0:v<.66?1:2;out.hair=Math.floor(v*9)%3;out.coat=Math.floor(v*27)%3;out.pants=Math.floor(v*81)%3;return out}
// 3D head: 1.48..1.83; the opt-in simulation uses the same head region.
export function makeZombie(geometry = new THREE.BoxGeometry(1,1,1),palette = zombiePalette(),headGeometry = geometry,torsoGeometry = geometry,armGeometry = geometry,legGeometry = geometry,handGeometry = geometry,shoeGeometry = geometry,cuffGeometry = geometry,jacketGeometry = geometry,lapelGeometry = geometry,workPocketGeometry = geometry,workSleeveGeometry = geometry,skullGeometry = headGeometry,neckGeometry = geometry,hairGeometries = null,bruteApronGeometry = geometry,bruteStrapGeometry = geometry,flankerSideGeometry = geometry,seamGeometry = geometry,hemGeometries = null) {
  const root=new THREE.Group();
  const {skin,handSkin,socket,lip,pants,dark,patch,workwear}=palette,jacket=palette.normal[0];
  function part(parent,material,x,y,z,sx,sy,sz){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m}
  const torso=part(root,jacket,0,1.065,.025,.54,.83,.36);torso.geometry=torsoGeometry;torso.rotation.x=.09;
  const head=part(root,skin,0,1.655,.075,.30,.35,.30),collar=part(root,skin,0,1.425,.075,.20,.108,.21);head.geometry=skullGeometry;collar.geometry=neckGeometry;
  // Small localized cues share geometry and leave skin and clothing materials untouched.
  const bodyImpact=part(torso,palette.impact,0,.05,.51,.19,.10,.02),headImpact=part(head,palette.impact,0,-.08,.43,.23,.12,.035);bodyImpact.visible=headImpact.visible=false;
  // Positive Z is the face: the shared head hit box remains 1.48–1.83 high.
  // The face stays inside the same headshot-height envelope; no oversized features.
  const jaw=part(root,skin,0,1.55,.09,.24,.09,.25);jaw.geometry=headGeometry;
  const faceDetails=new THREE.Group();faceDetails.name='zombie-face-details';root.add(faceDetails);
  for(const side of [-1,1]){let eye=part(faceDetails,socket,side*.06,1.69,zombieSkullFront(1.69)+.004,.040,.018,.008);eye.name='zombie-eye'}
  let mouth=part(faceDetails,lip,0,1.555,.217,.065,.010,.006);mouth.name='zombie-mouth';
  let nose=part(faceDetails,skin,0,1.625,zombieSkullFront(1.625)+.006,.045,.060,.035);nose.name='zombie-nose';nose.geometry=headGeometry;
  const faces=[new THREE.Group(),new THREE.Group(),new THREE.Group()],hairPieces=[];
  for(let i=0;i<faces.length;i++){
    const face=faces[i];root.add(face);face.visible=false;
    let hair;if(hairGeometries){hair=new THREE.Mesh(hairGeometries[i],palette.hair[i]);hair.name='zombie-hair';hair.position.copy(head.position);hair.scale.copy(head.scale);face.add(hair)}else{hair=part(face,palette.hair[i],0,1.785,.075,i===0?.26:.29,.08,i===0?.26:.25);hair.name='zombie-hair';hair.geometry=headGeometry}hairPieces.push(hair);
    for(const side of [-1,1]){const brow=part(face,palette.hair[i],side*.06,1.72,zombieSkullFront(1.72)+.005,.052,.014,.010);brow.rotation.z=side*(i===0?.04:i===1?.12:-.10)}
  }
  // Three low-key civilian garments reuse the same body and per-enemy variant seed.
  const clothes=[new THREE.Group(),new THREE.Group(),new THREE.Group()];for(const group of clothes)root.add(group);
  function seam(group,material,x,y,sx,sy,angle=0){const m=part(group,material,x,y,zombieShirtFront(y)+.005,sx,sy,.008);m.rotation.set(.09,0,angle);return m}
  if(seamGeometry===geometry)seam(clothes[0],dark,0,1.20,.016,.43);else{let line=new THREE.Mesh(seamGeometry,dark);line.name='zombie-shirt-seam';line.userData.fittedPanel=true;line.scale.x=1.14;clothes[0].add(line)}seam(clothes[0],patch,-.11,1.35,.12,.018,-.16);seam(clothes[0],patch,.11,1.35,.12,.018,.16);
  seam(clothes[1],dark,-.11,1.28,.035,.31,-.18);seam(clothes[1],dark,.11,1.28,.035,.31,.18);const jacketHem=seam(clothes[1],jacket,0,.70,.38,.035);
  if(seamGeometry===geometry)seam(clothes[2],dark,0,1.18,.012,.42);else{let line=new THREE.Mesh(seamGeometry,dark);line.name='zombie-work-seam';line.userData.fittedPanel=true;line.scale.x=.86;clothes[2].add(line)}if(workPocketGeometry===geometry)seam(clothes[2],patch,.13,1.22,.10,.09);else{let pocket=new THREE.Mesh(workPocketGeometry,patch);pocket.name='zombie-work-pocket';pocket.userData.fittedPanel=true;clothes[2].add(pocket)}seam(clothes[2],dark,.13,1.275,.10,.012);
  for(let i=0;i<3;i++){let accent=i===1||i===2?patch:dark;seam(clothes[i],accent,-.075,1.39,.11,.018,-.32);seam(clothes[i],accent,.075,1.39,.11,.018,.32);if(hemGeometries){let hem=new THREE.Mesh(hemGeometries[i],accent);hem.name='zombie-fabric-hem';hem.userData.fittedPanel=true;clothes[i].add(hem)}else seam(clothes[i],accent,0,.72,.34,.018)}
  const jacketPanels=[];for(const side of [-1,1])for(const [shape,material,name] of [[jacketGeometry,jacket,'zombie-jacket-panel'],[lapelGeometry,dark,'zombie-jacket-lapel']]){if(shape===geometry)continue;let piece=new THREE.Mesh(shape,material);piece.name=name;piece.userData.jacketPanel=true;piece.scale.x=side;clothes[1].add(piece);if(name==='zombie-jacket-panel')jacketPanels.push(piece)}
  for(const group of clothes)group.visible=false;
  function limb(x,y,material,length,width,depth,shape){let pivot=new THREE.Group();pivot.position.set(x,y,0);root.add(pivot);pivot.userData.shell=part(pivot,material,0,-length/2,0,width,length,depth);pivot.userData.shell.geometry=shape;return pivot}
  const leftArm=limb(-.34,1.39,jacket,.61,.18,.23,armGeometry),rightArm=limb(.34,1.39,jacket,.61,.18,.23,armGeometry);leftArm.rotation.z=-.06;rightArm.rotation.z=.06;const sleeveCuffs=[leftArm,rightArm].map(arm=>{let cuff=part(arm,dark,0,-.56,0,.13,.17,.008);cuff.name='zombie-sleeve-cuff';cuff.geometry=cuffGeometry;cuff.rotation.x=Math.PI/2;cuff.visible=false;return cuff});const jacketShoulders=[leftArm,rightArm].map(arm=>{let shoulder=part(arm,jacket,0,-.02,0,.17,.10,.23);shoulder.name='zombie-jacket-shoulder';shoulder.geometry=headGeometry;shoulder.visible=false;return shoulder});const workSleeves=[leftArm,rightArm].map(arm=>{let sleeve=part(arm,patch,0,-.45,0,.15,.08,.20);sleeve.name='zombie-work-sleeve';sleeve.geometry=workSleeveGeometry;sleeve.visible=false;return sleeve});
  const leftHand=part(leftArm,handSkin,0,-.67,0,.18,.15,.22),rightHand=part(rightArm,handSkin,0,-.67,0,.18,.15,.22);leftHand.geometry=rightHand.geometry=handGeometry;if(handGeometry!==geometry)leftHand.scale.x=-.18;
  const leftLeg=limb(-.13,.64,pants,.54,.23,.29,legGeometry),rightLeg=limb(.13,.64,pants,.54,.23,.29,legGeometry);
  const leftFoot=part(leftLeg,dark,0,-.59,.05,.24,.12,.38),rightFoot=part(rightLeg,dark,0,-.59,.05,.24,.12,.38);leftFoot.geometry=rightFoot.geometry=shoeGeometry;
  // Role silhouettes stay outside the shared head volume, so headshots remain predictable.
  const bruteGear=new THREE.Group(),flankerGear=new THREE.Group(),eliteGear=new THREE.Group();torso.add(bruteGear,flankerGear,eliteGear);
  const bruteStraps=[];if(bruteApronGeometry!==geometry){let apron=new THREE.Mesh(bruteApronGeometry,workwear);apron.name='zombie-brute-workwear';bruteGear.add(apron);for(const side of [-1,1]){let strap=new THREE.Mesh(bruteStrapGeometry,workwear);strap.name='zombie-brute-strap';strap.scale.x=side;bruteGear.add(strap);bruteStraps.push(strap)}}
  const bruteShoulders=[leftArm,rightArm].map(arm=>{let shoulder=part(arm,workwear,0,-.035,0,.16,.10,.21);shoulder.name='zombie-brute-shoulder';shoulder.geometry=headGeometry;shoulder.visible=false;return shoulder});
  const flankerSeams=[];if(flankerSideGeometry!==geometry)for(const side of [-1,1]){let seam=new THREE.Mesh(flankerSideGeometry,patch);seam.name='zombie-flanker-side';seam.scale.x=side;flankerGear.add(seam);flankerSeams.push(seam)}
  // Compact field pack and insulated chest unit explain the ranged operator silhouette.
  const fieldPack=part(eliteGear,dark,0,.08,-.64,.68,.58,.30);fieldPack.name='zombie-elite-pack';fieldPack.geometry=headGeometry;
  const eliteHarness=[];if(bruteStrapGeometry!==geometry)for(const side of [-1,1]){let strap=new THREE.Mesh(bruteStrapGeometry,dark);strap.name='zombie-elite-harness';strap.scale.x=side;eliteGear.add(strap);eliteHarness.push(strap)}
  const lantern=part(eliteGear,palette.lantern,.20,.14,zombieRingValue(ZOMBIE_TORSO_RINGS,.14,2)+.015,.11,.13,.025);lantern.name='zombie-elite-coil';
  const eliteShoulders=[leftArm,rightArm].map(arm=>{let shoulder=part(arm,dark,0,-.025,0,.14,.10,.19);shoulder.name='zombie-elite-shoulder';shoulder.geometry=headGeometry;shoulder.visible=false;return shoulder});
  bruteGear.visible=flankerGear.visible=eliteGear.visible=false;
  root.userData={torso,head,collar,leftArm,rightArm,leftLeg,rightLeg,leftHand,rightHand,leftFoot,rightFoot,sleeveCuffs,jacketShoulders,workSleeves,bruteShoulders,eliteShoulders,bruteStraps,flankerSeams,eliteHarness,nose,groundParts:[torso,head,jaw,nose,collar,leftArm.userData.shell,rightArm.userData.shell,leftLeg.userData.shell,rightLeg.userData.shell,leftHand,rightHand,leftFoot,rightFoot,...jacketShoulders,...bruteShoulders,...eliteShoulders],bruteGear,flankerGear,eliteGear,lantern,clothes,faces,hairPieces,jacketHem,jacketPanels,faceDetails,jaw,bodyImpact,headImpact,appearance:{},detailNear:null,roleDetail:null,gait:{enemy:null,phase:0,amount:0,x:0,z:0},attackPose:{},hitPose:{enemy:null,side:0,head:0}};
  return root;
}
function cubicEase(x){return x*x*(3-2*x)}
function quinticEase(x){return x*x*x*(x*(x*6-15)+10)}
export function pistolReloadEnvelope(progress){let p=Math.max(0,Math.min(1,progress)),enter=Math.min(1,p/.08),exit=Math.min(1,(1-p)/.08);return Math.sin(Math.PI*p)*cubicEase(enter)*cubicEase(exit)}
export function pistolReloadStages(progress,out={}){let p=Math.max(0,Math.min(1,progress)),reach=p<.04?0:p<.25?quinticEase((p-.04)/.21):p<=.75?1:p<.96?quinticEase((.96-p)/.21):0,drop=p<.25||p>.75?0:p<.40?quinticEase((p-.25)/.15):p<=.60?1:quinticEase((.75-p)/.15);out.reach=reach;out.drop=drop;return out}
export function shotgunReloadStages(progress,out={}){let p=Math.max(0,Math.min(1,progress)),reach=p<.12?0:p<.25?quinticEase((p-.12)/.13):p<.5?1:p<.65?quinticEase((.65-p)/.15):0,pump=p<.65?0:p<.8?quinticEase((p-.65)/.15):p<.96?quinticEase((.96-p)/.16):0,insertion=p<.25?0:p<.5?quinticEase((p-.25)/.25):1,emerge=Math.max(0,Math.min(1,(p-.12)/.08));out.reach=reach;out.pump=pump;out.insertion=insertion;out.shell=p>.12&&p<.5;out.shellScale=quinticEase(emerge);return out}
// A tiny group movement accompanies seating, keeping the hands and ammunition together.
export function reloadSeating(progress,weapon){let p=Math.max(0,Math.min(1,progress)),start=weapon==='shotgun'?.46:.69,end=weapon==='shotgun'?.54:.77;if(p<=start||p>=end)return 0;let wave=Math.sin(Math.PI*(p-start)/(end-start));return wave*wave}
// Aim is already time-smoothed by input; do not ease it a second time.
export function easeSightAim(value){return Math.max(0,Math.min(1,Number.isFinite(value)?value:0))}
// Visual-only pistol recoil: the slide completes its cycle during the first half
// of the existing recoil decay, while the smaller whole-gun kick settles smoothly.
export function pistolRecoilPose(value,out={}){let r=Math.max(0,Math.min(1,Number.isFinite(value)?value:0)),kick=r*r,t=Math.max(0,Math.min(1,(r-.5)*2)),slide=t*t*(3-2*t);out.pitch=.065*kick;out.back=.027*kick;out.slide=.05*slide;return out}
// Fire-only pump timing stays inside the shotgun's shortest firing interval.
export function shotgunFirePose(elapsed,recoil,out={}){let r=Math.max(0,Math.min(1,Number.isFinite(recoil)?recoil:0)),t=Number.isFinite(elapsed)?elapsed:-1,pump=t<.10||t>=.43?0:t<.24?cubicEase((t-.10)/.14):cubicEase((.43-t)/.19);out.pitch=.082*r*r;out.back=.058*r*r;out.pump=pump;return out}
export function advanceShotgunCycle(state,{sequence=0,weapon='',reloading=0,dt=0,runSequence=0,age=null}={}){let changedRun=state.runSequence!==runSequence,changedWeapon=state.weapon!==weapon,shotAge=Number.isFinite(age)&&age>=0?age:null;if(changedRun||changedWeapon||reloading>0){state.elapsed=-1;state.sequence=sequence}else if(sequence!==state.sequence){state.sequence=sequence;state.elapsed=weapon==='shotgun'?(shotAge??0):-1}else if(state.elapsed>=0)state.elapsed=shotAge??(state.elapsed+Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0)));state.weapon=weapon;state.runSequence=runSequence;return state.elapsed}
// Presentation only: the camera and simulation aim never move with these offsets.
export function resetWeaponMotion(state){state.phase=0;state.amount=0;state.sprint=0;state.dash=0;state.firing=0;state.reload=0;state.motionScale=1;state.reduced=false;return state}
export function advanceWeaponMotion(state,{dt=0,speed=0,sprinting=false,dashing=false,aim=0,firing=false,reloading=false,reloadProgress=0,reloadEnvelope=null,reduced=false}={},out={}) {
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));speed=Math.max(0,Number.isFinite(speed)?speed:0);
  const target=Math.min(1,speed/6.3),decay=Math.exp(-dt*10),previousAmount=state.amount;
  // Integrate the smoothed movement envelope, so different frame steps trace the same sway.
  state.amount=target+(previousAmount-target)*decay;
  const sprintTarget=sprinting&&!firing?1:0,sprintDecay=Math.exp(-dt*(sprintTarget?7:14));
  state.sprint=sprintTarget+(state.sprint-sprintTarget)*sprintDecay;
  state.firing=(firing?1:0)+((state.firing||0)-(firing?1:0))*decay;
  const reloadTarget=reloading?(reloadEnvelope??pistolReloadEnvelope(reloadProgress)):0;state.reload=reloadTarget+((state.reload||0)-reloadTarget)*decay;
  state.dash=(dashing?1:0)+(state.dash-(dashing?1:0))*decay;
  // Keep sprint and dash upgrades from accelerating the cosmetic gait beyond normal sprint.
  state.phase+=(4.5+Math.min(speed,6.3)*.65)*(target*dt+(previousAmount-target)*(1-decay)/10);
  const motionTarget=reduced?0:1;if(!Number.isFinite(state.motionScale))state.motionScale=motionTarget;if(dt===0&&state.reduced!==reduced)state.motionScale=motionTarget;else state.motionScale=motionTarget+(state.motionScale-motionTarget)*Math.exp(-18*dt);if(Math.abs(state.motionScale-motionTarget)<.0001)state.motionScale=motionTarget;state.reduced=reduced;
  const unaimed=1-Math.max(0,Math.min(1,aim)),strength=state.motionScale*unaimed*unaimed*(1-.7*state.firing)*(1-.7*state.reload),wave=Math.sin(state.phase),bob=Math.cos(state.phase*2)-1;
  out.x=(wave*.012*state.amount+.008*state.sprint)*strength;out.y=(bob*.0035*state.amount-.065*state.sprint-.025*state.dash)*strength;out.roll=(wave*.012*state.amount+.008*state.sprint)*strength;out.pitch=(.034*state.sprint+.028*state.dash)*strength;return out;
}
// Cosmetic only: a shot or reload immediately reveals the actual selected weapon.
export function advanceWeaponSwitch(state,{weapon,dt=0,runSequence=0,shotSequence=0,reloading=0,reduced=false,age=null}={},out={}) {
  const step=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0)),wallAge=Number.isFinite(age)&&age>=0?age:null;
  if(state.runSequence!==runSequence || state.target==null) {
    state.runSequence=runSequence;state.target=weapon;state.from=weapon;state.elapsed=.16;state.shotSequence=shotSequence;
  } else if(state.target!==weapon) {
    state.from=state.elapsed<.08?state.from:state.target;state.target=weapon;state.elapsed=wallAge??(step>0?0:.16);
  }
  if(shotSequence!==state.shotSequence || reloading>0 || reduced) state.elapsed=.16;
  state.shotSequence=shotSequence;
  state.elapsed=Math.min(.16,wallAge===null?state.elapsed+step:Math.max(state.elapsed,wallAge));
  const phase=state.elapsed/.16,t=phase<.35?phase/.35:phase>.65?(1-phase)/.35:1,lower=t<=0?0:t>=1?1:t*t*(3-2*t);
  out.weapon=phase<.5?state.from:state.target;out.lower=lower;return out;
}
// Compute reload placements together so hand, ammunition and pump cannot drift apart.
export function weaponReloadPose(progress, reloading, firePump=0, out={shotgun:{},magazine:{}}) {
  const shotgun=shotgunReloadStages(progress,out.shotgun),pistol=pistolReloadStages(progress,out.magazine);
  const pump=reloading>0?shotgun.pump:firePump;
  const shellY=-.125+.10*shotgun.insertion;
  const handY=-.135+.030*(shotgun.insertion**2*(3-2*shotgun.insertion));
  // Move sideways only while the magazine is fully clear of the well.
  const p=Math.max(0,Math.min(1,progress));let magazineShift=p<.40||p>.60?0:p<.47?(p-.40)/.07:p<=.53?1:(.60-p)/.07;
  magazineShift=magazineShift**3*(magazineShift*(magazineShift*6-15)+10)*.10;
  out.shotgun=shotgun;out.pump=pump;out.shellY=shellY;out.handY=handY;out.magazine=pistol;out.magazineShift=magazineShift;return out;
}
function updateWeaponFlash(flash,timer){const intensity=.7+.3*Math.min(1,timer/.045),dimensions=flash.userData.flashDimensions;flash.scale.set(dimensions[0]*intensity,dimensions[1]*intensity,dimensions[2]*intensity)}
// Create non-indexed surfaces once per model; scene disposal deduplicates shared geometry.
function flatSurfaceGeometry(vertices) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  return geometry;
}
// Shared profile primitives keep fitted frame surfaces and their cap winding consistent.
function fittedVertex(outline,station,index){const [z,x,y]=station,[px,py]=outline[index];return [px*x,py*y,z]}
function fittedTriangle(vertices,a,b,c){vertices.push(...a,...b,...c)}
function fittedQuad(vertices,a,b,c,d){fittedTriangle(vertices,a,b,c);fittedTriangle(vertices,a,c,d)}
function fittedCaps(vertices,outline,stations){const first=stations[0],last=stations[stations.length-1];for(let j=0;j<outline.length;j++){const k=(j+1)%outline.length;fittedTriangle(vertices,[0,0,first[0]],fittedVertex(outline,first,k),fittedVertex(outline,first,j));fittedTriangle(vertices,[0,0,last[0]],fittedVertex(outline,last,j),fittedVertex(outline,last,k))}}
// Small deterministic grain maps are shared by the matching stock and fore-end.
function shotgunWoodMaps() {
  const width=32,height=64,color=new Uint8Array(width*height*4),roughness=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const warp=Math.sin(y*.11)*.38+Math.sin(y*.045)*.21,grain=Math.sin(x*.83+warp)*3+Math.sin(x*2.13+warp*.7)*1.5;
    const c=Math.round(245+grain),r=Math.round(247+grain*.65),i=(y*width+x)*4;
    color[i]=color[i+1]=color[i+2]=c;color[i+3]=255;
    roughness[i]=roughness[i+1]=roughness[i+2]=r;roughness[i+3]=255;
  }
  function texture(data,colorSpace){const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);t.colorSpace=colorSpace;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t}
  return {color:texture(color,THREE.SRGBColorSpace),roughness:texture(roughness,THREE.NoColorSpace)};
}
// Low-contrast, mipmapped striations run along the weapon's long axis.
function brushedSteelMaps() {
  const width=64,height=32,color=new Uint8Array(width*height*4),roughness=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x*2*Math.PI/width,v=y*2*Math.PI/height,grain=1.25*Math.sin(u*5+.12*Math.sin(v))+.75*Math.sin(u*11);
    const c=Math.round(251+grain),r=Math.round(250+grain*.5),i=(y*width+x)*4;
    color[i]=color[i+1]=color[i+2]=c;color[i+3]=255;roughness[i]=roughness[i+1]=roughness[i+2]=r;roughness[i+3]=255;
  }
  function texture(data,space){const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);t.colorSpace=space;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,1);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t}
  return {color:texture(color,THREE.SRGBColorSpace),roughness:texture(roughness,THREE.NoColorSpace)};
}
// Use physical dimensions along the long axis; map end faces in their own plane.
function applyBrushedUV(geometry,width,height,length) {
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=new Float32Array(p.count*2),wear=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i)),endFace=nz>Math.max(nx,ny);
    const transverse=endFace||ny>=nx?x*width:y*height;
    uv[i*2]=transverse/.16;uv[i*2+1]=(endFace?y*height:p.getZ(i)*length)/.16;
    // Edges retain the base finish while broad faces are marginally darker.
    const edge=Math.max(0,Math.min(1,(Math.abs(x)+Math.abs(y)-.5)/.36)),shade=.96+.029*edge+.006*Math.abs(n.getY(i));
    wear[i*3]=shade;wear[i*3+1]=shade*.997;wear[i*3+2]=shade*.99;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.BufferAttribute(wear,3));return geometry;
}
// The front sight top sits at y=.06 in both models; ADS places it on the camera axis.
export function makeViewmodel(geometry = new THREE.BoxGeometry(1,1,1)) {
  const root=new THREE.Group();root.name='viewmodel';root.scale.x=.78;
  const material=(color,roughness=.88,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,depthTest:true,depthWrite:true,transparent:false,blending:THREE.NoBlending,fog:false});
  const steel=material(0x293532,.82,.48),edge=material(0x46544e,.78,.5),receiverSteel=material(0x293532,.88,.48),slideSteel=material(0x46544e,.80,.5),barrelSteel=material(0x303b39,.84,.5),dark=material(0x151d1b,.93,.16),recess=material(0x101815,.97,.08),wood=material(0x634f3d,.97),pistolPolymer=material(0x514a3f,.98),pistolPanel=material(0x62594a,.99),glove=material(0x555e4e,.98),gloveReinforced=material(0x41493d,.94),brass=material(0x9b845d,.78,.4),shellCasing=material(0x79564c,.88);
  const shotgunGrain=shotgunWoodMaps();wood.map=shotgunGrain.color;wood.roughnessMap=shotgunGrain.roughness;
  const steelGrain=brushedSteelMaps();for(const finish of [receiverSteel,slideSteel,barrelSteel]){finish.map=steelGrain.color;finish.roughnessMap=steelGrain.roughness}receiverSteel.vertexColors=slideSteel.vertexColors=true;
  function part(parent,mat,name,x,y,z,sx,sy,sz){let m=new THREE.Mesh(geometry,mat);m.name=name;m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.renderOrder=100+Math.round((z+2)*100);parent.add(m);return m}
  const profile=new THREE.Shape();profile.moveTo(-.5,-.36);profile.lineTo(-.36,-.5);profile.lineTo(.36,-.5);profile.lineTo(.5,-.36);profile.lineTo(.5,.36);profile.lineTo(.36,.5);profile.lineTo(-.36,.5);profile.lineTo(-.5,.36);profile.closePath();
  const receiverGeometry=new THREE.ExtrudeGeometry(profile,{depth:1,steps:1,bevelEnabled:false});receiverGeometry.translate(0,0,-.5);
  // Pistol slide narrows at its muzzle and rear, leaving the round barrel distinct.
  const slideOutline=[[-.5,-.36],[-.36,-.5],[.36,-.5],[.5,-.36],[.5,.36],[.36,.5],[-.36,.5],[-.5,.36]],slideStations=[[-.5,.72,.80],[-.32,1,1],[.32,1,1],[.5,.84,.90]],slideVertices=[];
  // The lower frame follows the slide's chamfered profile and eases into the barrel.
  function fittedFrameGeometry(){
    const stations=[[-.5,.82,1.05],[-.33,1,1],[.30,1,1],[.5,.90,.95]],vertices=[];
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<8;j++){let k=(j+1)%8,a=fittedVertex(slideOutline,stations[i],j),b=fittedVertex(slideOutline,stations[i],k),c=fittedVertex(slideOutline,stations[i+1],k),d=fittedVertex(slideOutline,stations[i+1],j);fittedQuad(vertices,a,b,c,d)}
    fittedCaps(vertices,slideOutline,stations);
    return flatSurfaceGeometry(vertices);
  }
  const pistolFrameGeometry=applyBrushedUV(fittedFrameGeometry(),.11,.082,.34),pistolLowerGeometry=applyBrushedUV(pistolFrameGeometry.clone(),.095,.035,.30);
  function slideVertex(station,index){return fittedVertex(slideOutline,station,index)}
  function slideQuad(a,b,c,d){fittedQuad(slideVertices,a,b,c,d)}
  for(let r=0;r<slideStations.length-1;r++)for(let j=0;j<8;j++){
    let k=(j+1)%8,a=slideVertex(slideStations[r],j),b=slideVertex(slideStations[r],k),c=slideVertex(slideStations[r+1],k),d=slideVertex(slideStations[r+1],j);
    if(r!==1||j!==3){slideQuad(a,b,c,d);continue}
    // A real cutout in the right slide wall, with shallow recessed edge walls.
    const x=.5,inner=.39,z0=.02,z1=.28,y0=-.27,y1=.27;
    function strip(zA,zB,yA,yB){slideQuad([x,yA,zA],[x,yB,zA],[x,yB,zB],[x,yA,zB])}
    strip(-.32,z0,-.36,.36);strip(z1,.32,-.36,.36);strip(z0,z1,-.36,y0);strip(z0,z1,y1,.36);
    slideQuad([x,y0,z0],[inner,y0,z0],[inner,y1,z0],[x,y1,z0]);slideQuad([inner,y0,z1],[x,y0,z1],[x,y1,z1],[inner,y1,z1]);
    slideQuad([x,y0,z1],[inner,y0,z1],[inner,y0,z0],[x,y0,z0]);slideQuad([x,y1,z0],[inner,y1,z0],[inner,y1,z1],[x,y1,z1]);
  }
  fittedCaps(slideVertices,slideOutline,slideStations);
  const pistolSlideGeometry=applyBrushedUV(flatSurfaceGeometry(slideVertices),.103,.028,.32);
  // A chamfered, gently tapered action with a genuine underside loading opening.
  const actionVertices=[],actionOutline=[[-.5,-.34],[-.40,-.5],[.40,-.5],[.5,-.34],[.5,.34],[.40,.5],[-.40,.5],[-.5,.34]],actionStations=[[-.5,.90,1],[-.34,1,1],[.32,1,1],[.5,.90,.95]];
  function actionVertex(station,index){return fittedVertex(actionOutline,station,index)}
  function actionQuad(a,b,c,d){fittedQuad(actionVertices,a,b,c,d)}
  for(let i=0;i<actionStations.length-1;i++)for(let j=0;j<8;j++){
    const k=(j+1)%8,a=actionVertex(actionStations[i],j),b=actionVertex(actionStations[i],k),c=actionVertex(actionStations[i+1],k),d=actionVertex(actionStations[i+1],j);
    if(i!==1||j!==1){actionQuad(a,b,c,d);continue}
    // The middle underside surrounds the open port, rather than covering it with a decal.
    function bottom(x0,x1,z0,z1){actionQuad([x0,-.5,z0],[x1,-.5,z0],[x1,-.5,z1],[x0,-.5,z1])}
    bottom(-.40,-.34,-.34,.32);bottom(.34,.40,-.34,.32);bottom(-.34,.34,-.34,-.16);bottom(-.34,.34,.22,.32);
  }
  fittedCaps(actionVertices,actionOutline,actionStations);
  const shotgunActionGeometry=applyBrushedUV(flatSurfaceGeometry(actionVertices),.108,.086,.34);
  const barrelGeometry=new THREE.CylinderGeometry(.5,.5,1,10),openBarrelGeometry=new THREE.CylinderGeometry(.5,.5,1,16,1,true),innerBoreGeometry=new THREE.CylinderGeometry(.32,.32,1,16,1,true);
  const boreWall=material(0x111c1b,.9,.08);boreWall.side=THREE.BackSide;
  function barrel(parent,mat,name,z,diameter,length,y=-.012,open=false){let m=new THREE.Mesh(open?openBarrelGeometry:barrelGeometry,mat);m.name=name;m.position.set(0,y,z);m.rotation.x=Math.PI/2;m.scale.set(diameter,length,diameter);parent.add(m);return m}
  const muzzleRingGeometry=new THREE.RingGeometry(.32,.5,16),boreGeometry=new THREE.CircleGeometry(.32,16);
  // Rim and recessed bore face outward (-Z); the barrel end has no cap.
  function muzzleFace(parent,name,z,y,diameter){let ring=new THREE.Mesh(muzzleRingGeometry,edge),bore=new THREE.Mesh(boreGeometry,dark),inner=new THREE.Mesh(innerBoreGeometry,boreWall);ring.name=name;ring.position.set(0,y,z);ring.rotation.y=Math.PI;ring.scale.set(diameter,diameter,1);bore.name=name+'-bore';bore.position.set(0,y,z+.012);bore.rotation.y=Math.PI;bore.scale.set(diameter,diameter,1);inner.name=name+'-inner';inner.position.set(0,y,z+.006);inner.rotation.x=Math.PI/2;inner.scale.set(diameter,.012,diameter);parent.add(ring,bore,inner)}
  const beadGeometry=new THREE.SphereGeometry(.5,10,6),sightProfile=new THREE.Shape();sightProfile.moveTo(-.32,-.5);sightProfile.lineTo(.32,-.5);sightProfile.lineTo(.32,-.18);sightProfile.lineTo(.46,-.05);sightProfile.lineTo(.46,.22);sightProfile.lineTo(.28,.5);sightProfile.lineTo(-.28,.5);sightProfile.lineTo(-.46,.22);sightProfile.lineTo(-.46,-.05);sightProfile.lineTo(-.32,-.18);sightProfile.closePath();
  const sightGeometry=new THREE.ExtrudeGeometry(sightProfile,{depth:1,bevelEnabled:false});sightGeometry.translate(0,0,-.5);
  function sight(parent,z,name,bead=false){if(bead){let m=new THREE.Mesh(beadGeometry,edge);m.name=name;m.position.set(0,.054,z);m.scale.setScalar(.012);m.renderOrder=100+Math.round((z+2)*100);parent.add(m);return}const post=part(parent,dark,name,0,.0355,z,.015,.049,.028);post.geometry=sightGeometry;part(parent,edge,name+'-mark',0,.052,z+.0146,.004,.004,.001)}
  // Shared softly chamfered glove and rounded thumb forms retain the existing contact groups.
  const gloveOutline=new THREE.Shape();gloveOutline.moveTo(-.50,-.30);gloveOutline.lineTo(-.38,-.48);gloveOutline.lineTo(.25,-.50);gloveOutline.lineTo(.46,-.32);gloveOutline.lineTo(.48,.24);gloveOutline.lineTo(.25,.47);gloveOutline.lineTo(-.22,.50);gloveOutline.lineTo(-.47,.31);gloveOutline.closePath();
  const gloveGeometry=new THREE.ExtrudeGeometry(gloveOutline,{depth:1,bevelEnabled:false});gloveGeometry.translate(0,0,-.5);
  const fingerGeometry=new THREE.SphereGeometry(.5,10,8);
  function hands(parent,supportZ,sideGrip=false){
    const grip=new THREE.Group(),support=new THREE.Group();grip.name='grip-hand-group';support.name='support-hand-group';parent.add(grip,support);
    grip.position.set(.055,-.14,-.32);support.position.set(-.085,-.10,supportZ);
    const palm=part(grip,gloveReinforced,'grip-hand',sideGrip?.016:0,0,0,sideGrip?.045:.10,.11,.13);palm.geometry=gloveGeometry;
    const fingers=part(grip,glove,'grip-fingers',sideGrip?-.112:-.059,.015,.01,sideGrip?.018:.055,.055,.09);fingers.geometry=fingerGeometry;fingers.rotation.z=sideGrip?-.10:.10;
    if(sideGrip){const wrap=part(grip,gloveReinforced,'grip-backstrap-wrap',-.055,0,.094,.14,.06,.022);wrap.geometry=gloveGeometry}
    const gripCuff=part(grip,glove,'grip-cuff',sideGrip?.016:.012,-.078,.055,sideGrip?.07:.09,.07,.11);gripCuff.geometry=gloveGeometry;gripCuff.rotation.z=-.12;
    const supportPalm=part(support,gloveReinforced,'support-hand',0,0,0,.10,.075,.16);supportPalm.geometry=gloveGeometry;
    const thumb=part(support,glove,'support-thumb',.055,.012,-.015,.035,.035,.10);thumb.geometry=fingerGeometry;thumb.rotation.y=-.16;
    const supportCuff=part(support,glove,'support-cuff',-.018,-.044,.08,.085,.06,.11);supportCuff.geometry=gloveGeometry;supportCuff.rotation.z=.12;
    const knuckles=part(grip,glove,'grip-knuckles',sideGrip?.016:0,.048,-.015,sideGrip?.035:.08,.016,.07);knuckles.geometry=fingerGeometry;
    const supportKnuckles=part(support,glove,'support-knuckles',0,.032,-.025,.08,.014,.065);supportKnuckles.geometry=fingerGeometry;
    return {grip,support};
  }
  // Smooth thin curves end inside their receivers rather than floating below them.
  function curvedTriggerPart(parent,name,points,radius){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'),mesh=new THREE.Mesh(new THREE.TubeGeometry(path,40,radius,8,false),dark);mesh.name=name;parent.add(mesh);return mesh}
  const pistol=new THREE.Group();pistol.name='pistol';root.add(pistol);
  let pistolReceiver=part(pistol,receiverSteel,'pistol-receiver',0,-.025,-.40,.11,.082,.34);pistolReceiver.geometry=pistolFrameGeometry;
  const pistolSlide=new THREE.Group();pistolSlide.name='pistol-slide-group';pistol.add(pistolSlide);let slideBody=part(pistolSlide,slideSteel,'pistol-slide',0,.025,-.42,.103,.028,.32);slideBody.geometry=pistolSlideGeometry;
  let pistolFrame=part(pistol,receiverSteel,'pistol-frame',0,-.061,-.38,.095,.035,.30);pistolFrame.geometry=pistolLowerGeometry;
  // Flush, non-interactive controls follow the existing left-side frame surfaces.
  const stopShape=new THREE.Shape();stopShape.moveTo(-.021,-.004);stopShape.lineTo(.013,-.004);stopShape.lineTo(.022,-.001);stopShape.lineTo(.022,.002);stopShape.lineTo(-.021,.003);stopShape.closePath();
  const slideStop=new THREE.Mesh(new THREE.ShapeGeometry(stopShape),dark);slideStop.name='pistol-slide-stop';slideStop.position.set(-.05525,-.028,-.38);slideStop.rotation.y=-Math.PI/2;pistol.add(slideStop);
  const ejection=new THREE.Mesh(new THREE.PlaneGeometry(.0832,.01512),recess);ejection.name='pistol-ejection-port';ejection.position.set(.04017,.025,-.372);ejection.rotation.y=Math.PI/2;pistolSlide.add(ejection);
  // Four fine rear grooves on each side follow the tapered slide surface.
  const serrationVertices=[];function slideSideX(z){return .103*(.5-.08*Math.max(0,Math.min(1,(z+.3176)/.0576)))}
  for(const side of [-1,1])for(const z of [-.309,-.297,-.285,-.273])for(const [y,dz] of [[-.006,-.002],[.006,.002]]){let zz=z+dz;serrationVertices.push(side*(slideSideX(zz)+.0004),.025+y,zz)}
  const serrationGeometry=new THREE.BufferGeometry();serrationGeometry.setAttribute('position',new THREE.Float32BufferAttribute(serrationVertices,3));
  const serrationMaterial=new THREE.LineBasicMaterial({color:0x17211e,fog:false,depthTest:true,depthWrite:true}),serrations=new THREE.LineSegments(serrationGeometry,serrationMaterial);serrations.name='pistol-slide-serrations';pistolSlide.add(serrations);
  barrel(pistol,barrelSteel,'pistol-barrel',-.66,.048,.25,-.012,true);
  muzzleFace(pistol,'pistol-muzzle',-.785,-.012,.048);
  let gripGeometry=new THREE.LatheGeometry([new THREE.Vector2(.37,-.5),new THREE.Vector2(.48,-.38),new THREE.Vector2(.46,-.1),new THREE.Vector2(.41,.2),new THREE.Vector2(.34,.5)],12),pistolGrip=new THREE.Mesh(gripGeometry,pistolPolymer);pistolGrip.name='pistol-grip';pistolGrip.position.set(0,-.13,-.31);pistolGrip.scale.set(.095,.20,.10);pistolGrip.rotation.x=-.16;pistol.add(pistolGrip);
  // The open lathed grip receives a thin downward-facing well rim and a dark recess.
  const wellRimGeometry=new THREE.RingGeometry(.32,.37,24),wellInnerGeometry=new THREE.CircleGeometry(.315,24),wellRim=new THREE.Mesh(wellRimGeometry,edge),wellInterior=new THREE.Mesh(wellInnerGeometry,recess);wellRim.name='pistol-mag-well';wellRim.position.y=-.499;wellRim.rotation.x=Math.PI/2;wellInterior.name='pistol-mag-well-interior';wellInterior.position.y=.10;wellInterior.rotation.x=Math.PI/2;pistolGrip.add(wellRim,wellInterior);
  const wellWallMaterial=material(0x101815,.97,.08);wellWallMaterial.side=THREE.BackSide;const wellWall=new THREE.Mesh(new THREE.CylinderGeometry(.315,.315,.6,24,1,true),wellWallMaterial);wellWall.name='pistol-mag-well-wall';wellWall.position.y=-.20;pistolGrip.add(wellWall);
  // Three molded inserts follow the faceted grip surface, offset less than a millimeter.
  const panelVertices=[],panelRings=[[.48,-.38],[.46,-.1],[.41,.2]],panelAngles=[Math.PI/3,Math.PI/2,2*Math.PI/3];
  function panelPoint(ring,angle){const [radius,y]=ring,r=radius+.003;return [Math.sin(angle)*r,y,Math.cos(angle)*r]}
  for(let y=0;y<panelRings.length-1;y++)for(let a=0;a<panelAngles.length-1;a++){
    const p0=panelPoint(panelRings[y],panelAngles[a]),p1=panelPoint(panelRings[y],panelAngles[a+1]),p2=panelPoint(panelRings[y+1],panelAngles[a+1]),p3=panelPoint(panelRings[y+1],panelAngles[a]);panelVertices.push(...p0,...p1,...p2,...p0,...p2,...p3);
  }
  const panelGeometry=flatSurfaceGeometry(panelVertices);
  for(const [name,angle,material] of [['pistol-grip-panel-right',0,pistolPanel],['pistol-grip-panel-left',Math.PI,pistolPanel],['pistol-backstrap',-Math.PI/2,dark]]){const panel=new THREE.Mesh(panelGeometry,material);panel.name=name;panel.rotation.y=angle;pistolGrip.add(panel)}
  // The release sits on the grip's existing faceted curvature, not on a raised block.
  const releaseVertices=[],releasePhi=3*Math.PI/2,step=Math.PI/6;
  function releasePoint(phi,y){
    const radius=.41+(y-.2)/.3*(.34-.41),lower=phi<releasePhi?releasePhi-step:releasePhi,upper=lower+step,t=(phi-lower)/step;
    return [radius*(Math.sin(lower)*(1-t)+Math.sin(upper)*t)-.003,y,radius*(Math.cos(lower)*(1-t)+Math.cos(upper)*t)];
  }
  const releaseCenter=releasePoint(releasePhi,.30);for(let i=0;i<12;i++){const a=i*2*Math.PI/12,b=(i+1)*2*Math.PI/12;fittedTriangle(releaseVertices,releaseCenter,releasePoint(releasePhi+.13*Math.cos(a),.30+.028*Math.sin(a)),releasePoint(releasePhi+.13*Math.cos(b),.30+.028*Math.sin(b)))}
  const magazineRelease=new THREE.Mesh(flatSurfaceGeometry(releaseVertices),dark);magazineRelease.name='pistol-mag-release';pistolGrip.add(magazineRelease);
  curvedTriggerPart(pistol,'pistol-trigger',[[0,-.076,-.422],[0,-.091,-.422],[0,-.108,-.416],[0,-.119,-.407]],.0025);
  // The magazine follows the grip axis; its tapered top clears the open well.
  const magProfile=new THREE.Shape();magProfile.moveTo(-.5,-.5);magProfile.lineTo(.5,-.5);magProfile.lineTo(.5,.24);magProfile.lineTo(.38,.5);magProfile.lineTo(-.38,.5);magProfile.lineTo(-.5,.24);magProfile.closePath();
  const magGeometry=new THREE.ExtrudeGeometry(magProfile,{depth:1,bevelEnabled:false});magGeometry.translate(0,0,-.5);
  const pistolMagazine=new THREE.Group(),magazinePivot=new THREE.Group();pistolMagazine.name='pistol-magazine';magazinePivot.name='pistol-magazine-axis';pistol.add(pistolMagazine);pistolMagazine.add(magazinePivot);magazinePivot.position.set(0,-.226,-.2945);magazinePivot.rotation.x=-.16;
  const magazineBody=part(magazinePivot,dark,'pistol-mag-body',0,.0495,0,.04,.085,.043);magazineBody.geometry=magGeometry;
  const magazineBase=part(magazinePivot,dark,'pistol-mag-base',0,0,0,.07,.014,.075);magazineBase.geometry=barrelGeometry;
  curvedTriggerPart(pistol,'pistol-trigger-guard',[[0,-.075,-.49],[0,-.095,-.49],[0,-.13,-.477],[0,-.148,-.45],[0,-.148,-.415],[0,-.13,-.386],[0,-.10,-.37],[0,-.075,-.37]],.0025);
  sight(pistol,-.76,'pistol-front-sight');
  for(const side of [-1,1]){const wing=part(pistolSlide,dark,'pistol-rear-wing',side*.027,.047,-.30,.012,.026,.029);wing.geometry=sightGeometry;part(pistolSlide,edge,'pistol-rear-sight-mark',side*.027,.050,-.2849,.0035,.0035,.001)}
  const pistolHands=hands(pistol,-.54,true);
  const shotgun=new THREE.Group();shotgun.name='shotgun';root.add(shotgun);
  let shotgunReceiver=part(shotgun,receiverSteel,'shotgun-receiver',0,-.025,-.39,.108,.086,.34);shotgunReceiver.geometry=shotgunActionGeometry;
  let shotgunTop=part(shotgun,slideSteel,'shotgun-receiver-top',0,.025,-.39,.084,.02,.31);shotgunTop.geometry=applyBrushedUV(receiverGeometry,.084,.02,.31);
  for(const side of [-1,1])part(shotgun,steel,side<0?'shotgun-action-bottom':'shotgun-action-rail',side*.048,-.075,-.39,.01,.025,.26);
  part(shotgun,dark,'shotgun-ejection-port',.055,-.0135,-.36,.003,.026,.11);
  // Sloped rim and inward-facing walls leave space for the shell all the way in.
  const lipVertices=[],wellVertices=[],outer=.03672,inner=.033,z0=-.4444,z1=-.3152,near=-.438,far=-.321,lower=-.068,upper=-.063,ceiling=.012;
  fittedQuad(lipVertices,[-outer,lower,z0],[outer,lower,z0],[inner,upper,near],[-inner,upper,near]);
  fittedQuad(lipVertices,[-inner,upper,far],[inner,upper,far],[outer,lower,z1],[-outer,lower,z1]);
  fittedQuad(lipVertices,[-outer,lower,z0],[-inner,upper,near],[-inner,upper,far],[-outer,lower,z1]);
  fittedQuad(lipVertices,[inner,upper,near],[outer,lower,z0],[outer,lower,z1],[inner,upper,far]);
  fittedQuad(wellVertices,[-inner,upper,near],[-inner,ceiling,near],[-inner,ceiling,far],[-inner,upper,far]);
  fittedQuad(wellVertices,[inner,upper,far],[inner,ceiling,far],[inner,ceiling,near],[inner,upper,near]);
  fittedQuad(wellVertices,[-inner,upper,near],[inner,upper,near],[inner,ceiling,near],[-inner,ceiling,near]);
  fittedQuad(wellVertices,[inner,upper,far],[-inner,upper,far],[-inner,ceiling,far],[inner,ceiling,far]);
  const portLip=new THREE.Mesh(flatSurfaceGeometry(lipVertices),steel),portWalls=new THREE.Mesh(flatSurfaceGeometry(wellVertices),recess);portLip.name='shotgun-loading-lip';portWalls.name='shotgun-loading-walls';shotgun.add(portLip,portWalls);
  let loadingPort=new THREE.Mesh(new THREE.PlaneGeometry(.066,.117),recess);loadingPort.name='shotgun-loading-port';loadingPort.position.set(0,ceiling,-.3795);loadingPort.rotation.x=Math.PI/2;shotgun.add(loadingPort);
  barrel(shotgun,barrelSteel,'shotgun-barrel',-.78,.052,.58,-.005,true);
  barrel(shotgun,edge,'shotgun-barrel-rib',-.78,.008,.52,.0245);
  muzzleFace(shotgun,'shotgun-muzzle',-1.07,-.005,.052);
  barrel(shotgun,steel,'shotgun-mag-tube',-.715,.033,.63,-.071);
  barrel(shotgun,dark,'shotgun-tube-cap',-1.035,.039,.018,-.071);
  // One thin bridge embraces the barrel and magazine tube without filling either silhouette.
  const bridgeShape=new THREE.Shape();bridgeShape.moveTo(-.036,-.097);bridgeShape.quadraticCurveTo(-.039,-.105,-.027,-.105);bridgeShape.lineTo(.027,-.105);bridgeShape.quadraticCurveTo(.039,-.105,.036,-.097);bridgeShape.lineTo(.036,.019);bridgeShape.quadraticCurveTo(.036,.029,.026,.029);bridgeShape.lineTo(-.026,.029);bridgeShape.quadraticCurveTo(-.036,.029,-.036,.019);bridgeShape.closePath();
  for(const [y,r] of [[-.005,.0275],[-.071,.018]]){let hole=new THREE.Path();hole.absarc(0,y,r,0,Math.PI*2,true);bridgeShape.holes.push(hole)}
  const bridgeGeometry=new THREE.ExtrudeGeometry(bridgeShape,{depth:.018,bevelEnabled:false,curveSegments:12});bridgeGeometry.translate(0,0,-.009);let bridge=new THREE.Mesh(bridgeGeometry,steel);bridge.name='shotgun-barrel-band';bridge.position.z=-.93;shotgun.add(bridge);
  // One tapered stock narrows into the action and widens toward the butt.
  const stockProfile=[new THREE.Vector2(.27,-.5),new THREE.Vector2(.29,-.41),new THREE.Vector2(.36,-.28),new THREE.Vector2(.44,.12),new THREE.Vector2(.48,.4),new THREE.Vector2(.44,.5)],stockGeometry=new THREE.LatheGeometry(stockProfile,12),shotgunStock=new THREE.Mesh(stockGeometry,wood);shotgunStock.name='shotgun-stock';shotgunStock.position.set(0,-.09,-.20);shotgunStock.rotation.x=Math.PI/2;shotgunStock.scale.set(.105,.27,.125);shotgun.add(shotgunStock);
  // The pad follows the elliptical stock end, with a softly tapered heel.
  const padProfile=[new THREE.Vector2(.44,-.5),new THREE.Vector2(.46,-.38),new THREE.Vector2(.45,.28),new THREE.Vector2(.40,.5)],padGeometry=new THREE.LatheGeometry(padProfile,12),buttPad=new THREE.Mesh(padGeometry,dark);buttPad.name='shotgun-stock-pad';buttPad.position.set(0,-.09,-.054);buttPad.rotation.x=Math.PI/2;buttPad.scale.set(.105,.022,.125);shotgun.add(buttPad);
  curvedTriggerPart(shotgun,'shotgun-trigger-guard',[[.041,-.066,-.405],[.041,-.09,-.405],[.041,-.13,-.405],[.041,-.165,-.405],[.035,-.178,-.405],[0,-.178,-.39],[0,-.178,-.32],[0,-.178,-.27],[0,-.14,-.235],[0,-.10,-.235],[0,-.066,-.235]],.0028);
  curvedTriggerPart(shotgun,'shotgun-trigger',[[.041,-.066,-.358],[.014,-.070,-.358],[0,-.078,-.358],[0,-.098,-.358],[0,-.114,-.3575]],.0023);
  const pump=new THREE.Group();pump.name='shotgun-pump';pump.position.set(0,-.075,-.64);shotgun.add(pump);
  // A shallow six-flute profile tapers into flush, open end caps around the tube.
  const foreProfile=[new THREE.Vector2(.44,-.5),new THREE.Vector2(.49,-.44),new THREE.Vector2(.5,-.28),new THREE.Vector2(.5,.28),new THREE.Vector2(.49,.44),new THREE.Vector2(.44,.5)],foreGeometry=new THREE.LatheGeometry(foreProfile,12),forePosition=foreGeometry.getAttribute('position');
  for(let i=0;i<forePosition.count;i++){const x=forePosition.getX(i),y=forePosition.getY(i),z=forePosition.getZ(i),angle=Math.atan2(x,z),weight=Math.max(0,Math.min(1,(.5-Math.abs(y))/.06)),factor=1-.012*(.5+.5*Math.cos(6*angle))*weight;forePosition.setXYZ(i,x*factor,y,z*factor)}foreGeometry.computeVertexNormals();
  const foreNormals=foreGeometry.getAttribute('normal'),seamOffset=12*foreProfile.length;for(let i=0;i<foreProfile.length;i++){const j=seamOffset+i,x=foreNormals.getX(i)+foreNormals.getX(j),y=foreNormals.getY(i)+foreNormals.getY(j),z=foreNormals.getZ(i)+foreNormals.getZ(j),length=Math.hypot(x,y,z)||1;foreNormals.setXYZ(i,x/length,y/length,z/length);foreNormals.setXYZ(j,x/length,y/length,z/length)}
  const foreEnd=barrel(pump,wood,'shotgun-foreend',-.162,.09,.22,0);foreEnd.geometry=foreGeometry;
  const capGeometry=new THREE.RingGeometry(.24,.44,12);
  for(const [name,z,angle] of [['shotgun-foreend-front-cap',-.272,Math.PI],['shotgun-foreend-rear-cap',-.052,0]]){const cap=new THREE.Mesh(capGeometry,dark);cap.name=name;cap.position.z=z;cap.rotation.y=angle;cap.scale.set(.09,.09,1);pump.add(cap)}
  const beadMount=part(shotgun,steel,'shotgun-sight-mount',0,.0385,-1.01,.008,.021,.008);beadMount.geometry=barrelGeometry;
  sight(shotgun,-1.01,'shotgun-front-sight',true);
  for(const side of [-1,1])part(shotgun,dark,'shotgun-rear-wing',side*.027,.047,-.29,.012,.026,.035);
  const shotgunHands=hands(shotgun,-.802);
  const shotgunShell=new THREE.Group();shotgunShell.name='shotgun-reload-shell';shotgun.add(shotgunShell);barrel(shotgunShell,shellCasing,'shotgun-shell-body',0,.035,.06,0);barrel(shotgunShell,brass,'shotgun-shell-base',.034,.038,.012,0);shotgunShell.rotation.x=Math.PI/2;shotgunShell.visible=false;
  const flashShape=new THREE.OctahedronGeometry(1,0),flashMaterial=new THREE.MeshBasicMaterial({color:0xffd38a,transparent:true,opacity:.8,depthTest:true,depthWrite:false});
  // Narrow, forward-directed flashes sit just beyond each actual muzzle rim.
  function muzzle(parent,z,y,width,height,length){let m=new THREE.Mesh(flashShape,flashMaterial);m.position.set(0,y,z);m.userData.flashDimensions=[width,height,length];m.scale.set(width,height,length);m.renderOrder=1000;m.visible=false;parent.add(m);return m}
  const pistolFlash=muzzle(pistol,-.805,-.012,.021,.017,.026),shotgunFlash=muzzle(shotgun,-1.10,-.005,.036,.028,.042);
  shotgun.visible=false;root.userData={pistol,shotgun,pump,pistolSlide,pistolMagazine,pistolHands,shotgunHands,shotgunShell,pistolFlash,shotgunFlash};return root;
}
// A fixed, room-volume approximation attenuates only direct sunlight. It does not
// cast dynamic shadows, and leaves hemisphere fill and the isolated weapon untouched.
// The 0.55-unit feather stays inside each room; no exterior pixels are darkened.
export function roomSunBounds(buildings=[]){return [...OUTPOST_ROOFS.map(r=>({x0:r.x0+1.2,x1:r.x1-1.2,z0:r.z0+1.2,z1:r.z1-1.2})),...buildings.map(b=>({x0:b.x0+1,x1:b.x1,z0:b.z0+1,z1:b.z1}))].filter(r=>r.x1>r.x0&&r.z1>r.z0).slice(0,8)}
const roomSunHooks=new WeakMap();
export function applyRoomSunOcclusion(material,bounds){if(!material||(!material.isMeshLambertMaterial&&!material.isMeshStandardMaterial)||roomSunHooks.get(material)===material.onBeforeCompile)return;const priorHook=material.onBeforeCompile,priorKey=material.customProgramCacheKey(),rooms=bounds.map(r=>`roomSun=max(roomSun,smoothstep(0.0,0.55,min(min(vRoomWorld.x-${r.x0.toFixed(3)},${r.x1.toFixed(3)}-vRoomWorld.x),min(vRoomWorld.z-${r.z0.toFixed(3)},${r.z1.toFixed(3)}-vRoomWorld.z))));`).join('\n');material.onBeforeCompile=function(shader,renderer){priorHook.call(this,shader,renderer);const vertex=shader.vertexShader,fragment=shader.fragmentShader,chunk=THREE.ShaderChunk.lights_fragment_begin,direct='getDirectionalLightInfo( directionalLight, directLight );';if(!oneShaderToken(vertex,'#include <common>')||!oneShaderToken(vertex,'#include <begin_vertex>')||!oneShaderToken(fragment,'#include <common>')||!oneShaderToken(fragment,'#include <lights_fragment_begin>')||!oneShaderToken(chunk,direct)){warnShaderFallback('room sunlight');return}shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoomWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 roomLocal=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nroomLocal=instanceMatrix*roomLocal;\n#endif\nvRoomWorld=(modelMatrix*roomLocal).xyz;');let directional=THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',`getDirectionalLightInfo( directionalLight, directLight );\n{\nfloat roomSun=0.0;\n${rooms}\nroomSun*=step(-0.05,vRoomWorld.y)*(1.0-smoothstep(2.30,2.45,vRoomWorld.y));\ndirectLight.color*=mix(1.0,0.32,roomSun);\n}`);shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoomWorld;').replace('#include <lights_fragment_begin>',directional)};material.customProgramCacheKey=()=>`room-sun-v4:${rooms}:${priorKey}`;roomSunHooks.set(material,material.onBeforeCompile);material.userData.roomSunOcclusion=true;material.needsUpdate=true}
// Locally generated ashlar: varied roughly 0.4–0.8 m stone lengths per
// 2.40 m tile, and four 0.30 m courses per 1.20 m. No photo pixels are used.
export function createCityHallStoneTextures() {
  const size=128,color=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4);
  const widths=[[24,38,28,38],[37,25,39,27],[31,41,22,34],[43,24,35,26]],shifts=[0,13,7,22];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const course=Math.floor(y/32),yy=y%32,xx=(x+shifts[course])%size;let col=0,start=0;while(col<3&&xx>=start+widths[course][col])start+=widths[course][col++];const within=xx-start,blockWidth=widths[course][col];
    const joint=yy<2||within<1,edge=Math.min(yy,31-yy,within,blockWidth-1-within),stone=((course*29+col*17)%19)-9;
    const relief=Math.sin((within+course*5)*.27)*3+Math.cos((yy+col*7)*.31)*2+Math.sin((within+yy)*.13)*2;
    // Slightly weathered mortar stays confined to the actual joint lines.
    const value=joint?165:Math.max(205,Math.min(244,226+stone+relief)),bump=joint?68:Math.max(90,Math.min(225,171+stone*2+relief*3+Math.min(3,edge)*7));
    const warmth=((course*13+col*5)%7)-3,i=(y*size+x)*4;color[i]=Math.max(0,Math.min(255,value+warmth));color[i+1]=Math.max(0,value-2);color[i+2]=Math.max(0,Math.min(255,value-8-warmth));color[i+3]=255;height[i]=height[i+1]=height[i+2]=bump;height[i+3]=255;
  }
  const make=(data,name,colorSpace)=>{let texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.name=name;texture.colorSpace=colorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture};
  return {color:make(color,'city-hall-ashlar-color',THREE.SRGBColorSpace),height:make(height,'city-hall-ashlar-relief',THREE.NoColorSpace)};
}

function applyCityHallStone(stone,center) {
  const textures=createCityHallStoneTextures();stone.map=textures.color;stone.bumpMap=textures.height;stone.bumpScale=.026;
  const prior=stone.onBeforeCompile,priorKey=stone.customProgramCacheKey();
  stone.onBeforeCompile=function(shader,renderer){
    prior.call(this,shader,renderer);
    const token='#include <uv_vertex>';
    const declarations=THREE.ShaderChunk.uv_pars_vertex;
    if(!oneShaderToken(shader.vertexShader,token)||!oneShaderToken(shader.vertexShader,'#include <common>')||!oneShaderToken(shader.fragmentShader,'#include <common>')||!oneShaderToken(shader.fragmentShader,'#include <map_fragment>')||!oneShaderToken(declarations,'vMapUv')||!oneShaderToken(declarations,'vBumpMapUv')){if(!this.userData.ashlarWarning){this.userData.ashlarWarning=true;console.warn('City Hall stone: UV shader hook unavailable; using default mapping')}return}
    // World-aligned course height continues around exterior corners and into
    // reveals. This building is static and its meshes use no skinning.
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCityWeatherPosition;').replace(token,`${token}\n{\nvec3 cityPosition=(modelMatrix*vec4(position,1.0)).xyz;\nvCityWeatherPosition=cityPosition;\nvec3 cityNormal=abs(normalize(mat3(modelMatrix)*normal));\nvec2 cityPlane=cityNormal.y>max(cityNormal.x,cityNormal.z)?cityPosition.xz:(cityNormal.x>cityNormal.z?cityPosition.zy:cityPosition.xy);\nvec2 cityUV=cityPlane/vec2(2.4,1.2);\n#ifdef USE_MAP\nvMapUv=cityUV;\n#endif\n#ifdef USE_BUMPMAP\nvBumpMapUv=cityUV;\n#endif\n}`);
    // East and north faces receive a modest smooth darkening, based on the
    // reported 2024 views. It is a color treatment, not modeled damage.
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCityWeatherPosition;').replace('#include <map_fragment>',`#include <map_fragment>\nfloat cityWeather=max(smoothstep(1.0,8.0,vCityWeatherPosition.x-${center[0].toFixed(3)}),smoothstep(1.0,8.0,${center[1].toFixed(3)}-vCityWeatherPosition.z));\ndiffuseColor.rgb*=1.0-0.12*cityWeather;`);
  };
  stone.customProgramCacheKey=()=>`city-hall-ashlar-v3:${center[0].toFixed(3)}:${center[1].toFixed(3)}:${priorKey}`;stone.needsUpdate=true;
}

// Original procedural clay pans: four 0.20 m pans across and four 0.28 m
// courses per repeat. Smooth periodic ridges suggest curved caps; a narrow
// horizontal lip separates courses without a checkerboard texture.
export function createCityHallRoofTextures() {
  const size=128,color=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const col=Math.floor(x/32),course=Math.floor(y/32),within=(x%32+.5)/32,row=y%32;
    // A rounded raised cap between shallow pans, repeated on a 0.20 m pitch.
    const cap=Math.exp(-Math.pow((within-.5)/.17,2)),curve=.45*Math.cos((within-.5)*Math.PI*2)+.55*(2*cap-1),joint=row<2,lip=row>=2&&row<5,variation=((col*11+course*5)%7)-3,aging=(col*7+course*3)%11===0?3:0;
    const value=joint?177:Math.max(195,Math.min(238,219+variation+curve*7+(lip?4:0)));
    const relief=joint?90:Math.max(95,Math.min(235,157+curve*49+(lip?15:0)));
    const i=(y*size+x)*4;color[i]=value;color[i+1]=Math.min(255,Math.max(0,value-5+aging));color[i+2]=Math.min(255,Math.max(0,value-9+aging));color[i+3]=255;height[i]=height[i+1]=height[i+2]=relief;height[i+3]=255;
  }
  const make=(data,name,colorSpace)=>{const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.name=name;t.colorSpace=colorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t};
  return {color:make(color,'city-hall-clay-color',THREE.SRGBColorSpace),height:make(height,'city-hall-clay-relief',THREE.NoColorSpace)};
}

// Map each roof face in its actual plane: one axis across the slope and one
// along it. This retains physical tile scale even on steep join triangles.
function setCityHallRoofUV(geometry,angle) {
  const p=geometry.getAttribute('position'),uv=new Float32Array(p.count*2),c=Math.cos(angle),s=Math.sin(angle);let refU=0,refV=0,refY=0;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);refU+=x*c+z*s;refV+=-x*s+z*c;refY+=p.getY(i)}refU/=p.count;refV/=p.count;refY/=p.count;
  for(let i=0;i<p.count;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),d=new THREE.Vector3().fromBufferAttribute(p,i+2),n=b.clone().sub(a).cross(d.clone().sub(a)).normalize();if(n.y<0)n.negate();
    const nu=n.x*c+n.z*s,nv=-n.x*s+n.z*c,horizontal=Math.hypot(nu,nv),flat=horizontal<.045,du=flat?0:nu/horizontal,dv=flat?1:nv/horizontal;
    // Texture V increases downhill; the orthogonal U axis runs across tiles.
    for(let j=0;j<3;j++){const x=p.getX(i+j),z=p.getZ(i+j),u=x*c+z*s-refU,v=-x*s+z*c-refV,y=p.getY(i+j)-refY;uv[(i+j)*2]=(-dv*u+du*v)/.8;uv[(i+j)*2+1]=(flat?v:(u*du+v*dv)*n.y-y*horizontal)/1.12}
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}

// Raised seams are shared edges with descending roof faces on both sides.
// Caps are a single instanced batch, not one draw call per tile or edge.
function cityHallRidgeSegments(vertices) {
  const edges=new Map(),key=p=>p.map(v=>v.toFixed(4)).join(',');
  for(let i=0;i<vertices.length;i+=9){
    const p=[0,1,2].map(j=>vertices.slice(i+j*3,i+j*3+3)),a=new THREE.Vector3(...p[0]),b=new THREE.Vector3(...p[1]),c=new THREE.Vector3(...p[2]),normal=b.sub(a).cross(c.sub(a)).normalize();if(normal.y<0)normal.negate();
    for(let j=0;j<3;j++){const a=p[j],b=p[(j+1)%3],other=p[(j+2)%3],ka=key(a),kb=key(b),id=ka<kb?ka+'|'+kb:kb+'|'+ka;if(!edges.has(id))edges.set(id,[]);edges.get(id).push({a,b,other,normal})}
  }
  const segments=[];for(const pair of edges.values())if(pair.length===2){
    const {a,b}=pair[0],mid=(a[1]+b[1])/2,len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const n0=new THREE.Vector3(pair[0].normal.x,0,pair[0].normal.z),n1=new THREE.Vector3(pair[1].normal.x,0,pair[1].normal.z);
    if(len>.25&&n0.lengthSq()>1e-8&&n1.lengthSq()>1e-8&&n0.normalize().dot(n1.normalize())<0&&pair.every(e=>e.other[1]<mid-.01))segments.push([a,b]);
  }
  return segments;
}

// The footprint is sourced from OSM; vertical dimensions are provisional.
// The four raised corner pavilions and shallow hipped roofs follow the 2016
// photo and preservation descriptions. The closed mass retains collision.
export function buildSonomaCityHall(building, stone, paths=[]) {
  const group=new THREE.Group();group.name='sonoma-building-'+building.id;
  const xs=building.coordinates.map(p=>p[0]),zs=building.coordinates.map(p=>p[1]);applyCityHallStone(stone,[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2]);
  const shape=new THREE.Shape();building.coordinates.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const cap=new THREE.Mesh(new THREE.ShapeGeometry(shape),stone);cap.rotation.x=-Math.PI/2;cap.position.y=7.4;cap.name='city-hall-core-cap';group.add(cap);
  // The four inward-facing central edges of this specific OSM ring form the
  // bays between its corner pavilions. Windows/doors remain collision-solid.
  const ring=building.coordinates,arcadeEdges=new Set([0,5,10,15]),dark=new THREE.MeshLambertMaterial({color:0x303630,side:THREE.DoubleSide});
  const pavilionEdges=new Set([2,3,7,8,12,13,17,18]),wallVertices=[],recessVertices=[],arcadeReveals=[],windowGlass=[],windowFrames=[],windowReveals=[],upperBlinds=[],upperBlindsMuted=[],upperBlindSlats=[],lowerGlass=[],lowerFrames=[],lowerReveals=[],lowerBlinds=[],lowerBlindSlats=[],entryDoors=[],entryFrames=[],southPanels=[],southPanelInsets=[],southGlazing=[],eastPanels=[],eastPanelInsets=[],eastStraps=[],eastGlazing=[],northPanels=[],northInsets=[],northHandles=[],northGlazing=[],northLanding=[],bedSoil=[],bedCurbs=[],bedPlants=[],bedStems=[],ashlarTrim=[];
  const glassMaterial=new THREE.MeshLambertMaterial({color:0x394e4b,side:THREE.DoubleSide}),frameMaterial=new THREE.MeshLambertMaterial({color:0xc3beb0,side:THREE.DoubleSide}),doorMaterial=new THREE.MeshLambertMaterial({color:0x263a39,side:THREE.DoubleSide});
  const trimMaterial=new THREE.MeshLambertMaterial({color:0xa7a094,side:THREE.DoubleSide}),copingMaterial=new THREE.MeshLambertMaterial({color:0x80796d,side:THREE.DoubleSide}),blindMaterial=new THREE.MeshLambertMaterial({color:0xb4b5a6,side:THREE.DoubleSide}),blindMutedMaterial=new THREE.MeshLambertMaterial({color:0xaeb1a3,side:THREE.DoubleSide}),blindShadeMaterial=new THREE.MeshLambertMaterial({color:0x969b8e,side:THREE.DoubleSide}),panelInsetMaterial=new THREE.MeshLambertMaterial({color:0xa5a99a,side:THREE.DoubleSide}),landingMaterial=new THREE.MeshLambertMaterial({color:0x97968b,side:THREE.DoubleSide}),soilMaterial=new THREE.MeshLambertMaterial({color:0x625e50,side:THREE.DoubleSide});
  // An arched outline traversed from the bottom left. The actual wall receives
  // this as a hole; the opaque glazing and frame are set inside that opening.
  function windowOutline(path,center,radius,bottom,spring){path.moveTo(center-radius,bottom);path.lineTo(center+radius,bottom);path.lineTo(center+radius,spring);for(let i=1;i<=12;i++){let t=i*Math.PI/12;path.lineTo(center+radius*Math.cos(t),spring+radius*Math.sin(t))}path.lineTo(center-radius,bottom);path.closePath();return path}
  function appendGeometry(g,matrix,out){let flat=g.index?g.toNonIndexed():g;flat.applyMatrix4(matrix);let p=flat.getAttribute('position');for(let i=0;i<p.count;i++)out.push(p.getX(i),p.getY(i),p.getZ(i));flat.dispose();if(flat!==g)g.dispose()}
  function pathClear(a,b,clearance=.95){const dist=(p,u,v)=>{const dx=v[0]-u[0],dz=v[1]-u[1],d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dz)/d)):0;return Math.hypot(p[0]-u[0]-dx*t,p[1]-u[1]-dz*t)},cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);for(const route of paths){const [u,v]=route.coordinates||[];if(!u||!v)continue;const intersects=cross(a,b,u)*cross(a,b,v)<=0&&cross(u,v,a)*cross(u,v,b)<=0;if(intersects||Math.min(dist(a,u,v),dist(b,u,v),dist(u,a,b),dist(v,a,b))<clearance)return false}return true}
  let area=0;for(let i=1;i<ring.length;i++)area+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];
  // One shallow dressed-stone course follows the real footprint, including
  // the recess returns. Mitered corners meet without overlapping face strips.
  const cornerCount=ring.length-1,inward=(a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);return area>0?[-dz/d,dx/d]:[dz/d,-dx/d]},bandOut=[];
  for(let i=0;i<cornerCount;i++){const p=ring[i],before=inward(ring[(i+cornerCount-1)%cornerCount],p),after=inward(p,ring[(i+1)%cornerCount]),den=1+before[0]*after[0]+before[1]*after[1],offset=.045/Math.max(.1,den);bandOut.push([p[0]-(before[0]+after[0])*offset,p[1]-(before[1]+after[1])*offset])}
  const bandQuad=(a,b,c,d)=>ashlarTrim.push(...a,...b,...c,...a,...c,...d),bandPoint=(p,y)=>[p[0],y,p[1]];
  for(let i=0;i<cornerCount;i++){const j=(i+1)%cornerCount,a=bandPoint(ring[i],3.7375),b=bandPoint(ring[j],3.7375),c=bandPoint(bandOut[j],3.7375),d=bandPoint(bandOut[i],3.7375),e=bandPoint(ring[i],3.7625),f=bandPoint(ring[j],3.7625),h=bandPoint(bandOut[j],3.7625),k=bandPoint(bandOut[i],3.7625);bandQuad(d,c,h,k);bandQuad(e,k,h,f);bandQuad(a,b,c,d)}
  for(let edge=0;edge<ring.length-1;edge++){
    const a=ring[edge],b=ring[edge+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)continue;
    const nx=(area>0?-dz:dz)/length,nz=(area>0?dx:-dx)/length,rotation=-Math.atan2(dz,dx);
    const trimPoint=(x,y,offset)=>[a[0]+dx/length*x+nx*offset,y,a[1]+dz/length*x+nz*offset];
    if(pavilionEdges.has(edge)){
      // Low, non-colliding planting edges stay against existing solid walls;
      // omit a bed if its strip would encroach on a mapped pedestrian path.
      const w=Math.min(3.6,length*.55),p=trimPoint((length-w)/2,0,-.18),q=trimPoint((length+w)/2,0,-.18);
      if(pathClear([p[0],p[2]],[q[0],q[2]])){const basis=offset=>new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(a[0]+nx*offset,0,a[1]+nz*offset);appendGeometry(new THREE.BoxGeometry(w,.01,.14),basis(-.09).multiply(new THREE.Matrix4().makeTranslation(length/2,.007,0)),bedSoil);appendGeometry(new THREE.BoxGeometry(w,.045,.08),basis(-.20).multiply(new THREE.Matrix4().makeTranslation(length/2,.0225,0)),bedCurbs);
        if(pathClear([p[0],p[2]],[q[0],q[2]],1.20)){const hedgeHeight=.50+(edge%3)*.025,hedge=trimPoint(length/2,.012+hedgeHeight/2,-.23);bedPlants.push({p:hedge,scale:[w-.25,hedgeHeight,.42],rotation,color:0x586a4e});const south=-nz>.5,rounded=-nx>.5||nz>.5;if(south||rounded){for(const side of [-1,1]){const height=south ? .94+(edge%3)*.035 : .60+(edge%3)*.025,plant=trimPoint(length/2+side*w*.36,.012+height/2,-.23);bedPlants.push({p:plant,scale:south?[.25,height,.28]:[.43,height,.39],rotation,color:south?0x4d6249:0x687459})}const stem=trimPoint(length/2,.322,-.23),bloom=trimPoint(length/2,.68,-.23);bedStems.push(stem);bedPlants.push({p:bloom,scale:[.09,.09,.09],rotation,color:0xd8d6c5})}}
      }
    }
    if(arcadeEdges.has(edge)&&edge!==5){const width=Math.min(1.7,length*.28),basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(a[0]-nx*.12,0,a[1]-nz*.12);appendGeometry(new THREE.BoxGeometry(width,.015,.24),basis.multiply(new THREE.Matrix4().makeTranslation(length/2,.0075,0)),ashlarTrim)}
    const trimQuad=(p,q,r,t)=>ashlarTrim.push(...p,...q,...r,...p,...r,...t);
    function trimStone(x0,y0,x1,y1,projection=.03){const a=trimPoint(x0,y0,-projection),b=trimPoint(x1,y0,-projection),c=trimPoint(x1,y1,-projection),d=trimPoint(x0,y1,-projection);trimQuad(a,b,c,d)}
    function openingMasonry(center,radius,bottom,spring,band,segments=9){
      // Individually jointed, shallow wedges; the inner edge stays outside
      // the opening, so it cannot cover a window, doorway or arch reveal.
      const count=segments,inner=radius+.012,outer=radius+band,gap=.008;
      for(let i=0;i<count;i++){
        const t0=Math.PI-i*Math.PI/count-gap,t1=Math.PI-(i+1)*Math.PI/count+gap;
        const p=(r,t,o)=>trimPoint(center+r*Math.cos(t),spring+r*Math.sin(t),o),a=p(inner,t0,-.028),b=p(inner,t1,-.028),c=p(outer,t1,-.028),d=p(outer,t0,-.028);
        trimQuad(a,b,c,d);trimQuad(a,p(inner,t0,0),p(inner,t1,0),b);trimQuad(d,c,p(outer,t1,0),p(outer,t0,0));
        // Close the two narrow radial returns at each joint, connecting the
        // shallow wedge face back to the wall without filling the opening.
        trimQuad(a,d,p(outer,t0,0),p(inner,t0,0));trimQuad(c,b,p(inner,t1,0),p(outer,t1,0));
      }
      // Jamb blocks follow the same 0.30 m course height as the wall map.
      for(const side of [-1,1]){const innerX=center+side*(radius+.015),outerX=center+side*(radius+band);let y=bottom;while(y<spring-1e-6){const next=Math.min(spring,(Math.floor((y+1e-7)/.30)+1)*.30);if(next<=y+1e-7)break;trimStone(Math.min(innerX,outerX),y+.006,Math.max(innerX,outerX),next-.006);y=next}}
    }
    const wallShape=new THREE.Shape();wallShape.moveTo(0,0);
    const arches=[];
    if(arcadeEdges.has(edge)){
      // A broader central arch and substantial piers carry the loggia rhythm
      // around the three recessed sides. Dimensions are visual estimates.
      const front=edge!==5,width=front?length*.88/4.75:length*.78/3.55,gap=front?width*.5:width*.275;
      // North is a shallow facade-plane infill, not a walk-in loggia. Its
      // distinct door/window treatment will be refined separately.
      const widths=front?[width,width*1.75,width]:[width,width,width],start=(length-widths.reduce((a,b)=>a+b,0)-2*gap)/2,spring=2.15,depth=edge===5?.06:.95;
      for(let n=0;n<3;n++){
        const left=start+widths.slice(0,n).reduce((a,b)=>a+b,0)+n*gap,right=left+widths[n],center=(left+right)/2,radius=widths[n]/2,profile=[[left,0],[left,spring]];
        for(let j=1;j<=10;j++){const t=Math.PI-j*Math.PI/10;profile.push([center+radius*Math.cos(t),spring+radius*Math.sin(t)])}
        profile.push([right,0]);wallShape.lineTo(left,0);for(let j=1;j<profile.length;j++)wallShape.lineTo(...profile[j]);
        arches.push({profile,depth,center,radius,frontCenter:front&&n===1});
      }
    }
    wallShape.lineTo(length,0);wallShape.lineTo(length,7.4);wallShape.lineTo(0,7.4);wallShape.closePath();
    const windows=[];
    if(arcadeEdges.has(edge)||pavilionEdges.has(edge)){
      const central=arcadeEdges.has(edge),positions=central?[.22,.5,.78]:[.39,.61];
      for(let i=0;i<positions.length;i++){
        const width=central?(i===1?Math.min(1.55,length*.25):Math.min(.88,length*.14)):Math.min(.76,length*.12);
        const spec={center:length*positions[i],radius:width/2,bottom:4.28,spring:6.06,depth:central ? .36 : .30,level:'upper'};windows.push(spec);
        wallShape.holes.push(windowOutline(new THREE.Path(),spec.center,spec.radius,spec.bottom,spec.spring));
      }
    }
    if(pavilionEdges.has(edge)){
      // One broad arched lower window per outward pavilion wall; dimensions
      // are estimated from the photographed elevations, not surveyed.
      const spec={center:length*.5,radius:Math.min(1.12,length*.16),bottom:.65,spring:2.05,depth:.38,level:'lower'};windows.push(spec);
      wallShape.holes.push(windowOutline(new THREE.Path(),spec.center,spec.radius,spec.bottom,spec.spring));
    }
    if(edge===5){const landing=new THREE.BoxGeometry(length*.65,.05,.65),p=trimPoint(length/2,.025,-.325),m=new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(...p);appendGeometry(landing,m,northLanding)}
    const wallMatrix=new THREE.Matrix4().makeRotationY(rotation).setPosition(a[0],0,a[1]);
    appendGeometry(new THREE.ShapeGeometry(wallShape),wallMatrix,wallVertices);
    if(edge===15){
      // The frontal photograph shows one small dark nameplate above the
      // arcade. Its mapped elevation and dimensions are visual estimates.
      const sign=new THREE.Group();sign.name='city-hall-nameplate';sign.userData.text='SONOMA CITY HALL';
      sign.position.set(a[0]+dx*.5,4.08,a[1]+dz*.5);sign.rotation.y=rotation;group.add(sign);
      const plate=new THREE.Mesh(new THREE.BoxGeometry(2,.10,.05),new THREE.MeshLambertMaterial({color:0x252c28}));
      plate.position.z=-.03;plate.name='city-hall-nameplate-backing';sign.add(plate);
      const border=new THREE.Mesh(new THREE.BoxGeometry(2.03,.13,.012),new THREE.MeshLambertMaterial({color:0xb9aa82}));border.position.z=-.022;border.name='city-hall-nameplate-border';sign.add(border);
      // Original small serif letterforms, instanced into a single draw call and
      // physically mounted on the wall, not an emissive camera-facing label.
      const font={S:['01111','11001','11000','01110','00011','10011','11110'],O:['01110','11011','10001','10001','10001','11011','01110'],N:['11011','11010','11100','10100','10110','10011','11011'],M:['11011','11111','10101','10101','10001','10001','11011'],A:['00100','01110','11011','10001','11111','10001','11011'],C:['01111','11001','10000','10000','10000','11001','01110'],I:['11111','00100','00100','00100','00100','00100','11111'],T:['11111','10101','00100','00100','00100','00100','01110'],Y:['11011','10001','01010','00100','00100','00100','01110'],H:['11011','10001','10001','11111','10001','10001','11011'],L:['11000','01000','01000','01000','01001','01001','11111']};
      const label=sign.userData.text,step=1.8/(label.length*6-1),count=[...label].reduce((n,ch)=>n+(font[ch]||[]).join('').replace(/0/g,'').length,0);
      const letters=new THREE.InstancedMesh(new THREE.BoxGeometry(step*.83,.0075,.008),new THREE.MeshLambertMaterial({color:0xd8d5c5}),count),pixel=new THREE.Object3D();
      letters.name='city-hall-nameplate-letters';let index=0;
      for(let n=0;n<label.length;n++)for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(font[label[n]]?.[row]?.[col]==='1'){
        pixel.position.set(.9-(n*6+col+.5)*step,(3-row)*.009,-.06);pixel.updateMatrix();letters.setMatrixAt(index++,pixel.matrix);
      }
      letters.instanceMatrix.needsUpdate=true;sign.add(letters);
    }
    for(const arch of arches){openingMasonry(arch.center,arch.radius,0,2.15,.14);if(edge!==5)for(const side of [-1,1]){const a=arch.center+side*(arch.radius+.015),b=arch.center+side*(arch.radius+.23),p=trimPoint((a+b)/2,2.15,-.03),position=new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(...p);appendGeometry(new THREE.BoxGeometry(Math.abs(b-a),.10,.16),position,ashlarTrim)}}
    for(const spec of windows){
      const {center,radius,bottom,spring,depth,level}=spec,centralUpper=level==='upper'&&arcadeEdges.has(edge)&&Math.abs(center-length*.5)<1e-6,position=offset=>new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(a[0]+nx*offset,0,a[1]+nz*offset),glassOut=level==='lower'?lowerGlass:windowGlass,frameOut=level==='lower'?lowerFrames:windowFrames,revealOut=level==='lower'?lowerReveals:windowReveals;
      const glassShape=windowOutline(new THREE.Shape(),center,radius,bottom,spring);appendGeometry(new THREE.ShapeGeometry(glassShape),position(depth),glassOut);
      const frameShape=windowOutline(new THREE.Shape(),center,radius,bottom,spring),inset=.055;
      frameShape.holes.push(windowOutline(new THREE.Path(),center,radius-inset,bottom+inset,spring));appendGeometry(new THREE.ShapeGeometry(frameShape),position(depth-.012),frameOut);
      // 1-over-1 sash: a single horizontal divider between two panes.
      const divider=new THREE.BoxGeometry(radius*2-.08,.065,.035),dividerMatrix=position(depth-.028).multiply(new THREE.Matrix4().makeTranslation(center,level==='lower'?1.42:5.12,0));appendGeometry(divider,dividerMatrix,frameOut);
      if(level==='upper'&&pavilionEdges.has(edge)){
        // A fixed, subtly varied ordinary blind state inside each separately
        // framed pane; the shared stone pier and horizontal sash remain clear.
        const w=radius*2-.13,muted=(edge+Math.round(center*1000))%2===0,panel=new THREE.BoxGeometry(w,.50,.008),panelMatrix=position(depth-.012).multiply(new THREE.Matrix4().makeTranslation(center,5.53,0));appendGeometry(panel,panelMatrix,muted?upperBlindsMuted:upperBlinds);
        for(const y of [5.35,5.47,5.59,5.71]){const slat=new THREE.BoxGeometry(w,.009,.004),slatMatrix=position(depth-.019).multiply(new THREE.Matrix4().makeTranslation(center,y,0));appendGeometry(slat,slatMatrix,upperBlindSlats)}
      }
      if(level==='lower'||centralUpper){const top=spring+radius-.055,mullion=new THREE.BoxGeometry(.065,top-bottom-.055,.035),mullionMatrix=position(depth-.028).multiply(new THREE.Matrix4().makeTranslation(center,(bottom+.055+top)/2,0));appendGeometry(mullion,mullionMatrix,frameOut)}
      if(level==='lower'){
        // Two understated blind panels are set within the glazed panes. The
        // thin sash and slats sit forward of the opaque glazing, without alpha.
        for(const side of [-1,1]){const x=center+side*radius*.5,w=radius-.10,panel=new THREE.BoxGeometry(w,.50,.008),panelMatrix=position(depth-.012).multiply(new THREE.Matrix4().makeTranslation(x,1.74,0));appendGeometry(panel,panelMatrix,lowerBlinds);for(const y of [1.56,1.68,1.80,1.92]){const slat=new THREE.BoxGeometry(w,.009,.004),slatMatrix=position(depth-.019).multiply(new THREE.Matrix4().makeTranslation(x,y,0));appendGeometry(slat,slatMatrix,lowerBlindSlats)}}
      }
      // Upper groups receive one continuous sill below their openings.
      if(level==='lower'){const sill=new THREE.BoxGeometry(radius*2+.25,.12,.30),sillMatrix=position(-.035).multiply(new THREE.Matrix4().makeTranslation(center,bottom-.06,0));appendGeometry(sill,sillMatrix,ashlarTrim)}
      openingMasonry(center,radius,bottom,spring,.12,centralUpper?11:9);
      const profile=[[center-radius,bottom],[center-radius,spring]];for(let i=1;i<=12;i++){let t=Math.PI-i*Math.PI/12;profile.push([center+radius*Math.cos(t),spring+radius*Math.sin(t)])}profile.push([center+radius,bottom],[center-radius,bottom]);
      const point=(x,y,offset)=>[a[0]+dx/length*x+nx*offset,y,a[1]+dz/length*x+nz*offset];
      for(let i=1;i<profile.length;i++){let p=profile[i-1],q=profile[i],p0=point(p[0],p[1],0),q0=point(q[0],q[1],0),p1=point(p[0],p[1],depth),q1=point(q[0],q[1],depth);revealOut.push(...p0,...q0,...q1,...p0,...q1,...p1)}
    }
    if(pavilionEdges.has(edge)||arcadeEdges.has(edge)){
      const pair=windows.filter(w=>w.level==='upper'),left=Math.min(...pair.map(w=>w.center-w.radius))-.125,right=Math.max(...pair.map(w=>w.center+w.radius))+.125;
      const sill=new THREE.BoxGeometry(right-left,.12,.30),position=new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(a[0]-nx*.035,0,a[1]-nz*.035);
      appendGeometry(sill,position.multiply(new THREE.Matrix4().makeTranslation((left+right)/2,pair[0].bottom-.06,0)),ashlarTrim);
    }
    // Restrained corner blocks sit only at convex footprint corners and use
    // the same global course heights on both meeting wall faces.
    const convex=index=>{const count=ring.length-1,prev=ring[(index+count-1)%count],cur=ring[index%count],next=ring[(index+1)%count],cross=(cur[0]-prev[0])*(next[1]-cur[1])-(cur[1]-prev[1])*(next[0]-cur[0]);return cross*area>1e-8};
    for(const [corner,fromStart] of [[edge,true],[(edge+1)%(ring.length-1),false]])if(convex(corner))for(let row=0;row<25;row++){let y=row*.30+.006,top=Math.min(7.4,(row+1)*.30-.006),width=(row+(fromStart?0:1))%2?.30:.22;if(top<=y)continue;trimStone(fromStart?0:length-width,y,fromStart?width:length,top,.025)}
    if(arcadeEdges.has(edge)){
      // Provisional Mission-style curved profile: source photographs establish
      // the silhouette, but not exact gable or coping dimensions.
      const width=length*.88,left=(length-width)/2,x=t=>left+width*t,base=7.4,crest=9.2,gableShape=new THREE.Shape();
      gableShape.moveTo(x(0),base);
      gableShape.bezierCurveTo(x(.04),base,x(.09),7.54,x(.13),7.92);
      gableShape.bezierCurveTo(x(.15),8.10,x(.17),8.15,x(.20),8.15);
      gableShape.bezierCurveTo(x(.23),8.15,x(.26),8.15,x(.29),8.15);
      gableShape.bezierCurveTo(x(.32),8.15,x(.32),8.43,x(.35),8.43);
      gableShape.bezierCurveTo(x(.39),8.43,x(.39),crest,x(.5),crest);
      gableShape.bezierCurveTo(x(.61),crest,x(.61),8.43,x(.65),8.43);
      gableShape.bezierCurveTo(x(.68),8.43,x(.68),8.15,x(.71),8.15);
      gableShape.bezierCurveTo(x(.74),8.15,x(.77),8.15,x(.80),8.15);
      gableShape.bezierCurveTo(x(.83),8.15,x(.85),8.10,x(.87),7.92);
      gableShape.bezierCurveTo(x(.91),7.54,x(.96),base,x(1),base);
      gableShape.lineTo(x(0),base);gableShape.closePath();
      // The frontal reference supports one clock; its south-facing mapped
      // elevation is inferred from the fountain approach, not surveyed.
      {const opening=new THREE.Path();opening.absarc(length/2,8.48,.48,0,Math.PI*2,true);gableShape.holes.push(opening)}
      const gableGeometry=new THREE.ExtrudeGeometry(gableShape,{depth:.36,bevelEnabled:false,curveSegments:12});if(area<0)gableGeometry.translate(0,0,-.36);
      const gable=new THREE.Mesh(gableGeometry,stone);gable.position.set(a[0],0,a[1]);gable.rotation.y=rotation;gable.name='city-hall-curved-gable';gable.userData.clockAnchor={x:length/2,y:8.48};group.add(gable);
      if(edge===15){
        // The aperture is cut into the gable; the face sits behind its stone
        // lip. A static 10:10 avoids suggesting a real-time gameplay clock.
        const clock=new THREE.Group(),ink=new THREE.MeshLambertMaterial({color:0x252e2c,side:THREE.DoubleSide}),dial=new THREE.MeshLambertMaterial({color:0xf2f0e8,side:THREE.DoubleSide});
        clock.name='city-hall-facade-clock';clock.position.set(a[0]+dx/length*length/2,8.48,a[1]+dz/length*length/2);clock.rotation.y=rotation;group.add(clock);
        const surround=new THREE.Mesh(new THREE.RingGeometry(.33,.48,32),stone);surround.position.z=-.012;surround.name='city-hall-clock-stone-surround';clock.add(surround);
        const clockWedges=[];for(let i=0;i<12;i++){const a=i*Math.PI/6+.012,b=(i+1)*Math.PI/6-.012,p=(r,t)=>[r*Math.cos(t),r*Math.sin(t),-.018],v=[p(.36,a),p(.48,a),p(.48,b),p(.36,b)];clockWedges.push(...v[0],...v[1],...v[2],...v[0],...v[2],...v[3])}const wedgeGeometry=new THREE.BufferGeometry();wedgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(clockWedges,3));wedgeGeometry.computeVertexNormals();const wedges=new THREE.Mesh(wedgeGeometry,trimMaterial);wedges.name='city-hall-clock-voussoirs';clock.add(wedges);
        const rim=new THREE.Mesh(new THREE.RingGeometry(.315,.355,32),ink);rim.position.z=-.016;rim.name='city-hall-clock-rim';clock.add(rim);
        const face=new THREE.Mesh(new THREE.CircleGeometry(.32,32),dial);face.position.z=.055;face.name='city-hall-clock-face';clock.add(face);
        // Small, upright Roman numerals share a single instanced line geometry.
        const labels=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'],strokes={I:[[0,-.5,0,.5]],V:[[-.5,.5,0,-.5],[0,-.5,.5,.5]],X:[[-.5,-.5,.5,.5],[-.5,.5,.5,-.5]]},lines=[];
        labels.forEach((label,index)=>{const theta=index*Math.PI/6,cx=Math.sin(theta)*.235,cy=Math.cos(theta)*.235,step=.018;for(let j=0;j<label.length;j++)for(const [x0,y0,x1,y1] of strokes[label[j]]){const base=cx+(j-(label.length-1)/2)*step,ax=base+x0*.014,ay=cy+y0*.035,bx=base+x1*.014,by=cy+y1*.035;lines.push({x:(ax+bx)/2,y:(ay+by)/2,length:Math.hypot(bx-ax,by-ay),angle:Math.atan2(by-ay,bx-ax)})}});
        const numerals=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,.008),ink,lines.length),numeralDummy=new THREE.Object3D();numerals.name='city-hall-clock-roman-numerals';lines.forEach((p,i)=>{numeralDummy.position.set(p.x,p.y,.025);numeralDummy.rotation.set(0,0,p.angle);numeralDummy.scale.set(p.length,.003,1);numeralDummy.updateMatrix();numerals.setMatrixAt(i,numeralDummy.matrix)});numerals.instanceMatrix.needsUpdate=true;clock.add(numerals);
        for(const [theta,reach,width] of [[(10+10/60)*Math.PI/6,.16,.025],[10*Math.PI/30,.225,.018]]){const hand=new THREE.Mesh(new THREE.BoxGeometry(width,reach,.009),ink);hand.position.set(Math.sin(theta)*reach/2,Math.cos(theta)*reach/2,.029);hand.rotation.z=-theta;hand.name='city-hall-clock-hand';clock.add(hand)}
      }
      if(edge!==15){
        // Distinct provisional gable apertures: reported east spokes and north
        // grille; older west reference establishes only a dark inset.
        const vent=new THREE.Group();vent.name=edge===10?'city-hall-east-gable-spokes':edge===5?'city-hall-north-gable-grille':'city-hall-west-gable-inset';vent.position.set(a[0]+dx*.5,8.48,a[1]+dz*.5);vent.rotation.y=rotation;group.add(vent);
        const rim=new THREE.Mesh(new THREE.RingGeometry(.33,.48,32),trimMaterial);rim.position.z=-.012;vent.add(rim);const inset=new THREE.Mesh(new THREE.CircleGeometry(.33,32),dark);inset.position.z=.055;vent.add(inset);
        if(edge===10){const geometry=new THREE.BoxGeometry(.018,.31,.012);for(let i=0;i<8;i++){const t=i*Math.PI/4,bar=new THREE.Mesh(geometry,frameMaterial);bar.position.set(Math.sin(t)*.155,Math.cos(t)*.155,.025);bar.rotation.z=-t;vent.add(bar)}}
        if(edge===5)for(const offset of [-.12,0,.12]){const reach=2*Math.sqrt(.31*.31-offset*offset),geometry=new THREE.BoxGeometry(reach,.018,.012);for(const vertical of [false,true]){const bar=new THREE.Mesh(geometry,frameMaterial);bar.position.set(vertical?offset:0,vertical?0:offset,.025);bar.rotation.z=vertical?Math.PI/2:0;vent.add(bar)}}
      }
      // Shallow raised stone coping follows only the curved upper profile.
      const profile=[];for(const curve of gableShape.curves){if(curve.type!=='CubicBezierCurve')continue;const points=curve.getPoints(8);for(let i=profile.length?1:0;i<points.length;i++)profile.push(points[i])}
      const vertices=[],point=(p,offset,rise)=>[a[0]+dx/length*p.x+nx*offset,p.y+rise,a[1]+dz/length*p.x+nz*offset],quad=(p,q,r,t)=>vertices.push(...p,...q,...r,...p,...r,...t);
      for(let i=1;i<profile.length;i++){const p=profile[i-1],q=profile[i],p0=point(p,-.035,0),q0=point(q,-.035,0),p1=point(p,-.035,.12),q1=point(q,-.035,.12),p2=point(p,.39,.12),q2=point(q,.39,.12),p3=point(p,.39,0),q3=point(q,.39,0);quad(p0,q0,q1,p1);quad(p1,q1,q2,p2);quad(q3,p3,p2,q2);if(i===1)quad(p3,p0,p1,p2);if(i===profile.length-1)quad(q0,q3,q2,q1)}
      const copingGeometry=new THREE.BufferGeometry();copingGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));copingGeometry.computeVertexNormals();
      const coping=new THREE.Mesh(copingGeometry,copingMaterial);coping.name='city-hall-gable-coping';group.add(coping);
    }
    for(const {profile,depth,center,radius,frontCenter} of arches){
      const backShape=new THREE.Shape();profile.forEach(([x,y],i)=>i?backShape.lineTo(x,y):backShape.moveTo(x,y));backShape.closePath();
      const backMatrix=new THREE.Matrix4().makeRotationY(rotation).setPosition(a[0]+nx*depth,0,a[1]+nz*depth);
      appendGeometry(new THREE.ShapeGeometry(backShape),backMatrix,recessVertices);
      // A closed, dark entry within each arcade. It is a visual recess only:
      // the existing full footprint continues to block gameplay movement.
      const doorRadius=Math.min(frontCenter ? .82 : .525,radius*.80),doorBottom=.06,doorSpring=1.82,position=offset=>new THREE.Matrix4().makeBasis(new THREE.Vector3(dx/length,0,dz/length),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz)).setPosition(a[0]+nx*offset,0,a[1]+nz*offset);
      const doorShape=windowOutline(new THREE.Shape(),center,doorRadius,doorBottom,doorSpring);appendGeometry(new THREE.ShapeGeometry(doorShape),position(depth-.025),entryDoors);
      const doorFrame=windowOutline(new THREE.Shape(),center,doorRadius,doorBottom,doorSpring);doorFrame.holes.push(windowOutline(new THREE.Path(),center,doorRadius-.06,doorBottom+.06,doorSpring));appendGeometry(new THREE.ShapeGeometry(doorFrame),position(depth-.04),entryFrames);
      const stile=new THREE.BoxGeometry(.04,1.7,.03),stileMatrix=position(depth-.05).multiply(new THREE.Matrix4().makeTranslation(center,.91,0));appendGeometry(stile,stileMatrix,entryFrames);
      if(edge===15){
        const box=(width,height,thickness,x,y,offset,out)=>appendGeometry(new THREE.BoxGeometry(width,height,thickness),position(offset).multiply(new THREE.Matrix4().makeTranslation(x,y,0)),out);
        if(frontCenter){
          // Closed double leaves beneath an arched glazed transom; the face
          // is recessed with the loggia and does not imply an enterable door.
          for(const side of [-1,1]){const x=center+side*.36;box(.68,1.66,.025,x,.91,depth-.055,southPanels);for(const y of [.54,1.22])box(.48,.46,.008,x,y,depth-.074,southPanelInsets)}
          const transom=windowOutline(new THREE.Shape(),center,doorRadius,doorSpring,doorSpring);appendGeometry(new THREE.ShapeGeometry(transom),position(depth-.06),southGlazing);
          box(doorRadius*2-.06,.055,.025,center,doorSpring,depth-.075,entryFrames);box(.045,doorRadius-.08,.025,center,doorSpring+(doorRadius-.08)/2,depth-.075,entryFrames);
        }else{
          // The side entries retain opaque recessed glazing and a low rail.
          box(doorRadius*1.48,.95,.008,center,1.28,depth-.058,southGlazing);box(doorRadius*1.55,.055,.025,center,.78,depth-.075,entryFrames);
        }
      }
      if(edge===10){
        const box=(width,height,thickness,x,y,offset,out)=>appendGeometry(new THREE.BoxGeometry(width,height,thickness),position(offset).multiply(new THREE.Matrix4().makeTranslation(x,y,0)),out);
        if(frontCenter){
          // A pale closed paneled leaf with two restrained dark strap hinges.
          box(1.34,1.66,.025,center,.91,depth-.055,eastPanels);
          for(const y of [.54,1.22]){box(.98,.46,.008,center,y,depth-.074,eastPanelInsets);box(.54,.045,.012,center-.32,y,depth-.086,eastStraps)}
        }else{
          // The side alcoves read as framed glazed windows, not entry leaves.
          box(doorRadius*1.48,1.04,.008,center,1.30,depth-.058,eastGlazing);box(doorRadius*1.55,.055,.025,center,1.30,depth-.075,entryFrames);
        }
      }
      if(edge===5){
        const box=(width,height,thickness,x,y,offset,out)=>appendGeometry(new THREE.BoxGeometry(width,height,thickness),position(offset).multiply(new THREE.Matrix4().makeTranslation(x,y,0)),out);
        if(Math.abs(center-length*.5)<1e-6){
          for(const side of [-1,1]){const x=center+side*.245;box(.46,1.66,.025,x,.91,depth-.055,northPanels);for(const y of [.54,1.22])box(.31,.46,.008,x,y,depth-.074,northInsets);box(.035,.11,.02,center+side*.075,.97,depth-.09,northHandles)}
        }else{
          const radius=doorRadius-.08,glazing=windowOutline(new THREE.Shape(),center,radius,.65,doorSpring);appendGeometry(new THREE.ShapeGeometry(glazing),position(depth-.058),northGlazing);
          const outer=windowOutline(new THREE.Shape(),center,radius,.65,doorSpring);outer.holes.push(windowOutline(new THREE.Path(),center,radius-.045,.695,doorSpring));appendGeometry(new THREE.ShapeGeometry(outer),position(depth-.075),entryFrames);
          box(.045,doorSpring+radius-.70,.02,center,(.70+doorSpring+radius)/2,depth-.085,entryFrames);for(const y of [1.05,1.48])box(radius*2-.05,.045,.02,center,y,depth-.085,entryFrames);
        }
      }
      const vertices=[],world=(x,y,offset)=>[a[0]+dx/length*x+nx*offset,y,a[1]+dz/length*x+nz*offset];
      for(let j=1;j<profile.length;j++){const p=profile[j-1],q=profile[j],p0=world(p[0],p[1],0),q0=world(q[0],q[1],0),p1=world(p[0],p[1],depth),q1=world(q[0],q[1],depth);vertices.push(...p0,...q0,...q1,...p0,...q1,...p1)}
      arcadeReveals.push(...vertices);
    }
  }
  for(const [name,vertices,material] of [['city-hall-wall',wallVertices,stone],['city-hall-arcade-recess',recessVertices,dark],['city-hall-arcade-reveal',arcadeReveals,stone],['city-hall-upper-glass',windowGlass,glassMaterial],['city-hall-upper-frames',windowFrames,frameMaterial],['city-hall-upper-reveals',windowReveals,stone],['city-hall-upper-blinds',upperBlinds,blindMaterial],['city-hall-upper-blinds-muted',upperBlindsMuted,blindMutedMaterial],['city-hall-upper-blind-slats',upperBlindSlats,blindShadeMaterial],['city-hall-lower-glass',lowerGlass,glassMaterial],['city-hall-lower-frames',lowerFrames,frameMaterial],['city-hall-lower-reveals',lowerReveals,stone],['city-hall-lower-blinds',lowerBlinds,blindMaterial],['city-hall-lower-blind-slats',lowerBlindSlats,blindShadeMaterial],['city-hall-entry-door',entryDoors,doorMaterial],['city-hall-entry-frames',entryFrames,frameMaterial],['city-hall-south-door-panels',southPanels,frameMaterial],['city-hall-south-door-insets',southPanelInsets,panelInsetMaterial],['city-hall-south-entry-glazing',southGlazing,glassMaterial],['city-hall-east-door-panel',eastPanels,frameMaterial],['city-hall-east-door-insets',eastPanelInsets,panelInsetMaterial],['city-hall-east-door-straps',eastStraps,dark],['city-hall-east-alcove-glazing',eastGlazing,glassMaterial],['city-hall-north-door-panels',northPanels,frameMaterial],['city-hall-north-door-insets',northInsets,panelInsetMaterial],['city-hall-north-door-handles',northHandles,dark],['city-hall-north-window-glazing',northGlazing,glassMaterial],['city-hall-north-landing',northLanding,landingMaterial],['city-hall-bed-soil',bedSoil,soilMaterial],['city-hall-bed-curbs',bedCurbs,trimMaterial],['city-hall-ashlar-framing',ashlarTrim,trimMaterial]]){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.name=name;group.add(mesh);
  }
  if(bedPlants.length){const plants=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.5,1),new THREE.MeshLambertMaterial({color:0xffffff}),bedPlants.length),dummyPlant=new THREE.Object3D(),plantColor=new THREE.Color();plants.name='city-hall-foundation-plants';bedPlants.forEach((v,i)=>{dummyPlant.position.set(...v.p);dummyPlant.rotation.set(0,v.rotation,0);dummyPlant.scale.set(...v.scale);dummyPlant.updateMatrix();plants.setMatrixAt(i,dummyPlant.matrix);plants.setColorAt(i,plantColor.set(v.color))});plants.instanceMatrix.needsUpdate=true;plants.instanceColor.needsUpdate=true;group.add(plants)}
  if(bedStems.length){const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.012,.012,.62,5),new THREE.MeshLambertMaterial({color:0x596b50}),bedStems.length),dummyStem=new THREE.Object3D();stems.name='city-hall-foundation-rose-stems';bedStems.forEach((p,i)=>{dummyStem.position.set(...p);dummyStem.updateMatrix();stems.setMatrixAt(i,dummyStem.matrix)});stems.instanceMatrix.needsUpdate=true;group.add(stems)}
  // Principal OSM edges are approximately 7.36 degrees clockwise from north.
  const angle=7.36*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),uv=building.coordinates.map(([x,z])=>[x*c+z*s,-x*s+z*c]);
  const us=uv.map(p=>p[0]),vs=uv.map(p=>p[1]),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);
  const world=(u,v,y)=>[u*c-v*s,y,u*s+v*c];
  const roofTextures=createCityHallRoofTextures(),roofs=new THREE.MeshLambertMaterial({color:0xa36b53,side:THREE.DoubleSide,map:roofTextures.color,bumpMap:roofTextures.height,bumpScale:.018}),eaveMaterial=new THREE.MeshLambertMaterial({color:0xb2ab9e,side:THREE.DoubleSide}),roofVertices=[],fasciaVertices=[],soffitVertices=[],soffitSupports=[],soffitEdges=[],tileEdges=[],roofPlans=[];
  const hip=(a,b,d,e,base,peak)=>roofPlans.push({a,b,d,e,base,peak});
  // Central roof occupies the inset core. Derive each pavilion's separate
  // rectangle from the corresponding OSM footprint quadrant, instead of
  // imposing one repeated size on the four mapped corner projections.
  // Follow the actual four inset arcade wall planes rather than guessed
  // offsets from the footprint's bounding rectangle.
  hip((uv[0][0]+uv[1][0])/2+.04,(uv[10][0]+uv[11][0])/2-.04,
      (uv[5][1]+uv[6][1])/2+.04,(uv[15][1]+uv[16][1])/2-.04,7.42,8.8);
  const pavilionMaterial=stone;
  // Continue each pavilion's mapped outer walls up to the eave rather than
  // stepping the upper mass inward and exposing an unintended ledge.
  const um=(u0+u1)/2,vm=(v0+v1)/2,inset=0;
  for(const right of [false,true])for(const south of [false,true]){
    const quadrant=uv.filter(([u,v])=>(right?u>um:u<um)&&(south?v>vm:v<vm));
    if(quadrant.length<3)throw new Error('City Hall footprint lacks a pavilion quadrant');
    const a=Math.min(...quadrant.map(p=>p[0]))+inset,b=Math.max(...quadrant.map(p=>p[0]))-inset;
    const d=Math.min(...quadrant.map(p=>p[1]))+inset,e=Math.max(...quadrant.map(p=>p[1]))-inset;
    const pavilion=new THREE.Mesh(new THREE.BoxGeometry(b-a,.55,e-d),pavilionMaterial),p=world((a+b)/2,(d+e)/2,7.675);
    pavilion.position.set(...p);pavilion.rotation.y=-angle;pavilion.name='city-hall-pavilion';group.add(pavilion);
    // Provisional 0.32 m roof overhang, kept short of adjacent gable faces.
    // A low pavilion hip, independently retained over each projecting corner.
    // The mapped 11.25 m ridge remains within the supplied LiDAR range.
    hip(a-.32,b+.32,d-.32,e+.32,7.95,9.04);
    // Supports stay on the two outer faces; the continuous underside is
    // generated once from the union boundary below, including returns.
    if(!south){for(const t of [.2,.4,.6,.8])soffitSupports.push({u:a+(b-a)*t,v:d-.16,alongU:false})}
    else{for(const t of [.2,.4,.6,.8])soffitSupports.push({u:a+(b-a)*t,v:e+.16,alongU:false})}
    if(!right){for(const t of [.2,.4,.6,.8])soffitSupports.push({u:a-.16,v:d+(e-d)*t,alongU:true})}
    else{for(const t of [.2,.4,.6,.8])soffitSupports.push({u:b+.16,v:d+(e-d)*t,alongU:true})}
  }
  // Tessellate the union once, taking the upper roof surface at overlaps.
  // Shared boundary vertices prevent stacked/coplanar roof faces and gaps;
  // creases where the shallow hip surfaces meet form the valley transitions.
  // Limit grid spacing at joins: the upper-envelope valley can cross a
  // broad cell between plan boundaries, and one central sample smears its
  // return. Shared subdivisions retain watertight edges and bounded work.
  const axis=(a,b)=>{const anchors=[...new Set(roofPlans.flatMap(r=>[r[a],(r[a]+r[b])/2,r[b]]))].sort((x,y)=>x-y),values=[anchors[0]];for(let i=1;i<anchors.length;i++){const start=anchors[i-1],end=anchors[i],count=Math.ceil((end-start)/1.5);for(let j=1;j<=count;j++)values.push(start+(end-start)*j/count)}return values},u=axis('a','b'),v=axis('d','e');
  const active=(x,z)=>roofPlans.filter(r=>x>=r.a-1e-8&&x<=r.b+1e-8&&z>=r.d-1e-8&&z<=r.e+1e-8);
  const height=(x,z)=>{const plans=active(x,z);if(!plans.length)throw new Error('Roof vertex outside mass');return Math.max(...plans.map(r=>{const half=Math.min(r.b-r.a,r.e-r.d)/2,edge=Math.min(x-r.a,r.b-x,z-r.d,r.e-z);return r.base+(r.peak-r.base)*Math.max(0,Math.min(1,edge/half))}))};
  const covered=(i,j)=>i>=0&&j>=0&&i<u.length-1&&j<v.length-1&&active((u[i]+u[i+1])/2,(v[j]+v[j+1])/2).length>0;
  const tri=(out,a,b,c)=>out.push(...a,...b,...c),point=(x,z,y)=>world(x,z,y);
  function fascia(a,b){const h0=height(...a),h1=height(...b),p=point(a[0],a[1],h0),q=point(b[0],b[1],h1),r=point(b[0],b[1],h1-.18),t=point(a[0],a[1],h0-.18);tri(fasciaVertices,p,q,r);tri(fasciaVertices,p,r,t);const dx=q[0]-p[0],dz=q[2]-p[2],length=Math.hypot(dx,dz);if(length<1e-8)return;const ix=-dz/length,iz=dx/length;soffitEdges.push({t,r,ix,iz});const po=[p[0]-ix*.035,p[1]-.01,p[2]-iz*.035],qo=[q[0]-ix*.035,q[1]-.01,q[2]-iz*.035],pl=[po[0],po[1]-.065,po[2]],ql=[qo[0],qo[1]-.065,qo[2]],pi=[p[0],p[1]-.01,p[2]],qi=[q[0],q[1]-.01,q[2]];tri(fasciaVertices,po,qo,ql);tri(fasciaVertices,po,ql,pl);tri(fasciaVertices,pi,po,qo);tri(fasciaVertices,pi,qo,qi);if(length>=.08){const count=Math.max(1,Math.floor(length/.20));for(let i=0;i<count;i++){const f=(i+.5)/count;tileEdges.push({x:p[0]+dx*f,y:h0+(h1-h0)*f-.035,z:p[2]+dz*f,angle:-Math.atan2(dz,dx)})}}}
  for(let i=0;i<u.length-1;i++)for(let j=0;j<v.length-1;j++){
    if(!covered(i,j))continue;
    const a=[u[i],v[j]],b=[u[i+1],v[j]],c=[u[i+1],v[j+1]],d=[u[i],v[j+1]],m=[(u[i]+u[i+1])/2,(v[j]+v[j+1])/2];
    const p=[a,b,c,d].map(q=>point(q[0],q[1],height(...q))),center=point(m[0],m[1],height(...m));
    for(let k=0;k<4;k++)tri(roofVertices,p[k],p[(k+1)%4],center);
    if(!covered(i,j-1))fascia(a,b);if(!covered(i+1,j))fascia(b,c);if(!covered(i,j+1))fascia(c,d);if(!covered(i-1,j))fascia(d,a);
  }
  // Miter the inner edge of the soffit strip at each shared boundary vertex.
  const soffitNodes=new Map(),soffitKey=p=>p[0].toFixed(5)+','+p[2].toFixed(5);
  for(const edge of soffitEdges)for(const p of [edge.t,edge.r]){const k=soffitKey(p);if(!soffitNodes.has(k))soffitNodes.set(k,[]);soffitNodes.get(k).push(edge)}
  const soffitInner=(p,edge)=>{const adjacent=(soffitNodes.get(soffitKey(p))||[]).find(e=>e!==edge);if(!adjacent)return [p[0]+edge.ix*.20,p[1],p[2]+edge.iz*.20];const den=1+edge.ix*adjacent.ix+edge.iz*adjacent.iz,k=.20/Math.max(.1,den);return [p[0]+(edge.ix+adjacent.ix)*k,p[1],p[2]+(edge.iz+adjacent.iz)*k]};
  for(const edge of soffitEdges){const a=soffitInner(edge.t,edge),b=soffitInner(edge.r,edge);tri(soffitVertices,edge.t,edge.r,b);tri(soffitVertices,edge.t,b,a)}
  const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roofVertices,3));roofGeometry.computeVertexNormals();setCityHallRoofUV(roofGeometry,angle);
  const roof=new THREE.Mesh(roofGeometry,roofs);roof.name='city-hall-hip-roofs';group.add(roof);
  const fasciaGeometry=new THREE.BufferGeometry();fasciaGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fasciaVertices,3));fasciaGeometry.computeVertexNormals();
  const fasciaMesh=new THREE.Mesh(fasciaGeometry,eaveMaterial);fasciaMesh.name='city-hall-eave-fascia';group.add(fasciaMesh);
  // Include the belfry cap perimeter in the same instanced tile-end batch.
  const capU=(roofPlans[0].a+roofPlans[0].b)/2,capV=(roofPlans[0].d+roofPlans[0].e)/2,capPlan=[[-1.35,-1.35],[1.35,-1.35],[1.35,1.35],[-1.35,1.35]];
  for(let side=0;side<4;side++){const a=capPlan[side],b=capPlan[(side+1)%4],p=world(capU+a[0],capV+a[1],10.545),q=world(capU+b[0],capV+b[1],10.545),dx=q[0]-p[0],dz=q[2]-p[2],count=Math.floor(Math.hypot(dx,dz)/.20);for(let i=0;i<count;i++){const f=(i+.5)/count;tileEdges.push({x:p[0]+dx*f,y:p[1],z:p[2]+dz*f,angle:-Math.atan2(dz,dx),cupola:true})}}
  // Short curved tile ends share one geometry and one material at all eaves.
  const endShape=new THREE.Shape();endShape.moveTo(-.085,0);endShape.absarc(0,0,.085,Math.PI,0,true);endShape.lineTo(-.085,0);endShape.closePath();
  const endGeometry=new THREE.ExtrudeGeometry(endShape,{depth:.045,bevelEnabled:false,curveSegments:6}),endMaterial=new THREE.MeshLambertMaterial({color:0x9c624d,side:THREE.DoubleSide}),ends=new THREE.InstancedMesh(endGeometry,endMaterial,tileEdges.length),endDummy=new THREE.Object3D(),endColor=new THREE.Color();
  ends.name='city-hall-eave-tile-ends';tileEdges.forEach((p,i)=>{endDummy.position.set(p.x,p.y,p.z);endDummy.rotation.set(0,p.angle,0);endDummy.updateMatrix();ends.setMatrixAt(i,endDummy.matrix);ends.setColorAt(i,endColor.set(i%13===0?0xe9d3c1:0xffffff))});ends.instanceMatrix.needsUpdate=true;if(ends.instanceColor)ends.instanceColor.needsUpdate=true;group.add(ends);
  const soffitGeometry=new THREE.BufferGeometry();soffitGeometry.setAttribute('position',new THREE.Float32BufferAttribute(soffitVertices,3));soffitGeometry.computeVertexNormals();
  const soffit=new THREE.Mesh(soffitGeometry,eaveMaterial);soffit.name='city-hall-eave-soffit';group.add(soffit);
  const supportItems=soffitSupports.map(s=>({p:world(s.u,s.v,7.71),rotation:-angle+(s.alongU?Math.PI/2:0)}));
  // Place small return supports on actual boundary turns, with spacing from
  // the existing repeated brackets and a fixed upper bound on additions.
  let returns=0;for(const edge of soffitEdges)for(const [p,q] of [[edge.t,edge.r],[edge.r,edge.t]]){if(returns>=32)continue;const neighbors=soffitNodes.get(soffitKey(p))||[],other=neighbors.find(e=>e!==edge),length=Math.hypot(q[0]-p[0],q[2]-p[2]);if(!other||edge.ix*other.ix+edge.iz*other.iz>.8||length<.32)continue;const t=Math.min(.3,.24/length),candidate=[p[0]+(q[0]-p[0])*t+edge.ix*.12,p[1]+(q[1]-p[1])*t-.06,p[2]+(q[2]-p[2])*t+edge.iz*.12];if(supportItems.some(s=>Math.hypot(s.p[0]-candidate[0],s.p[2]-candidate[2])<.65))continue;supportItems.push({p:candidate,rotation:Math.atan2(edge.ix,edge.iz)});returns++}
  const bracketProfile=new THREE.Shape();bracketProfile.moveTo(-.14,.06);bracketProfile.lineTo(.14,.06);bracketProfile.lineTo(.14,-.06);bracketProfile.bezierCurveTo(.06,-.06,.015,-.045,-.025,-.025);bracketProfile.lineTo(-.14,-.025);bracketProfile.closePath();
  const bracketGeometry=new THREE.ExtrudeGeometry(bracketProfile,{depth:.10,bevelEnabled:false,curveSegments:4});bracketGeometry.rotateY(Math.PI/2);bracketGeometry.translate(-.05,0,0);
  const supports=new THREE.InstancedMesh(bracketGeometry,eaveMaterial,supportItems.length),supportDummy=new THREE.Object3D();supports.name='city-hall-eave-supports';
  supportItems.forEach((s,i)=>{supportDummy.position.set(...s.p);supportDummy.rotation.set(0,s.rotation,0);supportDummy.scale.set(1,1,1);supportDummy.updateMatrix();supports.setMatrixAt(i,supportDummy.matrix)});supports.instanceMatrix.needsUpdate=true;group.add(supports);
  // Small recessed-looking, unlit fixtures between existing outer brackets.
  // They are surfaces only: no light source leaks through the roof or walls.
  const lightPositions=[];for(let i=0;i+3<soffitSupports.length;i+=4){const a=soffitSupports[i+1],b=soffitSupports[i+2];lightPositions.push(world((a.u+b.u)/2,(a.v+b.v)/2,7.765))}
  const downlightRims=new THREE.InstancedMesh(new THREE.RingGeometry(.052,.075,16),new THREE.MeshLambertMaterial({color:0x8f8d7f,side:THREE.DoubleSide}),lightPositions.length),downlights=new THREE.InstancedMesh(new THREE.CircleGeometry(.050,16),new THREE.MeshLambertMaterial({color:0xd7d2be,side:THREE.DoubleSide}),lightPositions.length),lightDummy=new THREE.Object3D();downlightRims.name='city-hall-soffit-light-rims';downlights.name='city-hall-soffit-lights';
  lightPositions.forEach((p,i)=>{lightDummy.position.set(...p);lightDummy.rotation.set(-Math.PI/2,0,0);lightDummy.updateMatrix();downlightRims.setMatrixAt(i,lightDummy.matrix);lightDummy.position.y-=.002;lightDummy.updateMatrix();downlights.setMatrixAt(i,lightDummy.matrix)});downlightRims.instanceMatrix.needsUpdate=downlights.instanceMatrix.needsUpdate=true;group.add(downlightRims,downlights);
  // Restrained rainwater goods: one cream gutter batch follows the actual
  // roof boundary, and four provisional pipe routes attach at inside returns.
  const gutter=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.055,.075),eaveMaterial,soffitEdges.length),rainDummy=new THREE.Object3D();gutter.name='city-hall-gutters';
  soffitEdges.forEach((e,i)=>{const dx=e.r[0]-e.t[0],dz=e.r[2]-e.t[2],length=Math.hypot(dx,dz);rainDummy.position.set((e.t[0]+e.r[0])/2-e.ix*.035,(e.t[1]+e.r[1])/2+.13,(e.t[2]+e.r[2])/2-e.iz*.035);rainDummy.rotation.set(0,-Math.atan2(dz,dx),0);rainDummy.scale.set(length,1,1);rainDummy.updateMatrix();gutter.setMatrixAt(i,rainDummy.matrix)});gutter.instanceMatrix.needsUpdate=true;group.add(gutter);
  const rainSegments=[],rainBrackets=[],upRain=new THREE.Vector3(0,1,0);
  function addRainSegment(a,b){const breakpoints=[3.4,4,6.95,7.4,8.8],ys=[a[1],...breakpoints.filter(y=>y>Math.min(a[1],b[1])+1e-6&&y<Math.max(a[1],b[1])-1e-6).sort((x,y)=>a[1]<b[1]?x-y:y-x),b[1]];for(let i=1;i<ys.length;i++){const interp=y=>{const t=(y-a[1])/(b[1]-a[1]);return new THREE.Vector3(a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t)};rainSegments.push([interp(ys[i-1]),interp(ys[i])])}}
  for(const index of [0,5,10,15]){const p=ring[index],prev=ring[(index+cornerCount-1)%cornerCount],dx=prev[0]-p[0],dz=prev[1]-p[1],d=Math.hypot(dx,dz),wallIn=inward(prev,p),x=p[0]+dx/d*.20-wallIn[0]*.065,z=p[1]+dz/d*.20-wallIn[1]*.065;let closest=null;
    for(const e of soffitEdges){const ex=e.r[0]-e.t[0],ez=e.r[2]-e.t[2],den=ex*ex+ez*ez,t=den?Math.max(0,Math.min(1,((x-e.t[0])*ex+(z-e.t[2])*ez)/den)):0,tx=e.t[0]+ex*t,tz=e.t[2]+ez*t,distance=Math.hypot(x-tx,z-tz);if(!closest||distance<closest.distance)closest={x:tx,z:tz,y:e.t[1]+(e.r[1]-e.t[1])*t+.13,distance}}
    if(!closest||closest.distance>.75||closest.y<1)continue;const top=closest.y-.20;addRainSegment([x,.18,z],[x,top,z]);addRainSegment([x,top,z],[closest.x,closest.y,closest.z]);addRainSegment([x,.18,z],[x-wallIn[0]*.15,.06,z-wallIn[1]*.15]);for(const y of [1,3,5,7])if(y<top)rainBrackets.push({x,y,z,ix:wallIn[0],iz:wallIn[1]})
  }
  const downpipes=new THREE.InstancedMesh(new THREE.CylinderGeometry(.04,.04,1,8),eaveMaterial,rainSegments.length);downpipes.name='city-hall-downpipes';rainSegments.forEach(([a,b],i)=>{const d=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);rainDummy.position.copy(mid);rainDummy.quaternion.setFromUnitVectors(upRain,d.clone().normalize());rainDummy.scale.set(1,d.length(),1);rainDummy.updateMatrix();downpipes.setMatrixAt(i,rainDummy.matrix)});downpipes.instanceMatrix.needsUpdate=true;group.add(downpipes);
  const rainClips=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.045,.15),eaveMaterial,rainBrackets.length);rainClips.name='city-hall-downpipe-brackets';rainBrackets.forEach((p,i)=>{rainDummy.position.set(p.x,p.y,p.z);rainDummy.rotation.set(0,0,0);rainDummy.scale.set(1,1,1);rainDummy.updateMatrix();rainClips.setMatrixAt(i,rainDummy.matrix)});rainClips.instanceMatrix.needsUpdate=true;group.add(rainClips);
  const wallFittings=rainBrackets.filter(p=>p.y===5),fittings=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.16,.025),eaveMaterial,wallFittings.length);fittings.name='city-hall-square-wall-fittings';wallFittings.forEach((p,i)=>{rainDummy.position.set(p.x+p.ix*.055,p.y,p.z+p.iz*.055);rainDummy.rotation.set(0,Math.atan2(p.ix,p.iz),0);rainDummy.scale.set(1,1,1);rainDummy.updateMatrix();fittings.setMatrixAt(i,rainDummy.matrix)});fittings.instanceMatrix.needsUpdate=true;group.add(fittings);
  // A modest open belfry at the central roof apex. The separate facade gable
  // carries the clock; the belfry contains no clock. Heights are estimates.
  const main=roofPlans[0],center=world((main.a+main.b)/2,(main.d+main.e)/2,0),cupola=new THREE.Group();
  cupola.name='city-hall-cupola';cupola.position.set(center[0],0,center[2]);cupola.rotation.y=-angle;group.add(cupola);
  const plaster=new THREE.MeshLambertMaterial({color:0xc5bcaa,side:THREE.DoubleSide});
  // Extend the curb below the sloped roof surface; its upper edge remains at
  // the opening bases while its concealed lower portion anchors the corners.
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(2.55,.65,2.55),plaster);plinth.position.y=8.625;plinth.name='city-hall-cupola-base';cupola.add(plinth);
  // Continue the walls into the sloped roof: its surface above the frames is
  // higher than the eave, so meeting the eave height would leave an open seam.
  const frameShape=new THREE.Shape(),half=1.04,r=.55,spring=9.76,bottom=8.95,top=10.80;
  frameShape.moveTo(-half,bottom);frameShape.lineTo(-r,bottom);frameShape.lineTo(-r,spring);
  // Compensate for the later vertical elevation remap so the opening's
  // head remains round instead of becoming a tall ellipse.
  const archRise=r/(3.9/1.78);
  for(let i=1;i<=12;i++){const t=Math.PI-i*Math.PI/12;frameShape.lineTo(r*Math.cos(t),spring+archRise*Math.sin(t))}
  frameShape.lineTo(r,bottom);frameShape.lineTo(half,bottom);frameShape.lineTo(half,top);frameShape.lineTo(-half,top);frameShape.closePath();
  const frameGeometry=new THREE.ExtrudeGeometry(frameShape,{depth:.16,bevelEnabled:false});
  for(let side=0;side<4;side++){let frame=new THREE.Mesh(frameGeometry,plaster),theta=side*Math.PI/2;frame.rotation.y=theta;frame.position.set(Math.sin(theta)*1.04,0,Math.cos(theta)*1.04);frame.name='city-hall-cupola-arch';cupola.add(frame)}
  // Shallow cream pilaster strips and arch bands sit on the existing frames;
  // neither crosses the open aperture or implies a closed interior.
  const belfryTrim=new THREE.MeshLambertMaterial({color:0xb7af9f,side:THREE.DoubleSide}),pilasterGeometry=new THREE.BoxGeometry(.095,top-bottom-.08,.045),bandVertices=[];
  for(let i=0;i<12;i++){const a=Math.PI-i*Math.PI/12,b=Math.PI-(i+1)*Math.PI/12,outer=r+.075,inner=r+.012,point=(radius,t)=>[radius*Math.cos(t),spring+radius*Math.sin(t)/(3.9/1.78),.175],p=point(inner,a),q=point(inner,b),u=point(outer,b),v=point(outer,a);bandVertices.push(...p,...q,...u,...p,...u,...v)}
  const bandGeometry=new THREE.BufferGeometry();bandGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bandVertices,3));bandGeometry.computeVertexNormals();
  for(let side=0;side<4;side++){const theta=side*Math.PI/2,s=Math.sin(theta),c=Math.cos(theta);let band=new THREE.Mesh(bandGeometry,belfryTrim);band.position.set(s*1.04,0,c*1.04);band.rotation.y=theta;band.name='city-hall-cupola-arch-trim';cupola.add(band);for(const x of [-.98,.98]){let pilaster=new THREE.Mesh(pilasterGeometry,belfryTrim);pilaster.position.set(s*1.225+c*x,(top+bottom)/2,c*1.225-s*x);pilaster.rotation.y=theta;pilaster.name='city-hall-cupola-pilaster';cupola.add(pilaster)}}
  // The small, dark hanging form is visible in the 2005 reference photograph.
  const bellMaterial=new THREE.MeshLambertMaterial({color:0x3f4038}),bell=new THREE.Mesh(new THREE.CylinderGeometry(.10,.20,.32,12),bellMaterial);bell.position.y=10.12;bell.name='city-hall-cupola-bell';cupola.add(bell);
  const bellLip=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.04,12),bellMaterial);bellLip.position.y=9.96;bellLip.name='city-hall-cupola-bell-lip';cupola.add(bellLip);
  const hanger=new THREE.Mesh(new THREE.BoxGeometry(.05,.28,.05),bellMaterial);hanger.position.y=10.42;hanger.name='city-hall-cupola-hanger';cupola.add(hanger);
  const capVertices=[],corners=[[-1.35,10.58,-1.35],[1.35,10.58,-1.35],[1.35,10.58,1.35],[-1.35,10.58,1.35]],apex=[0,11.18,0];
  for(let i=0;i<4;i++)capVertices.push(...corners[i],...corners[(i+1)%4],...apex);
  const capGeometry=new THREE.BufferGeometry();capGeometry.setAttribute('position',new THREE.Float32BufferAttribute(capVertices,3));capGeometry.computeVertexNormals();setCityHallRoofUV(capGeometry,0);
  const cupolaRoof=new THREE.Mesh(capGeometry,roofs);cupolaRoof.name='city-hall-cupola-roof';cupola.add(cupolaRoof);
  // A modest fascia runs beneath the projecting cap; small paired supports
  // remain against each frame rather than filling its arched opening.
  const capFasciaGeometry=new THREE.BoxGeometry(2.7,.0548,.10),capBracketGeometry=new THREE.BoxGeometry(.12,.07,.20);
  for(let side=0;side<4;side++){const theta=side*Math.PI/2,s=Math.sin(theta),c=Math.cos(theta),fascia=new THREE.Mesh(capFasciaGeometry,plaster);fascia.position.set(s*1.30,10.5526,c*1.30);fascia.rotation.y=theta;fascia.name='city-hall-cupola-fascia';cupola.add(fascia);for(const x of [-.72,.72]){const bracket=new THREE.Mesh(capBracketGeometry,plaster);bracket.position.set(s*1.22+c*x,10.49,c*1.22-s*x);bracket.rotation.y=theta;bracket.name='city-hall-cupola-eave-bracket';cupola.add(bracket)}}
  const segments=cityHallRidgeSegments(roofVertices),cupolaRidgeStart=segments.length,uc=(main.a+main.b)/2,vc=(main.d+main.e)/2;
  for(const corner of corners)segments.push([world(uc+corner[0],vc+corner[2],corner[1]),world(uc,vc,apex[1])]);
  const capPieces=[];for(const [segmentIndex,[a,b]] of segments.entries()){const delta=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),length=delta.length(),count=Math.max(1,Math.ceil(length/.30));for(let i=0;i<count;i++){const t=(i+.5)/count;capPieces.push({x:a[0]+delta.x*t,y:a[1]+delta.y*t+.025,z:a[2]+delta.z*t,length:Math.max(.01,length/count-.012),direction:delta,cupola:segmentIndex>=cupolaRidgeStart})}}
  const ridge=new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.075,1,8),new THREE.MeshLambertMaterial({color:0x8e5947}),capPieces.length),dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  ridge.name='city-hall-ridge-caps';capPieces.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.quaternion.setFromUnitVectors(up,p.direction.clone().normalize());dummy.scale.set(1,p.length,1);dummy.updateMatrix();ridge.setMatrixAt(i,dummy.matrix)});ridge.instanceMatrix.needsUpdate=true;group.add(ridge);
  // Piecewise elevation correction from county LiDAR: preserve the lower
  // entrances, raise the upper storey, and increase cupola height separately.
  // All coordinates are transformed in building/world space so joins shared
  // by walls, gables, roof and details remain coincident.
  {
  // Keep the photographed upper windows and their surrounds at their
  // modeled height; place the added wall height between the two storeys.
  const elevation=y=>y<=3.4?y:y<=4?3.4+(y-3.4)*(1.6/.6):y<=6.95?y+1:y<=7.4?7.95+(y-6.95)*(1.45/.45):y<=8.8?y+2:10.8+(y-8.8)*(4.5/2.38);
  const slope=y=>y<=3.4?1:y<=4?1.6/.6:y<=6.95?1:y<=7.4?1.45/.45:y<=8.8?1:4.5/2.38;
  // Keep the small belfry roof shallow while retaining the measured apex.
  // Its walls and four ridge runs use exactly the same elevation mapping.
  const cupolaElevation=y=>y<=8.8?elevation(y):y<=10.58?10.8+(y-8.8)*(3.9/1.78):y+4.12;
  const cupolaSlope=y=>y<=8.8?slope(y):y<=10.58?3.9/1.78:1;
  group.updateMatrixWorld(true);const replaced=new Set(),point=new THREE.Vector3(),inv=new THREE.Matrix4(),matrix=new THREE.Matrix4(),world=new THREE.Matrix4(),adjust=new THREE.Matrix4();
  group.traverse(o=>{if(!o.isMesh)return;inv.copy(o.matrixWorld).invert();const isCupola=o.parent===cupola,map=isCupola?cupolaElevation:elevation;
    if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);world.multiplyMatrices(o.matrixWorld,matrix);point.setFromMatrixPosition(world);const isCupolaRidge=o===ridge&&capPieces[i].cupola,isCupolaEnd=o===ends&&tileEdges[i].cupola,instanceMap=isCupolaRidge||isCupolaEnd?cupolaElevation:elevation,instanceSlope=isCupolaRidge?cupolaSlope:slope,sy=isCupolaEnd?1:instanceSlope(point.y),dy=instanceMap(point.y)-sy*point.y;adjust.makeScale(1,sy,1);adjust.elements[13]=dy;matrix.multiplyMatrices(inv,adjust.multiply(world));o.setMatrixAt(i,matrix)}o.instanceMatrix.needsUpdate=true;o.boundingBox=null;o.boundingSphere=null;return}
    const old=o.geometry,g=old.clone(),position=g.getAttribute('position');replaced.add(old);
    for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld);point.y=map(point.y);point.applyMatrix4(inv);position.setXYZ(i,point.x,point.y,point.z)}position.needsUpdate=true;g.computeVertexNormals();if(o===roof||o===cupolaRoof)setCityHallRoofUV(g,o===roof?angle:0);g.computeBoundingBox();g.computeBoundingSphere();o.geometry=g;
  });
  // Rebuild ridge caps from the final deformed roof surfaces. Transforming
  // old ridge instances around their midpoints can leave a step wherever a
  // piece crosses a change in the elevation mapping.
  const finalSegments=cityHallRidgeSegments(Array.from(roof.geometry.getAttribute('position').array));
  const finalApex=cupola.localToWorld(new THREE.Vector3(0,cupolaElevation(apex[1]),0));
  for(const corner of corners){const p=cupola.localToWorld(new THREE.Vector3(corner[0],cupolaElevation(corner[1]),corner[2]));finalSegments.push([p.toArray(),finalApex.toArray()])}
  const finalCaps=[];for(const [a,b] of finalSegments){const dir=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),length=dir.length(),count=Math.max(1,Math.ceil(length/.30));for(let i=0;i<count;i++){const t=(i+.5)/count;finalCaps.push({x:a[0]+dir.x*t,y:a[1]+dir.y*t+.025,z:a[2]+dir.z*t,length:Math.max(.01,length/count-.012),direction:dir})}}
  const alignedRidge=new THREE.InstancedMesh(ridge.geometry,ridge.material,finalCaps.length);alignedRidge.name=ridge.name;finalCaps.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.quaternion.setFromUnitVectors(up,p.direction.clone().normalize());dummy.scale.set(1,p.length,1);dummy.updateMatrix();alignedRidge.setMatrixAt(i,dummy.matrix)});alignedRidge.instanceMatrix.needsUpdate=true;group.remove(ridge);ridge.dispose();group.add(alignedRidge);
  // A warped junction can tilt a return soffit away from its original
  // candidate position. Retain added supports only where the final underside
  // is actually close to the support top.
  group.updateMatrixWorld(true);const supportRay=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),supportPosition=new THREE.Vector3(),supportMatrix=new THREE.Matrix4();
  for(let i=supports.count-1;i>=soffitSupports.length;i--){supports.getMatrixAt(i,supportMatrix);supportPosition.setFromMatrixPosition(supportMatrix);supportRay.set(new THREE.Vector3(supportPosition.x,supportPosition.y+1,supportPosition.z),down);supportRay.far=2;const hit=supportRay.intersectObject(soffit)[0];if(!hit||Math.abs(hit.point.y-(supportPosition.y+.06))>.10){const last=supports.count-1;if(i!==last){supports.getMatrixAt(last,supportMatrix);supports.setMatrixAt(i,supportMatrix)}supports.count--}}
  supports.instanceMatrix.needsUpdate=true;supports.boundingBox=null;supports.boundingSphere=null;
  for(let i=downlights.count-1;i>=0;i--){downlights.getMatrixAt(i,supportMatrix);supportPosition.setFromMatrixPosition(supportMatrix);supportRay.set(new THREE.Vector3(supportPosition.x,supportPosition.y+.3,supportPosition.z),down);supportRay.far=.6;const hit=supportRay.intersectObject(soffit)[0];if(!hit||Math.abs(hit.point.y-supportPosition.y)>.04){const last=downlights.count-1;if(i!==last){downlights.getMatrixAt(last,supportMatrix);downlights.setMatrixAt(i,supportMatrix);downlightRims.getMatrixAt(last,supportMatrix);downlightRims.setMatrixAt(i,supportMatrix)}downlights.count--;downlightRims.count--}}
  for(const item of [downlights,downlightRims]){item.instanceMatrix.needsUpdate=true;item.boundingBox=null;item.boundingSphere=null}
  const retained=new Set();group.traverse(o=>{if(o.geometry)retained.add(o.geometry)});for(const geometry of replaced)if(!retained.has(geometry))geometry.dispose();
  }
  // Ordinary, restrained south display: a bare rooftop mast and two short
  // facade poles, with one simplified US flag. Dimensions are estimates.
  const poleMaterial=new THREE.MeshLambertMaterial({color:0xb7b5a6}),halyardMaterial=new THREE.MeshLambertMaterial({color:0x777b72}),flagGroup=new THREE.Group();flagGroup.name='city-hall-flag-assembly';group.add(flagGroup);
  function poleBetween(a,b,radius,material,name){const d=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,d.length(),8),material);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());mesh.name=name;flagGroup.add(mesh);return mesh}
  const mastBase=new THREE.Vector3(center[0],15.30,center[2]),mastTop=new THREE.Vector3(center[0],20.10,center[2]);poleBetween(mastBase,mastTop,.035,poleMaterial,'city-hall-rooftop-mast');const finial=new THREE.Mesh(new THREE.SphereGeometry(.065,8,6),new THREE.MeshLambertMaterial({color:0xaa986d}));finial.position.copy(mastTop).add(new THREE.Vector3(0,.065,0));finial.name='city-hall-mast-finial';flagGroup.add(finial);
  poleBetween(new THREE.Vector3(center[0]+.09,15.40,center[2]),new THREE.Vector3(center[0]+.09,20.04,center[2]),.008,halyardMaterial,'city-hall-mast-halyard');poleBetween(new THREE.Vector3(center[0]+.09,20.04,center[2]),mastTop,.008,halyardMaterial,'city-hall-mast-halyard-return');
  const sa=ring[15],sb=ring[16],sdx=sb[0]-sa[0],sdz=sb[1]-sa[1],sl=Math.hypot(sdx,sdz),st=new THREE.Vector3(sdx/sl,0,sdz/sl),sn=new THREE.Vector3(area>0?sdz/sl:-sdz/sl,0,area>0?-sdx/sl:sdx/sl);let flagTop,flagBottom;
  for(const [i,t] of [.27,.73].entries()){const base=new THREE.Vector3(sa[0]+sdx*t,4.70,sa[1]+sdz*t).addScaledVector(sn,.055),top=base.clone().addScaledVector(sn,.58).add(new THREE.Vector3(0,1.36,0));poleBetween(base,top,.025,poleMaterial,'city-hall-south-flagpole');poleBetween(base.clone().addScaledVector(sn,-.055),base,.038,poleMaterial,'city-hall-south-pole-mount');if(i===0){flagTop=top;flagBottom=base.clone().lerp(top,.55)}}
  // Small striped national flag, shown in an ordinary static display; no
  // event-specific emblems or copied reference pixels are used.
  const flagPositions=[],flagColors=[],red=new THREE.Color(0x9c4d45),white=new THREE.Color(0xd6d4c4),blue=new THREE.Color(0x425b6f),normal=sn.clone();
  const flagPoint=(u,v,layer=0)=>flagTop.clone().lerp(flagBottom,v).addScaledVector(st,-.82*u).addScaledVector(normal,layer+.025*Math.sin(Math.PI*u));
  const flagTri=(a,b,c,color)=>{for(const p of [a,b,c]){flagPositions.push(p.x,p.y,p.z);flagColors.push(color.r,color.g,color.b)}};
  const flagQuad=(u0,v0,u1,v1,color,layer=0)=>{const a=flagPoint(u0,v0,layer),b=flagPoint(u1,v0,layer),c=flagPoint(u1,v1,layer),d=flagPoint(u0,v1,layer);flagTri(a,b,c,color);flagTri(a,c,d,color)};
  for(let row=0;row<13;row++)for(let col=0;col<4;col++)flagQuad(col/4,row/13,(col+1)/4,(row+1)/13,row%2?white:red);flagQuad(0,0,.4,7/13,blue,.004);
  for(let row=0;row<9;row++){const count=row%2?5:6;for(let col=0;col<count;col++){const u=.025+(col+(row%2?.5:0))*.064,v=.035+row*.058;flagQuad(u,v,u+.010,v+.012,white,.008)}}
  const flagGeometry=new THREE.BufferGeometry();flagGeometry.setAttribute('position',new THREE.Float32BufferAttribute(flagPositions,3));flagGeometry.setAttribute('color',new THREE.Float32BufferAttribute(flagColors,3));flagGeometry.computeVertexNormals();const flag=new THREE.Mesh(flagGeometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));flag.name='city-hall-south-us-flag';flagGroup.add(flag);
  return group;
}

export function buildSonomaEnvironment(layout, map = []) {
  const group=new THREE.Group();group.name='sonoma-environment';
  const surface=(coords,height,color,name,extrude=false)=>{
    const shape=new THREE.Shape();coords.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    const geometry=extrude?new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.name=name;group.add(mesh);return mesh;
  };
  const park=surface(layout.plaza.coordinates,0,0x748762,'sonoma-plaza');park.position.y=.002;
  const buildingMaterial=new THREE.MeshLambertMaterial({color:0x887e6d,side:THREE.DoubleSide});
  const cityHallMaterial=new THREE.MeshLambertMaterial({color:0xaaa092,side:THREE.DoubleSide});
  for(const b of layout.buildings){if(b.id==='27498189'){const hall=buildSonomaCityHall({...b,coordinates:b.visualBaseCoordinates||b.coordinates},cityHallMaterial,layout.paths),factor=b.horizontalScale||1,center=b.scaleCenter||[0,0];hall.scale.set(factor,1,factor);hall.position.set(center[0]*(1-factor),0,center[1]*(1-factor));if(factor!==1)for(const [name,angle] of [['city-hall-hip-roofs',7.36*Math.PI/180],['city-hall-cupola-roof',0]]){const geometry=hall.getObjectByName(name).geometry,scaled=geometry.clone();scaled.scale(factor,1,factor);setCityHallRoofUV(scaled,angle);geometry.setAttribute('uv',scaled.getAttribute('uv').clone());scaled.dispose()}group.add(hall);continue}const shape=new THREE.Shape();b.coordinates.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();let mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:b.height,bevelEnabled:false}),buildingMaterial);mesh.rotation.x=-Math.PI/2;mesh.name='sonoma-building-'+b.id;group.add(mesh)}
  const ribbons=(segments,width,color,name,y)=>{const vertices=[];for(const {coordinates:[a,b]} of segments){let dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);if(!d)continue;let sx=-dz/d*width/2,sz=dx/d*width/2;for(const p of [[a[0]+sx,a[1]+sz],[a[0]-sx,a[1]-sz],[b[0]+sx,b[1]+sz],[a[0]-sx,a[1]-sz],[b[0]-sx,b[1]-sz],[b[0]+sx,b[1]+sz]])vertices.push(p[0],y,p[1])}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();let mesh=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide}));mesh.name=name;group.add(mesh)};
  // Sidewalks are a uniform visual approximation flanking the sourced road
  // centerlines; OSM does not establish these exact sidewalk boundaries.
  ribbons(layout.streets,10.25,0x99978a,'sonoma-sidewalks',.004);ribbons(layout.streets,7,0x666660,'sonoma-streets',.006);ribbons(layout.paths,1.4,0xaaa58e,'sonoma-paths',.012);
  if(layout.parkedCar){
    // Approximate local parking context; the car's polygon is separately
    // rasterized into the same navigation grid as the building footprints.
    const spec=layout.parkedCar,parking=new THREE.Group();parking.name='sonoma-south-parking';parking.position.set(spec.center[0],0,spec.center[1]);parking.rotation.y=-Math.atan2(spec.tangent[1],spec.tangent[0]);group.add(parking);
    const asphalt=new THREE.MeshLambertMaterial({color:0x676a66}),paint=new THREE.MeshLambertMaterial({color:0xd8d9c9}),blue=new THREE.MeshLambertMaterial({color:0x48738a}),body=new THREE.MeshLambertMaterial({color:0x5d6c6c}),glass=new THREE.MeshLambertMaterial({color:0x334a4d,side:THREE.DoubleSide}),rubber=new THREE.MeshLambertMaterial({color:0x303431});
    function box(w,h,d,x,y,z,material,name){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);if(name)m.name=name;parking.add(m);return m}
    box(10,.012,5,2.4,.009,0,asphalt,'sonoma-parking-apron');
    for(const x of [-2.4,2.5,7.2])box(.07,.004,4.5,x,.019,0,paint,'sonoma-parking-line');
    box(1.35,.004,1.35,4.9,.019,0,blue,'sonoma-accessible-mark');
    const ring=new THREE.Mesh(new THREE.RingGeometry(.21,.27,16),paint);ring.rotation.x=-Math.PI/2;ring.position.set(4.9,.023,.08);ring.name='sonoma-accessible-wheel';parking.add(ring);
    box(.11,.004,.35,4.9,.023,-.25,paint);box(.34,.004,.10,5.01,.023,-.10,paint);box(.10,.004,.25,5.14,.023,.02,paint);
    box(4.5,.55,1.8,0,.57,0,body,'sonoma-parked-sedan-body');
    const cabinShape=new THREE.Shape();cabinShape.moveTo(-1.34,.84);cabinShape.lineTo(-.82,1.43);cabinShape.lineTo(.80,1.43);cabinShape.lineTo(1.40,.84);cabinShape.closePath();const cabin=new THREE.Mesh(new THREE.ExtrudeGeometry(cabinShape,{depth:1.42,bevelEnabled:false}),body);cabin.position.z=-.71;cabin.name='sonoma-parked-sedan-cabin';parking.add(cabin);
    const windowShape=new THREE.Shape();windowShape.moveTo(-1.12,.91);windowShape.lineTo(-.73,1.34);windowShape.lineTo(.69,1.34);windowShape.lineTo(1.13,.91);windowShape.closePath();const windowGeometry=new THREE.ShapeGeometry(windowShape);for(const z of [-.716,.716]){const pane=new THREE.Mesh(windowGeometry,glass);pane.position.z=z;pane.name='sonoma-parked-sedan-window';parking.add(pane)}
    for(const z of [-.72,.72])box(.055,.43,.025,.02,1.11,z,body);
    const wheelGeometry=new THREE.CylinderGeometry(.32,.32,.18,12);for(const x of [-1.45,1.45])for(const z of [-.78,.78]){const wheel=new THREE.Mesh(wheelGeometry,rubber);wheel.position.set(x,.32,z);wheel.rotation.x=Math.PI/2;wheel.name='sonoma-parked-sedan-wheel';parking.add(wheel)}
  }
  const stationGeometry=new THREE.BoxGeometry(1,2.5,1),stationMaterial=new THREE.MeshLambertMaterial({color:0x55594d});
  for(let z=0;z<map.length;z++)for(let x=0;x<map[z].length;x++)if([6,7,8].includes(map[z][x])){let station=new THREE.Mesh(stationGeometry,stationMaterial);station.name='sonoma-station';station.position.set(x+.5,1.25,z+.5);group.add(station)}
  return group;
}

export function createRenderer3D(canvas, map, gateCoordinates = [], rendererFactory = options => new THREE.WebGLRenderer(options), labelCanvasFactory = () => document.createElement('canvas'), townBuildings = [], sonoma = null) {
  if (!canvas || !Array.isArray(map) || !map.length) throw new TypeError('canvas and map required');
  const renderer=rendererFactory({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(1, globalThis.devicePixelRatio || 1));
  // Colors and the procedural sky share the same explicit output conversion.
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  renderer.setClearColor(ATMOSPHERE.horizon); const scene=new THREE.Scene();
  scene.fog=new THREE.Fog(ATMOSPHERE.horizon,sonoma?120:ATMOSPHERE.fogNear,sonoma?350:ATMOSPHERE.fogFar);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{zenithColor:{value:new THREE.Color(ATMOSPHERE.zenith)},horizonColor:{value:new THREE.Color(ATMOSPHERE.horizon)}},vertexShader:'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:"uniform vec3 zenithColor;\nuniform vec3 horizonColor;\nvarying vec3 vDirection;\nvoid main(){\n float t=smoothstep(0.0,0.8,normalize(vDirection).y);\n gl_FragColor=vec4(mix(horizonColor,zenithColor,t),1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}"});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(sonoma?400:80,24,12),skyMaterial);sky.name='twilight-sky';sky.renderOrder=-1000;sky.frustumCulled=false;scene.add(sky);
  const hemisphere=new THREE.HemisphereLight(ATMOSPHERE.hemiSky,ATMOSPHERE.hemiGround,ATMOSPHERE.hemiIntensity);hemisphere.name='sky-fill';scene.add(hemisphere);
  // Keep the weapon's established fill independent of changes to town exposure.
  const weaponFill=new THREE.HemisphereLight(ATMOSPHERE.hemiSky,ATMOSPHERE.hemiGround,ATMOSPHERE.weaponHemiIntensity);weaponFill.name='weapon-fill';weaponFill.layers.set(1);scene.add(weaponFill);
  const sunlight=new THREE.DirectionalLight(ATMOSPHERE.sunColor,ATMOSPHERE.sunIntensity);sunlight.name='twilight-sun';sunlight.position.set(-5,12,4);scene.add(sunlight);
  // Unshadowed point lights illuminated both sides of solid walls. Fixtures stay visible
  // as emissive-colored details; outdoor fill avoids leaking local light through walls.
  const camera=new THREE.PerspectiveCamera(65,1,.05,sonoma?450:100);camera.rotation.order='YXZ';scene.add(camera);
  const weaponKey=new THREE.DirectionalLight(0xe5dcc5,.45);weaponKey.name='weapon-key';weaponKey.layers.set(1);weaponKey.position.set(-.5,1,.5);weaponKey.target.position.set(0,0,-1);camera.add(weaponKey,weaponKey.target);
  const groundTexture=new THREE.DataTexture(terrainPixels(),64,64,THREE.RGBAFormat);groundTexture.name='terrain-tile';groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(map[0].length/4,map.length/4);groundTexture.colorSpace=THREE.SRGBColorSpace;groundTexture.magFilter=THREE.LinearFilter;groundTexture.minFilter=THREE.LinearMipmapLinearFilter;groundTexture.generateMipmaps=true;groundTexture.anisotropy=Math.min(4,renderer.capabilities?.getMaxAnisotropy?.()||1);groundTexture.needsUpdate=true;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(map[0].length,map.length),new THREE.MeshStandardMaterial({color:0x59665a,map:groundTexture,roughness:1,metalness:0}));ground.name='terrain';
  ground.rotation.x=-Math.PI/2;ground.position.set(map[0].length/2,-.01,map.length/2);scene.add(ground);
  let routesReady=false;function ensureRoutes(routes){if(routesReady||!routes?.length)return;routesReady=true;const data=routeVertices(routes);for(const [name,vertices,color,opacity] of [['world-paths',data.path,0xffffff,.52],['world-tracks',data.tracks,0x37463b,.36]]){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));if(name==='world-paths')g.setAttribute('color',new THREE.Float32BufferAttribute(data.pathColors,3));g.computeVertexNormals();let m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color,vertexColors:name==='world-paths',transparent:true,opacity,depthWrite:true,depthFunc:THREE.LessDepth,side:THREE.DoubleSide}));m.name=name;m.renderOrder=name==='world-paths'?1:2;applyRoomSunOcclusion(m.material,roomBounds);scene.add(m)}const wear=buildRoadWear(map,routes);wear.traverse(o=>{if(o.material)applyRoomSunOcclusion(o.material,roomBounds)});scene.add(wear)}
  const geometry=new THREE.BoxGeometry(1,1,1), gateCells=[];let gateMesh=null;
  for(const [type,cells] of (sonoma?[]:wallCells(map))) {
    if(type===5)continue;
    const color=colors[type]||colors[3],architectural=[2,3,4,6,7,8,10,11,12].includes(type),material=architectural?new THREE.MeshStandardMaterial({color,roughness:type===2?.99:type===11?.94:type===10?.96:.97,metalness:0}):new THREE.MeshLambertMaterial({color}),mesh=new THREE.InstancedMesh(geometry,material,cells.length);mesh.name='world-wall-'+type;
    const dummy=new THREE.Object3D();cells.forEach(({x,z},i)=>{dummy.position.set(x+.5,1.25,z+.5);dummy.scale.set(1,2.5,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
  }
  // Gate coordinates are stable even when the adapter initializes after a purchase.
  const uniqueGates=new Map();for(const [x,z] of gateCoordinates)uniqueGates.set(x+','+z,{x,z});
  for(const cell of wallCells(map).get(5)||[])uniqueGates.set(cell.x+','+cell.z,cell);
  if(uniqueGates.size){gateMesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:colors[5]}),uniqueGates.size);gateMesh.name='gates';gateMesh.frustumCulled=false;let dummy=new THREE.Object3D(),i=0;for(const {x,z} of uniqueGates.values()){let open=map[z][x]===0;dummy.position.set(x+.5,1.25,z+.5);dummy.scale.set(open?0:1,open?0:2.5,open?0:1);dummy.updateMatrix();gateMesh.setMatrixAt(i,dummy.matrix);gateCells.push({x,z,i,open});i++}gateMesh.instanceMatrix.needsUpdate=true;scene.add(gateMesh)}
  // Static pitched roofs cover the outpost and annex; their undersides are visible indoors.
  const roofVertices=[];function tri(a,b,c){roofVertices.push(...a,...b,...c)}function quad(a,b,c,d){tri(a,b,c);tri(a,c,d)}
  for(const r of [...OUTPOST_ROOFS,...townBuildings.map(b=>({x0:b.x0-.2,x1:b.x1+1.2,z0:b.z0-.2,z1:b.z1+1.2,ridge:(b.x0+b.x1+1)/2,eave:2.5,peak:b.roofPeak??3.3}))]){let L=[r.x0,r.eave,r.z0],R=[r.x1,r.eave,r.z0],M=[r.ridge,r.peak,r.z0],l=[r.x0,r.eave,r.z1],rr=[r.x1,r.eave,r.z1],m=[r.ridge,r.peak,r.z1];quad(L,l,m,M);quad(M,m,rr,R);tri(L,M,R);tri(l,rr,m)}
  const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roofVertices,3));roofGeometry.computeVertexNormals();const roofs=new THREE.Mesh(roofGeometry,new THREE.MeshStandardMaterial({color:0x48534c,roughness:.92,metalness:0,side:THREE.DoubleSide}));roofs.name='outpost-roofs';scene.add(roofs);
  // Opaque window panes and trim sit on solid cell faces, leaving no false walk-through opening.
  const faces=sonoma?[]:windowFaces(map),paneGeom=geometry,frameGeom=geometry,pane=new THREE.InstancedMesh(paneGeom,new THREE.MeshStandardMaterial({color:0x58757a,roughness:.65,metalness:.05}),Math.max(1,faces.length)),frame=new THREE.InstancedMesh(frameGeom,new THREE.MeshLambertMaterial({color:0x37473e}),Math.max(1,faces.length*5));pane.name='window-panes';frame.name='window-trim';pane.count=faces.length;frame.count=faces.length*5;
  let detailDummy=new THREE.Object3D(),frameIndex=0;function detail(mesh,index,x,y,z,sx,sy,sz){detailDummy.position.set(x,y,z);detailDummy.scale.set(sx,sy,sz);detailDummy.rotation.set(0,0,0);detailDummy.updateMatrix();mesh.setMatrixAt(index,detailDummy.matrix)}
  faces.forEach((v,index)=>{let xFace=v.dx!==0,place=(mesh,n,along,y,w,h)=>{let offset=mesh===frame?.528:.508,x=v.x+.5+v.dx*offset,z=v.z+.5+v.dz*offset;detail(mesh,n,x+(xFace?0:along),y,z+(xFace?along:0),xFace?.025:w,h,xFace?w:.025)};place(pane,index,0,1.45,.72,1.05);place(frame,frameIndex++,-.39,1.45,.07,1.2);place(frame,frameIndex++,.39,1.45,.07,1.2);place(frame,frameIndex++,0,.88,.92,.09);place(frame,frameIndex++,0,2.02,.85,.07);place(frame,frameIndex++,0,1.45,.78,.055)});pane.instanceMatrix.needsUpdate=true;frame.instanceMatrix.needsUpdate=true;scene.add(pane,frame);
  // Existing empty map cells remain clear; lintels sit above the full wall height.
  const lintelDefs=[[10,2.6,14.5,2,.2,1],[15.5,2.6,10,1,.2,2],[15.5,2.6,7,1,.2,2],[19.5,2.6,24,1,.2,2],[24,2.6,19.5,2,.2,1],[28.5,2.6,22,1,.2,2]],lintels=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0x786e58}),lintelDefs.length);lintels.name='door-lintels';lintelDefs.forEach((d,i)=>detail(lintels,i,...d));lintels.instanceMatrix.needsUpdate=true;scene.add(lintels);
  const porch=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.8),new THREE.MeshLambertMaterial({color:0x776b56,side:THREE.DoubleSide}));porch.name='outpost-porch';porch.rotation.x=-Math.PI/2;porch.position.set(10,.006,15.9);scene.add(porch);
  // Distinct roofline cues are above wall height and use the same town contract.
  if(townBuildings.length){let details=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color:0xffffff}),townBuildings.length),shape=new THREE.Object3D(),tint=new THREE.Color();details.name='town-roofline-cues';details.count=0;for(const b of townBuildings){let x=(b.x0+b.x1+1)/2,z=(b.z0+b.z1+1)/2,y,sx,sy,sz,color;if(b.role==='shop'){y=2.83;sx=3.4;sy=.5;sz=.14;z=b.z1+1.03;color=0x775642}else if(b.role==='civic'){y=4.08;sx=1.0;sy=1.4;sz=1.0;color=0x607178}else if(b.role==='residential'){x=b.x0+1.5;z=b.z0+1.6;y=3.65;sx=.45;sy=1.3;sz=.45;color=0x68574e}else continue;shape.position.set(x,y,z);shape.scale.set(sx,sy,sz);shape.updateMatrix();details.setMatrixAt(details.count,shape.matrix);details.setColorAt(details.count,tint.set(color));details.count++}details.instanceMatrix.needsUpdate=true;if(details.instanceColor)details.instanceColor.needsUpdate=true;scene.add(details)}
  const legacyMap=sonoma?Array.from({length:64},()=>Array(64).fill(3)):map;
  const landmarks=buildLandmarks(legacyMap,geometry),interiors=buildInteriors(legacyMap,geometry,townBuildings),interiorLightPools=buildInteriorLightPools(legacyMap),exteriors=buildExterior(legacyMap,geometry,townBuildings),townStreets=buildTownStreets(legacyMap,townBuildings,geometry),townFacades=buildTownFacades(legacyMap,townBuildings,geometry),townDoorways=buildTownDoorways(legacyMap,townBuildings,geometry),townRoofDetailsGroup=buildTownRoofDetails(townBuildings,geometry),windowStories=buildTownWindowStories(legacyMap,townBuildings,geometry);const fittings=buildTownFittingBatch(legacyMap,townBuildings,geometry);scene.add(landmarks,interiors,interiorLightPools,exteriors,townStreets,townFacades,townDoorways,townRoofDetailsGroup,windowStories,buildStreetLights(legacyMap,geometry),buildStreetEdges(legacyMap,townBuildings),buildTownPlantClusters(legacyMap,townBuildings),fittings);
  if(sonoma){for(const object of scene.children)if(object!==sky&&object!==ground&&object!==camera&&!object.isLight)object.visible=false;scene.add(buildSonomaEnvironment(sonoma,map));}
  const gun=makeViewmodel(geometry);gun.traverse(object=>object.layers.set(1));camera.add(gun);
  // All gameplay markers use fixed-capacity pools; updates copy authoritative positions.
  const markerGeometry=new THREE.OctahedronGeometry(1,0),dummy=new THREE.Object3D(),color=new THREE.Color();
  function pool(name,capacity,shape=geometry,lit=false){const m=new THREE.InstancedMesh(shape,lit?new THREE.MeshLambertMaterial({color:0xffffff}):new THREE.MeshBasicMaterial({color:0xffffff}),capacity);m.name=name;m.count=0;m.userData.colorValues=new Array(capacity);m.userData.colorDirty=false;m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(m);return m}
  const coinGeometry=new THREE.CylinderGeometry(.5,.5,.14,12);
  const gemPool=pool('xp-shards',64,markerGeometry),dropPool=pool('drops',2,geometry,true),coinPool=pool('double-points',2,coinGeometry,true),coinMarks=pool('double-marks',14),ammoLid=pool('ammo-lids',2,geometry,true),ammoMarks=pool('ammo-marks',6),cachePool=pool('supply-caches',3,geometry,true),cacheLids=pool('supply-lids',3,geometry,true),cacheMarks=pool('supply-marks',24),cacheTopMarks=pool('supply-lid-marks',9),chestPool=pool('keeper-caches',1,geometry,true),chestLid=pool('keeper-lids',1,geometry,true),chestBands=pool('keeper-bands',2),shotPool=pool('elite-projectiles',3,markerGeometry,true),particlePool=pool('impact-particles',48),shotImpact=pool('shot-impact',1,markerGeometry),stationPool=pool('wall-stations',12,geometry,true),stationMarks=pool('station-marks',24),beaconPool=pool('supply-beacon',1,geometry,true);
  shotPool.material.emissive.set(0x714724);shotPool.material.emissiveIntensity=.20;
  function put(pool,index,x,y,z,sx,sy,sz,tint,angle=0,angleZ=0,angleX=0){dummy.position.set(x,y,z);dummy.rotation.set(angleX,angle,angleZ,'YXZ');dummy.scale.set(sx,sy,sz);dummy.updateMatrix();pool.setMatrixAt(index,dummy.matrix);if(pool.userData.colorValues[index]!==tint){pool.userData.colorValues[index]=tint;pool.setColorAt(index,color.set(tint));pool.userData.colorDirty=true}}
  function finish(pool,count){pool.count=count;if(count>0)pool.instanceMatrix.needsUpdate=true;if(count>0&&pool.instanceColor&&pool.userData.colorDirty){pool.instanceColor.needsUpdate=true;pool.userData.colorDirty=false}}
  const ringGeometry=new THREE.RingGeometry(.96,1,48);function makeRing(){const m=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:0xa9d5c4,transparent:true,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.renderOrder=5;m.visible=false;scene.add(m);return m}const rings=Array.from({length:2},makeRing),innerRings=Array.from({length:2},makeRing);rings.forEach(r=>r.name='ripple-boundary');innerRings.forEach(r=>r.name='ripple-inner');
  function line(name,colorValue,segments=1){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array((segments+1)*3),3).setUsage(THREE.DynamicDrawUsage));let l=new THREE.Line(g,new THREE.LineBasicMaterial({color:colorValue,transparent:true,depthWrite:false}));l.name=name;l.visible=false;l.frustumCulled=false;scene.add(l);return l}
  const coilLines=Array.from({length:4},()=>line('coil-arc',0xa9d5c4,5)),warningLines=Array.from({length:12},()=>line('elite-warning',0xe5b57c)),tracer=line('muzzle-tracer',0xffd59b),muzzlePosition=new THREE.Vector3(),shotForward=new THREE.Vector3();warningLines.forEach(l=>{l.renderOrder=7});
  const warningFields=Array.from({length:4},()=>{let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(36),3).setUsage(THREE.DynamicDrawUsage));let mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xd3a66f,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));mesh.name='elite-warning-field';mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=6;scene.add(mesh);return mesh});
  const haloGeometry=new THREE.RingGeometry(.84,1,32),eliteHalos=Array.from({length:3},()=>{let mesh=new THREE.Mesh(haloGeometry,new THREE.MeshBasicMaterial({color:0xe7b879,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));mesh.name='elite-projectile-radius';mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.renderOrder=6;scene.add(mesh);return mesh});
  function setWarningField(field,e,l,opacity){let a=field.geometry.attributes.position,y=.038,lx=e.x-l.sx,lz=e.z-l.sz,rx=e.x+l.sx,rz=e.z+l.sz,cx=e.x+e.specialDx*l.center,cz=e.z+e.specialDz*l.center,lx1=lx+e.specialDx*l.left,lz1=lz+e.specialDz*l.left,rx1=rx+e.specialDx*l.right,rz1=rz+e.specialDz*l.right;a.setXYZ(0,lx,y,lz);a.setXYZ(1,e.x,y,e.z);a.setXYZ(2,cx,y,cz);a.setXYZ(3,lx,y,lz);a.setXYZ(4,cx,y,cz);a.setXYZ(5,lx1,y,lz1);a.setXYZ(6,e.x,y,e.z);a.setXYZ(7,rx,y,rz);a.setXYZ(8,rx1,y,rz1);a.setXYZ(9,e.x,y,e.z);a.setXYZ(10,rx1,y,rz1);a.setXYZ(11,cx,y,cz);a.needsUpdate=true;field.material.opacity=opacity;field.visible=true}
  function setLine(l,x1,y1,z1,x2,y2,z2,tint,opacity=1){let a=l.geometry.attributes.position;if(a.getX(0)!==Math.fround(x1)||a.getY(0)!==Math.fround(y1)||a.getZ(0)!==Math.fround(z1)||a.getX(1)!==Math.fround(x2)||a.getY(1)!==Math.fround(y2)||a.getZ(1)!==Math.fround(z2)){a.setXYZ(0,x1,y1,z1);a.setXYZ(1,x2,y2,z2);a.needsUpdate=true}if(l.material.color.getHex()!==tint)l.material.color.set(tint);if(l.material.opacity!==opacity)l.material.opacity=opacity;l.visible=true}
  const cacheMemo={count:-1,values:[]},stationMemo={count:-1,values:[]},perkMemo={present:false,x:undefined,z:undefined,type:undefined};
  function changed(items,memo,fields,limit){let count=Math.min(items.length,limit),dirty=count!==memo.count;memo.count=count;for(let i=0;i<count;i++)for(let j=0;j<fields.length;j++){let index=i*fields.length+j,value=items[i][fields[j]];if(memo.values[index]!==value){memo.values[index]=value;dirty=true}}return dirty}
  function syncMarkers(s){let n=0;
    for(const v of (s.xpGems||EMPTY)){if(n>=64)break;let bob=Math.sin((s.time||0)*3+(v.phase||0))*.035,distance=Math.hypot(v.x-s.player.x,v.z-s.player.z),near=Math.max(0,Math.min(1,(distance-.4)/1.4)),scale=(v.amount>1?.2:.16)*(.45+.55*near);put(gemPool,n++,v.x,.24+bob,v.z,scale,scale*1.3,scale,0x9edac1,(s.time||0)*1.4)}finish(gemPool,n);
    let ammo=0,coins=0,cartridges=0,coinMarkCount=0;for(const v of (s.drops||EMPTY)){if(ammo+coins>=2)break;let y=.48+Math.sin((s.time||0)*3+(v.phase||0))*.07;if(v.type==='ammo'){put(dropPool,ammo,v.x,y,v.z,.55,.35,.42,0x6b835c);put(ammoLid,ammo++,v.x,y+.19,v.z,.58,.07,.45,0xb1cd96);for(let k=-1;k<=1;k++)put(ammoMarks,cartridges++,v.x+k*.13,y,v.z+.216,.055,.18,.02,0xe6dfb3)}else{let facing=Math.atan2(s.player.x-v.x,s.player.z-v.z);put(coinPool,coins++,v.x,y,v.z,.62,.62,.62,0xe8c777,facing,0,Math.PI/2);let rx=Math.cos(facing),rz=-Math.sin(facing),fx=Math.sin(facing),fz=Math.cos(facing);for(const [lx,ly,w,h,angle] of COIN_GLYPH)put(coinMarks,coinMarkCount++,v.x+rx*lx+fx*.05,y+ly,v.z+rz*lx+fz*.05,w,h,.012,0x3b3020,facing,angle)}}finish(dropPool,ammo);finish(ammoLid,ammo);finish(ammoMarks,cartridges);finish(coinPool,coins);finish(coinMarks,coinMarkCount);
    if(changed(s.caches||EMPTY,cacheMemo,CACHE_KEYS,3)){
    let cacheMarksCount=0,topCount=0;n=0;for(const v of (s.caches||EMPTY)){if(n>=3)break;let body=v.used?0x53604a:0x7f8d62,lid=v.used?0x475445:0xc3ac70,mark=v.used?0x66715c:0xe4dbb7;put(cachePool,n,v.x,.31,v.z,.9,.62,.6,body);put(cacheLids,n++,v.x,v.used?.72:.65,v.z,.94,.08,.64,lid,0,0,v.used?-.38:0);if(!v.used){put(cacheTopMarks,topCount++,v.x,.698,v.z,.30,.012,.065,0xeee0ad);put(cacheTopMarks,topCount++,v.x,.698,v.z-.09125,.065,.012,.1175,0xeee0ad);put(cacheTopMarks,topCount++,v.x,.698,v.z+.09125,.065,.012,.1175,0xeee0ad)}for(const [dx,dz] of CACHE_FACES){let xf=dx!==0,x=v.x+dx,z=v.z+dz;put(cacheMarks,cacheMarksCount++,x,.33,z,xf?.025:.30,.065,xf?.30:.025,mark);put(cacheMarks,cacheMarksCount++,x,.33,z,xf?.025:.065,.30,xf?.065:.025,mark)}}finish(cachePool,n);finish(cacheLids,n);finish(cacheMarks,cacheMarksCount);finish(cacheTopMarks,topCount);
    }
    n=0;let bandCount=0;for(const v of (s.eliteChests||EMPTY)){if(n>=1)break;put(chestPool,n,v.x,.3,v.z,.8,.6,.55,0x665039);put(chestLid,n++,v.x,.63,v.z,.84,.10,.59,0xc4a06a);put(chestBands,bandCount++,v.x,.34,v.z+.286,.13,.42,.02,0xe7c885);put(chestBands,bandCount++,v.x,.36,v.z-.286,.13,.42,.02,0xe7c885)}finish(chestPool,n);finish(chestLid,n);finish(chestBands,bandCount);n=0;
    for(const v of (s.eliteShots||EMPTY)){if(n>=3)break;put(shotPool,n++,v.x,1.05,v.z,.18,.18,.18,0xd99a60)}finish(shotPool,n);n=0;
    for(const v of (s.particles||EMPTY)){if(n>=48)break;put(particlePool,n++,v.x,v.y,v.z,v.size,v.size,v.size,v.color||'#9c7057')}finish(particlePool,n);n=0;
    const stations=s.stations||EMPTY,perk=s.perkStation,perkChanged=!!perk!==perkMemo.present||(perk&&(perk.x!==perkMemo.x||perk.z!==perkMemo.z||perk.type!==perkMemo.type));perkMemo.present=!!perk;perkMemo.x=perk?.x;perkMemo.z=perk?.z;perkMemo.type=perk?.type;
    if(changed(stations,stationMemo,STATION_KEYS,3)||perkChanged){
      let markCount=0,markerCount=Math.min(3,stations.length+(perk?1:0));for(let markerIndex=0;markerIndex<markerCount;markerIndex++){let v=markerIndex<stations.length?stations[markerIndex]:perk;let x=v.x+.5,z=v.z+.5,tint=v.type===8?0xe8c777:0xd0e0c8;for(const [dx,dz] of STATION_FACES){let xf=dx!==0,xx=x+dx,zz=z+dz;put(stationPool,n++,xx,1.25,zz,xf?.025:.52,.32,xf?.52:.025,0x34463c);let markX=xx+Math.sign(dx)*.02,markZ=zz+Math.sign(dz)*.02;put(stationMarks,markCount++,markX,1.27,markZ,xf?.015:.30,.045,xf?.30:.015,tint);put(stationMarks,markCount++,markX+(xf||v.type===8?0:.06),v.type===8?1.27:1.20,markZ+(xf&&v.type!==8?.06:0),xf?.015:.055,v.type===8?.22:.12,xf?.055:.015,tint)}}finish(stationPool,n);finish(stationMarks,markCount);n=0;
    }
    n=0;
    if(s.beacon){let v=s.beacon;put(beaconPool,n++,v.x,.9,v.z,.16,1.8,.16,v.used?0x586b5b:v.active?0xffd480:0xb4c18e)}finish(beaconPool,n);
    const reducedEffects=!!(s.reducedZombieMotion||s.reducedWeaponMotion);for(let i=0;i<rings.length;i++){let r=rings[i],inner=innerRings[i],v=(s.pulses||EMPTY)[i],visible=!!v&&v.life>0;r.visible=visible;inner.visible=visible&&!reducedEffects;if(visible){let radius=v.radius;r.position.set(v.x,.025,v.z);r.scale.set(radius,radius,1);r.material.color.set(v.echo?0xe5c18a:0xa9d5c4);r.material.opacity=Math.max(0,Math.min(1,v.life/.42))*(reducedEffects?.28:.5);inner.position.set(v.x,.028,v.z);inner.scale.set(radius*.82,radius*.82,1);inner.material.color.copy(r.material.color);inner.material.opacity=r.material.opacity*.4}}
    for(let i=0;i<coilLines.length;i++){let l=coilLines[i],v=(s.arcs||EMPTY)[i];l.visible=!!v&&v.life>0;if(l.visible){let a=l.geometry.attributes.position,dx=v.x-s.player.x,dz=v.z-s.player.z,length=Math.hypot(dx,dz)||1;for(let j=0;j<=5;j++){let t=j/5,offset=Math.sin(j*2.4+(v.bend||0))*Math.sin(Math.PI*t)*(reducedEffects?.03:.10);a.setXYZ(j,s.player.x+dx*t-dz/length*offset,1.57+(1.1-1.57)*t+offset*.35,s.player.z+dz*t+dx/length*offset)}a.needsUpdate=true;l.material.color.set(v.evolved?0xe8ca88:0xa9d7c6);l.material.opacity=Math.max(0,Math.min(1,v.life/.18))*(reducedEffects?.45:.75)}}
    let wi=0,fieldCount=0;for(const e of (s.enemies||EMPTY)){if(e.kind!=='elite'||e.specialWindup<=0||e.breach||e.arrival>.45||(Number.isFinite(e.hp)&&e.hp<=0)||(e.x-s.player.x)**2+(e.z-s.player.z)**2>28*28||wi+3>warningLines.length)continue;let l=eliteWarningLengths(e,s.trace,s.solid,s.eliteSpeed??6,s.eliteLife??2,s.eliteRadius??.55),progress=Math.max(0,Math.min(1,1-e.specialWindup/1.1));setWarningField(warningFields[fieldCount++],e,l,.13+.10*progress);for(const side of WARNING_SIDES){let len=side<0?l.left:side>0?l.right:l.center;setLine(warningLines[wi++],e.x+l.sx*side,.045,e.z+l.sz*side,e.x+e.specialDx*len+l.sx*side,.045,e.z+e.specialDz*len+l.sz*side,0xe5b57c,.7+.25*progress)}}for(;wi<warningLines.length;wi++)warningLines[wi].visible=false;for(;fieldCount<warningFields.length;fieldCount++)warningFields[fieldCount].visible=false;
    for(let i=0;i<eliteHalos.length;i++){let halo=eliteHalos[i],shot=(s.eliteShots||EMPTY)[i];halo.visible=!!shot;if(shot){let radius=s.eliteRadius??.55;halo.position.set(shot.x,.045,shot.z);halo.scale.set(radius,radius,1)}}
    let shot=s.shotVisual;tracer.visible=false;if(shot&&shot.life>0){camera.updateMatrixWorld(true);let muzzle=s.player.weapon==='shotgun'?gun.userData.shotgunFlash:gun.userData.pistolFlash;muzzle.getWorldPosition(muzzlePosition);camera.getWorldDirection(shotForward);let mx=muzzlePosition.x-s.player.x,mz=muzzlePosition.z-s.player.z,muzzleDistance=Math.hypot(mx,mz),targetDistance=Math.hypot(shot.x-s.player.x,shot.z-s.player.z),blocked=targetDistance<=muzzleDistance+.08||!coherentTracer(muzzlePosition,shot,shotForward);if(!blocked&&typeof s.trace==='function'&&muzzleDistance>.001){let wall=s.trace(s.player.x,s.player.z,mx/muzzleDistance,mz/muzzleDistance,muzzleDistance+.04);blocked=!!wall&&wall.d<muzzleDistance+.04;let tx=shot.x-muzzlePosition.x,tz=shot.z-muzzlePosition.z,travel=Math.hypot(tx,tz);if(!blocked&&travel>.001){wall=s.trace(muzzlePosition.x,muzzlePosition.z,tx/travel,tz/travel,travel);blocked=!!wall&&wall.d<travel-.03}}if(blocked)muzzle.visible=false;else setLine(tracer,muzzlePosition.x,muzzlePosition.y,muzzlePosition.z,shot.x,shot.y,shot.z,0xffd59b,Math.max(0,Math.min(1,shot.life/.08)));let wallImpact=!shot.hit&&shot.wallType>0&&shot.y>.02&&shot.y<2.48;if(shot.hit||wallImpact){let tint=shot.head?0xffdc91:shot.hit?0xe4a18a:shot.wallType===5?0xb49a75:shot.wallType===4?0xa3c2c1:0xc7c5b4,size=(shot.head?.075:shot.hit?.05:.045)*Math.max(.35,Math.min(1,shot.life/.08));put(shotImpact,0,shot.x,shot.y,shot.z,size,size,size,tint);finish(shotImpact,1)}else finish(shotImpact,0)}else finish(shotImpact,0);
  }
  // Three small reusable labels keep nearby information readable without screen-covering signs.
  const labelPool=[],labelPoint=new THREE.Vector3();let labelsAvailable=true;
  function newLabel(){let canvas;try{canvas=labelCanvasFactory();if(!canvas||!canvas.getContext('2d'))throw new Error('label canvas unavailable')}catch(error){labelsAvailable=false;return null} canvas.width=384;canvas.height=96;let ctx=canvas.getContext('2d');if(!ctx)throw new Error('label canvas unavailable');let texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;let material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,fog:false,toneMapped:false}),sprite=new THREE.Sprite(material);sprite.name='interaction-label';sprite.center.set(.5,0);sprite.renderOrder=20;sprite.visible=false;scene.add(sprite);let entry={canvas,ctx,texture,sprite,key:null};labelPool.push(entry);return entry}
  function updateLabel(entry,text,muted){let key=(muted?'muted:':'active:')+text;if(entry.key===key)return;entry.key=key;let c=entry.ctx;c.clearRect(0,0,384,96);c.fillStyle='rgba(19,30,26,.88)';c.fillRect(0,6,384,84);c.fillStyle=muted?'#849487':'#d6bc7c';c.fillRect(0,6,8,84);c.fillStyle=muted?'#c0c9ba':'#f2e5bd';c.font='700 27px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,196,48,352);entry.texture.needsUpdate=true}
  function syncLabels(s){if(!labelsAvailable)return;let candidates=[];camera.updateMatrixWorld(true);for(const item of (s.affordances||EMPTY)){let v=labelPlacement(item,s.player,s.fovFactor??1.18,s.trace);if(!v)continue;labelPoint.set(v.x,v.y,v.z).project(camera);if(labelPoint.z< -1||labelPoint.z>1||Math.abs(labelPoint.x)>1.1||Math.abs(labelPoint.y)>1.1)continue;let width=labelWorldWidth(v.forward,s.width,s.fovFactor??1.18),pxWidth=width/v.forward*(s.width/(2*(s.fovFactor??1.18))),pxHeight=pxWidth*.25;candidates.push({item,v,width,sx:(labelPoint.x+1)*s.width/2,sy:(1-labelPoint.y)*s.height/2,pxWidth,pxHeight})}candidates.sort((a,b)=>Number(b.item.active)-Number(a.item.active)||a.v.distance-b.v.distance);let chosen=[];for(const c of candidates){if(chosen.length>=3)break;if(chosen.some(o=>Math.abs(o.sx-c.sx)<(o.pxWidth+c.pxWidth)/2+8&&Math.abs(o.sy-c.sy)<(o.pxHeight+c.pxHeight)/2+8))continue;chosen.push(c)}for(let i=0;i<chosen.length;i++){let v=chosen[i],entry=labelPool[i]||newLabel();if(!entry){for(const stale of labelPool)stale.sprite.visible=false;return}updateLabel(entry,v.item.text,v.item.muted);entry.sprite.position.set(v.v.x,v.v.y,v.v.z);entry.sprite.scale.set(v.width,v.width*.25,1);entry.sprite.visible=true}for(let i=chosen.length;i<labelPool.length;i++)labelPool[i].sprite.visible=false}
  const shadowGeometry=new THREE.CircleGeometry(1,16),shadowPool=new THREE.InstancedMesh(shadowGeometry,new THREE.MeshBasicMaterial({color:0x0b1913,transparent:true,opacity:.30,depthWrite:false}),48);shadowPool.name='zombie-contact-shadows';shadowPool.renderOrder=4;shadowPool.count=0;shadowPool.frustumCulled=false;shadowPool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(shadowPool);
  const zombieMaterials=zombiePalette(),zombieHeadGeometry=new THREE.SphereGeometry(.5,10,8),zombieTorsoGeometry=makeZombieTorsoGeometry(),zombieArmGeometry=makeZombieLimbGeometry('arm'),zombieLegGeometry=makeZombieLimbGeometry('leg'),zombieHandGeometry=makeZombieHandGeometry(),zombieShoeGeometry=makeZombieShoeGeometry(),zombieCuffGeometry=new THREE.RingGeometry(.35,.5,8),zombieJacketGeometry=makeZombieJacketGeometry('panel'),zombieLapelGeometry=makeZombieJacketGeometry('lapel'),zombieWorkPocketGeometry=makeZombieWorkPocketGeometry(),zombieWorkSleeveGeometry=makeZombieWorkSleeveGeometry(),zombieSkullGeometry=makeZombieSkullGeometry(),zombieNeckGeometry=new THREE.CylinderGeometry(.5,.46,1,8),zombieHairGeometries=[0,1,2].map(makeZombieHairGeometry),zombieBruteApronGeometry=makeZombieBruteWorkwearGeometry('apron'),zombieBruteStrapGeometry=makeZombieBruteWorkwearGeometry('strap'),zombieFlankerSideGeometry=makeZombieFlankerSideGeometry(),zombieSeamGeometry=makeZombieSeamGeometry(),zombieHemGeometries=[0,1,2].map(makeZombieHemGeometry),zombies=[],corpses=[],corpseSlots=new Array(8),weaponMotion=resetWeaponMotion({}),shotgunCycle={sequence:null,weapon:null,runSequence:null,elapsed:-1},weaponSwitch={target:null,from:null,elapsed:.16,runSequence:null,shotSequence:0},switchStartPosition=new THREE.Vector3(),switchStartRotation=new THREE.Euler(),clothingPivot=new THREE.Vector3(),motionResult={},recoilResult={},fireResult={},switchResult={},reloadResult={shotgun:{},magazine:{}},motionInput={},cycleInput={},switchInput={};let disposed=false,lastWidth=0,lastHeight=0,lastFov=NaN,lastMotionSequence=null,interiorSyncX=NaN,interiorSyncZ=NaN;
  const roomBounds=sonoma?[]:roomSunBounds(townBuildings);scene.traverse(object=>{if(object.layers.mask!==1||!object.material)return;for(const material of (Array.isArray(object.material)?object.material:[object.material]))applyRoomSunOcclusion(material,roomBounds)});for(const value of Object.values(zombieMaterials))for(const material of (Array.isArray(value)?value:[value]))applyRoomSunOcclusion(material,roomBounds);
  const annexExitThreshold=townStreets.getObjectByName('annex-exit-threshold');
  function syncGates(currentMap) {
    if(annexExitThreshold)annexExitThreshold.visible=annexExitClear(currentMap);
    if(!gateMesh)return;dummy.rotation.set(0,0,0);let changed=false;
    for(const cell of gateCells){let open=currentMap[cell.z][cell.x]===0;if(open===cell.open)continue;cell.open=open;dummy.position.set(cell.x+.5,1.25,cell.z+.5);dummy.scale.set(open?0:1,open?0:2.5,open?0:1);dummy.updateMatrix();gateMesh.setMatrixAt(cell.i,dummy.matrix);changed=true}
    if(changed){gateMesh.instanceMatrix.needsUpdate=true;
      // Refresh only on topology changes: contact strips into a gate cell must
      // follow its actual state, not whichever state existed at scene creation.
      if(townBuildings.length){const previous=townStreets.getObjectByName('town-contact-shading'),faces=groundContactFaces(currentMap).faces;if(!previous||!updateGroundContacts(previous,faces)){const next=buildGroundContacts(currentMap);if(previous){townStreets.remove(previous);previous.dispose();previous.geometry.dispose();previous.material.dispose()}if(next)townStreets.add(next)}}
    }
  }
  // Brute shoulders settle more slowly after a strike, without delaying damage.
  function settleZombieShoulders(gait,kind,target,dt) {
    if(kind!=='brute'||target>=gait.shoulder){gait.shoulder=target;return target}
    const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    gait.shoulder=target+(gait.shoulder-target)*Math.exp(-step*7);
    return gait.shoulder;
  }
  // A small delayed shoulder roll gives the heavy footfall weight without moving the head.
  function bruteGaitRoll(gait,kind,attack,dt) {
    if(kind!=='brute'){gait.bruteRoll=0;return 0}
    const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    const target=Math.sin(gait.phase)*.035*gait.amount*(1-attack);
    gait.bruteRoll+=(target-gait.bruteRoll)*(1-Math.exp(-step*7));
    return gait.bruteRoll;
  }
  // All zombie pools share the same palette and deterministic outfit selection.
  function applyZombieStyle(mesh,e) {
    const u=mesh.userData,appearance=zombieAppearance(e.variant,u.appearance),variant=appearance.outfit,hair=appearance.hair,coatVariant=appearance.coat,pantsVariant=appearance.pants,alert=e.specialWindup>0;
    if(u.styleKind===e.kind&&u.styleVariant===variant&&u.styleHair===hair&&u.styleCoat===coatVariant&&u.stylePants===pantsVariant&&u.styleAlert===alert)return;
    u.styleKind=e.kind;u.styleVariant=variant;u.styleHair=hair;u.styleCoat=coatVariant;u.stylePants=pantsVariant;u.styleAlert=alert;
    const skin=zombieMaterials.skin;
    const coat=e.kind==='brute'?zombieMaterials.brute:e.kind==='flanker'?zombieMaterials.flanker:e.kind==='elite'?zombieMaterials.elite:zombieMaterials.normal[coatVariant];
    u.head.material=u.jaw.material=u.collar.material=u.nose.material=skin;u.leftHand.material=u.rightHand.material=zombieMaterials.handSkin;
    u.torso.material=u.leftArm.userData.shell.material=u.rightArm.userData.shell.material=coat;u.torso.scale.x=e.kind==='brute'?.57:.54;
    u.leftLeg.userData.shell.material=u.rightLeg.userData.shell.material=zombieMaterials.pantsVariants[pantsVariant];
    for(let v=0;v<3;v++){u.clothes[v].visible=v===variant&&(e.kind==='shambler'||e.kind==='flanker');u.faces[v].visible=v===hair}
    u.jacketHem.material=coat;for(const piece of u.jacketPanels)piece.material=coat;for(const shoulder of u.jacketShoulders){shoulder.material=coat;shoulder.visible=variant===1&&(e.kind==='shambler'||e.kind==='flanker')}for(const sleeve of u.workSleeves)sleeve.visible=variant===2&&(e.kind==='shambler'||e.kind==='flanker')&&u.detailNear!==false;for(const cuff of u.sleeveCuffs){cuff.material=variant===0?zombieMaterials.dark:variant===1?zombieMaterials.patch:coat;cuff.visible=(e.kind==='shambler'||e.kind==='flanker')&&u.detailNear!==false}
    u.bruteGear.visible=e.kind==='brute';for(const shoulder of u.bruteShoulders)shoulder.visible=e.kind==='brute';u.flankerGear.visible=e.kind==='flanker';u.eliteGear.visible=e.kind==='elite';for(const shoulder of u.eliteShoulders)shoulder.visible=e.kind==='elite';u.lantern.material=alert?zombieMaterials.alert:zombieMaterials.lantern;u.lantern.visible=u.roleDetail!==false||alert;
  }
  // Hysteresis keeps small details from flickering at the projected-size boundary.
  function updateZombieDetail(mesh,e,player,width,fovFactor,corpse=false) {
    const u=mesh.userData,distance=Math.max(.1,Math.hypot(e.x-player.x,e.z-player.z));
    const pixels=.35*width/(2*fovFactor*distance),same=corpse||u.gait.enemy===e;
    const near=same&&u.detailNear!==null ? (u.detailNear?pixels>=11:pixels>=14) : pixels>=12.5;
    // Small role trims span roughly one pixel when the head is seven pixels tall.
    const roleDetail=same&&u.roleDetail!==null?(u.roleDetail?pixels>=7:pixels>=8.4):pixels>=7.7;
    if(u.roleDetail!==roleDetail){u.roleDetail=roleDetail;for(const piece of u.bruteStraps)piece.visible=roleDetail;for(const piece of u.flankerSeams)piece.visible=roleDetail;for(const piece of u.eliteHarness)piece.visible=roleDetail;u.lantern.visible=roleDetail||u.styleAlert}
    if(u.detailNear===near)return;u.detailNear=near;u.faceDetails.visible=near;for(const cuff of u.sleeveCuffs)cuff.visible=near&&(u.styleKind==='shambler'||u.styleKind==='flanker');for(const sleeve of u.workSleeves)sleeve.visible=near&&u.styleVariant===2&&(u.styleKind==='shambler'||u.styleKind==='flanker');
    for(let i=0;i<3;i++){
      const clothes=u.clothes[i].children,face=u.faces[i].children;
      for(let j=0;j<clothes.length;j++)clothes[j].visible=near||clothes[j]===u.jacketHem; // jacket hem is silhouette
      for(let j=0;j<face.length;j++)face[j].visible=near||face[j]===u.hairPieces[i]; // retain each hairstyle at distance
    }
  }
  function showZombieImpact(mesh,active,head,side,lethal,player) {
    const u=mesh.userData,mark=head?u.headImpact:u.bodyImpact;
    u.headImpact.visible=!!active&&!!head;u.bodyImpact.visible=!!active&&!head;
    if(active){const dx=player.x-mesh.position.x,dz=player.z-mesh.position.z,yaw=mesh.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw),localX=c*dx-s*dz,localZ=s*dx+c*dz,offset=side<0?-1:1;if(Math.abs(localX)>Math.abs(localZ)){mark.position.x=(localX<0?-1:1)*.45;mark.position.z=offset*.06}else{mark.position.x=offset*.25;mark.position.z=(localZ<0?-1:1)*(head?.43:.49)}const material=lethal?zombieMaterials.lethalImpact:zombieMaterials.impact;if(mark.material!==material)mark.material=material}
  }
  // Bounding support of key limb shapes keeps a falling rig on the ground, without per-enemy lights.
  function groundCorpse(body,surface) {
    let lowest=Infinity;
    for(const part of body.userData.groundParts){part.updateWorldMatrix(true,false);const m=part.matrixWorld.elements,extent=part.geometry.type==='SphereGeometry'?.5*Math.hypot(m[1],m[5],m[9]):.5*(Math.abs(m[1])+Math.abs(m[5])+Math.abs(m[9]));lowest=Math.min(lowest,m[13]-extent)}
    body.position.y+=surface-lowest;
  }
  // Capture only numbers from the prior visible rig, never an enemy reference.
  function captureDeathPose(body,source,death,run,key) {
    const u=body.userData,p=u.deathPose||(u.deathPose={});u.deathKey=key;u.deathRun=run;u.detailNear=null;u.roleDetail=null;
    const a=source?.userData;let clothes=null;if(a)for(const outfit of a.clothes)if(outfit.visible){clothes=outfit;break}
    p.yaw=source?source.rotation.y:death.yaw;p.runAmount=death.kind==='flanker'&&a?Math.max(0,Math.min(1,a.gait.amount)):0;
    p.torsoX=a?a.torso.rotation.x:.09;p.torsoY=a?a.torso.rotation.y:0;p.torsoZ=a?a.torso.rotation.z:0;
    p.leftArmX=a?a.leftArm.rotation.x:0;p.rightArmX=a?a.rightArm.rotation.x:0;p.leftArmZ=a?a.leftArm.rotation.z:-.06;p.rightArmZ=a?a.rightArm.rotation.z:.06;
    p.leftArmPos=a?a.leftArm.position.z:0;p.rightArmPos=a?a.rightArm.position.z:0;
    p.leftLegX=a?a.leftLeg.rotation.x:0;p.rightLegX=a?a.rightLeg.rotation.x:0;p.leftLegY=a?a.leftLeg.position.y:.64;p.rightLegY=a?a.rightLeg.position.y:.64;
    p.leftFootX=a?a.leftFoot.rotation.x:0;p.rightFootX=a?a.rightFoot.rotation.x:0;
    p.outfitX=clothes?clothes.rotation.x:0;p.outfitY=clothes?clothes.rotation.y:0;p.outfitZ=clothes?clothes.rotation.z:0;
    p.outfitPX=clothes?clothes.position.x:0;p.outfitPY=clothes?clothes.position.y:0;p.outfitPZ=clothes?clothes.position.z:0;
  }
  function deathVisualKey(death){return death.visualId??('fallback:'+death.x+':'+death.z+':'+death.phase+':'+death.kind)}
  function deathKeyActive(key,deaths,count){for(let i=0;i<count;i++)if(deathVisualKey(deaths[i])===key)return true;return false}
  function mixDeath(start,end,t){return start+(end-start)*t}
  function render(snapshot) {
    if(disposed)throw new Error('renderer disposed');const {player,enemies=[],map:currentMap=map,width,height,fovFactor=1.18,aim=0,recoil=0,time=0,reloading=0,reloadDuration=0}=snapshot;
    const p=projection(fovFactor,width,height,player.pitch||0);let resized=width!==lastWidth||height!==lastHeight;if(resized){renderer.setSize(width,height,false);lastWidth=width;lastHeight=height}if(resized||fovFactor!==lastFov){camera.aspect=width/height;camera.fov=p.verticalFov;camera.updateProjectionMatrix();lastFov=fovFactor}
    camera.position.set(player.x,1.6,player.z);sky.position.copy(camera.position);camera.rotation.set(p.pitchRadians,-player.yaw,0,'YXZ');
    if(snapshot.motionSequence!==lastMotionSequence){resetWeaponMotion(weaponMotion);lastMotionSequence=snapshot.motionSequence}let reloadProgress=reloading>0&&reloadDuration>0?Math.max(0,Math.min(1,snapshot.reloadProgress??(1-reloading/reloadDuration))):0,reloadPhase=reloading>0?pistolReloadEnvelope(reloadProgress):0,pose=(motionInput.dt=snapshot.dt,motionInput.speed=snapshot.motionSpeed,motionInput.sprinting=snapshot.motionSprinting,motionInput.dashing=snapshot.dashing,motionInput.aim=aim,motionInput.firing=snapshot.firing,motionInput.reloading=reloading>0,motionInput.reloadProgress=reloadProgress,motionInput.reloadEnvelope=reloadPhase,motionInput.reduced=snapshot.reducedWeaponMotion,advanceWeaponMotion(weaponMotion,motionInput,motionResult));let ultrawideReloadLift=.25*reloadPhase*Math.max(0,Math.min(1,(width/height-2.4)/(32/9-2.4))),ads=easeSightAim(aim),visualRecoil=snapshot.reducedWeaponMotion?0:recoil,pistolPose=pistolRecoilPose(visualRecoil,recoilResult),cycleTime=(cycleInput.sequence=snapshot.shotSequence,cycleInput.weapon=player.weapon,cycleInput.reloading=reloading,cycleInput.dt=snapshot.dt,cycleInput.runSequence=snapshot.motionSequence,cycleInput.age=snapshot.shotAge,advanceShotgunCycle(shotgunCycle,cycleInput)),firePose=shotgunFirePose(cycleTime,reloading>0?0:visualRecoil,fireResult),kickPitch=player.weapon==='shotgun'?firePose.pitch:pistolPose.pitch,kickBack=player.weapon==='shotgun'?firePose.back:pistolPose.back;let switching=weaponSwitch.target!==null&&weaponSwitch.target!==player.weapon&&weaponSwitch.runSequence===snapshot.motionSequence;if(switching){switchStartPosition.copy(gun.position);switchStartRotation.copy(gun.rotation)}let switchPose=(switchInput.weapon=player.weapon,switchInput.dt=snapshot.dt,switchInput.runSequence=snapshot.motionSequence,switchInput.shotSequence=snapshot.shotSequence,switchInput.reloading=reloading,switchInput.reduced=snapshot.reducedWeaponMotion,switchInput.age=snapshot.switchAge,advanceWeaponSwitch(weaponSwitch,switchInput,switchResult)),switchStability=1-switchPose.lower,reloadMotion=snapshot.reducedWeaponMotion?.7:1,reloadTravel=snapshot.reducedWeaponMotion?.8:1,seating=reloading>0?reloadSeating(reloadProgress,player.weapon)*(snapshot.reducedWeaponMotion?.4:1):0,pistolReload=player.weapon==='smg'?reloadPhase:0,shotgunReload=player.weapon==='shotgun'?reloadPhase:0;gun.position.set(.17*(1-ads)+pose.x*switchStability,-.18+.12*ads+.24*pistolReload+.20*shotgunReload+ultrawideReloadLift+.010*seating+pose.y*switchStability-1.10*switchPose.lower,-.08+kickBack-reloadTravel*(.90*pistolReload+.85*shotgunReload));gun.rotation.set(kickPitch+pose.pitch*switchStability+reloadMotion*(player.weapon==='shotgun'?-.65:-.70)*reloadPhase,0,reloadMotion*(player.weapon==='shotgun'?-.30:-.45)*reloadPhase+pose.roll*switchStability);if(switchPose.weapon!==player.weapon){let t=Math.min(1,weaponSwitch.elapsed/.08);t=t*t*(3-2*t);gun.position.x=switchStartPosition.x+(gun.position.x-switchStartPosition.x)*t;gun.position.y=switchStartPosition.y+(gun.position.y-switchStartPosition.y)*t;gun.position.z=switchStartPosition.z+(gun.position.z-switchStartPosition.z)*t;gun.rotation.x=switchStartRotation.x+(gun.rotation.x-switchStartRotation.x)*t;gun.rotation.y=switchStartRotation.y+(gun.rotation.y-switchStartRotation.y)*t;gun.rotation.z=switchStartRotation.z+(gun.rotation.z-switchStartRotation.z)*t}gun.userData.pistol.visible=switchPose.weapon!=='shotgun';gun.userData.shotgun.visible=switchPose.weapon==='shotgun';let reloadPose=weaponReloadPose(reloadProgress,reloading,firePose.pump,reloadResult),shotgunStage=reloadPose.shotgun,pumpTravel=reloadPose.pump,shellY=reloadPose.shellY,handY=reloadPose.handY;if(player.weapon!=='shotgun'||reloading<=0)gun.userData.shotgunShell.visible=false;if(!(switchPose.weapon==='shotgun'&&player.weapon!=='shotgun')){gun.userData.pump.position.z=-.64+.13*pumpTravel;gun.userData.shotgunHands.support.position.set(-.085+.035*shotgunStage.reach,-.10+(handY+.10)*shotgunStage.reach,-.802+.422*shotgunStage.reach+.13*pumpTravel);gun.userData.shotgunShell.visible=player.weapon==='shotgun'&&reloading>0&&shotgunStage.shell;gun.userData.shotgunShell.scale.setScalar(shotgunStage.shellScale);let shellSide=Math.max(0,Math.min(1,(shotgunStage.reach-.35)/.65));shellSide=shellSide*shellSide*(3-2*shellSide);gun.userData.shotgunShell.position.set(gun.userData.shotgunHands.support.position.x+.008+.042*shellSide,shellY,gun.userData.shotgunHands.support.position.z)}if(!(switchPose.weapon!=='shotgun'&&(player.weapon==='shotgun'||(weaponSwitch.from==='smg'&&weaponSwitch.target==='smg'&&weaponSwitch.elapsed<.08)))){gun.userData.pistolSlide.position.z=pistolPose.slide;let magStage=reloadPose.magazine,magShift=reloadPose.magazineShift;let magazineDepth=.10*magStage.drop,magazineRear=magazineDepth*Math.tan(.16);gun.userData.pistolMagazine.position.set(-magShift,-magazineDepth,magazineRear);gun.userData.pistolHands.support.position.set(-.085+.04*magStage.reach-magShift,-.10-magazineDepth,-.54+.246*magStage.reach+magazineRear)}const flashOpacity=snapshot.reducedWeaponMotion?.38:.8;if(gun.userData.pistolFlash.material.opacity!==flashOpacity)gun.userData.pistolFlash.material.opacity=flashOpacity;gun.userData.pistolFlash.visible=player.weapon!=='shotgun'&&snapshot.flashTimer>0;gun.userData.shotgunFlash.visible=player.weapon==='shotgun'&&snapshot.flashTimer>0;if(gun.userData.pistolFlash.visible)updateWeaponFlash(gun.userData.pistolFlash,snapshot.flashTimer);if(gun.userData.shotgunFlash.visible)updateWeaponFlash(gun.userData.shotgunFlash,snapshot.flashTimer);
    syncGates(currentMap);ensureRoutes(snapshot.groundRoutes);if(!Number.isFinite(interiorSyncX)||Math.hypot(player.x-interiorSyncX,player.z-interiorSyncZ)>=.5){syncInteriorDetails(interiors,player);syncTownFittingDetails(fittings,player);interiorSyncX=player.x;interiorSyncZ=player.z}
    const deaths=snapshot.deathVisuals||EMPTY,deathCount=Math.min(8,deaths.length),deathRun=snapshot.motionSequence;
    while(corpses.length<deathCount){const body=makeZombie(geometry,zombieMaterials,zombieHeadGeometry,zombieTorsoGeometry,zombieArmGeometry,zombieLegGeometry,zombieHandGeometry,zombieShoeGeometry,zombieCuffGeometry,zombieJacketGeometry,zombieLapelGeometry,zombieWorkPocketGeometry,zombieWorkSleeveGeometry,zombieSkullGeometry,zombieNeckGeometry,zombieHairGeometries,zombieBruteApronGeometry,zombieBruteStrapGeometry,zombieFlankerSideGeometry,zombieSeamGeometry,zombieHemGeometries);body.name='fallen-zombie';corpses.push(body);scene.add(body)}
    // Capture before living slots are reassigned after the simulation removes a kill.
    for(let i=0;i<deathCount;i++){
      const death=deaths[i],key=deathVisualKey(death);let body=null;
      for(let j=0;j<corpses.length;j++){const candidate=corpses[j];if(candidate.userData.deathRun===deathRun&&candidate.userData.deathKey===key){body=candidate;break}}
      if(!body){
        for(let j=0;j<corpses.length;j++){const candidate=corpses[j];if(candidate.userData.deathRun!==deathRun||!deathKeyActive(candidate.userData.deathKey,deaths,deathCount)){body=candidate;break}}
        let source=null;if(death.visualId!=null)for(let j=0;j<zombies.length;j++){if(zombies[j].userData.gait.enemy?.visualId===death.visualId){source=zombies[j];break}}
        captureDeathPose(body,source,death,deathRun,key);
      }
      corpseSlots[i]=body;
    }
    const motionScale=snapshot.reducedZombieMotion?.25:1;
    const count=Math.min(40,enemies.length);while(zombies.length<count){const z=makeZombie(geometry,zombieMaterials,zombieHeadGeometry,zombieTorsoGeometry,zombieArmGeometry,zombieLegGeometry,zombieHandGeometry,zombieShoeGeometry,zombieCuffGeometry,zombieJacketGeometry,zombieLapelGeometry,zombieWorkPocketGeometry,zombieWorkSleeveGeometry,zombieSkullGeometry,zombieNeckGeometry,zombieHairGeometries,zombieBruteApronGeometry,zombieBruteStrapGeometry,zombieFlankerSideGeometry,zombieSeamGeometry,zombieHemGeometries);zombies.push(z);scene.add(z)}
    for(let i=0;i<zombies.length;i++){let mesh=zombies[i],e=enemies[i];mesh.visible=i<count&&!e.breach&&!(e.arrival>.45);if(!mesh.visible){mesh.userData.gait.enemy=null;mesh.userData.hitPose.enemy=null;continue}mesh.position.set(e.x,0,e.z);mesh.scale.x=e.kind==='brute'?1.22:e.kind==='flanker'?.85:1;applyZombieStyle(mesh,e);updateZombieDetail(mesh,e,player,width,fovFactor);if(mesh.userData.gait.enemy!==e||mesh.userData.gait.kind!==e.kind){mesh.userData.attackPose.specialWas=false;mesh.userData.attackPose.specialRecovery=0;mesh.userData.attackPose.wasWindup=false;mesh.userData.attackPose.cancelTime=0}let attackPose=zombieAttackPose(e,mesh.userData.attackPose,snapshot.dt),attack=attackPose.strength,stride=e.kind==='brute'?.16:e.kind==='flanker'?.36:.24,lift=e.kind==='brute'?1.32:e.kind==='flanker'?1.42:e.kind==='elite'?1.18:1.38,gait=advanceZombieGait(mesh.userData.gait,e,snapshot.dt),heading=advanceZombieHeading(gait,e,player,snapshot.dt,attack),shoulder=settleZombieShoulders(gait,e.kind,attackPose.shoulder,snapshot.dt),reaction=advanceZombieHit(mesh.userData.hitPose,e,snapshot.dt),strideState=advanceZombieStride(gait,Math.sin(gait.phase)*stride*gait.strideScale*gait.turnStride*gait.amount*(1-attack*.75),-Math.sin(gait.phase-.12)*stride*gait.strideScale*.92*gait.amount*(1-attack*.75),snapshot.dt),step=strideState.leftStride,otherStep=strideState.rightStride;mesh.rotation.y=heading.heading;let impactScale=(e.kind==='brute'?.72:1)*(snapshot.reducedZombieMotion?.5:1),hitRoll=reaction.side*.14*(1-.45*attack)*impactScale,hitPitch=-reaction.head*.065*(1-.55*attack)*impactScale,runLean=e.kind==='flanker'?.11*gait.amount*(1-.65*attack):0,runArms=e.kind==='flanker'?.12*gait.amount*(1-attack):0,eliteCast=e.kind==='elite'&&(attackPose.specialWas||attackPose.specialRecovery>0),runSwing=e.kind==='flanker'?Math.sin(gait.phase)*.10*gait.amount*(1-attack):0,posture=gait.posture,idleSway=Math.sin(gait.idlePhase)*.009*gait.idleWeight*(1-attack)*(snapshot.reducedZombieMotion?0:1),carriage=gait.carriage*(1-attack),attackLead=eliteCast?0:gait.carriage*.8,hitArm=reaction.side*.05*(1-.6*attack)*impactScale,headFlinch=reaction.head*.025*(1-attack)*impactScale,weight=e.kind==='shambler'?Math.sin(gait.phase)*.026*gait.amount*(1-attack*.75)*motionScale:0,heavyRoll=bruteGaitRoll(gait,e.kind,attack,snapshot.dt),bodyRoll=hitRoll+(e.kind==='shambler'?-weight:e.kind==='brute'?heavyRoll*motionScale:Math.sin(gait.phase+.3)*.018*gait.amount*motionScale)+(e.kind==='flanker'?.025*(e.orbit||1)*motionScale:0);mesh.userData.torso.rotation.set(.09+posture+idleSway+runLean+attackPose.lean+hitPitch,heading.upper-reaction.side*.035,bodyRoll);for(const outfit of mesh.userData.clothes){if(!outfit.visible)continue;outfit.rotation.set(posture+idleSway+runLean+attackPose.lean+hitPitch,heading.upper-reaction.side*.035,bodyRoll);clothingPivot.set(0,1.065,0).applyEuler(outfit.rotation);outfit.position.set(-clothingPivot.x,1.065-clothingPivot.y,-clothingPivot.z)}mesh.userData.leftArm.position.z=mesh.userData.rightArm.position.z=.065*attack+.30*runLean;mesh.userData.leftArm.rotation.z=-.06-shoulder+hitRoll*.55-weight*.5;mesh.userData.rightArm.rotation.z=.06+shoulder+hitRoll*.55-weight*.5;mesh.userData.leftLeg.rotation.x=step;mesh.userData.rightLeg.rotation.x=otherStep;mesh.userData.leftFoot.rotation.x=-step;mesh.userData.rightFoot.rotation.x=-otherStep;mesh.userData.leftLeg.position.y=mesh.userData.rightLeg.position.y=.64+zombieFootGround(step,otherStep);mesh.userData.leftArm.rotation.x=-step-runArms-runSwing+carriage+hitArm-headFlinch-attack*lift*(eliteCast?.72:1+Math.max(0,attackLead));mesh.userData.rightArm.rotation.x=-otherStep-runArms+runSwing-carriage*.6-hitArm-headFlinch-attack*lift*(e.kind==='flanker'?.75*(1+Math.max(0,-attackLead)):1+Math.max(0,-attackLead));showZombieImpact(mesh,e.flash>0,e.hitHead,e.hitSide,false,player)}
    // Cosmetic corpses preserve their last displayed pose and have no collision.
    for(const body of corpses)body.visible=false;
    for(let i=0;i<deathCount;i++){
      const death=deaths[i],body=corpseSlots[i],u=body.userData,p=u.deathPose;body.visible=true;
      applyZombieStyle(body,death);updateZombieDetail(body,death,player,width,fovFactor,true);
      const duration=.46+.08*(.5+.5*Math.sin(death.phase||0)),t=Math.max(0,Math.min(1,death.age/duration)),fall=zombieCollapseEase(t,death.kind),side=(death.side<0?-1:1)*(.16+.05*Math.cos(death.phase||0))*(snapshot.reducedZombieMotion?.5:1),angle=1.38*fall+((death.shotgun?.22*t*(1-t)*(1-t):0)+p.runAmount*.15*t*(1-t)*(1-t))*(snapshot.reducedZombieMotion?.25:1),headImpulse=death.hitHead?.10*t*(1-t)*(1-t)*(snapshot.reducedZombieMotion?.5:1):0,limbVariation=Math.sin((death.phase||0)*1.37)*.08*(snapshot.reducedZombieMotion?.5:1),imbalance=(death.side<0?-1:1)*.17*t*(1-t)*(1-t)*(snapshot.reducedZombieMotion?.5:1);
      body.position.set(death.x,0,death.z);body.rotation.set(-angle,p.yaw,side*fall,'YXZ');const cleanup=corpseCleanupScale(death.age);body.scale.set((death.kind==='brute'?1.22:death.kind==='flanker'?.85:1)*cleanup,cleanup,cleanup);
      u.torso.rotation.set(mixDeath(p.torsoX,.09,fall)-headImpulse,mixDeath(p.torsoY,0,fall),mixDeath(p.torsoZ,0,fall)+imbalance);
      for(const outfit of u.clothes){outfit.rotation.set(mixDeath(p.outfitX,0,fall)-headImpulse,mixDeath(p.outfitY,0,fall),mixDeath(p.outfitZ,0,fall)+imbalance);outfit.position.set(p.outfitPX*(1-fall),p.outfitPY*(1-fall),p.outfitPZ*(1-fall))}
      u.leftArm.rotation.set(mixDeath(p.leftArmX,-.58+limbVariation,fall),0,mixDeath(p.leftArmZ,-.18,fall)+imbalance*.4);u.rightArm.rotation.set(mixDeath(p.rightArmX,-.46-limbVariation,fall),0,mixDeath(p.rightArmZ,.18,fall)+imbalance*.4);
      u.leftArm.position.z=p.leftArmPos*(1-fall);u.rightArm.position.z=p.rightArmPos*(1-fall);
      u.leftLeg.rotation.x=mixDeath(p.leftLegX,.12+limbVariation*.5,fall);u.rightLeg.rotation.x=mixDeath(p.rightLegX,-.18-limbVariation*.5,fall);u.leftLeg.position.y=mixDeath(p.leftLegY,.64,fall);u.rightLeg.position.y=mixDeath(p.rightLegY,.64,fall);
      u.leftFoot.rotation.x=mixDeath(p.leftFootX,-u.leftLeg.rotation.x,fall);u.rightFoot.rotation.x=mixDeath(p.rightFootX,-u.rightLeg.rotation.x,fall);groundCorpse(body,.016);showZombieImpact(body,death.age<.12&&!death.cueExpired,death.hitHead,death.side,true,player);
    }
    let shadowCount=0;for(let i=0;i<count;i++){const e=enemies[i];if(e.breach||e.arrival>.45)continue;let width=e.kind==='brute'?.46:e.kind==='flanker'?.32:.38;dummy.position.set(e.x,.024,e.z);dummy.rotation.set(-Math.PI/2,0,0,'YXZ');dummy.scale.set(width,width*.53,1);dummy.updateMatrix();shadowPool.setMatrixAt(shadowCount++,dummy.matrix)}for(let i=0;i<deathCount;i++){const death=deaths[i],duration=.46+.08*(.5+.5*Math.sin(death.phase||0)),t=Math.max(0,Math.min(1,death.age/duration)),fall=zombieCollapseEase(t,death.kind),back=.55*fall,body=corpseSlots[i],yaw=body.userData.deathPose.yaw,width=death.kind==='brute'?.46:death.kind==='flanker'?.32:.38;dummy.position.set(death.x-Math.sin(yaw)*back,.024,death.z-Math.cos(yaw)*back);dummy.rotation.set(-Math.PI/2,yaw,0,'YXZ');let cleanup=corpseCleanupScale(death.age);dummy.scale.set(width*cleanup,(width*.53+.5*fall)*cleanup,1);dummy.updateMatrix();shadowPool.setMatrixAt(shadowCount++,dummy.matrix)}shadowPool.count=shadowCount;shadowPool.instanceMatrix.needsUpdate=true;
    syncMarkers(snapshot);syncLabels(snapshot);const oldCameraMask=camera.layers.mask,oldAutoClear=renderer.autoClear;try{camera.layers.set(0);renderer.render(scene,camera);renderer.autoClear=false;renderer.clearDepth();camera.layers.set(1);renderer.render(scene,camera)}finally{camera.layers.mask=oldCameraMask;renderer.autoClear=oldAutoClear}
  }
  function dispose(){if(disposed)return;disposed=true;let materials=new Set(),geometries=new Set(),instances=new Set();scene.traverse(o=>{if(o.isInstancedMesh)instances.add(o);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.geometry)geometries.add(o.geometry)});for(const instance of instances)instance.dispose();for(const item of landmarks.userData.landmarkMaterials)materials.add(item);for(const item of interiors.userData.materials)materials.add(item);materials.add(interiorLightPools.userData.material);geometries.add(interiorLightPools.userData.geometry);geometries.add(zombieHeadGeometry);geometries.add(zombieTorsoGeometry);geometries.add(zombieArmGeometry);geometries.add(zombieLegGeometry);geometries.add(zombieHandGeometry);geometries.add(zombieShoeGeometry);geometries.add(zombieCuffGeometry);geometries.add(zombieJacketGeometry);geometries.add(zombieLapelGeometry);geometries.add(zombieWorkPocketGeometry);geometries.add(zombieWorkSleeveGeometry);geometries.add(zombieSkullGeometry);geometries.add(zombieNeckGeometry);for(const hair of zombieHairGeometries)geometries.add(hair);geometries.add(zombieBruteApronGeometry);geometries.add(zombieBruteStrapGeometry);geometries.add(zombieFlankerSideGeometry);geometries.add(zombieSeamGeometry);for(const hem of zombieHemGeometries)geometries.add(hem);for(const value of Object.values(zombieMaterials)){if(Array.isArray(value))for(const item of value)materials.add(item);else materials.add(value)}let textures=new Set();for(const material of materials){if(material.map)textures.add(material.map);if(material.roughnessMap)textures.add(material.roughnessMap);if(material.bumpMap)textures.add(material.bumpMap);material.dispose()}for(const texture of textures)texture.dispose();for(const item of geometries)item.dispose();renderer.dispose()}
  return {render,dispose};
}




