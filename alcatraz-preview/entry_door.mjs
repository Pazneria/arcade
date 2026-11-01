import * as THREE from './vendor/three.module.min.mjs';

// Local entry coordinates: u along the facade, v inward, y NAVD88. The scene
// must remain gated closed until an enclosed, supported portal is installed.
const HALF_PI=Math.PI/2,MAX_SWEEP_STEP=Math.PI/60;
function checkBody(body){if(!body||![body.x,body.z,body.footY,body.height,body.radius].every(Number.isFinite)||body.height<=0||body.radius<=0)throw Error('A finite player body is required for door collision')}
function localBody(c,b){return {u:(b.x-c.originX)*c.tx+(b.z-c.originZ)*c.tz,v:(b.x-c.originX)*c.nx+(b.z-c.originZ)*c.nz}}
export function bodyFitsEntryHeightAndWidth(c,body){checkBody(body);const {u}=localBody(c,body),eps=1e-6;return Math.abs(u)+body.radius<=c.clearWidth/2+eps&&body.footY>=c.thresholdY-.22&&body.footY+body.height<=c.thresholdY+c.clearHeight+eps}
export function bodyHitsDoorAt(c,body,angle,inflation=0){
 checkBody(body);if(!Number.isFinite(angle)||angle<0||angle>HALF_PI||!Number.isFinite(inflation)||inflation<0)throw Error('Invalid door pose');
 const bottom=c.thresholdY+.015,top=bottom+c.leafHeight;if(body.footY>=top||body.footY+body.height<=bottom)return false;
 const p=localBody(c,body),rad=body.radius+inflation;
 for(const sign of [-1,1]){const ux=-sign*Math.cos(angle),uz=Math.sin(angle),hx=sign*c.clearWidth/2,centerU=hx+ux*c.leafWidth/2,centerV=c.hingeDepth+uz*c.leafWidth/2,du=p.u-centerU,dv=p.v-centerV,along=du*ux+dv*uz,across=-du*uz+dv*ux,excessU=Math.max(0,Math.abs(along)-c.leafWidth/2),excessV=Math.max(0,Math.abs(across)-c.leafThickness/2);if(excessU*excessU+excessV*excessV<=rad*rad)return true}
 return false
}
export function createDoorState(contract){return {contract,enabled:false,context:null,angle:0,target:0,phase:'closed',blocked:false,speed:HALF_PI}}
function roomReady(state){const ctx=state.context,room=ctx?.room,scene=ctx?.scene,world=ctx?.world;let ancestor=room;while(ancestor&&ancestor!==world)ancestor=ancestor.parent;return !!(world?.isScene&&ancestor===world&&room?.userData?.portal?.contract===state.contract&&room.getObjectByName('entry-room-floor')&&room.getObjectByName('entry-room-back')&&room.getObjectByName('entry-room-ceiling')&&room.children.filter(x=>x.name==='entry-room-side').length===2&&scene?.entry?.doorState===state&&scene.entry.room===room&&scene.entry.portal===room.userData.portal&&typeof scene.entry.leafHit==='function'&&typeof scene.entry.isReady==='function'&&room.userData.supports?.length===2&&room.userData.supports.every(s=>scene.walkableSteps?.includes(s)))}
export function isDoorReady(state){return !!(state?.enabled&&roomReady(state))}
// Only the caller that has installed a supported room + portal may enable it.
export function setDoorAvailable(state,available,context=null){if(!available&&state.angle>1e-9)throw Error('Cannot disable an open door without safe closure');if(available){const previous=state.context;state.context=context;if(!roomReady(state)){state.context=previous;throw Error('Cannot enable door before room, supports and portal are installed')}}state.enabled=!!available;if(!available){state.context=null;state.angle=0;state.target=0;state.phase='closed';state.blocked=false}}
export function toggleDoor(state){if(!state.enabled||!roomReady(state))return false;state.target=state.target>0?0:HALF_PI;state.phase=state.target>state.angle?'opening':'closing';state.blocked=false;return true}
export function advanceDoor(state,dt,body){
 if(!state.enabled)return state.angle;if(!roomReady(state))throw Error('Door room/portal is no longer ready');checkBody(body);if(!Number.isFinite(dt)||dt<0)throw Error('Invalid frame delta');if(dt===0||Math.abs(state.target-state.angle)<1e-10)return state.angle;
 const start=state.angle,desired=start+Math.sign(state.target-start)*Math.min(Math.abs(state.target-start),state.speed*dt),steps=Math.max(1,Math.ceil(Math.abs(desired-start)/MAX_SWEEP_STEP)),corner=Math.hypot(state.contract.leafWidth,state.contract.leafThickness/2);state.blocked=false;
 for(let i=1;i<=steps;i++){const next=start+(desired-start)*i/steps,delta=Math.abs(next-state.angle),inflate=2*corner*Math.sin(delta/4)+1e-5;if(bodyHitsDoorAt(state.contract,body,state.angle,inflate)||bodyHitsDoorAt(state.contract,body,next,inflate)){state.blocked=true;break}state.angle=next}
 if(Math.abs(state.angle-state.target)<1e-9){state.angle=state.target;state.phase=state.angle===0?'closed':'open'}else state.phase=state.target>state.angle?'opening':'closing';return state.angle
}
// Capture existing instanced geometry exactly once. Door leaf/panel/pull matrices
// rotate about their outer pivots; hinge tabs, frame, transom and threshold stay.
export function bindDoorVisuals(arch,contract){
 const names=[['closed-entry',[[0],[1]]],['entry-leaf-panels',[[0,1,2,3],[4,5,6,7]]],['entry-hardware',[[0,1,2],[6,7,8]]]],moving=[];
 for(const [name,sides] of names){const mesh=arch.getObjectByName(name);if(!mesh?.isInstancedMesh)throw Error(`Missing door instance mesh ${name}`);for(let side=0;side<2;side++)for(const index of sides[side]){if(index>=mesh.count)throw Error(`Missing door instance ${name}:${index}`);const base=new THREE.Matrix4();mesh.getMatrixAt(index,base);moving.push({mesh,index,side,base})}}
 const backing=arch.getObjectByName('entry-backing');if(!backing)throw Error('Missing closed door backing');const frame=new THREE.Matrix4().makeBasis(new THREE.Vector3(contract.tx,0,contract.tz),new THREE.Vector3(0,1,0),new THREE.Vector3(contract.nx,0,contract.nz));frame.setPosition(contract.originX,contract.thresholdY,contract.originZ);return {contract,moving,backing,frame,invFrame:frame.clone().invert()}
}
export function syncDoorVisuals(binding,state){
 if(binding.contract!==state.contract)throw Error('Mismatched door contract');if(!state.enabled&&state.angle!==0)throw Error('Unavailable door cannot be open');if(state.enabled&&!roomReady(state)){binding.backing.visible=true;throw Error('Door room/portal is no longer ready')}const c=binding.contract;
 for(const part of binding.moving){const sign=part.side===0?-1:1,pivot=sign*c.clearWidth/2,rotation=new THREE.Matrix4().makeRotationY(sign*state.angle),motion=binding.frame.clone().multiply(new THREE.Matrix4().makeTranslation(pivot,0,c.hingeDepth)).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-pivot,0,-c.hingeDepth)).multiply(binding.invFrame);part.mesh.setMatrixAt(part.index,motion.multiply(part.base));part.mesh.instanceMatrix.needsUpdate=true}
 for(const mesh of new Set(binding.moving.map(part=>part.mesh)))mesh.computeBoundingSphere();
 // Temporary backing is retained while closed. No runtime caller may enable
 // this before a room exists; the later integration can replace the seam seal.
 binding.backing.visible=!(state.enabled&&state.angle>1e-9)
}
