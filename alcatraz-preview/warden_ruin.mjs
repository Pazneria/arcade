import * as THREE from './vendor/three.module.min.mjs';

// Prison-era Warden's House, as a source-qualified exterior interpretation.
// The mapped location and earlier 20 x 12 m blockout are approximate: no
// measured floor plan or 1962 window/door schedule has been established.
// The real house was intact while the prison operated, before its 1970 fire.
export function buildWardenResidence(terrain,facadeTexture=null){
 const cx=97.158,cz=-21.376,angle=Math.atan2(.718,.696),u=[Math.cos(angle),Math.sin(angle)],v=[-u[1],u[0]],halfL=10,halfW=6,t=.38;
 function pos(a,b){return [cx+u[0]*a+v[0]*b,cz+u[1]*a+v[1]*b]}
 const samples=[];for(let a=-10;a<=10;a+=2)for(let b=-6;b<=6;b+=2){const [x,z]=pos(a,b),h=terrain.sampleHeight(x,z);if(Number.isFinite(h))samples.push(h)}if(samples.length<20)throw Error('Warden house missing terrain coverage');
 const ground=Math.max(...samples),base=Math.min(...samples)-.7,top=ground+8.5,H=top-base;
 const wall=new THREE.MeshStandardMaterial({color:facadeTexture?0xe6e0d1:0xbcb7a9,map:facadeTexture||null,roughness:.96}),roofMat=new THREE.MeshStandardMaterial({color:0x817e74,roughness:.98}),trim=new THREE.MeshStandardMaterial({color:0xc8c2b4,roughness:1}),glass=new THREE.MeshStandardMaterial({color:0x495b5c,roughness:.64,metalness:.04}),doorMat=new THREE.MeshStandardMaterial({color:0x554c41,roughness:.9}),brick=new THREE.MeshStandardMaterial({color:0x856a5c,roughness:1});
 const group=new THREE.Group();group.name='warden-house-intact-approx';const batches=new Map();
 function transform(a,b,y){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),tangent=new THREE.Vector3(dx/length,0,dz/length),inward=new THREE.Vector3(-dz/length,0,dx/length),mat=new THREE.Matrix4().makeBasis(tangent,new THREE.Vector3(0,1,0),inward);mat.setPosition(a[0],y,a[1]);return {mat,length}}
 function hole(shape,x,y,w,h){const q=new THREE.Path();q.moveTo(x-w/2,y);q.lineTo(x-w/2,y+h);q.lineTo(x+w/2,y+h);q.lineTo(x+w/2,y);q.closePath();shape.holes.push(q)}
 function boxOnFrame(frame,x,y,z,w,h,d,mat,name){const key=mat.uuid+':'+name;if(!batches.has(key))batches.set(key,{mat,name,matrices:[]});const m=frame.clone().multiply(new THREE.Matrix4().makeTranslation(x,y,z)).multiply(new THREE.Matrix4().makeScale(w,h,d));batches.get(key).matrices.push(m)}
 const corners=[pos(-10,-6),pos(10,-6),pos(10,6),pos(-10,6)];let openings=0;
 for(let edge=0;edge<4;edge++){
  const a=corners[edge],b=corners[(edge+1)%4],f=transform(a,b,base),L=f.length,shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(L,0);shape.lineTo(L,H);shape.lineTo(0,H);shape.closePath();
  const count=L>15?5:3,door=edge===2?{x:L/2,y:ground-base-.2,w:1.7,h:2.5}:null;if(door)hole(shape,door.x,door.y,door.w,door.h);
  for(let row=0;row<3;row++)for(let j=1;j<=count;j++){
   const x=L*j/(count+1),y=[1.2,4.6,8.0][row],w=1.25,h=1.75;if(y+h>H-.4)continue;if(door&&Math.abs(x-door.x)<(w+door.w)/2+.25&&y<door.y+door.h&&y+h>door.y)continue;
   hole(shape,x,y,w,h);boxOnFrame(f.mat,x,y+h/2,.22,w-.04,h-.04,.06,glass,'warden-window-glass');for(const side of [-1,1])boxOnFrame(f.mat,x+side*w/2,y+h/2,-.025,.08,h+.12,.10,trim,'warden-window-frame');boxOnFrame(f.mat,x,y+h/2,-.04,.055,h,.09,trim,'warden-window-mullion');boxOnFrame(f.mat,x,y+h*.56,-.04,w,.055,.09,trim,'warden-window-crossbar');openings++;
  }
  if(door){boxOnFrame(f.mat,door.x,door.y+door.h/2,.21,door.w-.04,door.h-.04,.07,doorMat,'warden-closed-door');boxOnFrame(f.mat,door.x,door.y+door.h+.08,-.04,door.w+.25,.16,.12,trim,'warden-door-lintel')}
  const g=new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false,steps:1,curveSegments:3});g.applyMatrix4(f.mat);const mesh=new THREE.Mesh(g,wall);mesh.name='warden-intact-wall';group.add(mesh);
 }
 // Closed under-roof cap avoids exposing a void; no interior is modeled.
 const cap=new THREE.Mesh(new THREE.BoxGeometry(20,.18,12),wall);cap.position.set(cx,top-.09,cz);cap.rotation.y=-angle;cap.name='warden-roof-deck';group.add(cap);
 // Hipped roof: four planar faces, low profile. Ridge arrangement is an
 // interpretation of period photography, not a surveyed roof plan.
 function hip(a0,a1,b0,b1,eave,rise,name){const L=(a1-a0),W=(b1-b0),halfR=Math.max(0,(L-W)/2),mid=(a0+a1)/2,pts=[[a0,b0,0],[a1,b0,0],[a1,b1,0],[a0,b1,0],[mid-halfR,(b0+b1)/2,rise],[mid+halfR,(b0+b1)/2,rise]],faces=[[0,4,5],[0,5,1],[1,5,2],[2,5,4],[2,4,3],[3,4,0]],verts=[];for(const f of faces)for(const i of f){const [a,b,h]=pts[i],[x,z]=pos(a,b);verts.push(x,eave+h,z)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,roofMat);mesh.name=name;group.add(mesh);return mesh}
 hip(-10.3,10.3,-6.3,6.3,top,2.15,'warden-main-hipped-roof');
 // Mission-revival curved parapet segments; proportions/placement estimated.
 for(const center of [-6,0,6]){const a=pos(center-1.55,6.05),b=pos(center+1.55,6.05),f=transform(a,b,top-.1),shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(0,.35);shape.bezierCurveTo(.35,.35,.42,1.05,.9,1.05);shape.bezierCurveTo(1.12,1.05,1.2,1.4,1.55,1.4);shape.bezierCurveTo(1.9,1.4,1.98,1.05,2.2,1.05);shape.bezierCurveTo(2.68,1.05,2.75,.35,3.1,.35);shape.lineTo(3.1,0);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:false,curveSegments:6});g.applyMatrix4(f.mat);const m=new THREE.Mesh(g,wall);m.name='warden-curved-parapet';group.add(m)}
 // The period photo also shows a high curved end-gable with a small opening.
 {const f=transform(pos(10,-1.55),pos(10,1.55),top-.1),shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(0,.35);shape.bezierCurveTo(.35,.35,.42,1.05,.9,1.05);shape.bezierCurveTo(1.12,1.05,1.2,1.4,1.55,1.4);shape.bezierCurveTo(1.9,1.4,1.98,1.05,2.2,1.05);shape.bezierCurveTo(2.68,1.05,2.75,.35,3.1,.35);shape.lineTo(3.1,0);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:false,curveSegments:6});g.applyMatrix4(f.mat);const mesh=new THREE.Mesh(g,wall);mesh.name='warden-curved-end-gable';group.add(mesh);boxOnFrame(f.mat,1.55,.55,-.035,.48,.65,.06,glass,'warden-gable-window')}
 // Projecting enclosed glazed veranda facing the lighthouse; reference-led,
 // dimensions are inferred. Its visible solid frame/volume has a matching collider.
 const bayBottom=ground-.45,bayTop=ground+6.3,bayL=6,bay0=6.02,bay1=7.95,bayDepth=bay1-bay0,bayMid=pos(0,(bay0+bay1)/2);const bay=new THREE.Mesh(new THREE.BoxGeometry(bayL*2,bayTop-bayBottom,bayDepth),wall);bay.position.set(bayMid[0],(bayTop+bayBottom)/2,bayMid[1]);bay.rotation.y=-angle;bay.name='warden-veranda-solid';group.add(bay);hip(-bayL-.2,bayL+.2,bay0-.1,bay1+.2,bayTop,.55,'warden-veranda-hipped-roof');
 const outA=pos(bayL,bay1),outB=pos(-bayL,bay1),bf=transform(outA,outB,bayBottom),bayH=bayTop-bayBottom;for(const yy of [1.0,3.9])for(let j=1;j<=7;j++){if(yy===1.0&&j===4)continue;const x=bf.length*j/8;boxOnFrame(bf.mat,x,yy+.72,-.021,1.25,1.44,.045,glass,'warden-veranda-glazing');boxOnFrame(bf.mat,x,yy+.72,-.05,.05,1.44,.07,trim,'warden-veranda-mullion');boxOnFrame(bf.mat,x,yy+1.48,-.05,1.31,.07,.08,trim,'warden-veranda-lintel')}
 boxOnFrame(bf.mat,bf.length/2,1.15,-.045,1.45,2.3,.06,doorMat,'warden-veranda-closed-door');
 const chimneyCentre=pos(2,2.8),chimney=new THREE.Mesh(new THREE.BoxGeometry(1.1,3.6,1.1),brick);chimney.position.set(chimneyCentre[0],top+1.5,chimneyCentre[1]);chimney.name='warden-house-chimney';group.add(chimney);
 for(const {mat,name,matrices} of batches.values()){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,matrices.length);mesh.name=name;matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;group.add(mesh)}
 const outline=[...corners],veranda=[pos(-bayL,bay0),pos(bayL,bay0),pos(bayL,bay1),pos(-bayL,bay1)];
 group.userData={colliders:[{id:'warden-house-main',outline},{id:'warden-house-veranda',outline:veranda}],center:[cx,cz],estimated_size_m:[20,12],base,top,windowOpenings:openings,period:'interpreted intact prison-era exterior, 1934–1963',qualification:'Location from approximate map point; shape, dimensions, roof, veranda and opening schedule are visual interpretations, not a surveyed plan. No interior.',sources:['https://www.nps.gov/places/16-warden-s-house.htm','https://www.hmdb.org/m.asp?m=228667','https://mapcarta.com/W27996789']};return group;
}
// Backward-compatible entrypoint for the current prototype's game integration.
export const buildWardenRuin=buildWardenResidence;
