import * as THREE from './vendor/three.module.min.mjs';

// Every repeated rectangular detail can share one immutable unit-box geometry.
const INSTANCE_BOX=new THREE.BoxGeometry(1,1,1);
const ENTRY_WIDTH=7.2, ENTRY_LANDING_DEPTH=7.8;
function entryGroundExtrema(f,length,terrain,d0,d1){let low=Infinity,high=-Infinity;const nx=Math.ceil(ENTRY_WIDTH/.12),nd=Math.ceil((d1-d0)/.12);for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nd;iz++){const x=-ENTRY_WIDTH/2+ENTRY_WIDTH*ix/nx,d=d0+(d1-d0)*iz/nd,p=position(f,length/2+x,0,-d),h=terrain.sampleHeight(p.x,p.z);if(h!==null&&Number.isFinite(h)){low=Math.min(low,h);high=Math.max(high,h)}}if(!Number.isFinite(low))throw Error('Entrance terrain unavailable');return {low,high}}

// Interpreted facade treatment: the source records do not supply opening
// schedules. Rectangular openings and trim are visual approximations inspired by
// inspected 1986 HABS images; collision remains the original source footprint.
function signedArea(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
function frameFor(a,b,base,ccw){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),t=new THREE.Vector3(dx/length,0,dz/length),up=new THREE.Vector3(0,1,0),inward=new THREE.Vector3(-dz/length,0,dx/length).multiplyScalar(ccw?1:-1);return {a,length,t,up,inward,base}}
function basis(f){return new THREE.Matrix4().makeBasis(f.t,f.up,f.inward)}
function position(f,x,y,z){return new THREE.Vector3(f.a[0],f.base,f.a[1]).addScaledVector(f.t,x).addScaledVector(f.up,y).addScaledVector(f.inward,z)}
function boxTransform(f,x,y,z,w,h,d){const q=new THREE.Quaternion().setFromRotationMatrix(basis(f));return new THREE.Matrix4().compose(position(f,x,y,z),q,new THREE.Vector3(w,h,d))}
function addHole(shape,x,y,w,h){const p=new THREE.Path();p.moveTo(x-w/2,y);p.lineTo(x-w/2,y+h);p.lineTo(x+w/2,y+h);p.lineTo(x+w/2,y);p.closePath();shape.holes.push(p)}
function instances(matrices,material,name){if(!matrices.length)return null;const mesh=new THREE.InstancedMesh(INSTANCE_BOX,material,matrices.length);mesh.name=name;const tint=new THREE.Color();matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);if(name==='window-panes'){const v=.92+.08*((i*73%101)/100);mesh.setColorAt(i,tint.setRGB(v,v,v))}});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;return mesh}
function gablePrism(length,width,height){const x=length/2,z=width/2,h=height,p=[[-x,0,-z],[x,0,-z],[x,0,z],[-x,0,z],[-x,h,0],[x,h,0]],faces=[[0,1,5],[0,5,4],[3,4,5],[3,5,2],[0,4,3],[1,2,5],[0,3,2],[0,2,1]],v=[];for(const f of faces)for(const i of f)v.push(...p[i]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();return g}
// Five side/bottom faces plus two abutting, non-overlapping top regions.
// The narrow top region marks a worn nosing without an offset decal or a
// coplanar overlay; its highest point is exactly the walking-support plane.
function stairSlabGeometry(width,height,depth,noseDepth=0){
 const box=new THREE.BoxGeometry(width,height,depth).toNonIndexed(),pos=box.attributes.position,norm=box.attributes.normal,uv=box.attributes.uv,vertices=[],normals=[],uvs=[],groups=[];
 for(const g of box.groups){if(g.materialIndex===2)continue;for(let i=g.start;i<g.start+g.count;i++){vertices.push(pos.getX(i),pos.getY(i),pos.getZ(i));normals.push(norm.getX(i),norm.getY(i),norm.getZ(i));uvs.push(uv.getX(i),uv.getY(i))}}groups.push([0,vertices.length/3,0]);
 function top(z0,z1,material){if(z1-z0<1e-8)return;const x0=-width/2,x1=width/2,y=height/2,start=vertices.length/3;for(const [x,z] of [[x0,z0],[x0,z1],[x1,z0],[x1,z0],[x0,z1],[x1,z1]]){vertices.push(x,y,z);normals.push(0,1,0);uvs.push(x,z)}groups.push([start,6,material])}
 const z0=-depth/2,z1=depth/2,edge=z0+Math.min(noseDepth,depth);top(z0,edge,2);top(edge,z1,1);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));for(const [start,count,mat] of groups)g.addGroup(start,count,mat);g.userData.slab={width,height,depth,noseDepth};box.dispose();return g
}
// Each ExtrudeGeometry UV coordinate is measured in the local wall's metres.
// Configure 4-metre world-scale repeats on both the vertical fronts and their
// shallow reveals; caller owns image loading and the shared texture lifetime.
export function configureFacadeTexture(texture){if(!texture)return null;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(.25,.25);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture}
// Unit-box UVs cover each ~1 x 2.5 m leaf; repeat one metre in both directions.
export function configureDoorTexture(texture){if(!texture)return null;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1,2.5);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture}
// Shared sky-toned glazing texture spans each pane once; opaque glazing hides
// unmodeled interiors. It is a static visual cue, not live environment capture.
export function configureGlassTexture(texture){if(!texture)return null;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.repeat.set(1,1);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture}
export function addArchitecture(data,structures,terrain,facadeTextures={}){
 const cellMap=configureFacadeTexture(facadeTextures.cellhouse),industryMap=configureFacadeTexture(facadeTextures.industrial),doorMap=configureDoorTexture(facadeTextures.door),glassMap=configureGlassTexture(facadeTextures.glass);
 const material={wall:new THREE.MeshStandardMaterial({color:cellMap?0xdad3c8:0xc2baaa,map:cellMap,roughness:.96}),industry:new THREE.MeshStandardMaterial({color:industryMap?0xcdc8c2:0xa9a69b,map:industryMap,roughness:.96}),cellCap:new THREE.MeshStandardMaterial({color:0xc2baaa,roughness:.96}),industryCap:new THREE.MeshStandardMaterial({color:0xa9a69b,roughness:.96}),trim:new THREE.MeshStandardMaterial({color:0x9f998a,roughness:1}),pane:new THREE.MeshStandardMaterial({color:glassMap?0x697e7a:0x394b4d,map:glassMap,roughness:glassMap?.72:.88,metalness:0}),bar:new THREE.MeshStandardMaterial({color:0x69726e,roughness:.92,metalness:0}),door:new THREE.MeshStandardMaterial({color:doorMap?0x585d58:0x4c504c,map:doorMap,roughness:.93,metalness:0}),doorBack:new THREE.MeshStandardMaterial({color:0x292e2b,roughness:1}),doorPanel:new THREE.MeshStandardMaterial({color:0x64675f,roughness:.96,metalness:.05}),doorHardware:new THREE.MeshStandardMaterial({color:0x85887e,roughness:.90,metalness:.12}),doorTransom:new THREE.MeshStandardMaterial({color:0x3d4846,roughness:.92,metalness:0}),rooflight:new THREE.MeshStandardMaterial({color:0x788781,roughness:.7,side:THREE.DoubleSide}),stairSide:new THREE.MeshStandardMaterial({color:0x918d82,roughness:1}),stairTop:new THREE.MeshStandardMaterial({color:cellMap?0xc5c0b4:0xada89d,map:cellMap,roughness:1}),stairNose:new THREE.MeshStandardMaterial({color:0xa19c91,roughness:1}),hidden:new THREE.MeshBasicMaterial({visible:false})};
 const group=new THREE.Group();group.name='reference-led-architecture';const pane=[],frame=[],bars=[],trim=[],pilasters=[],doors=[],entryFrame=[],entryBack=[],entryTransom=[],entryPanels=[],entryHardware=[],details=[],walkableSteps=[];
 const specs=[{id:16050272,rows:3,spacing:3.5,width:1.25,levels:b=>[b.base+.3,b.base+3.2,b.base+6.45],heights:[1.45,1.8,2.4],front:12,style:'cellhouse'},{id:9925847,rows:2,spacing:5.0,width:3.8,levels:b=>[b.base+.55,b.base+4.1],heights:[1.55,1.55],style:'new-industries'},{id:7811972,rows:3,spacing:4.7,width:3.3,levels:b=>[b.base+1.2,b.base+5.8,b.base+10.4],heights:[1.8,1.8,1.8],style:'model-industries'}];
 for(const spec of specs){const b=data.buildings.find(x=>x.id===spec.id),solid=structures.getObjectByName(`footprint-${spec.id}`);if(!b||!solid)throw Error(`Missing source mass ${spec.id}`);const base=solid.userData.base,top=solid.userData.top,H=top-base,ccw=signedArea(b.outline)>0;solid.material=[spec.style==='cellhouse'?material.cellCap:material.industryCap,material.hidden];const floors=spec.levels(b);let buildingOpenings=0;
  for(let i=0;i<b.outline.length;i++){const a=b.outline[i],end=b.outline[(i+1)%b.outline.length],f=frameFor(a,end,base,ccw),L=f.length;const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(L,0);shape.lineTo(L,H);shape.lineTo(0,H);shape.closePath();let openings=[];const yardWing=spec.style==='cellhouse'&&i===1;const count=L>=8?(yardWing?7:Math.max(1,Math.floor((L-2.0)/spec.spacing))):0;const gap=L/(count+1);let door=null;
   if(spec.front===i){
    // Closed, recessed interpretation: the post-closure photograph has an
    // open dark entry, so the two leaves and opaque transom are not a verified
    // 1962 hardware/door schedule. The threshold meets the existing terrace.
    const x=L/2,bottom=entryGroundExtrema(f,L,terrain,0,ENTRY_LANDING_DEPTH).high+.015,w=2.25,h=3.10,y=bottom-base,jamb=.12,head=.12,transomHeight=.38,cross=.08,leafHeight=h-head-transomHeight-cross-.015,inside=w-2*jamb,gap=.025,leafWidth=(inside-gap)/2;
    door={x,y,w,h,leafHeight,transomHeight,thresholdY:bottom,hardware:'illustrative, not verified as 1962 design'};addHole(shape,x,y,w,h);
    // Jambs stop at the lintel; the crossbar stops at jambs: no coplanar overlap.
    entryFrame.push(boxTransform(f,x-w/2+jamb/2,y+(h-head)/2,.09,jamb,h-head,.16),boxTransform(f,x+w/2-jamb/2,y+(h-head)/2,.09,jamb,h-head,.16),boxTransform(f,x,y+h-head/2,.09,w,head,.16),boxTransform(f,x,y+.015+leafHeight+cross/2,.09,inside,cross,.16),boxTransform(f,x,y-.0175,.16,inside,.035,.32));
    for(const sign of [-1,1]){
     const leafX=x+sign*(gap/2+leafWidth/2);doors.push(boxTransform(f,leafX,y+.015+leafHeight/2,.235,leafWidth,leafHeight,.07));
     // Restrained framed metal panel and practical pull are generic, not
     // asserted historical hardware. Rails touch the leaf at z=.20; adjoining
     // rails meet only at their edges and the pull uses small stand-offs.
     const panelW=leafWidth-.22,panelH=leafHeight-.40,rail=.035,cy=y+.015+leafHeight/2;
     entryPanels.push(boxTransform(f,leafX-panelW/2+rail/2,cy,.18,rail,panelH,.04),boxTransform(f,leafX+panelW/2-rail/2,cy,.18,rail,panelH,.04),boxTransform(f,leafX,cy-panelH/2+rail/2,.18,panelW-2*rail,rail,.04),boxTransform(f,leafX,cy+panelH/2-rail/2,.18,panelW-2*rail,rail,.04));
     const pullX=x+sign*.18,pullY=y+1.30;entryHardware.push(boxTransform(f,pullX,pullY,.14,.035,.42,.035));for(const dy of [-.195,.195])entryHardware.push(boxTransform(f,pullX,pullY+dy,.17875,.035,.03,.0425));
     const hingeX=x+sign*(w/2-jamb-.025);for(const v of [.35,1.30,2.25])entryHardware.push(boxTransform(f,hingeX,y+v,.175,.04,.12,.05));
    }
    entryTransom.push(boxTransform(f,x,y+h-head-transomHeight/2,.235,inside,transomHeight,.06));
    entryBack.push(boxTransform(f,x,y+h/2,.305,w-.02,h-.02,.02));
   }
   // The south entry elevation in the HABS photograph has two principal
   // tiers of broad windows; the long side elevations use slimmer windows
   // and can expose a lower basement tier. Dimensions are visual estimates.
   const entryFront=spec.style==='cellhouse'&&i===spec.front;
   const sideElevation=spec.style==='cellhouse'&&(i===1||i===11||i===17);
   for(let row=0;row<spec.rows;row++)for(let j=1;j<=count;j++){
    if(entryFront&&row===0)continue;
    // The yard-side dining wing's two upper tiers have several paired lights;
    // represent each light as its own aperture with a narrow masonry pier.
    const paired=yardWing&&row>0&&j>=5, offsets=paired?[-.70,.70]:[0];
    for(const offset of offsets){
     const x=j*gap+offset,y=floors[row]-base,h=entryFront&&row===1?1.55:spec.style==='cellhouse'&&!entryFront&&row>0?2.4:spec.heights[row],w=Math.min(entryFront?(row===1?2.1:2.15):paired?1.2:spec.width,gap*.68);
     // Retain partially visible lower windows, but don't create a row wholly
     // buried by sampled exterior grade. Missing samples do not suppress one.
     if(sideElevation&&row===0){const samples=[-w/2,0,w/2].map(offset=>{const p=position(f,x+offset,0,-.4);return terrain.sampleHeight(p.x,p.z)});if(samples.every(v=>v!==null&&Number.isFinite(v)&&v>=base+y+h+.15))continue}
     if(y<.25||y+h>H-.55)continue;
     if(door&&Math.abs(x-door.x)<(w+door.w)/2+.35&&y<door.y+door.h&&y+h>door.y)continue;
     // Slight pane overlap into the jamb closes the aperture at grazing angles;
     // glazing and crossed bars sit on distinct recessed depth planes.
     addHole(shape,x,y,w,h);openings.push({x,y,w,h,row});pane.push(boxTransform(f,x,y+h/2,.245,w+.02,h+.02,.06));
     const border=.085;frame.push(boxTransform(f,x-w/2,y+h/2,-.035,border,h+.12,.12),boxTransform(f,x+w/2,y+h/2,-.035,border,h+.12,.12),boxTransform(f,x,y-.025,-.035,w-.10,border,.12),boxTransform(f,x,y+h+.025,-.035,w-.10,border,.12),boxTransform(f,x,y-.11,-.075,w+.18,.12,.26));
     const verticals=entryFront&&row===2?4:spec.style==='cellhouse'&&!entryFront&&row>0?2:spec.style==='cellhouse'?1:3,horizontals=entryFront&&row===2?4:spec.style==='cellhouse'&&!entryFront&&row>0?4:2;
     for(let n=1;n<=verticals;n++)bars.push(boxTransform(f,x-w/2+w*n/(verticals+1),y+h/2,.085,.035,h,.035));
     for(let n=1;n<=horizontals;n++)bars.push(boxTransform(f,x,y+h*n/(horizontals+1),.14,w,.035,.035));
    }
   }
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:.32,bevelEnabled:false,steps:1,curveSegments:3});const transform=basis(f);transform.setPosition(new THREE.Vector3(a[0],base,a[1]));geometry.applyMatrix4(transform);const wall=new THREE.Mesh(geometry,spec.style==='cellhouse'?material.wall:material.industry);wall.name=`facade-${spec.id}-${i}`;group.add(wall);
   if(L>3){trim.push(boxTransform(f,L/2,H-.48,-.07,L,.24,.20),boxTransform(f,L/2,H+.15,-.06,L,.30,.35));if(spec.style==='cellhouse'&&count>0)for(let j=0;j<=count;j++){const x=(j+.5)*gap;pilasters.push(boxTransform(f,x,H/2,-.065,.22,H-.8,.18))}}
   buildingOpenings+=openings.length;details.push({id:spec.id,edge:i,length:L,base,top,openings,door});
  }
  details.push({id:spec.id,summary:true,openings:buildingOpenings,style:spec.style});
 }
 for(const [arr,mat,name] of [[pane,material.pane,'window-panes'],[frame,material.trim,'window-frames'],[bars,material.bar,'window-grilles'],[trim,material.trim,'cornice-parapet'],[pilasters,material.trim,'pilasters'],[doors,material.door,'closed-entry'],[entryFrame,material.trim,'entry-frame'],[entryBack,material.doorBack,'entry-backing'],[entryTransom,material.doorTransom,'entry-transom'],[entryPanels,material.doorPanel,'entry-leaf-panels'],[entryHardware,material.doorHardware,'entry-hardware']]){const mesh=instances(arr,mat,name);if(mesh)group.add(mesh)}
 // The two low, long gabled roof lights are visually grounded in HABS roof photos;
 // placement and dimensions are approximate and sit inside the 2 m high region.
 const house=data.buildings.find(x=>x.id===16050272),model=data.roof_massing.models['16050272'],high=Math.max(...model.regions.map(r=>r.elevation_navd88)),dir=new THREE.Vector3(house.outline[12][0]-house.outline[11][0],0,house.outline[12][1]-house.outline[11][1]).normalize(),side=new THREE.Vector3(-dir.z,0,dir.x);for(const v of [-60,-44]){const center=dir.clone().multiplyScalar(-16).addScaledVector(side,v),geom=gablePrism(52,2.2,.85),mesh=new THREE.Mesh(geom,material.rooflight);mesh.position.set(center.x,high-.02,center.z);mesh.rotation.y=-Math.atan2(dir.z,dir.x);mesh.name='cellhouse-skylight';group.add(mesh);details.push({id:16050272,skylight:true,center:[center.x,high-.02,center.z],length:52,width:2.2,height:.85})}
 // The entrance photo shows a short broad flight reaching a terrace, not
 // independent slabs climbing the wall. Counts and sizes below are visual
 // estimates over the existing fictional apron, not surveyed 1962 dimensions.
 // Every rendered top has the same oriented rectangle in walkableSteps.
 const front=details.find(v=>v.id===16050272&&v.edge===12),a=house.outline[12],b=house.outline[13],f=frameFor(a,b,front.base,true);
 if(front.door){
  const width=ENTRY_WIDTH,landingDepth=ENTRY_LANDING_DEPTH,treadDepth=.46,count=5,rise=.09,q=new THREE.Quaternion().setFromRotationMatrix(basis(f));
  const groundExtrema=(d0,d1)=>entryGroundExtrema(f,front.length,terrain,d0,d1);
  const ground=groundExtrema(0,landingDepth),landingTop=ground.high+.015;
  function slab(name,d0,d1,top,index){const ext=groundExtrema(d0,d1),bottom=ext.low-.20,depth=d1-d0,probe=position(f,front.length/2,0,-(d0+d1)/2),loc=position(f,front.length/2,(top+bottom)/2-front.base,-(d0+d1)/2);if(!(top>ext.high))throw Error(`Entrance ${name} is buried by terrain`);const mesh=new THREE.Mesh(stairSlabGeometry(width,top-bottom,depth,index<0?0:.04),[material.stairSide,material.stairTop,material.stairNose]);mesh.position.copy(loc);mesh.quaternion.copy(q);mesh.name=name;group.add(mesh);walkableSteps.push({cx:probe.x,cz:probe.z,tx:f.t.x,tz:f.t.z,nx:f.inward.x,nz:f.inward.z,halfWidth:width/2,halfDepth:depth/2,top,kind:name});details.push({id:16050272,step:name==='entrance-step-approx',landing:name==='entrance-landing',index,top,bottom,groundMax:ext.high,near:d0,far:d1,width})}
  slab('entrance-landing',0,landingDepth,landingTop,-1);
  for(let i=0;i<count;i++)slab('entrance-step-approx',landingDepth+i*treadDepth,landingDepth+(i+1)*treadDepth,landingTop-rise*(i+1),i);
 }

 const door=front.door,entryDoorContract=door?{originX:a[0]+f.t.x*door.x,originZ:a[1]+f.t.z*door.x,tx:f.t.x,tz:f.t.z,nx:f.inward.x,nz:f.inward.z,thresholdY:front.base+door.y,apertureWidth:door.w,apertureHeight:door.h,clearWidth:door.w-.24,clearHeight:.015+door.leafHeight,leafWidth:(door.w-.24-.025)/2,leafHeight:door.leafHeight,leafThickness:.07,hingeDepth:.235}:null;
 group.userData={details,walkableSteps,entryDoorContract,windowCount:pane.length,barCount:bars.length,uncertainty:'Source footprints and median levels remain; opening rhythm, widths, parapets, door/steps and skylight dimensions are visual interpretations of 1986/post-closure references, not a measured opening schedule. A provisional entry room is built separately but remains gated; no playable door yet.'};return group;
}
