import * as THREE from './vendor/three.module.min.mjs';

// Present-day fire-damaged Warden's House: a photo-informed, open ruin, not
// a reconstruction of its occupied appearance. Location is the mapped OSM
// centre only; shape, opening schedule and dimensions are provisional.
export function buildWardenRuin(terrain,facadeTexture=null){
 const cx=97.158,cz=-21.376,angle=Math.atan2(.718,.696),u=[Math.cos(angle),Math.sin(angle)],v=[-u[1],u[0]],halfL=10,halfW=6,thickness=.38;
 function pos(a,b){return [cx+u[0]*a+v[0]*b,cz+u[1]*a+v[1]*b]}
 const samples=[];for(let a=-10;a<=10;a+=2)for(let b=-6;b<=6;b+=2){const [x,z]=pos(a,b),h=terrain.sampleHeight(x,z);if(Number.isFinite(h))samples.push(h)}if(samples.length<20)throw Error('Warden ruin missing terrain coverage');
 const ground=Math.max(...samples),base=Math.min(...samples)-.7,top=ground+8.5,H=top-base;
 const wallMaterial=new THREE.MeshStandardMaterial({color:facadeTexture?0xe6e0d1:0xbcb7a9,map:facadeTexture||null,roughness:1}),brick=new THREE.MeshStandardMaterial({color:0x88695a,roughness:1});const group=new THREE.Group();group.name='warden-house-ruin-approx';const colliders=[];let counter=0;
 function rectangle(a,b,n){return [[a[0],a[1]],[b[0],b[1]],[b[0]+n[0]*thickness,b[1]+n[1]*thickness],[a[0]+n[0]*thickness,a[1]+n[1]*thickness]]}
 function shapeHole(shape,x,y,w,h){const q=new THREE.Path();q.moveTo(x-w/2,y);q.lineTo(x-w/2,y+h);q.lineTo(x+w/2,y+h);q.lineTo(x+w/2,y);q.closePath();shape.holes.push(q)}
 function wall(a,b){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),t=[dx/length,dz/length],n=[-t[1],t[0]],shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(length,0);shape.lineTo(length,H-.6);shape.lineTo(length*.82,H-.18);shape.lineTo(length*.63,H-.74);shape.lineTo(length*.43,H-.26);shape.lineTo(length*.2,H-.92);shape.lineTo(0,H-.45);shape.closePath();
  const count=Math.max(1,Math.floor(length/3.8));for(let j=1;j<=count;j++){const x=length*j/(count+1);shapeHole(shape,x,H-6.6,1.35,1.65);shapeHole(shape,x,H-3.4,1.3,1.5)}
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1,curveSegments:2});const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(t[0],0,t[1]),new THREE.Vector3(0,1,0),new THREE.Vector3(n[0],0,n[1]));matrix.setPosition(a[0],base,a[1]);geometry.applyMatrix4(matrix);const mesh=new THREE.Mesh(geometry,wallMaterial);mesh.name='warden-ruin-wall';group.add(mesh);colliders.push({id:`warden-ruin-wall-${counter++}`,outline:rectangle(a,b,n)});
 }
 // A visible 2.4 m full-height breach in the long face is actually traversable.
 wall(pos(-10,-6),pos(-1.2,-6));wall(pos(1.2,-6),pos(10,-6));wall(pos(10,-6),pos(10,6));wall(pos(10,6),pos(-10,6));wall(pos(-10,6),pos(-10,-6));
 // Brick chimney is an approximate reference-led vertical silhouette.
 const chimneyCentre=pos(2,2.8),chimney=new THREE.Mesh(new THREE.BoxGeometry(1.1,H+1.2,1.1),brick);chimney.position.set(chimneyCentre[0],base+(H+1.2)/2,chimneyCentre[1]);chimney.name='warden-ruin-chimney';group.add(chimney);colliders.push({id:'warden-ruin-chimney',outline:[[chimneyCentre[0]-.55,chimneyCentre[1]-.55],[chimneyCentre[0]+.55,chimneyCentre[1]-.55],[chimneyCentre[0]+.55,chimneyCentre[1]+.55],[chimneyCentre[0]-.55,chimneyCentre[1]+.55]]});
 group.userData={colliders,center:[cx,cz],estimated_size_m:[20,12],base,top,period:'present-day roofless shell after 1970 fire',qualification:'Location is an approximate map point. Shape, dimensions, wall fragments, window and chimney positions are photo-informed placeholders, not surveyed or a 1962 reconstruction.',sources:['https://www.nps.gov/places/000/alcatraz-wardens-house.htm','https://mapcarta.com/W27996789']};return group;
}
