import * as THREE from './vendor/three.module.min.mjs';

// Exact maximum over piecewise-linear terrain triangles clipped to an oriented
// facade-local rectangle. This is geometry validation, not surveyed interior data.
export function maxTerrainInEntryRect(meta,heights,c,{u0,u1,v0,v1}){
 const g=meta.grid,{x0,z0,width:w,height:h,spacing_m:s}=g;if(heights.length!==w*h)throw Error('Invalid terrain payload');
 const corners=[[u0,v0],[u0,v1],[u1,v0],[u1,v1]].map(([u,v])=>[c.originX+c.tx*u+c.nx*v,c.originZ+c.tz*u+c.nz*v]),xs=corners.map(p=>p[0]),zs=corners.map(p=>p[1]),c0=Math.max(0,Math.floor((Math.min(...xs)-x0)/s)),c1=Math.min(w-2,Math.floor((Math.max(...xs)-x0)/s)),r0=Math.max(0,Math.floor((Math.min(...zs)-z0)/s)),r1=Math.min(h-2,Math.floor((Math.max(...zs)-z0)/s));let max=-Infinity,polygons=0;
 function vertex(col,row){const x=x0+col*s,z=z0+row*s,dx=x-c.originX,dz=z-c.originZ,y=heights[row*w+col];if(!Number.isFinite(y))throw Error('Non-finite entry terrain');return {u:dx*c.tx+dz*c.tz,v:dx*c.nx+dz*c.nz,y}}
 function clip(poly,key,bound,sign){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[key]-bound),db=sign*(b[key]-bound),ina=da>=-1e-10,inb=db>=-1e-10;if(ina)out.push(a);if(ina!==inb){const t=da/(da-db);out.push({u:a.u+t*(b.u-a.u),v:a.v+t*(b.v-a.v),y:a.y+t*(b.y-a.y)})}}return out}
 for(let r=r0;r<=r1;r++)for(let col=c0;col<=c1;col++){const a=vertex(col,r),b=vertex(col+1,r),d=vertex(col,r+1),e=vertex(col+1,r+1);for(let poly of [[a,b,e],[a,e,d]]){for(const [key,bound,sign] of [['u',u0,1],['u',u1,-1],['v',v0,1],['v',v1,-1]]){if(poly.length)poly=clip(poly,key,bound,sign)}if(poly.length){polygons++;for(const p of poly)max=Math.max(max,p.y)}}}
 if(!polygons||!Number.isFinite(max))throw Error('Entry room lacks terrain coverage');return {max,polygons}
}

export function buildEntryRoom(meta,heights,c){
 const width=4.2,depth=4.5,wallDepth=.32,wallThickness=.16,clearHeight=3.25,floorY=c.thresholdY,ceilingY=floorY+clearHeight;
 const ground=maxTerrainInEntryRect(meta,heights,c,{u0:-width/2,u1:width/2,v0:wallDepth,v1:depth}),thresholdGround=maxTerrainInEntryRect(meta,heights,c,{u0:-c.clearWidth/2,u1:c.clearWidth/2,v0:0,v1:wallDepth});
 if(Math.max(ground.max,thresholdGround.max)>=floorY-.005)throw Error('Entry floor or threshold is not above source terrain');
 const group=new THREE.Group();group.name='entry-vestibule-provisional';const mat={wall:new THREE.MeshStandardMaterial({color:0xaaa79b,roughness:1}),floor:new THREE.MeshStandardMaterial({color:0x8b8980,roughness:1}),ceiling:new THREE.MeshStandardMaterial({color:0xb7b3a8,roughness:1})},basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(c.tx,0,c.tz),new THREE.Vector3(0,1,0),new THREE.Vector3(c.nx,0,c.nz)),q=new THREE.Quaternion().setFromRotationMatrix(basis);
 function box(name,u,v,y,w,h,d,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.name=name;mesh.position.set(c.originX+c.tx*u+c.nx*v,y,c.originZ+c.tz*u+c.nz*v);mesh.quaternion.copy(q);group.add(mesh)}
 const span=depth-wallDepth,mid=(depth+wallDepth)/2;box('entry-room-floor',0,mid,floorY-.08,width,.16,span,mat.floor);for(const sign of [-1,1])box('entry-room-side',sign*(width/2+wallThickness/2),mid,floorY+clearHeight/2,wallThickness,clearHeight,span,mat.wall);box('entry-room-back',0,depth+wallThickness/2,floorY+clearHeight/2,width+2*wallThickness,clearHeight,wallThickness,mat.wall);box('entry-room-ceiling',0,mid,floorY+clearHeight+.08,width,.16,span,mat.ceiling);
 function rect(u,v,halfWidth,halfDepth,kind){return {cx:c.originX+c.tx*u+c.nx*v,cz:c.originZ+c.tz*u+c.nz*v,tx:c.tx,tz:c.tz,nx:c.nx,nz:c.nz,halfWidth,halfDepth,top:floorY,kind}}
 const supports=[rect(0,wallDepth/2,c.clearWidth/2,wallDepth/2,'entry-threshold'),rect(0,mid,width/2,span/2,'entry-room-floor')];
 group.userData={portal:{contract:c,width,depth,wallDepth,ceilingY,approximation:'Provisional bounded entry room, not a measured historic interior.'},supports,terrainMax:ground.max,thresholdTerrainMax:thresholdGround.max,terrainPolygons:ground.polygons+thresholdGround.polygons};return group
}
